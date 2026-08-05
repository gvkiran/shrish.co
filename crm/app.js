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
  updateDoc,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  escapeHtml,
  moneyNumber,
  cloudFunctions,
  httpsCallable
} from '../assets/js/firebase-app.js';

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
  excludeMango: true,
  excludeOwner: true,
  showTest: false,
  rawOrders: [],
  rawProfiles: [],
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
      if (isMangoItem(item)) customer.mangoQty += qty;
      else customer.otherQty += qty;
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
    // Bought fresh mangoes and nothing else — a seasonal buyer whose silence
    // says nothing about churn.
    customer.isMangoOnly = customer.mangoQty > 0 && customer.otherQty === 0;

    const days = customer.daysSince;
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
  { id: 'once',    label: 'One order only', test: (c) => c.paidOrderCount === 1 }
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

  const counts = buckets.map((bucket) =>
    state.customers.filter((c) => c.daysSince !== null && c.daysSince >= bucket.min && c.daysSince <= bucket.max).length
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
    list = list.filter((customer) =>
      customer.name.toLowerCase().includes(term)
      || customer.email.toLowerCase().includes(term)
      || customer.key.includes(term.replace(/\D/g, ''))
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
  if (customer.isOverdue) return `<span class="crm-pill over">Overdue ${customer.daysSince}d</span>`;
  if (customer.isDue) return `<span class="crm-pill due">Due ${customer.daysSince}d</span>`;
  if (customer.isNew) return '<span class="crm-pill new">New</span>';
  if (customer.daysSince === null) return '<span class="crm-pill muted">No date</span>';
  return `<span class="crm-pill ok">Active ${customer.daysSince}d</span>`;
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

function applyFilters() {
  const ownerKey = normalizeDigits(window.SHRISH_APP_CONFIG?.supportPhone || '');

  let list = state.allCustomers;
  let mangoRemoved = 0;
  let ownerRemoved = 0;

  if (state.excludeMango) {
    const before = list.length;
    list = list.filter((customer) => !customer.isMangoOnly);
    mangoRemoved = before - list.length;
  }

  if (state.excludeOwner) {
    const before = list.length;
    list = list.filter((customer) =>
      customer.key !== ownerKey
      && String(customer.email || '').trim().toLowerCase() !== ADMIN_EMAIL);
    ownerRemoved = before - list.length;
  }

  state.customers = list;

  const notes = [];
  if (mangoRemoved) notes.push(`${mangoRemoved} mango-only hidden`);
  if (ownerRemoved) notes.push(`${ownerRemoved} own account hidden`);
  const note = document.getElementById('crmFilterNote');
  if (note) note.textContent = notes.length ? notes.join(' · ') : '';
}

/* ── what converts ────────────────────────────────────── */

// Below this many customers a percentage is noise, not a signal. Products with
// smaller samples are still listed but shown as counts without a rate.
const MIN_SAMPLE = 5;

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

  if (!state.unpaid.length) { panel.style.display = 'none'; return; }
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

function renderAll() {
  applyFilters();
  renderInsights();
  renderSeason();
  renderMetrics();
  renderChart();
  renderSegments();
  renderList();
  renderUnpaid();
}

function setSegment(id) {
  state.segment = id;
  renderSegments();
  renderList();
  document.getElementById('crmListTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    <div class="crm-detail-section-title">Order history</div>
    ${orders || '<div class="crm-empty">No orders found.</div>'}`;

  document.getElementById('crmDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  document.getElementById('crmDetailModal').classList.remove('open');
  document.body.style.overflow = '';
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
  const [orderSnap, profileSnap] = await Promise.all([
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'user_profiles')).catch(() => ({ docs: [] }))
  ]);

  const orders = orderSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const profiles = profileSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

  state.rawOrders = orders;
  state.rawProfiles = profiles;

  document.getElementById('crmLoading').style.display = 'none';
  document.getElementById('crmContent').style.display = 'block';
  rebuild();
}

// Recomputes everything from the raw order list. Called on load and whenever a
// test flag changes, so no refresh is needed.
function rebuild() {
  const orders = state.rawOrders;

  state.allCustomers = buildCustomers(orders, state.rawProfiles);
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

  document.getElementById('crmSeasonSelect').addEventListener('change', (event) => {
    state.season = Number(event.target.value);
    renderSeason();
  });

  document.getElementById('crmSeasonExport').addEventListener('click', exportSeasonCsv);

  bindToggle('crmExcludeMango', 'excludeMango');
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
