// Shrish CRM — Phase 1 (read-only).
//
// This file NEVER writes to Firestore. It reads `orders` and `user_profiles`,
// derives one record per customer, and renders. Customer records are computed
// in the browser rather than stored, so `orders` stays the single source of
// truth and there is nothing to keep in sync.
//
// Customer identity is keyed on phoneDigits: it is present and format-validated
// on every order, survives guest checkout, and is already used as a person key
// by order_locks. Email breaks on guest checkout and shared household inboxes.

import {
  db,
  auth,
  collection,
  getDocs,
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

const state = {
  allCustomers: [],
  customers: [],
  unpaid: [],
  segment: 'all',
  search: '',
  sort: 'ltv',
  excludeMango: true,
  excludeOwner: true,
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
    const canEmail = Boolean(String(order.email || '').trim()) && !sent;

    return `<div class="crm-unpaid-row">
      <div class="crm-unpaid-main">
        <div class="crm-unpaid-name">${escapeHtml(name)}</div>
        <div class="crm-unpaid-meta">${escapeHtml(order.phone || '—')}${order.email ? ` · ${escapeHtml(order.email)}` : ' · no email'}</div>
        <div class="crm-unpaid-meta">${escapeHtml(summary || 'No items')} · ${age === null ? 'unknown age' : `${age}d ago`} · ${escapeHtml(String(order.status || '').replace(/_/g, ' '))}</div>
      </div>
      <div class="crm-unpaid-value">${escapeHtml(money(moneyNumber(order.totalPrice)))}</div>
      <div class="crm-unpaid-actions">
        ${phone ? `<a class="crm-action-btn" href="tel:+1${escapeHtml(phone)}">Call</a>
        <a class="crm-action-btn" href="https://wa.me/1${escapeHtml(phone)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
        ${sent
          ? '<span class="crm-unpaid-sent">Retry email sent</span>'
          : `<button class="crm-action-btn primary" type="button" data-retry="${escapeHtml(order.id)}" ${canEmail ? '' : 'disabled title="No email address on this order"'}>Send payment link</button>`}
      </div>
    </div>`;
  }).join('');
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

  state.allCustomers = buildCustomers(orders, profiles);

  // Recoverable unpaid checkouts: reached Stripe, never completed, still open.
  state.unpaid = orders
    .filter((order) => INCOMPLETE_STATUSES.has(order.status || 'pending')
      || String(order.paymentStatus || '') === 'retry_link_sent')
    .filter((order) => String(order.paymentStatus || '') !== 'paid')
    .map((order) => ({ ...order, _createdAt: toDate(order.createdAt) }))
    .sort((a, b) => (b._createdAt?.getTime() || 0) - (a._createdAt?.getTime() || 0));

  document.getElementById('crmDataNote').textContent =
    `${state.allCustomers.length} customers from ${orders.length} orders`
    + (state.unpaid.length ? ` · ${state.unpaid.length} unpaid checkout${state.unpaid.length === 1 ? '' : 's'}` : '');

  document.getElementById('crmLoading').style.display = 'none';
  document.getElementById('crmContent').style.display = 'block';
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

  document.getElementById('crmExcludeMango').addEventListener('change', (event) => {
    state.excludeMango = event.target.checked;
    renderAll();
  });

  document.getElementById('crmExcludeOwner').addEventListener('change', (event) => {
    state.excludeOwner = event.target.checked;
    renderAll();
  });

  document.getElementById('crmUnpaidRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-retry]');
    if (button) sendRetryLink(button.dataset.retry, button);
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
