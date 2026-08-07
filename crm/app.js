// Shrish CRM — Phase 1 (read-only).
//
// This file has exactly ONE write path: toggling the `isTestOrder` flag on an
// order, which is reversible and destroys nothing. Everything else reads
// `orders` and `user_profiles` and derives one record per customer in the
// browser, so `orders` stays the single source of truth with nothing to sync.
//
// There is deliberately no delete. Removing an order document would also
// remove it from admin and from accounting history, and a mis-click could
// destroy a real customer's record with no way back.
//
// Customer identity is keyed on phoneDigits: it is present and format-validated
// on every order, survives guest checkout, and is already used as a person key
// by order_locks. Email breaks on guest checkout and shared household inboxes.

import {
  db,
  auth,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  escapeHtml,
  moneyNumber,
  cloudFunctions,
  httpsCallable
} from '/assets/js/firebase-app.js';

const ADMIN_EMAIL = String(window.SHRISH_APP_CONFIG?.adminEmailHint || 'contact@shrish.co').trim().toLowerCase();

// Reorder cycle for pickles and sweets is 1-2 months, so a customer is "due"
// at 60 days and "overdue" at 90. Change here, not in six other places.
const DUE_DAYS = 60;
const OVERDUE_DAYS = 90;
const NEW_DAYS = 30;

// Orders that never represent money collected.
const NON_REVENUE_STATUSES = new Set(['cancelled', 'no_show']);
// Online checkouts that never completed payment. Excluded from customer stats
// entirely — these people never actually bought anything.
const INCOMPLETE_STATUSES = new Set(['awaiting_payment', 'payment_expired']);

// Fresh mango varieties from data.js. Matching on these names rather than the
// word "mango" is deliberate: Avakaya mango pickle, mango ginger pickle and
// mango jelly are year-round products, not seasonal fruit, and a naive
// substring match on "mango" would wrongly sweep them in.
const MANGO_VARIETIES = [
  'alphonso', 'hapus', 'kesar', 'banganapalli', 'safeda', 'langra', 'rasalu',
  'himayat', 'imam pasand', 'payari', 'paheri', 'dasheri', 'malgova', 'neelam'
];

function isMangoItem(item = {}) {
  const category = String(item.category || '').trim().toLowerCase();
  if (category) return category === 'mangoes';

  const name = String(item.name || '').trim().toLowerCase();
  const id = String(item.productId || item.id || '').trim().toLowerCase();
  if (!name && !id) return false;

  // Anything explicitly a pickle, podi, jelly or sweet is never fresh fruit.
  if (/pickle|podi|powder|jelly|laddu|kaja|putharekulu|gavvalu|sunnundalu|murukulu|pakodi|chekkalu|pusa|kayalu/.test(name)) return false;
  if (id.startsWith('puth_') || id.startsWith('picklespodi-') || id.startsWith('sweets-') || id.startsWith('snacks-')) return false;

  return MANGO_VARIETIES.some((variety) => name.includes(variety) || id === variety);
}

// A mango "season" is keyed by calendar year. Fresh mango sells roughly
// April-July in one hemisphere-summer block, so it never straddles a year
// boundary and the year alone is an unambiguous season key.
function seasonKey(date) {
  return date ? date.getFullYear() : null;
}

function itemLineTotal(item = {}) {
  const qty = Math.max(1, Number(item.qty || 1));
  const line = moneyNumber(item.lineTotal);
  return line > 0 ? line : moneyNumber(item.price) * qty;
}

// Builds one record per mango season. Deliberately separate from the customer
// rollup: seasons answer "who bought mangoes and what did they buy", which is a
// different question from "who is my customer".
function buildSeasons(orders) {
  const seasons = new Map();

  for (const order of orders) {
    if (order.isTestOrder) continue;
    if (INCOMPLETE_STATUSES.has(order.status || 'pending')) continue;
    if (NON_REVENUE_STATUSES.has(order.status || 'pending')) continue;

    const created = toDate(order.createdAt);
    const key = seasonKey(created);
    if (!key) continue;

    const mangoItems = (Array.isArray(order.items) ? order.items : []).filter(isMangoItem);
    if (!mangoItems.length) continue;

    if (!seasons.has(key)) {
      seasons.set(key, {
        year: key,
        customers: new Map(),
        varieties: new Map(),
        boxes: 0,
        revenue: 0,
        orders: 0,
        firstOrderAt: null,
        lastOrderAt: null
      });
    }

    const season = seasons.get(key);
    season.orders += 1;
    if (!season.firstOrderAt || created < season.firstOrderAt) season.firstOrderAt = created;
    if (!season.lastOrderAt || created > season.lastOrderAt) season.lastOrderAt = created;

    const phone = normalizeDigits(order.phoneDigits || order.phone);
    if (!season.customers.has(phone)) {
      season.customers.set(phone, {
        key: phone,
        name: String(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`).trim(),
        email: String(order.email || '').trim(),
        phone: String(order.phone || '').trim(),
        boxes: 0,
        spend: 0,
        orders: 0,
        varieties: new Map()
      });
    }
    const buyer = season.customers.get(phone);
    buyer.orders += 1;
    if (!buyer.name) buyer.name = String(order.fullName || '').trim();
    if (!buyer.email) buyer.email = String(order.email || '').trim();

    for (const item of mangoItems) {
      const qty = Math.max(1, Number(item.qty || 1));
      const value = itemLineTotal(item);
      const name = String(item.name || 'Unknown').trim();

      season.boxes += qty;
      season.revenue += value;
      season.varieties.set(name, (season.varieties.get(name) || 0) + qty);

      buyer.boxes += qty;
      buyer.spend += value;
      buyer.varieties.set(name, (buyer.varieties.get(name) || 0) + qty);
    }
  }

  return [...seasons.values()].sort((a, b) => b.year - a.year);
}

const state = {
  allCustomers: [],
  seasons: [],
  season: null,
  customers: [],
  unpaid: [],
  segment: 'all',
  search: '',
  sort: 'ltv',
  view: 'overview',
  groups: { mango: false, both: true, nonmango: true },   // true = shown
  excludeOwner: true,
  showTest: false,
  rawOrders: [],
  rawProfiles: [],
  campaign: { template: 'checkin', audience: 'due30', esp: 'brevo', fields: {} },
  tasks: [],
  planSeeded: false,
  reorderModel: new Map(),
  overlays: new Map(),    // phoneDigits -> { tags: [], notes: '' }
  feedback: new Map(),    // phoneDigits -> [ feedback ]
  detailKey: '',
  chart: null
};

/* ── helpers ──────────────────────────────────────────────────────── */

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from, to = new Date()) {
  if (!from) return null;
  return Math.floor((to - from) / 86400000);
}

function money(value) {
  return `$${(Math.round(value * 100) / 100).toFixed(2)}`;
}

function shortDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function orderRevenue(order) {
  if (NON_REVENUE_STATUSES.has(order.status || 'pending')) return 0;
  return moneyNumber(order.totalPrice);
}

/* ── rollup engine ────────────────────────────────────────────────── */

function buildCustomers(orders, profiles) {
  const byKey = new Map();

  for (const order of orders) {
    if (INCOMPLETE_STATUSES.has(order.status || 'pending')) continue;
    if (order.isTestOrder) continue;

    const key = normalizeDigits(order.phoneDigits || order.phone);
    if (!key) continue;

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: '',
        email: '',
        phone: '',
        uid: '',
        orders: [],
        ltv: 0,
        paidOrderCount: 0,
        products: new Map(),
        firstOrderAt: null,
        lastOrderAt: null,
        firstNonMangoAt: null,
        lastNonMangoAt: null,
        sources: new Set(),
        hasProfile: false,
        mangoQty: 0,
        otherQty: 0
      });
    }

    const customer = byKey.get(key);
    const created = toDate(order.createdAt);
    const revenue = orderRevenue(order);

    customer.orders.push({ ...order, _createdAt: created, _revenue: revenue });
    customer.ltv += revenue;
    if (revenue > 0) customer.paidOrderCount += 1;
    customer.sources.add(order.source || 'website');

    const name = String(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`).trim();
    if (name && !customer.name) customer.name = name;
    if (order.email && !customer.email) customer.email = String(order.email).trim();
    if (order.phone && !customer.phone) customer.phone = String(order.phone).trim();
    if (order.customerUid && !customer.uid) customer.uid = order.customerUid;

    if (created) {
      if (!customer.firstOrderAt || created < customer.firstOrderAt) customer.firstOrderAt = created;
      if (!customer.lastOrderAt || created > customer.lastOrderAt) customer.lastOrderAt = created;
    }

    for (const item of Array.isArray(order.items) ? order.items : []) {
      const itemName = String(item.name || '').trim();
      if (!itemName) continue;
      const qty = Math.max(1, Number(item.qty || 1));
      customer.products.set(itemName, (customer.products.get(itemName) || 0) + qty);
      if (isMangoItem(item)) {
        customer.mangoQty += qty;
      } else {
        customer.otherQty += qty;
        // Recency is tracked separately for non-mango, because fresh mango is
        // seasonal: a mango order in June says nothing about whether someone
        // is still an active pickle customer in November.
        if (created) {
          if (!customer.firstNonMangoAt || created < customer.firstNonMangoAt) customer.firstNonMangoAt = created;
          if (!customer.lastNonMangoAt || created > customer.lastNonMangoAt) customer.lastNonMangoAt = created;
        }
      }
    }
  }

  // Overlay profile details. Profiles never create a customer on their own —
  // someone who registered but never ordered is not yet a customer.
  const profileByPhone = new Map();
  for (const profile of profiles) {
    const key = normalizeDigits(profile.phone);
    if (key) profileByPhone.set(key, profile);
  }

  for (const customer of byKey.values()) {
    const profile = profileByPhone.get(customer.key);
    if (!profile) continue;
    customer.hasProfile = true;
    if (!customer.email && profile.email) customer.email = String(profile.email).trim();
    if (!customer.name) {
      const profileName = String(profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`).trim();
      if (profileName) customer.name = profileName;
    }
  }

  const list = [...byKey.values()];

  // VIP is the top 10% by lifetime value, so it needs the whole population.
  const sortedLtv = list.map((customer) => customer.ltv).sort((a, b) => b - a);
  const vipCutoff = sortedLtv.length
    ? sortedLtv[Math.max(0, Math.floor(sortedLtv.length * 0.1) - 1)]
    : Infinity;

  for (const customer of list) {
    customer.orders.sort((a, b) => (b._createdAt?.getTime() || 0) - (a._createdAt?.getTime() || 0));
    customer.orderCount = customer.orders.length;
    customer.daysSince = daysBetween(customer.lastOrderAt);
    customer.daysSinceFirst = daysBetween(customer.firstOrderAt);
    customer.avgOrder = customer.orderCount ? customer.ltv / customer.orderCount : 0;
    customer.favourites = [...customer.products.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    customer.isOffline = !customer.sources.has('website');

    // Three mutually exclusive groups by what they have ever bought:
    //   mango    — fresh fruit only, purely seasonal
    //   both     — fresh fruit and year-round lines, the crossover group
    //   nonmango — year-round only, never bought fresh fruit
    customer.group = customer.otherQty === 0
      ? 'mango'
      : (customer.mangoQty === 0 ? 'nonmango' : 'both');
    customer.isMangoOnly = customer.group === 'mango';

    // Recency and "due" judgements deliberately ignore mango orders. A mango
    // buy is a seasonal event, not evidence of an ongoing relationship, so
    // counting it would make seasonal customers look permanently healthy.
    customer.daysSinceNonMango = daysBetween(customer.lastNonMangoAt);
    const days = customer.daysSinceNonMango;

    customer.isNew = customer.daysSinceFirst !== null && customer.daysSinceFirst <= NEW_DAYS;
    customer.isRepeat = customer.paidOrderCount >= 2;
    customer.isVip = customer.isRepeat && customer.ltv >= vipCutoff && customer.ltv > 0;
    customer.isOverdue = days !== null && days >= OVERDUE_DAYS;
    customer.isDue = days !== null && days >= DUE_DAYS && days < OVERDUE_DAYS;

    if (customer.isOverdue) customer.statusKey = 'over';
    else if (customer.isDue) customer.statusKey = 'due';
    else if (customer.isNew) customer.statusKey = 'new';
    else customer.statusKey = 'ok';
  }

  return list;
}

const SEGMENTS = [
  { id: 'all',     label: 'All customers', test: () => true },
  { id: 'due',     label: 'Due to reorder', test: (c) => c.isDue },
  { id: 'overdue', label: 'Overdue',        test: (c) => c.isOverdue },
  { id: 'repeat',  label: 'Repeat',         test: (c) => c.isRepeat },
  { id: 'vip',     label: 'Top spenders',   test: (c) => c.isVip },
  { id: 'new',     label: 'New this month', test: (c) => c.isNew },
  { id: 'offline', label: 'Offline only',   test: (c) => c.isOffline },
  { id: 'once',    label: 'One order only', test: (c) => c.paidOrderCount === 1 },
  { id: 'predicted', label: 'Running out now', test: (c) => c.predictedOver !== null && c.predictedOver >= -3 && c.predictedOver <= 45 }
];

/* ── rendering ────────────────────────────────────────────────────── */

function renderMetrics() {
  const all = state.customers;
  const due = all.filter((c) => c.isDue);
  const overdue = all.filter((c) => c.isOverdue);
  const repeat = all.filter((c) => c.isRepeat);
  const atRisk = [...due, ...overdue];
  const atRiskValue = atRisk.reduce((sum, c) => sum + c.ltv, 0);
  const totalLtv = all.reduce((sum, c) => sum + c.ltv, 0);
  const repeatRate = all.length ? Math.round((repeat.length / all.length) * 100) : 0;

  const cards = [
    { label: 'Customers', value: String(all.length), note: 'with at least one paid order' },
    { label: 'Repeat rate', value: `${repeatRate}%`, note: `${repeat.length} ordered more than once`, cls: repeatRate >= 30 ? 'is-good' : '' },
    { label: 'Avg lifetime value', value: money(all.length ? totalLtv / all.length : 0), note: `${money(totalLtv)} total` },
    { label: 'Due to reorder', value: String(due.length), note: `${DUE_DAYS}–${OVERDUE_DAYS - 1} days since last order`, cls: 'is-warn' },
    { label: 'Overdue', value: String(overdue.length), note: `${OVERDUE_DAYS}+ days — likely lost`, cls: 'is-warn' },
    { label: 'Value at risk', value: money(atRiskValue), note: 'past spend of due + overdue', cls: 'is-warn' }
  ];

  document.getElementById('crmMetrics').innerHTML = cards.map((card) => `
    <div class="crm-metric ${card.cls || ''}">
      <div class="crm-metric-label">${escapeHtml(card.label)}</div>
      <div class="crm-metric-value">${escapeHtml(card.value)}</div>
      <div class="crm-metric-note">${escapeHtml(card.note)}</div>
    </div>`).join('');
}

function renderChart() {
  const buckets = [
    { label: '0–30', min: 0, max: 30 },
    { label: '31–59', min: 31, max: 59 },
    { label: '60–89', min: 60, max: 89 },
    { label: '90–119', min: 90, max: 119 },
    { label: '120–179', min: 120, max: 179 },
    { label: '180+', min: 180, max: Infinity }
  ];

  // Measured on non-mango recency, so a seasonal mango purchase does not make
  // a lapsed year-round customer look active.
  const counts = buckets.map((bucket) =>
    state.customers.filter((c) => c.daysSinceNonMango !== null
      && c.daysSinceNonMango >= bucket.min && c.daysSinceNonMango <= bucket.max).length
  );

  const colors = buckets.map((bucket) => (bucket.min >= DUE_DAYS ? '#E8A83C' : '#6BA8E0'));

  document.getElementById('crmChartLegend').innerHTML = `
    <span><span class="crm-legend-dot" style="background:#6BA8E0"></span>Within reorder window</span>
    <span><span class="crm-legend-dot" style="background:#E8A83C"></span>Due or overdue</span>`;

  const canvas = document.getElementById('crmReorderChart');
  canvas.setAttribute('aria-label', `Customers by days since last order: ${buckets.map((b, i) => `${b.label} days ${counts[i]}`).join(', ')}`);

  if (state.chart) state.chart.destroy();
  if (typeof window.Chart !== 'function') return;

  state.chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map((bucket) => bucket.label),
      datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4, maxBarThickness: 42 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(239,228,206,0.5)', font: { size: 11 } } },
        y: { grid: { color: 'rgba(200,121,26,0.12)' }, ticks: { color: 'rgba(239,228,206,0.5)', font: { size: 11 }, precision: 0 } }
      },
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const bucket = buckets[elements[0].index];
        setSegment(bucket.min >= OVERDUE_DAYS ? 'overdue' : bucket.min >= DUE_DAYS ? 'due' : 'all');
      }
    }
  });
}

function renderSegments() {
  document.getElementById('crmSegments').innerHTML = SEGMENTS.map((segment) => {
    const count = state.customers.filter(segment.test).length;
    return `<button class="crm-seg ${state.segment === segment.id ? 'active' : ''}" type="button" data-segment="${segment.id}">
      ${escapeHtml(segment.label)}<span class="crm-seg-count">${count}</span>
    </button>`;
  }).join('');
}

function visibleCustomers() {
  const segment = SEGMENTS.find((entry) => entry.id === state.segment) || SEGMENTS[0];
  const term = state.search.trim().toLowerCase();

  let list = state.customers.filter(segment.test);

  if (term) {
    // Only test the phone when the term actually contains digits.
    // `'8045551234'.includes('')` is true, so a plain text search previously
    // matched every row through this branch and search appeared dead.
    const termDigits = term.replace(/\D/g, '');
    list = list.filter((customer) =>
      customer.name.toLowerCase().includes(term)
      || customer.email.toLowerCase().includes(term)
      || (termDigits.length >= 3 && customer.key.includes(termDigits))
    );
  }

  const sorters = {
    ltv: (a, b) => b.ltv - a.ltv,
    orders: (a, b) => b.orderCount - a.orderCount,
    recent: (a, b) => (b.lastOrderAt?.getTime() || 0) - (a.lastOrderAt?.getTime() || 0),
    stale: (a, b) => (a.lastOrderAt?.getTime() || 0) - (b.lastOrderAt?.getTime() || 0),
    name: (a, b) => a.name.localeCompare(b.name)
  };

  return list.sort(sorters[state.sort] || sorters.ltv);
}

function statusPill(customer) {
  // Mango-only buyers have no year-round cycle to be due against. Calling them
  // overdue would be meaningless — they are simply seasonal.
  if (customer.group === 'mango') {
    return `<span class="crm-pill season">Seasonal ${customer.daysSince}d</span>`;
  }
  // Someone who ordered in the last fortnight is active, whatever a single
  // product's cycle says. Recency wins over prediction for the headline.
  if (customer.daysSinceNonMango !== null && customer.daysSinceNonMango <= 14) {
    return `<span class="crm-pill ok">Active ${customer.daysSinceNonMango}d</span>`;
  }
  // A measured prediction beats a generic day count, so it wins when present.
  if (customer.predictedOver !== null && customer.predictedOver >= -3) {
    const label = customer.predictedOver > 0
      ? `${customer.predictedOver}d past due`
      : 'Due now';
    const cls = customer.predictedOver > 21 ? 'over' : 'due';
    return `<span class="crm-pill ${cls}" title="${escapeHtml(customer.predictedProduct)} should have run out by now and has not been reordered">${label}</span>`;
  }
  if (customer.isOverdue) return `<span class="crm-pill over">Quiet ${customer.daysSince}d</span>`;
  if (customer.isDue) return `<span class="crm-pill due">Quiet ${customer.daysSince}d</span>`;
  if (customer.isNew) return '<span class="crm-pill new">New</span>';
  if (customer.daysSinceNonMango === null) return '<span class="crm-pill muted">No date</span>';
  return `<span class="crm-pill ok">Active ${customer.daysSinceNonMango}d</span>`;
}

function renderList() {
  const list = visibleCustomers();
  const segment = SEGMENTS.find((entry) => entry.id === state.segment) || SEGMENTS[0];
  document.getElementById('crmListTitle').textContent = segment.label;

  const body = document.getElementById('crmCustomerRows');

  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5"><div class="crm-empty">No customers match this filter.</div></td></tr>';
  } else {
    body.innerHTML = list.map((customer) => `
      <tr data-key="${escapeHtml(customer.key)}">
        <td>
          <div class="crm-cust-name">${escapeHtml(customer.name || 'No name saved')}</div>
          <div class="crm-cust-meta">${escapeHtml(customer.phone || customer.key)}${customer.email ? ` · ${escapeHtml(customer.email)}` : ''}</div>
        </td>
        <td class="crm-num">${customer.orderCount}</td>
        <td class="crm-num">${escapeHtml(money(customer.ltv))}</td>
        <td class="crm-num">${escapeHtml(shortDate(customer.lastOrderAt))}</td>
        <td>${statusPill(customer)}</td>
      </tr>`).join('');
  }

  const value = list.reduce((sum, customer) => sum + customer.ltv, 0);
  document.getElementById('crmListFooter').textContent =
    `${list.length} customer${list.length === 1 ? '' : 's'} · ${money(value)} lifetime value in this view`;
}

const GROUP_LABELS = {
  mango: 'Mango only',
  both: 'Mango + other',
  nonmango: 'Non-mango only'
};

function applyFilters() {
  const ownerKey = normalizeDigits(window.SHRISH_APP_CONFIG?.supportPhone || '');

  let list = state.allCustomers.filter((customer) => state.groups[customer.group]);
  let ownerRemoved = 0;

  if (state.excludeOwner) {
    const before = list.length;
    list = list.filter((customer) =>
      customer.key !== ownerKey
      && String(customer.email || '').trim().toLowerCase() !== ADMIN_EMAIL);
    ownerRemoved = before - list.length;
  }

  state.customers = list;

  // Live counts on the group buttons, so the split is visible without clicking.
  const counts = { mango: 0, both: 0, nonmango: 0 };
  for (const customer of state.allCustomers) counts[customer.group] += 1;
  for (const group of Object.keys(GROUP_LABELS)) {
    const button = document.getElementById(`crmGroup-${group}`);
    if (!button) continue;
    button.classList.toggle('active', state.groups[group]);
    button.setAttribute('aria-pressed', String(state.groups[group]));
    button.innerHTML = `${escapeHtml(GROUP_LABELS[group])}<span class="crm-seg-count">${counts[group]}</span>`;
  }

  const hidden = state.allCustomers.length - state.customers.length;
  const note = document.getElementById('crmFilterNote');
  if (note) {
    note.textContent = hidden
      ? `${hidden} hidden · showing ${state.customers.length} of ${state.allCustomers.length}`
      : `showing all ${state.allCustomers.length}`;
  }
}

/* ── reorder prediction ───────────────────────────────── */
//
// Most CRMs ask "how many days since their last order" and pick a threshold by
// gut. That is wrong here: a jar of pickle and a box of mangoes empty at
// completely different rates, so one global number is wrong for both.
//
// Instead the interval is MEASURED. For every product, look at customers who
// bought it more than once and take the median gap between their purchases.
// That is the product's real depletion time, in your customers' actual hands.
// Products without enough repeat history are left unpredicted rather than
// guessed at.

const MIN_INTERVAL_SAMPLE = 3;
const MIN_GAP_DAYS = 3;      // below this is a split order, not a repurchase
const MAX_GAP_DAYS = 400;    // above this is a returning customer, not a cycle

function buildReorderModel(customers) {
  const gaps = new Map();

  for (const customer of customers) {
    const datesByProduct = new Map();
    for (const order of customer.orders) {
      if (!order._createdAt) continue;
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const name = String(item.name || '').trim();
        if (!name) continue;
        if (!datesByProduct.has(name)) datesByProduct.set(name, []);
        datesByProduct.get(name).push(order._createdAt);
      }
    }

    for (const [name, dates] of datesByProduct) {
      if (dates.length < 2) continue;
      const sorted = [...dates].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i += 1) {
        const days = Math.round((sorted[i] - sorted[i - 1]) / 86400000);
        if (days < MIN_GAP_DAYS || days > MAX_GAP_DAYS) continue;
        if (!gaps.has(name)) gaps.set(name, []);
        gaps.get(name).push(days);
      }
    }
  }

  const model = new Map();
  for (const [name, list] of gaps) {
    if (list.length < MIN_INTERVAL_SAMPLE) continue;
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    model.set(name, { days: median, sample: list.length });
  }
  return model;
}

// Per customer: for each product they have bought, when should it run out?
//
// Crucially, a product is only "due" if the customer has NOT ordered since its
// due date passed. If they have, they stood at your checkout and chose
// something else — that is a preference, not an impending stock-out, and
// flagging it would send you chasing an active customer. Those products are
// returned separately as `declined`, which is useful in its own right.
function predictReorders(customer, model) {
  const due = [];
  const declined = [];
  const lastByProduct = new Map();

  for (const order of customer.orders) {
    if (!order._createdAt) continue;
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const name = String(item.name || '').trim();
      if (!name) continue;
      const prior = lastByProduct.get(name);
      if (!prior || order._createdAt > prior) lastByProduct.set(name, order._createdAt);
    }
  }

  const lastOrderAt = customer.lastOrderAt ? customer.lastOrderAt.getTime() : 0;

  for (const [name, last] of lastByProduct) {
    const entry = model.get(name);
    if (!entry) continue;
    const dueAt = new Date(last.getTime() + entry.days * 86400000);
    const record = {
      product: name,
      dueAt,
      daysOver: Math.floor((Date.now() - dueAt.getTime()) / 86400000),
      interval: entry.days,
      sample: entry.sample
    };

    // Ordered after this fell due, and did not take it.
    if (lastOrderAt > dueAt.getTime()) declined.push(record);
    else due.push(record);
  }

  due.sort((a, b) => b.daysOver - a.daysOver);
  declined.sort((a, b) => b.daysOver - a.daysOver);
  due.declined = declined;
  return due;
}

/* ── affinity, geography, acquisition, discounts ──────── */

// Lift, not raw co-occurrence. Two popular products appear together often just
// by being popular; lift divides that out and shows genuine attraction.
// lift > 1 means buying A makes B more likely than chance.
function buildAffinity(customers) {
  // Support must be measured across ALL customers, not just multi-product ones.
  // Restricting the population first inflates every base rate — a product in
  // every multi-product basket looks universal and its lift collapses to 1.0,
  // hiding genuine pairs.
  const sets = customers.map((customer) => new Set(
    customer.orders.flatMap((order) =>
      (Array.isArray(order.items) ? order.items : []).map((item) => String(item.name || '').trim()).filter(Boolean))
  )).filter((set) => set.size >= 1);

  const total = sets.length;
  if (total < 8) return { pairs: [], total };

  const single = new Map();
  const pair = new Map();

  for (const set of sets) {
    const list = [...set].sort();
    for (const name of list) single.set(name, (single.get(name) || 0) + 1);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const key = `${list[i]}||${list[j]}`;
        pair.set(key, (pair.get(key) || 0) + 1);
      }
    }
  }

  const pairs = [];
  for (const [key, both] of pair) {
    if (both < 3) continue;
    const [a, b] = key.split('||');
    const pa = single.get(a) / total;
    const pb = single.get(b) / total;
    const lift = (both / total) / (pa * pb);
    if (lift <= 1.2) continue;
    pairs.push({ a, b, both, lift, confidence: both / single.get(a) });
  }

  return { pairs: pairs.sort((x, y) => y.lift - x.lift).slice(0, 12), total };
}

// Where demand actually is, versus where you can currently serve it.
function buildGeography(orders) {
  const zips = new Map();
  const pickups = new Map();

  for (const order of orders) {
    if (order.isTestOrder) continue;
    if (INCOMPLETE_STATUSES.has(order.status || 'pending')) continue;
    if (NON_REVENUE_STATUSES.has(order.status || 'pending')) continue;

    const value = moneyNumber(order.totalPrice);
    const phone = normalizeDigits(order.phoneDigits || order.phone);

    const zip = String(order.shippingAddress?.zip || '').trim().slice(0, 5);
    if (zip) {
      if (!zips.has(zip)) zips.set(zip, { zip, orders: 0, revenue: 0, customers: new Set(), city: '', state: '' });
      const entry = zips.get(zip);
      entry.orders += 1;
      entry.revenue += value;
      if (phone) entry.customers.add(phone);
      if (!entry.city) entry.city = String(order.shippingAddress?.city || '').trim();
      if (!entry.state) entry.state = String(order.shippingAddress?.state || '').trim();
    }

    const label = String(order.locationLabel || order.pickupLocationLabel || order.location || '').trim();
    if (label && String(order.fulfillmentType || 'pickup') !== 'shipping') {
      if (!pickups.has(label)) pickups.set(label, { label, orders: 0, revenue: 0, customers: new Set() });
      const entry = pickups.get(label);
      entry.orders += 1;
      entry.revenue += value;
      if (phone) entry.customers.add(phone);
    }
  }

  const shape = (map) => [...map.values()]
    .map((entry) => ({ ...entry, customers: entry.customers.size }))
    .sort((a, b) => b.revenue - a.revenue);

  return { zips: shape(zips), pickups: shape(pickups) };
}

// Which channels actually bring customers who spend, not just customers.
function buildAcquisition(orders) {
  const REFERRAL_LABELS = {
    friend: 'Friend / family',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp group',
    google: 'Google search',
    community: 'Community group',
    other: 'Other',
    '': 'Not specified'
  };

  const sources = new Map();
  const seen = new Map();   // phone -> first source, so a customer counts once

  const sorted = [...orders]
    .filter((order) => !order.isTestOrder
      && !INCOMPLETE_STATUSES.has(order.status || 'pending')
      && !NON_REVENUE_STATUSES.has(order.status || 'pending'))
    .sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));

  for (const order of sorted) {
    const phone = normalizeDigits(order.phoneDigits || order.phone);
    if (!phone) continue;
    const raw = String(order.referral || '').trim().toLowerCase();
    const key = raw === 'not specified' || !raw ? '' : raw;
    if (!seen.has(phone)) seen.set(phone, key);
  }

  for (const order of sorted) {
    const phone = normalizeDigits(order.phoneDigits || order.phone);
    if (!phone) continue;
    const key = seen.get(phone) ?? '';
    const label = REFERRAL_LABELS[key] || key || 'Not specified';
    if (!sources.has(label)) sources.set(label, { label, customers: new Set(), revenue: 0, orders: 0 });
    const entry = sources.get(label);
    entry.customers.add(phone);
    entry.revenue += moneyNumber(order.totalPrice);
    entry.orders += 1;
  }

  return [...sources.values()]
    .map((entry) => ({
      ...entry,
      customers: entry.customers.size,
      valuePerCustomer: entry.customers.size ? entry.revenue / entry.customers.size : 0
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// Who only ever buys on a discount. Worth knowing before sending another one:
// a full-price customer given a code is margin you gave away for nothing.
function buildDiscountProfile(customers) {
  const rows = customers.map((customer) => {
    const paid = customer.orders.filter((order) => order._revenue > 0);
    const discounted = paid.filter((order) => String(order.promoCode || '').trim());
    return {
      key: customer.key,
      name: customer.name,
      orders: paid.length,
      discounted: discounted.length,
      share: paid.length ? discounted.length / paid.length : 0,
      saved: discounted.reduce((sum, order) => sum + moneyNumber(order.promoDiscount), 0),
      ltv: customer.ltv
    };
  }).filter((row) => row.orders >= 2);

  const dependent = rows.filter((row) => row.share >= 0.8).sort((a, b) => b.saved - a.saved);
  const fullPrice = rows.filter((row) => row.share === 0).sort((a, b) => b.ltv - a.ltv);
  const totalGiven = rows.reduce((sum, row) => sum + row.saved, 0);

  return { dependent, fullPrice, totalGiven, analysed: rows.length };
}

// Weekly mango volume through a season, so next year's stock ordering is
// driven by last year's actual shape rather than memory. The peak week is the
// number that matters: it is when you must already have boxes on hand.
function buildSeasonCurve(orders, year) {
  const weeks = new Map();

  for (const order of orders) {
    if (order.isTestOrder) continue;
    if (INCOMPLETE_STATUSES.has(order.status || 'pending')) continue;
    if (NON_REVENUE_STATUSES.has(order.status || 'pending')) continue;

    const created = toDate(order.createdAt);
    if (!created || created.getFullYear() !== year) continue;

    const mangoItems = (Array.isArray(order.items) ? order.items : []).filter(isMangoItem);
    if (!mangoItems.length) continue;

    // Monday-anchored week start, so bars line up with how a week is planned.
    const start = new Date(created);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const key = start.toISOString().slice(0, 10);

    if (!weeks.has(key)) weeks.set(key, { key, start, boxes: 0, revenue: 0, orders: 0 });
    const week = weeks.get(key);
    week.orders += 1;
    for (const item of mangoItems) {
      week.boxes += Math.max(1, Number(item.qty || 1));
      week.revenue += itemLineTotal(item);
    }
  }

  return [...weeks.values()].sort((a, b) => a.start - b.start);
}

/* ── what converts ────────────────────────────────────── */

// Below this many customers a percentage is noise, not a signal. Products with
// smaller samples are still listed but shown as counts without a rate.
const MIN_SAMPLE = 5;

// Fixed tag vocabulary. Free-text tags drift into synonyms ("vip", "VIP",
// "v.i.p") and stop being filterable, which defeats the point.
const CRM_TAGS = ['VIP', 'Wholesale', 'Festival buyer', 'Mild spice', 'Bulk', 'Referrer', 'Do not contact'];

// Answers the question the two halves of the business raise: mango buyers are
// seasonal and numerous, year-round customers are few. What do the few have in
// common, and which non-mango product do mango buyers actually reach for?
function buildProductInsights(customers) {
  const mangoBuyers = customers.filter((customer) => customer.mangoQty > 0);
  const crossedOver = mangoBuyers.filter((customer) => customer.otherQty > 0);

  // Non-mango products bought by people who also bought mangoes, ranked by how
  // many distinct customers bought them — not by units, which one bulk order
  // could distort.
  const bridge = new Map();
  for (const customer of crossedOver) {
    for (const order of customer.orders) {
      for (const item of Array.isArray(order.items) ? order.items : []) {
        if (isMangoItem(item)) continue;
        const name = String(item.name || '').trim();
        if (!name) continue;
        if (!bridge.has(name)) bridge.set(name, new Set());
        bridge.get(name).add(customer.key);
      }
    }
  }

  // Conversion by first-order product: of everyone whose first order contained
  // product X, how many ever ordered again?
  const firstProduct = new Map();
  for (const customer of customers) {
    const first = customer.orders[customer.orders.length - 1];
    if (!first) continue;
    const returned = customer.paidOrderCount >= 2;
    const names = new Set(
      (Array.isArray(first.items) ? first.items : [])
        .map((item) => String(item.name || '').trim())
        .filter(Boolean)
    );
    for (const name of names) {
      if (!firstProduct.has(name)) firstProduct.set(name, { name, total: 0, returned: 0 });
      const entry = firstProduct.get(name);
      entry.total += 1;
      if (returned) entry.returned += 1;
    }
  }

  const conversion = [...firstProduct.values()]
    .map((entry) => ({ ...entry, rate: entry.total ? entry.returned / entry.total : 0 }))
    .sort((a, b) => {
      const aOk = a.total >= MIN_SAMPLE;
      const bOk = b.total >= MIN_SAMPLE;
      if (aOk !== bOk) return aOk ? -1 : 1;   // usable samples first
      if (aOk) return b.rate - a.rate;
      return b.total - a.total;
    });

  return {
    mangoBuyers: mangoBuyers.length,
    crossedOver: crossedOver.length,
    crossoverRate: mangoBuyers.length ? crossedOver.length / mangoBuyers.length : 0,
    bridge: [...bridge.entries()]
      .map(([name, buyers]) => ({ name, buyers: buyers.size }))
      .sort((a, b) => b.buyers - a.buyers),
    conversion
  };
}

function renderInsights() {
  const panel = document.getElementById('crmInsightsPanel');
  // Always computed on the unfiltered population: this question is about the
  // whole business, not the currently filtered view.
  const data = buildProductInsights(state.allCustomers);

  if (!data.mangoBuyers) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const bridgeRows = data.bridge.slice(0, 10);
  const maxBuyers = bridgeRows.length ? bridgeRows[0].buyers : 1;

  const usable = data.conversion.filter((entry) => entry.total >= MIN_SAMPLE).slice(0, 10);

  document.getElementById('crmInsightsBody').innerHTML = `
    <div class="crm-metrics" style="margin-bottom:16px">
      <div class="crm-metric">
        <div class="crm-metric-label">Mango buyers</div>
        <div class="crm-metric-value">${data.mangoBuyers}</div>
        <div class="crm-metric-note">bought fresh mangoes at least once</div>
      </div>
      <div class="crm-metric ${data.crossoverRate >= 0.15 ? 'is-good' : 'is-warn'}">
        <div class="crm-metric-label">Crossed over</div>
        <div class="crm-metric-value">${data.crossedOver}</div>
        <div class="crm-metric-note">${Math.round(data.crossoverRate * 100)}% also bought something else</div>
      </div>
      <div class="crm-metric">
        <div class="crm-metric-label">Still mango only</div>
        <div class="crm-metric-value">${data.mangoBuyers - data.crossedOver}</div>
        <div class="crm-metric-note">the conversion opportunity</div>
      </div>
    </div>

    <div class="crm-detail-section-title">What mango buyers also buy</div>
    ${bridgeRows.length
      ? bridgeRows.map((row) => `
        <div class="crm-variety-row">
          <span class="crm-variety-name">${escapeHtml(row.name)}</span>
          <span class="crm-variety-bar-wrap"><span class="crm-variety-bar" style="width:${Math.round((row.buyers / maxBuyers) * 100)}%"></span></span>
          <span class="crm-variety-qty">${row.buyers}</span>
        </div>`).join('')
      : '<div class="crm-empty">No mango buyer has bought anything else yet.</div>'}

    <div class="crm-detail-section-title">Repeat rate by first product bought</div>
    ${usable.length
      ? `<table class="crm-table"><thead><tr>
          <th>First product</th><th>Customers</th><th>Came back</th><th>Rate</th>
        </tr></thead><tbody>
        ${usable.map((entry) => `<tr>
          <td>${escapeHtml(entry.name)}</td>
          <td class="crm-num">${entry.total}</td>
          <td class="crm-num">${entry.returned}</td>
          <td class="crm-num">${Math.round(entry.rate * 100)}%</td>
        </tr>`).join('')}
        </tbody></table>`
      : `<div class="crm-empty">No product has been the first purchase for ${MIN_SAMPLE}+ customers yet.</div>`}

    <div class="crm-season-note">
      Rates are only shown for products bought first by ${MIN_SAMPLE} or more customers. Below that a percentage
      swings wildly on one person and would mislead. Bridge products are ranked by number of distinct
      customers, not units, so a single bulk order cannot distort the order.
    </div>`;

  renderExtraInsights();
}

// Affinity, geography, acquisition and discount reliance. Each answers a
// decision you actually face: what to bundle, where to hold a booth, which
// channel to spend on, and who not to send another discount to.
function renderExtraInsights() {
  const wrap = document.getElementById('crmExtraInsights');
  if (!wrap) return;

  const affinity = buildAffinity(state.allCustomers);
  const geo = buildGeography(state.rawOrders);
  const acquisition = buildAcquisition(state.rawOrders);
  const discounts = buildDiscountProfile(state.allCustomers);

  const affinityHtml = affinity.pairs.length
    ? affinity.pairs.map((pair) => `
      <div class="crm-order-row">
        <div>
          <div>${escapeHtml(pair.a)} <span class="crm-order-meta">+</span> ${escapeHtml(pair.b)}</div>
          <div class="crm-order-meta">${pair.both} customers bought both · ${Math.round(pair.confidence * 100)}% of ${escapeHtml(pair.a)} buyers also took ${escapeHtml(pair.b)}</div>
        </div>
        <div class="crm-num"><span class="crm-lift">${pair.lift.toFixed(1)}×</span></div>
      </div>`).join('')
    : `<div class="crm-empty">Not enough multi-product customers yet to find reliable pairs${affinity.total ? ` (${affinity.total} so far)` : ''}.</div>`;

  const maxZip = geo.zips.length ? geo.zips[0].revenue : 1;
  const geoHtml = geo.zips.length
    ? geo.zips.slice(0, 10).map((entry) => `
      <div class="crm-variety-row">
        <span class="crm-variety-name">${escapeHtml(entry.zip)}${entry.city ? ` · ${escapeHtml(entry.city)}` : ''}</span>
        <span class="crm-variety-bar-wrap"><span class="crm-variety-bar" style="width:${Math.round((entry.revenue / maxZip) * 100)}%"></span></span>
        <span class="crm-variety-qty">${escapeHtml(money(entry.revenue))}</span>
      </div>`).join('')
    : '<div class="crm-empty">No shipping addresses recorded yet.</div>';

  const pickupHtml = geo.pickups.length
    ? geo.pickups.map((entry) => `
      <div class="crm-order-row">
        <div>
          <div>${escapeHtml(entry.label)}</div>
          <div class="crm-order-meta">${entry.customers} customer${entry.customers === 1 ? '' : 's'} · ${entry.orders} orders</div>
        </div>
        <div class="crm-num">${escapeHtml(money(entry.revenue))}</div>
      </div>`).join('')
    : '';

  const acqHtml = acquisition.length
    ? `<table class="crm-table"><thead><tr>
        <th>How they found you</th><th>Customers</th><th>Revenue</th><th>Per customer</th>
      </tr></thead><tbody>
      ${acquisition.map((entry) => `<tr>
        <td>${escapeHtml(entry.label)}</td>
        <td class="crm-num">${entry.customers}</td>
        <td class="crm-num">${escapeHtml(money(entry.revenue))}</td>
        <td class="crm-num">${escapeHtml(money(entry.valuePerCustomer))}</td>
      </tr>`).join('')}
      </tbody></table>`
    : '<div class="crm-empty">No referral source recorded yet.</div>';

  const discountHtml = discounts.analysed
    ? `<div class="crm-metrics" style="margin-bottom:12px">
        <div class="crm-metric">
          <div class="crm-metric-label">Given away in discounts</div>
          <div class="crm-metric-value">${escapeHtml(money(discounts.totalGiven))}</div>
          <div class="crm-metric-note">across ${discounts.analysed} repeat customers</div>
        </div>
        <div class="crm-metric ${discounts.dependent.length ? 'is-warn' : ''}">
          <div class="crm-metric-label">Only buy on discount</div>
          <div class="crm-metric-value">${discounts.dependent.length}</div>
          <div class="crm-metric-note">80%+ of their orders used a code</div>
        </div>
        <div class="crm-metric is-good">
          <div class="crm-metric-label">Never used a code</div>
          <div class="crm-metric-value">${discounts.fullPrice.length}</div>
          <div class="crm-metric-note">stop discounting these</div>
        </div>
      </div>
      ${discounts.fullPrice.length ? `<div class="crm-detail-section-title">Highest value, never discounted</div>
      ${discounts.fullPrice.slice(0, 5).map((row) => `
        <div class="crm-order-row">
          <div><div>${escapeHtml(row.name || row.key)}</div>
          <div class="crm-order-meta">${row.orders} orders, always full price</div></div>
          <div class="crm-num">${escapeHtml(money(row.ltv))}</div>
        </div>`).join('')}` : ''}`
    : '<div class="crm-empty">Not enough repeat customers yet to judge discount reliance.</div>';

  wrap.innerHTML = `
    <section class="crm-panel">
      <div class="crm-panel-head">
        <h2>Bought together</h2>
        <span class="crm-panel-note">What to bundle. Lift shows attraction beyond chance — 2× means twice as likely as coincidence.</span>
      </div>
      ${affinityHtml}
    </section>

    <section class="crm-panel">
      <div class="crm-panel-head">
        <h2>Where your demand is</h2>
        <span class="crm-panel-note">Shipping ZIPs by revenue. Clusters far from a pickup point are booth or pickup-location candidates.</span>
      </div>
      ${geoHtml}
      ${pickupHtml ? `<div class="crm-detail-section-title">Pickup locations</div>${pickupHtml}` : ''}
    </section>

    <section class="crm-panel">
      <div class="crm-panel-head">
        <h2>How customers find you</h2>
        <span class="crm-panel-note">Counted once per customer, from their first order. Revenue per customer matters more than headcount.</span>
      </div>
      ${acqHtml}
    </section>

    <section class="crm-panel">
      <div class="crm-panel-head">
        <h2>Discount reliance</h2>
        <span class="crm-panel-note">A code given to someone who would have paid full price is margin gone for nothing.</span>
      </div>
      ${discountHtml}
    </section>`;
}

/* ── plan ─────────────────────────────────────────────── */
//
// Deliberately not Jira. No sprints, story points, assignees, epics or
// workflows — there is one of you, and every one of those fields would be
// ceremony with nothing on the other side of it. Three columns and a done
// pile is the most structure a solo operator can actually maintain.

const PLAN_COLUMNS = [
  { id: 'now',   label: 'Now',   note: 'This week' },
  { id: 'next',  label: 'Next',  note: 'Soon, once Now clears' },
  { id: 'later', label: 'Later', note: 'Worth keeping, not urgent' }
];

// Seeded from the roadmap so the board is useful the first time it opens
// rather than being an empty box asking you to do work.
const PLAN_SEED = [
  { title: 'Work out cost per product so the CRM can show margin, not just revenue', status: 'now',
    notes: 'The biggest gap. Everything currently ranks by revenue and nothing knows what anything costs. ~70 products, roughly an hour of entry.' },
  { title: 'Booth offline mode — queue sales when there is no signal', status: 'now',
    notes: 'Needed before the next event, not after. Sales are currently lost if the venue has no coverage.' },
  { title: 'WhatsApp compose from a customer record', status: 'next',
    notes: 'One tap to a pre-filled message with their name and usual products.' },
  { title: 'Track mango spoilage as a real cost', status: 'next',
    notes: 'Damaged boxes exist in the pickup tally but never reach the CRM, so a genuine cost is invisible.' },
  { title: 'Weekly brief and anomaly watch by email', status: 'next',
    notes: 'Monday summary, plus alerts for things like repeated failed checkouts from one person.' },
  { title: 'Pre-season mango campaign builder', status: 'later',
    notes: 'Useless in August, valuable in February. Countdown, task list and mail list from this season data.' },
  { title: 'Season-over-season retention', status: 'later',
    notes: 'Needs April 2027 before there is anything to compare against.' },
  { title: 'B2B wholesale accounts', status: 'later',
    notes: 'Only worth building when a real prospect exists.' }
];

function renderPlan() {
  const board = document.getElementById('crmBoard');
  if (!board) return;

  const tasks = state.tasks;
  const open = tasks.filter((task) => task.status !== 'done');

  const badge = document.getElementById('crmPlanBadge');
  const nowCount = tasks.filter((task) => task.status === 'now').length;
  if (badge) {
    badge.textContent = String(nowCount);
    badge.style.display = nowCount ? 'inline-block' : 'none';
  }

  board.innerHTML = PLAN_COLUMNS.map((column) => {
    const items = open.filter((task) => task.status === column.id);
    return `<section class="crm-panel crm-column">
      <div class="crm-panel-head">
        <h2>${escapeHtml(column.label)}<span class="crm-seg-count">${items.length}</span></h2>
      </div>
      <div class="crm-panel-note" style="margin:-8px 0 12px">${escapeHtml(column.note)}</div>
      ${items.length ? items.map((task) => `
        <div class="crm-task" data-task="${escapeHtml(task.id)}">
          <div class="crm-task-title">${escapeHtml(task.title)}</div>
          ${task.notes ? `<div class="crm-task-notes">${escapeHtml(task.notes)}</div>` : ''}
          <div class="crm-task-actions">
            ${PLAN_COLUMNS.filter((c) => c.id !== column.id).map((c) =>
              `<button class="crm-task-btn" type="button" data-move="${escapeHtml(task.id)}" data-to="${c.id}">→ ${escapeHtml(c.label)}</button>`).join('')}
            <button class="crm-task-btn done" type="button" data-move="${escapeHtml(task.id)}" data-to="done">✓ Done</button>
            <button class="crm-task-btn danger" type="button" data-del="${escapeHtml(task.id)}">Delete</button>
          </div>
        </div>`).join('') : '<div class="crm-empty">Nothing here.</div>'}
    </section>`;
  }).join('');

  const done = tasks.filter((task) => task.status === 'done')
    .sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));

  document.getElementById('crmPlanDone').innerHTML = done.length
    ? done.slice(0, 25).map((task) => `
      <div class="crm-order-row">
        <div>
          <div style="text-decoration:line-through;opacity:.7">${escapeHtml(task.title)}</div>
          <div class="crm-order-meta">${escapeHtml(task.doneAt ? shortDate(new Date(task.doneAt)) : '')}</div>
        </div>
        <button class="crm-task-btn" type="button" data-move="${escapeHtml(task.id)}" data-to="now">Reopen</button>
      </div>`).join('')
    : '<div class="crm-empty">Nothing finished yet.</div>';
}

async function loadPlan() {
  try {
    const snap = await getDocs(collection(db, 'crm_tasks'));
    state.tasks = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

    // First open: fill the board from the roadmap rather than showing nothing.
    if (!state.tasks.length && !state.planSeeded) {
      state.planSeeded = true;
      for (const seed of PLAN_SEED) await addPlanTask(seed.title, seed.status, seed.notes, true);
      return loadPlan();
    }
    renderPlan();
  } catch (error) {
    console.error('Could not load plan', error);
    document.getElementById('crmBoard').innerHTML = '<div class="crm-empty">Could not load the plan.</div>';
  }
}

async function addPlanTask(title, status, notes, quiet) {
  const clean = String(title || '').trim();
  if (!clean) return;
  const now = new Date().toISOString();
  const ref = doc(collection(db, 'crm_tasks'));
  await setDoc(ref, {
    title: clean.slice(0, 140),
    notes: String(notes || '').trim().slice(0, 1000),
    status: status || 'next',
    createdAt: now,
    updatedAt: now,
    doneAt: ''
  });
  if (!quiet) {
    document.getElementById('crmPlanTitle').value = '';
    document.getElementById('crmPlanNotes').value = '';
    await loadPlan();
  }
}

async function movePlanTask(id, to) {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'crm_tasks', id), {
    status: to,
    updatedAt: now,
    doneAt: to === 'done' ? now : ''
  });
  const task = state.tasks.find((entry) => entry.id === id);
  if (task) { task.status = to; task.doneAt = to === 'done' ? now : ''; }
  renderPlan();
}

async function deletePlanTask(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!window.confirm(`Delete "${task?.title || 'this item'}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'crm_tasks', id));
  state.tasks = state.tasks.filter((entry) => entry.id !== id);
  renderPlan();
}

/* ── campaigns ────────────────────────────────────────── */

const CAMPAIGN_AUDIENCES = [
  { id: 'due30',   label: 'Quiet 30+ days', pick: (c) => c.daysSinceNonMango !== null && c.daysSinceNonMango >= 30 },
  { id: 'due60',   label: 'Quiet 60+ days', pick: (c) => c.daysSinceNonMango !== null && c.daysSinceNonMango >= 60 },
  { id: 'running', label: 'Predicted running out', pick: (c) => c.predictedOver !== null && c.predictedOver >= -3 && c.predictedOver <= 45 },
  { id: 'repeat',  label: 'Repeat customers', pick: (c) => c.isRepeat },
  { id: 'vip',     label: 'Top spenders', pick: (c) => c.isVip },
  { id: 'new30',   label: 'New in last 30 days', pick: (c) => c.isNew },
  { id: 'mango',   label: 'Mango buyers', pick: (c) => c.mangoQty > 0 },
  { id: 'all',     label: 'Everyone shown by the current filters', pick: () => true }
];

const CAMPAIGN_FIELDS = {
  checkin: [],
  promo: [
    ['headline', 'Headline', '10% off orders over $70'],
    ['intro', 'Opening line', 'A small thank-you for ordering from us. Until 31 August, take 10% off any order over $70.'],
    ['promoCode', 'Promo code', 'THANKYOU10'],
    ['offerLine', 'Offer summary', '10% off orders over $70 · valid until 31 August'],
    ['terms', 'Terms', 'One use per customer. Applies to the item total before tax and shipping. Cannot be combined with another offer.']
  ],
  announce: [
    ['headline', 'Headline', 'Our Diwali combo is here'],
    ['intro', 'Opening line', 'We have put together something for the festival season.'],
    ['productName', 'Product name', 'Diwali Sweets Combo'],
    ['productDescription', 'Description', 'Sunnundalu, Rava Laddu and Madatha Kaja together in one box.'],
    ['price', 'Price', '$44.99'],
    ['imageUrl', 'Image URL (optional)', 'https://www.shrish.co/images/products/...'],
    ['productUrl', 'Link', 'https://www.shrish.co/shop.html'],
    ['closing', 'Closing line', 'Made fresh to order, so please allow a few days.']
  ]
};

function campaignRecipients() {
  const audience = CAMPAIGN_AUDIENCES.find((a) => a.id === state.campaign.audience) || CAMPAIGN_AUDIENCES[0];
  return state.customers
    .filter(audience.pick)
    .filter((customer) => String(customer.email || '').includes('@'))
    .map((customer) => ({
      email: String(customer.email).trim(),
      firstName: (customer.name || '').split(/\s+/)[0] || '',
      lastProduct: customer.favourites[0]?.[0] || ''
    }));
}

function renderCampaign() {
  const picker = document.getElementById('crmTplPicker');
  if (!picker) return;

  picker.querySelectorAll('[data-tpl]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tpl === state.campaign.template);
  });

  const fields = CAMPAIGN_FIELDS[state.campaign.template] || [];
  document.getElementById('crmCampFields').innerHTML = fields.length
    ? fields.map(([key, label, placeholder]) => `
        <label class="crm-field-label" for="camp-${key}">${escapeHtml(label)}</label>
        ${key === 'intro' || key === 'terms' || key === 'productDescription' || key === 'closing'
          ? `<textarea class="crm-field" id="camp-${key}" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(state.campaign.fields[key] || '')}</textarea>`
          : `<input class="crm-field" id="camp-${key}" type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(state.campaign.fields[key] || '')}" />`}`).join('')
    : '<div class="crm-season-note">This template writes itself from each customer\'s own history. Nothing to fill in.</div>';

  const select = document.getElementById('crmCampAudience');
  if (select.options.length !== CAMPAIGN_AUDIENCES.length) {
    select.innerHTML = CAMPAIGN_AUDIENCES.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('');
  }
  select.value = state.campaign.audience;

  const recipients = campaignRecipients();
  const audience = CAMPAIGN_AUDIENCES.find((a) => a.id === state.campaign.audience);
  const inSegment = state.customers.filter(audience.pick).length;
  const noEmail = inSegment - recipients.length;

  document.getElementById('crmCampCount').innerHTML = recipients.length
    ? `<strong>${recipients.length}</strong> will receive this${noEmail ? ` · ${noEmail} in this group have no email address` : ''}${recipients.length > 120 ? ' · <span style="color:var(--amber)">over the 120 limit, send in batches</span>' : ''}`
    : 'Nobody in this group has an email address.';

  document.getElementById('crmCampCsv').disabled = !recipients.length;
}

function readCampaignFields() {
  const fields = {};
  for (const [key] of CAMPAIGN_FIELDS[state.campaign.template] || []) {
    fields[key] = String(document.getElementById(`camp-${key}`)?.value || '').trim();
  }
  state.campaign.fields = { ...state.campaign.fields, ...fields };
  return fields;
}

/* Email HTML built here rather than server-side, because sending now happens in
   Brevo or Mailchimp. Merge tags differ per provider, so the same template is
   emitted in whichever dialect the chosen tool expects. */

const MERGE_TAGS = {
  brevo:     { first: '{{contact.FIRSTNAME}}', product: '{{contact.LASTPRODUCT}}', unsub: '{{ unsubscribe }}' },
  mailchimp: { first: '*|FNAME|*',             product: '*|LASTPRODUCT|*',        unsub: '*|UNSUB|*' },
  plain:     { first: 'there',                 product: 'your order',             unsub: '#' }
};

const SHRISH_LOGO_ABS = 'https://www.shrish.co/images/brand/logo-small.png';
const SHRISH_REVIEW_ABS = 'https://g.page/r/shrish/review';
const POSTAL_ADDRESS = 'Shrish LLC, Chesterfield, VA, USA';

function campaignHtml() {
  const tags = MERGE_TAGS[state.campaign.esp] || MERGE_TAGS.plain;
  const f = state.campaign.fields;
  const sign = '<p style="margin:18px 0 0;font-size:15px;line-height:1.7;">— Kiran, Shrish</p>';
  const cta = (url, label) =>
    `<div style="text-align:center;margin:0 0 22px;"><a href="${url}" style="display:inline-block;background:#b87512;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 34px;border-radius:50px;">${label}</a></div>`;

  let headline = '';
  let body = '';

  if (state.campaign.template === 'checkin') {
    headline = 'We hope you enjoyed it';
    body = `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi ${tags.first},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
        It has been a little while since your last order, so we wanted to check in.
        We hope the ${tags.product} was everything you hoped for.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">
        We are a small family kitchen, and honest feedback is how we get better. If something was not
        right — the taste, the packing, the delivery — please just reply to this email and tell us.
        We would rather hear it from you than not know.
      </p>
      <div style="background:#fff8ec;border:1px solid #ecd9b6;border-radius:14px;padding:20px 18px;text-align:center;margin-bottom:20px;">
        <div style="font-size:15px;font-weight:700;">Would you leave us a review?</div>
        <div style="font-size:13px;line-height:1.65;color:#6b5842;margin:8px auto 15px;max-width:420px;">
          It takes about thirty seconds and it genuinely helps other families find us.
          Whatever your experience has been, we would like to hear it.
        </div>
        <a href="${SHRISH_REVIEW_ABS}" style="display:inline-block;background:#b87512;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:50px;">Leave a review</a>
      </div>
      <p style="margin:0;font-size:15px;line-height:1.7;">
        And if you are running low, everything is at
        <a href="https://www.shrish.co/shop.html" style="color:#b87512;">shrish.co</a> whenever you need it.
      </p>${sign}`;
  } else if (state.campaign.template === 'promo') {
    headline = f.headline || 'A little something off your next order';
    body = `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi ${tags.first},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">${escapeHtml(f.intro || '')}</p>
      <div style="background:#fff8ec;border:2px dashed #d9a441;border-radius:14px;padding:22px 18px;text-align:center;margin-bottom:20px;">
        <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8a6d3b;">Use code</div>
        <div style="font-size:30px;font-weight:800;letter-spacing:2px;color:#8a5a12;margin:6px 0 4px;">${escapeHtml(f.promoCode || '')}</div>
        <div style="font-size:13px;color:#6b5842;">${escapeHtml(f.offerLine || '')}</div>
      </div>
      ${cta('https://www.shrish.co/shop.html', 'Shop now')}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#6b5842;">${escapeHtml(f.terms || '')}</p>${sign}`;
  } else {
    headline = f.headline || 'Something new at Shrish';
    body = `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi ${tags.first},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">${escapeHtml(f.intro || '')}</p>
      <div style="border:1px solid #ecd9b6;border-radius:14px;overflow:hidden;margin-bottom:20px;">
        ${f.imageUrl ? `<img src="${escapeHtml(f.imageUrl)}" alt="${escapeHtml(f.productName || '')}" style="display:block;width:100%;height:auto;" />` : ''}
        <div style="padding:18px;">
          <div style="font-size:17px;font-weight:700;">${escapeHtml(f.productName || '')}</div>
          <div style="font-size:14px;line-height:1.7;color:#3d3225;margin-top:6px;">${escapeHtml(f.productDescription || '')}</div>
          ${f.price ? `<div style="font-size:18px;font-weight:700;color:#8a5a12;margin-top:10px;">${escapeHtml(f.price)}</div>` : ''}
        </div>
      </div>
      ${cta(escapeHtml(f.productUrl || 'https://www.shrish.co/shop.html'), 'Have a look')}
      <p style="margin:0;font-size:14px;line-height:1.7;color:#6b5842;">${escapeHtml(f.closing || '')}</p>${sign}`;
  }

  return `<html><body style="margin:0;padding:0;background:#ece7df;font-family:Arial,Helvetica,sans-serif;color:#2b2218;">
  <div style="padding:28px 12px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;">
      <div style="background:#b87512;padding:26px 24px;text-align:center;">
        <img src="${SHRISH_LOGO_ABS}" alt="Shrish" width="96" style="display:block;margin:0 auto 12px;" />
        <div style="font-size:11px;letter-spacing:1.6px;font-weight:700;color:#f8ebd4;">SHRISH LLC</div>
        <div style="margin-top:8px;font-size:19px;font-weight:700;color:#ffffff;">${escapeHtml(headline)}</div>
      </div>
      <div style="padding:24px;">${body}</div>
      <div style="background:#f6f1e8;padding:16px 24px;font-size:11px;color:#7a6853;line-height:1.7;text-align:center;">
        You are receiving this because you ordered from Shrish.<br />
        <a href="${tags.unsub}" style="color:#7a6853;">Unsubscribe</a> &nbsp;·&nbsp; ${POSTAL_ADDRESS}
      </div>
    </div>
  </div>
</body></html>`;
}

function exportCampaignCsv() {
  const recipients = campaignRecipients();
  if (!recipients.length) return;
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = recipients.map((r) => [r.email, r.firstName, r.lastProduct].map(cell).join(','));
  const csv = [['EMAIL', 'FIRSTNAME', 'LASTPRODUCT'].map(cell).join(','), ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shrish_${state.campaign.audience}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadCampaignHtml() {
  const blob = new Blob([campaignHtml()], { type: 'text/html;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shrish_${state.campaign.template}_${state.campaign.esp}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyCampaignHtml(button) {
  try {
    await navigator.clipboard.writeText(campaignHtml());
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy HTML'; }, 2000);
  } catch (error) {
    downloadCampaignHtml();
  }
}

/* ── today ────────────────────────────────────────────── */
//
// One screen answering "what should I do right now", ordered by money at stake
// rather than by category. Everything here is an action, not a statistic — if
// there is nothing to do, it says so plainly instead of showing empty widgets.

function buildTodayActions() {
  const actions = [];
  const model = state.reorderModel;

  // 1. Money already earned but not collected.
  const unpaidValue = state.unpaid.reduce((sum, order) => sum + moneyNumber(order.totalPrice), 0);
  if (state.unpaid.length) {
    const chaseable = state.unpaid.filter((order) => !order.paymentRetryEmailSentAt && String(order.email || '').trim()).length;
    actions.push({
      level: 'danger',
      title: `${state.unpaid.length} unpaid checkout${state.unpaid.length === 1 ? '' : 's'}`,
      value: money(unpaidValue),
      body: chaseable
        ? `${chaseable} can be sent a payment link right now. Nothing was charged, so these are real orders that simply did not finish.`
        : 'All have been contacted already, or have no email on file. Worth a phone call.',
      cta: 'Open unpaid',
      view: 'unpaid'
    });
  }

  // 2. Shipped but the customer was never told.
  const silentShipments = state.rawOrders.filter((order) =>
    !order.isTestOrder
    && String(order.trackingNumber || '').trim()
    && !order.shipmentEmailSentAt);
  if (silentShipments.length) {
    actions.push({
      level: 'danger',
      title: `${silentShipments.length} shipment${silentShipments.length === 1 ? '' : 's'} with no tracking email`,
      value: '',
      body: 'These have a tracking number but the customer was never notified. Send it from the admin shipping sheet.',
      cta: 'Open admin',
      href: '../admin.html'
    });
  }

  // 3. Unhappy customers, which decay fast if left.
  const lowRatings = [];
  for (const [key, entries] of state.feedback) {
    for (const entry of entries) {
      const rating = Number(entry.responses?.overallRating || 0);
      if (rating && rating <= 3) lowRatings.push({ key, rating, entry });
    }
  }
  if (lowRatings.length) {
    actions.push({
      level: 'danger',
      title: `${lowRatings.length} customer${lowRatings.length === 1 ? '' : 's'} rated you 3 or below`,
      value: '',
      body: 'Low ratings age badly. A reply within a few days usually turns one around; a month later it rarely does.',
      cta: 'See customers',
      view: 'customers'
    });
  }

  // 4. Predicted to be running out, from measured intervals.
  const dueSoon = state.customers
    .map((customer) => {
      const predictions = model.size ? predictReorders(customer, model) : [];
      const top = predictions[0];
      if (!top) return null;
      if (top.daysOver < -3 || top.daysOver > 45) return null;
      return { customer, top };
    })
    .filter(Boolean)
    .sort((a, b) => b.customer.ltv - a.customer.ltv);

  if (dueSoon.length) {
    const value = dueSoon.reduce((sum, entry) => sum + entry.customer.avgOrder, 0);
    actions.push({
      level: 'warn',
      title: `${dueSoon.length} customer${dueSoon.length === 1 ? '' : 's'} due to run out`,
      value: `${money(value)} typical`,
      body: `Based on how long each product actually lasts your customers, not a fixed rule. Top: ${dueSoon.slice(0, 3).map((entry) => escapeHtml(entry.customer.name || entry.customer.key)).join(', ')}.`,
      cta: 'See who',
      view: 'customers',
      segment: 'predicted'
    });
  }

  // 5. New customers worth a personal note while it still feels personal.
  const newThisWeek = state.customers.filter((customer) =>
    customer.daysSinceFirst !== null && customer.daysSinceFirst <= 7);
  if (newThisWeek.length) {
    actions.push({
      level: 'good',
      title: `${newThisWeek.length} new customer${newThisWeek.length === 1 ? '' : 's'} this week`,
      value: money(newThisWeek.reduce((sum, customer) => sum + customer.ltv, 0)),
      body: 'A short thank-you now is the cheapest thing you can do to earn a second order.',
      cta: 'See them',
      view: 'customers',
      segment: 'new'
    });
  }

  return actions;
}

function renderToday() {
  const wrap = document.getElementById('crmTodayBody');
  if (!wrap) return;

  const actions = buildTodayActions();
  const revenue = state.customers.reduce((sum, customer) => sum + customer.ltv, 0);

  const week = state.rawOrders.filter((order) => {
    const created = toDate(order.createdAt);
    return created && !order.isTestOrder
      && !INCOMPLETE_STATUSES.has(order.status || 'pending')
      && !NON_REVENUE_STATUSES.has(order.status || 'pending')
      && (Date.now() - created.getTime()) <= 7 * 86400000;
  });
  const weekRevenue = week.reduce((sum, order) => sum + moneyNumber(order.totalPrice), 0);

  const actionsHtml = actions.length
    ? actions.map((action) => `
      <div class="crm-action crm-action-${action.level}">
        <div class="crm-action-main">
          <div class="crm-action-title">${escapeHtml(action.title)}${action.value ? `<span class="crm-action-value">${escapeHtml(action.value)}</span>` : ''}</div>
          <div class="crm-action-body">${action.body}</div>
        </div>
        ${action.href
          ? `<a class="crm-action-cta" href="${escapeHtml(action.href)}">${escapeHtml(action.cta)}</a>`
          : `<button class="crm-action-cta" type="button" data-goto="${escapeHtml(action.view)}" ${action.segment ? `data-seg="${escapeHtml(action.segment)}"` : ''}>${escapeHtml(action.cta)}</button>`}
      </div>`).join('')
    : `<div class="crm-allclear">
        <div class="crm-allclear-title">Nothing needs you right now</div>
        <div class="crm-allclear-body">No unpaid checkouts, no silent shipments, no unhappy customers, nobody predicted to be running out. Have a look at Insights instead.</div>
      </div>`;

  document.getElementById('crmTodayHeadline').innerHTML = `
    <div class="crm-headline-item">
      <span class="crm-headline-label">Last 7 days</span>
      <span class="crm-headline-value">${escapeHtml(money(weekRevenue))}</span>
      <span class="crm-headline-note">${week.length} order${week.length === 1 ? '' : 's'}</span>
    </div>
    <div class="crm-headline-item">
      <span class="crm-headline-label">Customers</span>
      <span class="crm-headline-value">${state.customers.length}</span>
      <span class="crm-headline-note">${escapeHtml(money(revenue))} lifetime</span>
    </div>
    <div class="crm-headline-item">
      <span class="crm-headline-label">Needs attention</span>
      <span class="crm-headline-value ${actions.some((a) => a.level === 'danger') ? 'is-danger' : actions.length ? 'is-warn' : 'is-good'}">${actions.length}</span>
      <span class="crm-headline-note">${actions.length ? 'items below' : 'all clear'}</span>
    </div>`;

  wrap.innerHTML = actionsHtml;
}

/* ── mango season ─────────────────────────────────────── */

function currentSeason() {
  return state.seasons.find((season) => season.year === state.season) || state.seasons[0] || null;
}

function renderSeason() {
  const panel = document.getElementById('crmSeasonPanel');
  if (!state.seasons.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const select = document.getElementById('crmSeasonSelect');
  select.innerHTML = state.seasons
    .map((season) => `<option value="${season.year}" ${season.year === state.season ? 'selected' : ''}>${season.year} season</option>`)
    .join('');

  const season = currentSeason();
  if (!season) return;

  const buyers = [...season.customers.values()].sort((a, b) => b.spend - a.spend);
  const repeat = buyers.filter((buyer) => buyer.orders >= 2).length;
  const avgBoxes = buyers.length ? season.boxes / buyers.length : 0;

  const varieties = [...season.varieties.entries()].sort((a, b) => b[1] - a[1]);
  const maxQty = varieties.length ? varieties[0][1] : 1;

  // Cross-season retention needs a prior season to compare against. Say so
  // rather than showing a zero that looks like a finding.
  const prior = state.seasons.find((entry) => entry.year === season.year - 1);
  let retentionHtml;
  if (prior) {
    const returned = [...season.customers.keys()].filter((key) => prior.customers.has(key)).length;
    const rate = prior.customers.size ? Math.round((returned / prior.customers.size) * 100) : 0;
    retentionHtml = `<div class="crm-season-note">
      <strong>${returned}</strong> of ${prior.customers.size} ${prior.year} buyers came back in ${season.year} — ${rate}% season-over-season retention.
    </div>`;
  } else {
    retentionHtml = `<div class="crm-season-note">
      Season-over-season retention needs a second season to compare against. After next season this will show how many ${season.year} buyers returned.
    </div>`;
  }

  document.getElementById('crmSeasonBody').innerHTML = `
    <div class="crm-metrics" style="margin-bottom:16px">
      <div class="crm-metric">
        <div class="crm-metric-label">Mango buyers</div>
        <div class="crm-metric-value">${buyers.length}</div>
        <div class="crm-metric-note">${repeat} ordered more than once</div>
      </div>
      <div class="crm-metric">
        <div class="crm-metric-label">Boxes sold</div>
        <div class="crm-metric-value">${season.boxes}</div>
        <div class="crm-metric-note">${avgBoxes.toFixed(1)} per buyer</div>
      </div>
      <div class="crm-metric">
        <div class="crm-metric-label">Mango revenue</div>
        <div class="crm-metric-value">${escapeHtml(money(season.revenue))}</div>
        <div class="crm-metric-note">${season.orders} orders</div>
      </div>
      <div class="crm-metric">
        <div class="crm-metric-label">Season ran</div>
        <div class="crm-metric-value" style="font-size:17px">${escapeHtml(shortDate(season.firstOrderAt))}</div>
        <div class="crm-metric-note">to ${escapeHtml(shortDate(season.lastOrderAt))}</div>
      </div>
    </div>

    ${(() => {
      const curve = buildSeasonCurve(state.rawOrders, season.year);
      if (curve.length < 2) return '';
      const peak = curve.reduce((best, week) => (week.boxes > best.boxes ? week : best), curve[0]);
      const max = peak.boxes || 1;
      return `<div class="crm-detail-section-title">Weekly demand — plan next year's stock from this</div>
        ${curve.map((week) => `
          <div class="crm-variety-row">
            <span class="crm-variety-name">${escapeHtml(shortDate(week.start))}</span>
            <span class="crm-variety-bar-wrap"><span class="crm-variety-bar" style="width:${Math.round((week.boxes / max) * 100)}%;${week === peak ? 'background:var(--green)' : ''}"></span></span>
            <span class="crm-variety-qty">${week.boxes}</span>
          </div>`).join('')}
        <div class="crm-season-note">
          Peak week began <strong>${escapeHtml(shortDate(peak.start))}</strong> at ${peak.boxes} boxes.
          Stock has to be on hand before that week, not during it.
        </div>`;
    })()}

    <div class="crm-detail-section-title">Boxes by variety</div>
    ${varieties.map(([name, qty]) => `
      <div class="crm-variety-row">
        <span class="crm-variety-name">${escapeHtml(name)}</span>
        <span class="crm-variety-bar-wrap"><span class="crm-variety-bar" style="width:${Math.round((qty / maxQty) * 100)}%"></span></span>
        <span class="crm-variety-qty">${qty}</span>
      </div>`).join('')}

    <div class="crm-detail-section-title">Top buyers</div>
    ${buyers.slice(0, 10).map((buyer) => `
      <div class="crm-order-row">
        <div>
          <div>${escapeHtml(buyer.name || 'No name saved')}</div>
          <div class="crm-order-meta">${escapeHtml(buyer.phone || buyer.key)} · ${buyer.boxes} box${buyer.boxes === 1 ? '' : 'es'} · ${escapeHtml([...buyer.varieties.keys()].slice(0, 2).join(', '))}</div>
        </div>
        <div class="crm-num">${escapeHtml(money(buyer.spend))}</div>
      </div>`).join('')}

    ${retentionHtml}`;
}

// Export aimed at a pre-season announcement: who to contact, and what they
// bought last time so the message can name their varieties.
function exportSeasonCsv() {
  const season = currentSeason();
  if (!season) return;

  const buyers = [...season.customers.values()].sort((a, b) => b.spend - a.spend);
  const cell = (value) => `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`;
  const header = ['Name', 'Phone', 'Email', 'Orders', 'Boxes', 'Spend', 'Varieties bought', 'Top variety'];

  const rows = buyers.map((buyer) => {
    const sorted = [...buyer.varieties.entries()].sort((a, b) => b[1] - a[1]);
    return [
      buyer.name,
      buyer.phone || buyer.key,
      buyer.email,
      buyer.orders,
      buyer.boxes,
      buyer.spend.toFixed(2),
      sorted.map(([name, qty]) => `${name} x${qty}`).join('; '),
      sorted[0]?.[0] || ''
    ].map(cell).join(',');
  });

  const blob = new Blob([[header.map(cell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shrish_mango_${season.year}_campaign_list.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ── unpaid checkouts ─────────────────────────────────── */

function renderUnpaid() {
  const panel = document.getElementById('crmUnpaidPanel');
  const rows = document.getElementById('crmUnpaidRows');
  if (!panel || !rows) return;

  const badge = document.getElementById('crmUnpaidBadge');
  if (badge) {
    badge.textContent = String(state.unpaid.length);
    badge.style.display = state.unpaid.length ? 'inline-block' : 'none';
  }

  if (!state.unpaid.length) {
    panel.style.display = 'block';
    rows.innerHTML = '<div class="crm-empty">No unpaid checkouts. Everyone who reached payment finished it.</div>';
    return;
  }
  panel.style.display = 'block';

  const total = state.unpaid.reduce((sum, order) => sum + moneyNumber(order.totalPrice), 0);

  rows.innerHTML = `<div class="crm-metric-note" style="margin-bottom:6px">
      ${state.unpaid.length} order${state.unpaid.length === 1 ? '' : 's'} · ${escapeHtml(money(total))} not collected
    </div>` + state.unpaid.map((order) => {
    const name = String(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`).trim() || 'No name';
    const created = toDate(order.createdAt);
    const age = daysBetween(created);
    const items = Array.isArray(order.items) ? order.items : [];
    const summary = items.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ')
      + (items.length > 3 ? ` +${items.length - 3} more` : '');
    const phone = String(order.phone || '').replace(/\D/g, '');
    const sent = order.paymentRetryEmailSentAt;
    const isTest = Boolean(order.isTestOrder);
    const canEmail = Boolean(String(order.email || '').trim()) && !sent && !isTest;

    return `<div class="crm-unpaid-row ${isTest ? 'is-test' : ''}">
      <div class="crm-unpaid-main">
        <div class="crm-unpaid-name">${escapeHtml(name)}${isTest ? '<span class="crm-test-badge">Test</span>' : ''}</div>
        <div class="crm-unpaid-meta">${escapeHtml(order.phone || '—')}${order.email ? ` · ${escapeHtml(order.email)}` : ' · no email'}</div>
        <div class="crm-unpaid-meta">${escapeHtml(summary || 'No items')} · ${age === null ? 'unknown age' : `${age}d ago`} · ${escapeHtml(String(order.status || '').replace(/_/g, ' '))}</div>
      </div>
      <div class="crm-unpaid-value">${escapeHtml(money(moneyNumber(order.totalPrice)))}</div>
      <div class="crm-unpaid-actions">
        ${phone ? `<a class="crm-action-btn" href="tel:+1${escapeHtml(phone)}">Call</a>
        <a class="crm-action-btn" href="https://wa.me/1${escapeHtml(phone)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
        ${sent
          ? '<span class="crm-unpaid-sent">Retry email sent</span>'
          : `<button class="crm-action-btn primary" type="button" data-retry="${escapeHtml(order.id)}" ${canEmail ? '' : 'disabled title="Marked as test, already sent, or no email on this order"'}>Send payment link</button>`}
        <button class="crm-action-btn" type="button" data-test="${escapeHtml(order.id)}">${isTest ? 'Unmark test' : 'Mark as test'}</button>
      </div>
    </div>`;
  }).join('');
}

// The only write in this app. Reversible, and it deletes nothing.
async function toggleTestOrder(orderId) {
  const order = state.rawOrders.find((entry) => entry.id === orderId);
  if (!order) return;

  const next = !order.isTestOrder;
  const name = String(order.fullName || order.firstName || 'this order').trim();

  if (next && !window.confirm(
    `Mark ${name}'s order as a test?\n\n`
    + 'It will be hidden from the CRM. Nothing is deleted, and you can undo this '
    + 'any time with the "Show test orders" filter.'
  )) return;

  try {
    await updateDoc(doc(db, 'orders', orderId), {
      isTestOrder: next,
      testMarkedAt: next ? new Date().toISOString() : '',
      testMarkedBy: next ? ADMIN_EMAIL : ''
    });
    order.isTestOrder = next;
    rebuild();
  } catch (error) {
    console.error('Could not update test flag', error);
    window.alert('Could not update this order. Check the console.');
  }
}

// The only action in this app that changes anything. Never automatic, always
// one explicit click plus a confirm, and the function refuses a second send.
async function sendRetryLink(orderId, button) {
  const order = state.unpaid.find((entry) => entry.id === orderId);
  if (!order) return;

  const name = String(order.fullName || order.firstName || 'this customer').trim();
  const confirmed = window.confirm(
    `Send a payment link to ${name} (${order.email})?\n\n`
    + `This creates a fresh Stripe checkout valid for 24 hours and emails it once. `
    + `It cannot be sent again for this order.`
  );
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = 'Sending...';

  try {
    const callable = httpsCallable(cloudFunctions, 'resendPaymentLink');
    await callable({ orderId, origin: window.location.origin });
    order.paymentRetryEmailSentAt = new Date().toISOString();
    renderUnpaid();
  } catch (error) {
    console.error('Payment retry failed', error);
    button.disabled = false;
    button.textContent = 'Send payment link';
    window.alert(error?.message || 'Could not send the payment link. Check the console.');
  }
}

// Views share one data load and one render pass; switching is instant because
// nothing is refetched. Only the chart needs special handling — see setView.
function renderAll() {
  applyFilters();
  renderToday();
  renderInsights();
  renderSeason();
  renderMetrics();
  renderChart();
  renderSegments();
  renderList();
  renderUnpaid();
  renderCampaign();
}

function setView(view) {
  state.view = view;

  document.querySelectorAll('.crm-nav-btn').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });

  document.querySelectorAll('.crm-view').forEach((node) => {
    node.classList.toggle('active', node.id === `view-${view}`);
  });

  // Chart.js measures its canvas at construction time. Built inside a
  // display:none container it computes a zero size and stays collapsed, so the
  // chart is rebuilt whenever Overview becomes visible.
  if (view === 'overview') renderChart();
  if (view === 'plan' && !state.tasks.length) loadPlan();

  try { localStorage.setItem('shrish_crm_view', view); } catch (error) { /* private mode */ }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setSegment(id) {
  state.segment = id;
  renderSegments();
  renderList();
  // Segment chips live on Customers, but the chart on Overview also drills in.
  if (state.view !== 'customers') setView('customers');
  else document.getElementById('crmListTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── detail ───────────────────────────────────────────────────────── */

function openDetail(key) {
  const customer = state.customers.find((entry) => entry.key === key);
  if (!customer) return;

  document.getElementById('crmDetailName').textContent = customer.name || 'No name saved';
  document.getElementById('crmDetailContact').textContent =
    [customer.phone || customer.key, customer.email].filter(Boolean).join(' · ');

  const stats = [
    { label: 'Lifetime', value: money(customer.ltv) },
    { label: 'Orders', value: String(customer.orderCount) },
    { label: 'Avg order', value: money(customer.avgOrder) },
    { label: 'Last order', value: customer.daysSince === null ? '—' : `${customer.daysSince}d ago` },
    { label: 'First order', value: shortDate(customer.firstOrderAt) },
    { label: 'Account', value: customer.hasProfile ? 'Registered' : 'Guest' }
  ];

  const favourites = customer.favourites.length
    ? `<div class="crm-detail-section-title">Buys most often</div>
       <div class="crm-fav">${customer.favourites.map(([name, qty]) =>
         `<span class="crm-fav-item">${escapeHtml(name)} × ${qty}</span>`).join('')}</div>`
    : '';

  state.detailKey = key;
  const overlay = state.overlays.get(key) || { tags: [], notes: '' };

  const tagsHtml = `
    <div class="crm-detail-section-title">Tags</div>
    <div class="crm-tag-row">
      ${CRM_TAGS.map((tag) => `<button class="crm-tag ${overlay.tags.includes(tag) ? 'on' : ''}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
    </div>
    <div class="crm-detail-section-title">Notes</div>
    <textarea class="crm-notes" id="crmNotes" rows="3" maxlength="2000" placeholder="Anything worth remembering — spice preference, delivery quirks, who referred them.">${escapeHtml(overlay.notes || '')}</textarea>
    <div class="crm-notes-row">
      <button class="crm-action-btn primary" type="button" id="crmSaveNotes">Save notes</button>
      <span class="crm-notes-status" id="crmNotesStatus"></span>
    </div>`;

  const dueList = (customer.predictions || []).filter((entry) => entry.daysOver >= -14);
  const declinedList = (customer.declined || []).filter((entry) => entry.daysOver > 0);

  const predictionHtml = (dueList.length || declinedList.length)
    ? `<div class="crm-detail-section-title">Reorder timing</div>
       ${dueList.length ? dueList.slice(0, 5).map((entry) => `
         <div class="crm-order-row">
           <div>
             <div>${escapeHtml(entry.product)}</div>
             <div class="crm-order-meta">Lasts about ${entry.interval} days, measured from ${entry.sample} repeat purchase${entry.sample === 1 ? '' : 's'}</div>
           </div>
           <div class="crm-num"><span class="crm-pill ${entry.daysOver > 21 ? 'over' : entry.daysOver > 0 ? 'due' : 'ok'}">${entry.daysOver > 0 ? `${entry.daysOver}d over` : `in ${Math.abs(entry.daysOver)}d`}</span></div>
         </div>`).join('') : ''}
       ${declinedList.length ? `<div class="crm-order-meta" style="margin-top:10px">Bought before but not taken since it fell due — they have ordered since and chose otherwise: ${escapeHtml(declinedList.slice(0, 4).map((entry) => entry.product).join(', '))}</div>` : ''}`
    : '';

  const reviews = state.feedback.get(key) || [];
  const feedbackHtml = reviews.length
    ? `<div class="crm-detail-section-title">Feedback given</div>
       ${reviews.map((entry) => {
         const rating = Number(entry.responses?.overallRating || 0);
         const stars = rating ? '★'.repeat(Math.min(5, rating)) + '☆'.repeat(Math.max(0, 5 - rating)) : '';
         const comment = String(entry.responses?.comments || entry.responses?.comment || '').trim();
         return `<div class="crm-order-row">
           <div>
             <div>${escapeHtml(stars || 'No rating')} ${rating ? `<span class="crm-order-meta">${rating}/5</span>` : ''}</div>
             <div class="crm-order-meta">${escapeHtml(entry.orderNumber || '')}${comment ? ` · “${escapeHtml(comment)}”` : ''}</div>
           </div>
         </div>`;
       }).join('')}`
    : '';

  const orders = customer.orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items.length : 0;
    return `<div class="crm-order-row">
        <div>
          <div>${escapeHtml(order.orderNumber || order.id || 'Order')}</div>
          <div class="crm-order-meta">${escapeHtml(shortDate(order._createdAt))} · ${items} item${items === 1 ? '' : 's'} · ${escapeHtml(String(order.status || 'pending').replace(/_/g, ' '))}${order.source && order.source !== 'website' ? ` · ${escapeHtml(order.source)}` : ''}</div>
        </div>
        <div class="crm-num">${escapeHtml(money(order._revenue))}</div>
      </div>`;
  }).join('');

  document.getElementById('crmDetailBody').innerHTML = `
    <div class="crm-detail-stats">
      ${stats.map((stat) => `<div class="crm-detail-stat">
        <div class="crm-detail-stat-label">${escapeHtml(stat.label)}</div>
        <div class="crm-detail-stat-value">${escapeHtml(stat.value)}</div>
      </div>`).join('')}
    </div>
    ${favourites}
    ${predictionHtml}
    ${tagsHtml}
    ${feedbackHtml}
    <div class="crm-detail-section-title">Order history</div>
    ${orders || '<div class="crm-empty">No orders found.</div>'}`;

  document.getElementById('crmDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  state.detailKey = '';
  document.getElementById('crmDetailModal').classList.remove('open');
  document.body.style.overflow = '';
}

// Writes only tags and notes. Order data is never written back from here.
async function saveOverlay(key, patch, statusNode) {
  const current = state.overlays.get(key) || { tags: [], notes: '' };
  const next = { ...current, ...patch };
  state.overlays.set(key, next);

  try {
    await setDoc(doc(db, 'crm_customers', key), {
      tags: next.tags,
      notes: next.notes,
      updatedAt: new Date().toISOString(),
      updatedBy: ADMIN_EMAIL
    }, { merge: true });
    if (statusNode) {
      statusNode.textContent = 'Saved';
      statusNode.style.color = '#7EE2A8';
      setTimeout(() => { statusNode.textContent = ''; }, 2200);
    }
  } catch (error) {
    console.error('Could not save customer overlay', error);
    if (statusNode) {
      statusNode.textContent = 'Could not save';
      statusNode.style.color = '#E0736B';
    }
  }
}

/* ── export ───────────────────────────────────────────────────────── */

function exportCsv() {
  const list = visibleCustomers();
  if (!list.length) return;

  const header = ['Name', 'Phone', 'Email', 'Orders', 'Lifetime value', 'Avg order', 'First order', 'Last order', 'Days since', 'Status', 'Top product'];
  const cell = (value) => `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`;

  const rows = list.map((customer) => [
    customer.name,
    customer.phone || customer.key,
    customer.email,
    customer.orderCount,
    customer.ltv.toFixed(2),
    customer.avgOrder.toFixed(2),
    customer.firstOrderAt ? customer.firstOrderAt.toISOString().slice(0, 10) : '',
    customer.lastOrderAt ? customer.lastOrderAt.toISOString().slice(0, 10) : '',
    customer.daysSince === null ? '' : customer.daysSince,
    customer.statusKey,
    customer.favourites[0]?.[0] || ''
  ].map(cell).join(','));

  const blob = new Blob([[header.map(cell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shrish_customers_${state.segment}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ── data load ────────────────────────────────────────────────────── */

async function loadData() {
  const [orderSnap, profileSnap, overlaySnap, feedbackSnap] = await Promise.all([
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'user_profiles')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'crm_customers')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'order_feedback')).catch(() => ({ docs: [] }))
  ]);

  const orders = orderSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const profiles = profileSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

  state.overlays = new Map(overlaySnap.docs.map((snap) => {
    const data = snap.data() || {};
    return [snap.id, { tags: Array.isArray(data.tags) ? data.tags : [], notes: String(data.notes || '') }];
  }));

  // Feedback is keyed on customerUid, so it is matched back to a phone number
  // through the orders it belongs to.
  const phoneByOrderId = new Map(orders.map((order) => [order.id, normalizeDigits(order.phoneDigits || order.phone)]));
  const phoneByUid = new Map();
  for (const order of orders) {
    const phone = normalizeDigits(order.phoneDigits || order.phone);
    if (order.customerUid && phone) phoneByUid.set(order.customerUid, phone);
  }

  state.feedback = new Map();
  for (const snap of feedbackSnap.docs) {
    const entry = { id: snap.id, ...snap.data() };
    const phone = phoneByOrderId.get(entry.orderId) || phoneByUid.get(entry.customerUid) || '';
    if (!phone) continue;
    if (!state.feedback.has(phone)) state.feedback.set(phone, []);
    state.feedback.get(phone).push(entry);
  }

  state.rawOrders = orders;
  state.rawProfiles = profiles;

  document.getElementById('crmLoading').style.display = 'none';
  document.getElementById('crmContent').style.display = 'block';
  rebuild();

  let saved = 'overview';
  try { saved = localStorage.getItem('shrish_crm_view') || 'overview'; } catch (error) { /* private mode */ }
  setView(document.getElementById(`view-${saved}`) ? saved : 'overview');
}

// Recomputes everything from the raw order list. Called on load and whenever a
// test flag changes, so no refresh is needed.
function rebuild() {
  const orders = state.rawOrders;

  state.allCustomers = buildCustomers(orders, state.rawProfiles);

  // Intervals are measured across everyone, then applied back to each person.
  state.reorderModel = buildReorderModel(state.allCustomers);
  for (const customer of state.allCustomers) {
    const predictions = state.reorderModel.size ? predictReorders(customer, state.reorderModel) : [];
    customer.predictions = predictions;
    customer.declined = predictions.declined || [];
    customer.predictedOver = predictions.length ? predictions[0].daysOver : null;
    customer.predictedProduct = predictions.length ? predictions[0].product : '';
  }

  state.seasons = buildSeasons(orders);
  if (!state.seasons.some((season) => season.year === state.season)) {
    state.season = state.seasons[0]?.year ?? null;
  }

  // Recoverable unpaid checkouts: reached Stripe, never completed, still open.
  state.unpaid = orders
    .filter((order) => INCOMPLETE_STATUSES.has(order.status || 'pending')
      || String(order.paymentStatus || '') === 'retry_link_sent')
    .filter((order) => String(order.paymentStatus || '') !== 'paid')
    .filter((order) => state.showTest || !order.isTestOrder)
    .map((order) => ({ ...order, _createdAt: toDate(order.createdAt) }))
    .sort((a, b) => (b._createdAt?.getTime() || 0) - (a._createdAt?.getTime() || 0));

  const testCount = orders.filter((order) => order.isTestOrder).length;

  document.getElementById('crmDataNote').textContent =
    `${state.allCustomers.length} customers from ${orders.length} orders`
    + (state.unpaid.length ? ` · ${state.unpaid.length} unpaid checkout${state.unpaid.length === 1 ? '' : 's'}` : '')
    + (testCount ? ` · ${testCount} marked test` : '');

  renderAll();
}

/* ── auth + wiring ────────────────────────────────────────────────── */

function setLoggedIn(isLoggedIn) {
  document.getElementById('loginScreen').style.display = isLoggedIn ? 'none' : 'flex';
  document.getElementById('crmApp').style.display = isLoggedIn ? 'block' : 'none';
}

function showLoginError(message) {
  document.getElementById('crmLoginErr').textContent = message || '';
}

async function doLogin() {
  const email = String(document.getElementById('crmEmail').value || '').trim();
  const password = String(document.getElementById('crmPassword').value || '');
  if (!email || !password) { showLoginError('Enter your email and password.'); return; }
  if (email.toLowerCase() !== ADMIN_EMAIL) { showLoginError(`CRM access is only available for ${ADMIN_EMAIL}.`); return; }
  showLoginError('');
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.warn('CRM login failed', error);
    showLoginError('Login failed. Check the email and password.');
  }
}

function wire() {
  document.getElementById('crmLoginBtn').addEventListener('click', doLogin);
  ['crmEmail', 'crmPassword'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doLogin();
    });
  });

  document.getElementById('crmLogoutBtn').addEventListener('click', () => signOut(auth));
  document.getElementById('crmExportBtn').addEventListener('click', exportCsv);
  document.getElementById('crmDetailClose').addEventListener('click', closeDetail);

  document.getElementById('crmDetailBody').addEventListener('click', (event) => {
    const tagBtn = event.target.closest('[data-tag]');
    if (tagBtn && state.detailKey) {
      const overlay = state.overlays.get(state.detailKey) || { tags: [], notes: '' };
      const tag = tagBtn.dataset.tag;
      const tags = overlay.tags.includes(tag)
        ? overlay.tags.filter((entry) => entry !== tag)
        : [...overlay.tags, tag];
      tagBtn.classList.toggle('on');
      saveOverlay(state.detailKey, { tags }, document.getElementById('crmNotesStatus'));
      return;
    }

    if (event.target.closest('#crmSaveNotes') && state.detailKey) {
      const notes = String(document.getElementById('crmNotes')?.value || '').trim();
      saveOverlay(state.detailKey, { notes }, document.getElementById('crmNotesStatus'));
    }
  });

  document.getElementById('crmDetailModal').addEventListener('click', (event) => {
    if (event.target?.id === 'crmDetailModal') closeDetail();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetail();
  });

  document.getElementById('crmSegments').addEventListener('click', (event) => {
    const button = event.target.closest('[data-segment]');
    if (button) setSegment(button.dataset.segment);
  });

  document.getElementById('crmCustomerRows').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-key]');
    if (row) openDetail(row.dataset.key);
  });

  document.getElementById('crmSearch').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderList();
  });

  document.getElementById('crmSort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderList();
  });

  const bindToggle = (id, key, onChange) => {
    const button = document.getElementById(id);
    button.addEventListener('click', () => {
      state[key] = !state[key];
      button.classList.toggle('active', state[key]);
      button.setAttribute('aria-pressed', String(state[key]));
      (onChange || renderAll)();
    });
  };

  document.getElementById('crmNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });

  document.getElementById('crmTodayBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-goto]');
    if (!button) return;
    if (button.dataset.seg) { state.segment = button.dataset.seg; renderSegments(); renderList(); }
    setView(button.dataset.goto);
  });

  document.getElementById('crmSeasonSelect').addEventListener('change', (event) => {
    state.season = Number(event.target.value);
    renderSeason();
  });

  document.getElementById('crmSeasonExport').addEventListener('click', exportSeasonCsv);

  document.getElementById('crmTplPicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tpl]');
    if (!button) return;
    readCampaignFields();
    state.campaign.template = button.dataset.tpl;
    renderCampaign();
  });

  document.getElementById('crmCampAudience').addEventListener('change', (event) => {
    state.campaign.audience = event.target.value;
    renderCampaign();
  });

  document.getElementById('crmPlanAdd').addEventListener('click', () => {
    addPlanTask(
      document.getElementById('crmPlanTitle').value,
      document.getElementById('crmPlanStatus').value,
      document.getElementById('crmPlanNotes').value
    );
  });

  document.getElementById('crmPlanTitle').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.getElementById('crmPlanAdd').click();
  });

  document.getElementById('view-plan').addEventListener('click', (event) => {
    const move = event.target.closest('[data-move]');
    if (move) { movePlanTask(move.dataset.move, move.dataset.to); return; }
    const del = event.target.closest('[data-del]');
    if (del) deletePlanTask(del.dataset.del);
  });

  document.getElementById('crmCampEsp').addEventListener('change', (event) => {
    state.campaign.esp = event.target.value;
  });

  document.getElementById('crmCampCsv').addEventListener('click', () => {
    readCampaignFields();
    exportCampaignCsv();
    const status = document.getElementById('crmCampStatus');
    status.style.color = '#7EE2A8';
    status.textContent = 'CSV downloaded. Import it as a list, then paste the HTML into a new campaign.';
  });

  document.getElementById('crmCampCopy').addEventListener('click', (event) => {
    readCampaignFields();
    copyCampaignHtml(event.target);
  });

  document.getElementById('crmCampHtml').addEventListener('click', () => {
    readCampaignFields();
    downloadCampaignHtml();
  });

  document.getElementById('crmCampPreview').addEventListener('click', () => {
    readCampaignFields();
    const win = window.open('', '_blank');
    if (win) { win.document.write(campaignHtml()); win.document.close(); }
  });

  document.querySelectorAll('[data-group]').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.dataset.group;
      const shown = Object.values(state.groups).filter(Boolean).length;
      if (state.groups[group] && shown === 1) return;   // never hide everything
      state.groups[group] = !state.groups[group];
      renderAll();
    });
  });

  bindToggle('crmExcludeOwner', 'excludeOwner');
  bindToggle('crmShowTest', 'showTest', rebuild);

  document.getElementById('crmUnpaidRows').addEventListener('click', (event) => {
    const retry = event.target.closest('[data-retry]');
    if (retry) { sendRetryLink(retry.dataset.retry, retry); return; }
    const test = event.target.closest('[data-test]');
    if (test) toggleTestOrder(test.dataset.test);
  });
}

wire();

onAuthStateChanged(auth, async (user) => {
  if (!user) { setLoggedIn(false); return; }

  if (String(user.email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    setLoggedIn(false);
    showLoginError(`CRM access is only available for ${ADMIN_EMAIL}.`);
    await signOut(auth);
    return;
  }

  showLoginError('');
  setLoggedIn(true);

  try {
    await loadData();
  } catch (error) {
    console.error('Could not load CRM data', error);
    document.getElementById('crmLoading').textContent =
      'Could not load orders. Check the console — you may need to sign in again.';
  }
});
