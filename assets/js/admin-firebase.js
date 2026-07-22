import {
  db,
  auth,
  collection,
  doc,
  getDocs,
  deleteDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  cloudFunctions,
  httpsCallable,
  serverTimestamp,
  moneyNumber,
  escapeHtml,
  formatDate,
  formatDateInput,
  formatCurrency,
  orderItemsSummary
} from './firebase-app.js';

const BASE_PRODUCTS = JSON.parse(JSON.stringify(window.SHRISH_DATA?.products || []));
const GO_LIVE_STATS_DATE = '2026-04-10';
const EXCEL_CALC_DOC_PREFIX = 'excel_sheet__';
const DAMAGED_BOX_UNIT_PRICE = 56; // Default spoiled box price — override per product in tally
const PICKUP_TALLY_MANGOES = [
  { id: 'alphonso', label: 'Alphonso', code: 'A', price: 56 },
  { id: 'kesar', label: 'Kesar', code: 'K', price: 55 },
  { id: 'banganapalli', label: 'Banganapalli', code: 'B', price: 56 },
  { id: 'himayat', label: 'Himayat', code: 'H', price: 58 },
  { id: 'rasalu', label: 'Rasalu', code: 'R', price: 55 },
  { id: 'payari', label: 'Payari', code: 'P', price: 55 },
  { id: 'langra', label: 'Langra', code: 'L', price: 55 }
];
const PICKUP_TALLY_LEGACY_PRICES = {
  alphonso: 54,
  kesar: 52,
  banganapalli: 53,
  himayat: 56,
  rasalu: 52,
  payari: 50,
  langra: 50
};
const REMINDER_EMAIL_BATCH_SIZE = 50;
// Expose for refund module
window._firestoreExports = { collection, doc, updateDoc, addDoc: typeof addDoc !== 'undefined' ? addDoc : null, onSnapshot, orderBy, query };

const NON_REVENUE_ORDER_STATUSES = ['cancelled', 'no_show'];
const ADMIN_EMAIL = normalizeLookup(window.SHRISH_APP_CONFIG?.adminEmailHint || 'contact@shrish.co');
const deleteCustomerAccount = httpsCallable(cloudFunctions, 'deleteCustomerAccount');
const getOwnerAnalytics = httpsCallable(cloudFunctions, 'getOwnerAnalytics');
const sendProductAvailabilityEmails = httpsCallable(cloudFunctions, 'sendProductAvailabilityEmails');

const state = {
  orders: [],
  products: JSON.parse(JSON.stringify(BASE_PRODUCTS)),
  customers: [],
  feedback: [],
  subscribers: [],
  accountingBatches: {},
  accounting2Records: {},
  accountingView: 'open',
  ownerAnalytics: null,
  ownerAnalyticsLoading: false,
  ownerAnalyticsError: '',
  selectedAccountingBatch: '',
  productFilter: 'all',
  productPickleFilter: 'all',
  selectedReminderOrderIds: new Set(),
  orderSheet: 'active',
  orderEditor: {
    orderId: '',
    items: [],
    mode: 'edit'
  },
  orderFilters: {
    active: { status: 'pending', dateFrom: '', dateTo: '', search: '', location: 'all' },
    specialty: { status: 'pending', dateFrom: '', dateTo: '', search: '', location: 'all' },
    processed: { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' },
    all: { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' }
  },
  unsubOrders: null,
  unsubProducts: null,
  unsubCustomers: null,
  unsubFeedback: null,
  unsubSubscribersGeneral: null,
  unsubSubscribersProduct: null,
  unsubAccountingBatches: null,
  unsubAccounting2Records: null
};
window._adminState = state; // expose for tally walkup calc

function normalizeProductCategory(category) {
  return category === 'Mango Jelly' ? 'jellysnacks' : category;
}

function showToast(msg) {
  const t = document.getElementById('adminToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function isAuthorizedAdmin(user) {
  return normalizeLookup(user?.email || '') === ADMIN_EMAIL;
}

function showLoginError(message) {
  const errorEl = document.getElementById('loginErr');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

function clearLoginError() {
  const errorEl = document.getElementById('loginErr');
  if (errorEl) errorEl.style.display = 'none';
}

function unsubscribeAdminData() {
  state.unsubOrders?.();
  state.unsubProducts?.();
  state.unsubCustomers?.();
  state.unsubFeedback?.();
  state.unsubSubscribersGeneral?.();
  state.unsubSubscribersProduct?.();
  state.unsubAccountingBatches?.();
  state.unsubAccounting2Records?.();

  state.unsubOrders = null;
  state.unsubProducts = null;
  state.unsubCustomers = null;
  state.unsubFeedback = null;
  state.unsubSubscribersGeneral = null;
  state.unsubSubscribersProduct = null;
  state.unsubAccountingBatches = null;
  state.unsubAccounting2Records = null;
  state.selectedReminderOrderIds.clear();
}

  async function doLogin() {
    const email = document.getElementById('adminEmail')?.value?.trim();
    const password = document.getElementById('adminPw')?.value || '';
    const btn = document.querySelector('.login-btn');

    if (!email) { showLoginError('⚠️ Please enter your email address.'); return; }
    if (!password) { showLoginError('⚠️ Please enter your password.'); return; }

    if (normalizeLookup(email) !== ADMIN_EMAIL) {
      showLoginError('❌ Wrong email. Admin login requires: ' + ADMIN_EMAIL);
      return;
    }

    if (btn) { btn.textContent = 'Logging in...'; btn.disabled = true; }
    clearLoginError();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearLoginError();
    } catch (error) {
      console.error('Login error:', error.code, error.message);
      const msgs = {
        'auth/wrong-password':         '❌ Wrong password. Please try again.',
        'auth/invalid-credential':     '❌ Wrong password. Please try again.',
        'auth/user-not-found':         '❌ No account found for this email.',
        'auth/invalid-email':          '❌ Invalid email address format.',
        'auth/too-many-requests':      '⚠️ Too many failed attempts. Try again later.',
        'auth/network-request-failed': '⚠️ Network error. Check your connection.',
        'auth/user-disabled':          '❌ This account has been disabled.',
      };
      showLoginError(msgs[error.code] || ('❌ Login failed (' + error.code + '). Check email and password.'));
    } finally {
      if (btn) { btn.textContent = 'Login →'; btn.disabled = false; }
    }
  }

async function doLogout() {
  await signOut(auth);
}

function setLoggedInUi(isLoggedIn, email = '') {
  document.getElementById('loginScreen').style.display = isLoggedIn ? 'none' : 'flex';
  document.getElementById('dashboard').style.display = isLoggedIn ? 'block' : 'none';
  const label = document.getElementById('adminUserEmail');
  if (label) label.textContent = email || '';
}

async function seedProductsIfNeeded() {
  const snapshot = await getDocs(collection(db, 'products'));
  const existingIds = new Set(snapshot.docs.map((snap) => snap.id));
  const missingProducts = BASE_PRODUCTS.filter((product) => !existingIds.has(product.id));
  if (!missingProducts.length) return;

  await Promise.all(missingProducts.map((product) => setDoc(doc(db, 'products', product.id), {
    ...product,
    updatedAt: new Date().toISOString()
  })));
  showToast(`${missingProducts.length} missing products added to Firestore`);
}

// Push prices, sizes and catalog text from the website catalog (data.js -> BASE_PRODUCTS)
// into Firestore. Admin-controlled live/off/coming-soon/hidden states are preserved for
// existing products so a catalog price sync cannot accidentally make sold-out mangoes live.
function adminCatalogSyncMessage() {
  return [
    'Update the LIVE store to match the website catalog?',
    '',
    'This syncs prices, pack sizes, names and descriptions used at checkout.',
    'Current admin statuses are preserved: Live, Off, Coming Soon and Hidden will not be changed.',
    '',
    'Product photos and sort order are kept.',
    '',
    'Continue?'
  ].join('\n');
}

async function syncCatalogPrices() {
  const confirmed = window.confirm(adminCatalogSyncMessage());
  if (!confirmed) return;
  showToast('Syncing catalog details while keeping admin statuses...');
  const iso = new Date().toISOString();
  const existingById = new Map(state.products.map((product) => [product.id, product]));
  const CARRY = ['ingredientsText', 'storageNote', 'shelfLifeDisplay', 'foodSafetyNote',
    'shippingNote', 'details', 'season', 'taste', 'bestFor', 'filterGroup', 'preorderOnly', 'origin'];
  const buildPayload = (p) => {
    const existing = existingById.get(p.id);
    const out = {
      name: p.name,
      category: p.category,
      localName: p.localName != null ? p.localName : '',
      price: p.price != null ? p.price : '',
      unit: p.unit != null ? p.unit : '',
      available: existing ? Boolean(existing.available) : p.available !== false,
      displayOnly: existing ? Boolean(existing.displayOnly) : Boolean(p.displayOnly),
      hidden: existing ? Boolean(existing.hidden) : Boolean(p.hidden),
      description: p.description != null ? p.description : '',
      tag: p.tag != null ? p.tag : '',
      catalogSyncedAt: iso,
      updatedAt: iso
    };
    if (Array.isArray(p.variants)) out.variants = p.variants.map((v) => ({ ...v }));
    if (Array.isArray(p.badges)) out.badges = p.badges.slice();
    CARRY.forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
    return out;
  };
  const results = await Promise.allSettled(
    BASE_PRODUCTS.map((p) => setDoc(doc(db, 'products', p.id), buildPayload(p), { merge: true }))
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const fail = results.length - ok;
  if (fail) console.warn('Catalog sync failures', results.filter((r) => r.status === 'rejected'));
  showToast(`Synced ${ok} products; admin live/off/hidden statuses were preserved${fail ? `, ${fail} failed (see console)` : ''}.`);
}

function renderStats() {
  const orders = state.orders;
  const statsOrders = orders.filter((order) => {
    const createdKey = orderDateKey(order);
    return createdKey && createdKey >= GO_LIVE_STATS_DATE;
  });
  const total = statsOrders.length;
  const pending = orders.filter((o) => o.status === 'pending').length;
  const fulfilledOrders = statsOrders.filter((o) => o.status === 'fulfilled');
  const fulfilled = fulfilledOrders.length;
  const totalBoxes = fulfilledOrders.reduce((sum, order) => sum + (order.totalBoxes || 0), 0);
  const totalRevenue = fulfilledOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const available = state.products.filter((product) => product.available && !product.displayOnly && !product.hidden).length;
  const totalProducts = state.products.filter((product) => !product.displayOnly && !product.hidden).length;
  const totalSubscribers = state.subscribers.length;

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card"><div class="s-label">Total Orders</div><div class="s-value">${total}</div></div>
    <div class="stat-card"><div class="s-label">Pending Pickup</div><div class="s-value gold">${pending}</div></div>
    <div class="stat-card"><div class="s-label">Fulfilled</div><div class="s-value">${fulfilled}</div></div>
    <div class="stat-card"><div class="s-label">Revenue</div><div class="s-value gold">${formatCurrency(totalRevenue)}</div></div>
    <div class="stat-card"><div class="s-label">Boxes</div><div class="s-value">${totalBoxes}</div></div>
    <div class="stat-card"><div class="s-label">Products Live</div><div class="s-value">${available} / ${totalProducts}</div></div>
    <div class="stat-card"><div class="s-label">Subscribers</div><div class="s-value">${totalSubscribers}</div></div>`;
}

function growthDays() {
  const value = Number(document.getElementById('growthRange')?.value || 30);
  return Number.isFinite(value) ? value : 30;
}

function growthCategory() {
  return document.getElementById('growthCategory')?.value || 'all';
}

function growthCategoryLabel(category = growthCategory()) {
  const labels = {
    all: 'All categories',
    mangoes: 'Mangoes',
    sweets: 'Sweets',
    pickles: 'Pickles',
    podi: 'Podi',
    snacks: 'Snacks'
  };
  return labels[category] || category;
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function numberCompact(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-US', { notation: num >= 10000 ? 'compact' : 'standard' }).format(num);
}

function percentText(value) {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function analyticsCountMap() {
  const rows = state.ownerAnalytics?.eventCounts || [];
  return rows.reduce((acc, row) => {
    acc[row.event] = {
      total: Number(row.totalEvents || 0),
      people: Number(row.uniquePeople || 0)
    };
    return acc;
  }, {});
}

function eventPeople(eventName) {
  return analyticsCountMap()[eventName]?.people || 0;
}

function eventTotal(eventName) {
  return analyticsCountMap()[eventName]?.total || 0;
}

function productLookupById() {
  return state.products.reduce((acc, product) => {
    if (product?.id) acc[product.id] = product;
    return acc;
  }, {});
}

function productLookupByName() {
  return state.products.reduce((acc, product) => {
    if (product?.name) acc[normalizeLookup(product.name)] = product;
    return acc;
  }, {});
}

function growthCategoryFromProduct(product = {}) {
  const category = normalizeProductCategory(product.category || '');
  const filterGroup = String(product.filterGroup || '').toLowerCase();
  if (category === 'mangoes') return 'mangoes';
  if (category === 'putharekulu' || category === 'jellysnacks') return 'sweets';
  if (category === 'snacks') return 'snacks';
  if (category === 'picklespodi') return filterGroup.includes('podi') ? 'podi' : 'pickles';
  return category || 'unknown';
}

function growthCategoryFromAnalytics(row = {}) {
  const category = normalizeProductCategory(row.category || '');
  const filterGroup = String(row.filterGroup || '').toLowerCase();
  if (category === 'mangoes') return 'mangoes';
  if (category === 'putharekulu' || category === 'jellysnacks') return 'sweets';
  if (category === 'snacks') return 'snacks';
  if (category === 'picklespodi') return filterGroup.includes('podi') ? 'podi' : 'pickles';
  return category || 'unknown';
}

function orderItemProductId(item = {}) {
  return String(item.productId || item.id || '').split('__')[0];
}

function productForOrderItem(item = {}) {
  const byId = productLookupById();
  const id = orderItemProductId(item);
  if (id && byId[id]) return byId[id];
  return productLookupByName()[normalizeLookup(item.name || '')] || null;
}

function selectedCategoryMatches(category) {
  const selected = growthCategory();
  return selected === 'all' || selected === category;
}

function localSubscriberCount(days = growthDays()) {
  const cutoff = dateDaysAgo(days);
  return state.subscribers.filter((entry) => {
    const raw = entry?.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry?.createdAt || 0);
    return !Number.isNaN(raw.getTime()) && raw.toISOString().slice(0, 10) >= cutoff;
  }).length;
}

function localGrowthSummary(days = growthDays()) {
  const cutoff = dateDaysAgo(days);
  const orders = state.orders.filter((order) => {
    const key = orderDateKey(order);
    return key && key >= cutoff;
  });
  if (growthCategory() !== 'all') {
    const matchingOrderIds = new Set();
    let revenue = 0;
    let boxes = 0;
    let fulfilledCount = 0;

    orders.forEach((order) => {
      let orderMatches = false;
      (order.items || []).forEach((item) => {
        const catalogProduct = productForOrderItem(item);
        if (!selectedCategoryMatches(growthCategoryFromProduct(catalogProduct || {}))) return;
        orderMatches = true;
        if (!NON_REVENUE_ORDER_STATUSES.includes(order.status || 'pending')) {
          const qty = Number(item.qty || item.quantity || item.boxes || 0);
          boxes += qty;
          revenue += Number(item.lineTotal || 0) || (moneyNumber(item.price || item.unitPrice || 0) * qty);
        }
      });
      if (orderMatches) {
        matchingOrderIds.add(order.id || order.orderNumber || JSON.stringify(order.createdAt || ''));
        if (order.status === 'fulfilled') fulfilledCount += 1;
      }
    });

    const orderCount = matchingOrderIds.size;
    return {
      orders: orders.filter((order) => matchingOrderIds.has(order.id || order.orderNumber || JSON.stringify(order.createdAt || ''))),
      orderCount,
      fulfilledCount,
      revenue,
      boxes,
      avgOrder: orderCount ? revenue / orderCount : 0,
      subscribers: localSubscriberCount(days)
    };
  }
  const revenueOrders = orders.filter((order) => !NON_REVENUE_ORDER_STATUSES.includes(order.status || 'pending'));
  const fulfilledOrders = revenueOrders.filter((order) => order.status === 'fulfilled');
  const revenue = revenueOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const boxes = revenueOrders.reduce((sum, order) => sum + Number(order.totalBoxes || 0), 0);
  const avgOrder = revenueOrders.length ? revenue / revenueOrders.length : 0;
  return {
    orders,
    orderCount: orders.length,
    fulfilledCount: fulfilledOrders.length,
    revenue,
    boxes,
    avgOrder,
    subscribers: localSubscriberCount(days)
  };
}

function localTopOrderedProducts(days = growthDays()) {
  const cutoff = dateDaysAgo(days);
  const products = new Map();
  state.orders.forEach((order) => {
    const key = orderDateKey(order);
    if (!key || key < cutoff || NON_REVENUE_ORDER_STATUSES.includes(order.status || 'pending')) return;
    (order.items || []).forEach((item) => {
      const catalogProduct = productForOrderItem(item);
      const category = growthCategoryFromProduct(catalogProduct || {});
      if (!selectedCategoryMatches(category)) return;
      const name = String(item.name || item.productTitle || item.id || 'Unknown product').trim();
      const current = products.get(name) || { product: name, category: growthCategoryLabel(category), boxes: 0, revenue: 0, orders: 0 };
      const qty = Number(item.qty || item.quantity || item.boxes || 0);
      const lineRevenue = Number(item.lineTotal || 0) || (moneyNumber(item.price || item.unitPrice || 0) * qty);
      current.boxes += qty;
      current.revenue += lineRevenue;
      current.orders += 1;
      products.set(name, current);
    });
  });
  return [...products.values()]
    .sort((a, b) => b.revenue - a.revenue || b.boxes - a.boxes)
    .slice(0, 12);
}

function localCategoryBreakdown(days = growthDays()) {
  const cutoff = dateDaysAgo(days);
  const categories = new Map();

  state.orders.forEach((order) => {
    const key = orderDateKey(order);
    if (!key || key < cutoff || NON_REVENUE_ORDER_STATUSES.includes(order.status || 'pending')) return;
    (order.items || []).forEach((item) => {
      const catalogProduct = productForOrderItem(item);
      const category = growthCategoryFromProduct(catalogProduct || {});
      if (!category || category === 'unknown') return;
      const current = categories.get(category) || {
        category,
        label: growthCategoryLabel(category),
        boxes: 0,
        revenue: 0,
        lines: 0
      };
      const qty = Number(item.qty || item.quantity || item.boxes || 0);
      current.boxes += qty;
      current.revenue += Number(item.lineTotal || 0) || (moneyNumber(item.price || item.unitPrice || 0) * qty);
      current.lines += 1;
      categories.set(category, current);
    });
  });

  return [...categories.values()].sort((a, b) => b.revenue - a.revenue);
}

function filteredAnalyticsRows(rows = []) {
  return rows.filter((row) => selectedCategoryMatches(growthCategoryFromAnalytics(row)));
}

function localOrderMix(days = growthDays()) {
  const cutoff = dateDaysAgo(days);
  const locations = new Map();
  const statuses = new Map();
  const paymentMethods = new Map();

  state.orders.forEach((order) => {
    const key = orderDateKey(order);
    if (!key || key < cutoff) return;
    const location = order.pickupLocationLabel || order.locationLabel || order.location || order.pickupLocation || 'Unknown pickup';
    const status = order.status || 'pending';
    const method = order.paymentMethodLabel || order.paymentMethod || order.payment || 'Not selected';

    locations.set(location, (locations.get(location) || 0) + 1);
    statuses.set(status, (statuses.get(status) || 0) + 1);
    paymentMethods.set(method, (paymentMethods.get(method) || 0) + 1);
  });

  const rows = [];
  [...locations.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, total]) => rows.push({ group: 'Pickup', label, total }));
  [...statuses.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, total]) => rows.push({ group: 'Status', label: orderStatusLabel(label), total }));
  [...paymentMethods.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, total]) => rows.push({ group: 'Payment', label, total }));

  return rows.slice(0, 16);
}

function renderGrowthKpis(summary) {
  const connected = state.ownerAnalytics?.connected;
  const cards = [
    { label: 'Website visitors', value: connected ? numberCompact(eventPeople('page_viewed')) : 'Setup', note: 'PostHog unique visitors' },
    { label: 'Product clicks', value: connected ? numberCompact(eventTotal('product_details_opened')) : 'Setup', note: 'Products opened' },
    { label: 'Cart adds', value: connected ? numberCompact(eventTotal('product_added_to_cart')) : 'Setup', note: 'Purchase interest' },
    { label: 'Orders database', value: numberCompact(summary.orderCount), note: `Business total, not funnel` },
    { label: 'Tracked orders', value: connected ? numberCompact(eventTotal('order_submitted')) : 'Setup', note: 'PostHog order events' },
    { label: 'Fulfilled', value: numberCompact(summary.fulfilledCount), note: 'Completed pickups' },
    { label: 'Revenue', value: formatCurrency(summary.revenue), note: 'Pending + fulfilled, excluding cancelled/no-show' },
    { label: 'Avg order', value: formatCurrency(summary.avgOrder), note: `${summary.boxes} boxes total` },
    { label: 'New subscribers', value: numberCompact(summary.subscribers), note: 'Email + notify requests' },
  ];

  document.getElementById('growthKpis').innerHTML = cards.map((card) => `
    <div class="growth-kpi">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.note)}</small>
    </div>
  `).join('');
}

function renderGrowthFunnel(summary) {
  const connected = state.ownerAnalytics?.connected;
  const steps = [
    { label: 'Website visitors', value: eventPeople('page_viewed'), source: 'PostHog' },
    { label: 'Shop visitors', value: eventPeople('shop_viewed'), source: 'PostHog' },
    { label: 'Cart adders', value: eventPeople('product_added_to_cart'), source: 'PostHog' },
    { label: 'Checkout visitors', value: Math.max(eventPeople('checkout_viewed'), eventPeople('checkout_started')), source: 'PostHog' },
    { label: 'Submit attempted', value: eventPeople('order_submit_attempted'), source: 'PostHog' },
    { label: 'Orders submitted', value: eventPeople('order_submitted'), source: 'PostHog' },
  ];
  const max = Math.max(...steps.map((step) => Number(step.value || 0)), 1);

  document.getElementById('growthFunnel').innerHTML = steps.map((step, index) => {
    const previous = index ? steps[index - 1].value : step.value;
    const keepRate = previous ? step.value / previous : 0;
    const dropRate = index ? Math.max(0, 1 - keepRate) : 0;
    const width = connected || step.value ? Math.max(8, (step.value / max) * 100) : 8;
    return `
      <div class="growth-funnel-row">
        <div class="growth-funnel-label">
          <strong>${escapeHtml(step.label)}</strong>
          <span>${escapeHtml(step.source)}</span>
        </div>
        <div class="growth-funnel-bar">
          <div style="width:${width}%"></div>
        </div>
        <div class="growth-funnel-value">
          <strong>${numberCompact(step.value)}</strong>
          <span>${index ? `${percentText(dropRate)} drop` : 'Start'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderGrowthTable(targetId, rows, columns, emptyText) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows?.length) {
    target.innerHTML = `<div class="growth-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  target.innerHTML = `
    <table>
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${columns.map((column) => `<td>${escapeHtml(column.format ? column.format(row[column.key], row) : row[column.key])}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>`;
}

function renderGrowthTables() {
  const analytics = state.ownerAnalytics || {};
  renderGrowthTable('growthPages', analytics.topPages || [], [
    { key: 'page', label: 'Page' },
    { key: 'views', label: 'Views', format: numberCompact },
    { key: 'visitors', label: 'People', format: numberCompact },
  ], 'PostHog page data will show here after the API secret is connected.');

  renderGrowthTable('growthClickedProducts', filteredAnalyticsRows(analytics.clickedProducts || []), [
    { key: 'productTitle', label: 'Product' },
    { key: 'category', label: 'Category', format: (_value, row) => growthCategoryLabel(growthCategoryFromAnalytics(row)) },
    { key: 'clicks', label: 'Clicks', format: numberCompact },
    { key: 'people', label: 'People', format: numberCompact },
  ], 'Product clicks are tracked as product_details_opened.');

  renderGrowthTable('growthAddedProducts', filteredAnalyticsRows(analytics.addedProducts || []), [
    { key: 'productTitle', label: 'Product' },
    { key: 'category', label: 'Category', format: (_value, row) => growthCategoryLabel(growthCategoryFromAnalytics(row)) },
    { key: 'adds', label: 'Adds', format: numberCompact },
    { key: 'people', label: 'People', format: numberCompact },
  ], 'Cart adds are tracked as product_added_to_cart.');

  renderGrowthTable('growthOrderedProducts', localTopOrderedProducts(), [
    { key: 'product', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'boxes', label: 'Boxes', format: numberCompact },
    { key: 'revenue', label: 'Revenue', format: formatCurrency },
    { key: 'orders', label: 'Lines', format: numberCompact },
  ], 'No ordered products found for this date range.');

  renderGrowthTable('growthOrderMix', localOrderMix(), [
    { key: 'group', label: 'Type' },
    { key: 'label', label: 'Value' },
    { key: 'total', label: 'Orders', format: numberCompact },
  ], 'No orders found for this date range.');
}

function renderGrowthCategoryBreakdown() {
  const target = document.getElementById('growthCategoryBreakdown');
  if (!target) return;
  const rows = localCategoryBreakdown();
  const filtered = growthCategory() === 'all'
    ? rows
    : rows.filter((row) => row.category === growthCategory());
  if (!filtered.length) {
    target.innerHTML = '<div class="growth-empty">No category demand found for this date range.</div>';
    return;
  }
  const maxRevenue = Math.max(...filtered.map((row) => row.revenue), 1);
  target.innerHTML = filtered.map((row) => `
    <div class="growth-chart-row">
      <div class="growth-chart-label">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${numberCompact(row.boxes)} boxes / ${numberCompact(row.lines)} order lines</span>
      </div>
      <div class="growth-chart-track">
        <div style="width:${Math.max(8, (row.revenue / maxRevenue) * 100)}%"></div>
      </div>
      <div class="growth-chart-value">${formatCurrency(row.revenue)}</div>
    </div>
  `).join('');
}

function renderGrowthActions(summary) {
  const actions = [];
  const connected = state.ownerAnalytics?.connected;
  const productClicks = eventPeople('product_details_opened');
  const cartAdds = eventPeople('product_added_to_cart');
  const checkoutStarts = eventPeople('checkout_started');
  const orders = eventPeople('order_submitted');
  const topClicked = state.ownerAnalytics?.clickedProducts?.[0];
  const topAdded = state.ownerAnalytics?.addedProducts?.[0];

  if (!connected) {
    actions.push('Orders, revenue, top ordered products, pickup demand, and subscribers are visible now from Firestore.');
    actions.push('Connect and deploy the PostHog analytics function to unlock visitor paths, page views, product clicks before cart, and true drop-off.');
  }
  if (connected && productClicks > 0 && cartAdds / productClicks < 0.25) {
    actions.push('Many shoppers open products but do not add to cart. Improve product photos, price clarity, or the add-to-cart button near the top.');
  }
  if (connected && checkoutStarts > 0 && orders / checkoutStarts < 0.65) {
    actions.push('Checkout is leaking orders. Review pickup date clarity, payment wording, required fields, and error messages.');
  }
  if (topClicked && topAdded && topClicked.productId !== topAdded.productId) {
    actions.push(`${topClicked.productTitle} gets the most clicks, but ${topAdded.productTitle} gets the most cart adds. Feature the cart-winning product higher.`);
  }
  if (summary.orderCount > 0 && summary.avgOrder < 50) {
    actions.push('Average order is below $50. Try bundles or "add one more box" suggestions before checkout.');
  }
  if (!actions.length) {
    actions.push('The main funnel looks healthy. Watch the top clicked products and keep improving the pages that bring orders.');
  }

  document.getElementById('growthActions').innerHTML = actions.map((action) => `
    <div class="growth-action-item">${escapeHtml(action)}</div>
  `).join('');
}

function renderGrowthIssues(summary) {
  const issues = [];
  const connected = state.ownerAnalytics?.connected;
  const productClicks = eventPeople('product_details_opened');
  const cartAdds = eventPeople('product_added_to_cart');
  const checkoutStarts = eventPeople('checkout_started');
  const orders = eventPeople('order_submitted');
  const trackedOrderEvents = eventTotal('order_submitted');
  const submitFailures = eventTotal('order_submit_failed');

  if (!connected) {
    issues.push({ level: 'warn', text: 'PostHog API is not connected to this dashboard yet. We can see orders, but not true visitor drop-off or product-click behavior here.' });
  }
  if (connected && productClicks === 0 && summary.orderCount > 0) {
    issues.push({ level: 'warn', text: 'Orders exist but product click events are zero. Check that PostHog script loads before shop-firebase.js and that ad blockers are not hiding all events.' });
  }
  if (connected && productClicks > 0 && cartAdds / productClicks < 0.2) {
    issues.push({ level: 'warn', text: 'Low product-click to cart-add conversion. Improve product photo, visible price, availability, and add-to-cart position.' });
  }
  if (connected && checkoutStarts > 0 && orders / checkoutStarts < 0.65) {
    issues.push({ level: 'critical', text: 'Checkout start to order completion is weak. Review pickup selection, validation errors, phone/email requirements, and payment wording.' });
  }
  if (connected && summary.orderCount > 0 && trackedOrderEvents > 0) {
    const orderGap = Math.abs(summary.orderCount - trackedOrderEvents) / summary.orderCount;
    if (orderGap > 0.1) {
      issues.push({ level: 'warn', text: `Data quality note: orders database shows ${numberCompact(summary.orderCount)} orders, while PostHog has ${numberCompact(trackedOrderEvents)} order_submitted events. The funnel now uses PostHog only; database orders are shown separately as the business total.` });
    }
  }
  if (submitFailures > 0) {
    issues.push({ level: 'critical', text: `${numberCompact(submitFailures)} order submit failures were tracked. These should be reviewed first because they are closest to lost revenue.` });
  }
  if (summary.orderCount > 0 && summary.subscribers <= 2) {
    issues.push({ level: 'info', text: 'Subscriber capture is low compared with order volume. Add a stronger "notify me / seasonal alert" prompt after ordering and on sold-out products.' });
  }
  if (!issues.length) {
    issues.push({ level: 'good', text: 'No urgent issues detected for this filter. Keep monitoring checkout completion and product click-to-cart conversion.' });
  }

  document.getElementById('growthIssues').innerHTML = issues.map((issue) => `
    <div class="growth-action-item ${escapeHtml(issue.level)}">${escapeHtml(issue.text)}</div>
  `).join('');
}

function renderGrowthSetup() {
  const connected = state.ownerAnalytics?.connected;
  const requiredEvents = [
    'page_viewed',
    'shop_viewed',
    'product_details_opened',
    'product_added_to_cart',
    'checkout_started',
    'order_submitted',
    'order_confirmed'
  ];
  const countMap = analyticsCountMap();
  const missingEvents = connected
    ? requiredEvents.filter((event) => !countMap[event])
    : requiredEvents;

  const setupItems = connected
    ? [
      missingEvents.length ? `Missing or zero events: ${missingEvents.join(', ')}` : 'All key PostHog events are present.',
      'Vercel page/device/referrer metrics stay in Vercel Analytics; use the Open Vercel button for that view.',
      'PostHog is the main source for product clicks and funnel drop-off.'
    ]
    : [
      'PostHog is not connected to this dashboard yet, so visitor paths and click/drop-off tables are missing.',
      'Deploy Cloud Function needed: getOwnerAnalytics. If this function is not deployed, the dashboard cannot query PostHog.',
      'Firebase secret needed before deploy: POSTHOG_PERSONAL_API_KEY with PostHog query:read access.',
      'Project ID currently defaults to 409686. Set POSTHOG_PROJECT_ID only if that changes.',
      'After the secret is saved, redeploy Firebase Functions and refresh this tab.',
      'Vercel Analytics is already installed on public pages; use Vercel for page/device/referrer metrics.'
    ];

  document.getElementById('growthSetup').innerHTML = setupItems.map((item) => `
    <div class="growth-setup-row ${item.startsWith('Missing') ? 'warn' : ''}">${escapeHtml(item)}</div>
  `).join('');
}

function renderOwnerAnalytics() {
  const status = document.getElementById('growthStatus');
  if (!status) return;
  const summary = localGrowthSummary();
  renderGrowthKpis(summary);
  renderGrowthFunnel(summary);
  renderGrowthTables();
  renderGrowthCategoryBreakdown();
  renderGrowthActions(summary);
  renderGrowthIssues(summary);
  renderGrowthSetup();

  if (state.ownerAnalyticsLoading) {
    status.textContent = 'Loading PostHog data...';
    status.className = 'growth-status';
    return;
  }
  if (state.ownerAnalyticsError) {
    const friendly = state.ownerAnalyticsError === 'internal'
      ? 'the analytics function is not deployed yet or its PostHog secret is missing'
      : state.ownerAnalyticsError;
    status.textContent = `PostHog could not load: ${friendly}. Local order, revenue, product, pickup, and subscriber metrics are still shown.`;
    status.className = 'growth-status warn';
    return;
  }
  if (state.ownerAnalytics?.connected) {
    const updated = state.ownerAnalytics.updatedAt ? formatDateTime(state.ownerAnalytics.updatedAt) : 'just now';
    status.textContent = `Live PostHog data connected. Showing last ${growthDays()} days. Last updated ${updated}.`;
    status.className = 'growth-status good';
    return;
  }
  status.textContent = 'Local order metrics are shown now. Connect the PostHog API secret to unlock visitor, page, click, and drop-off charts.';
  status.className = 'growth-status warn';
}

async function refreshOwnerAnalytics() {
  if (state.ownerAnalyticsLoading) return;
  state.ownerAnalyticsLoading = true;
  state.ownerAnalyticsError = '';
  renderOwnerAnalytics();

  try {
    const result = await getOwnerAnalytics({ days: growthDays() });
    state.ownerAnalytics = result.data || null;
  } catch (error) {
    console.error('Owner analytics failed', error);
    state.ownerAnalyticsError = error?.message || 'Analytics function is not deployed or not configured yet';
  } finally {
    state.ownerAnalyticsLoading = false;
    renderOwnerAnalytics();
  }
}

function orderDateKey(order) {
  const raw = order?.createdAt?.toDate ? order.createdAt.toDate() : new Date(order?.createdAt || 0);
  if (Number.isNaN(raw.getTime())) return '';
  return raw.toISOString().slice(0, 10);
}

function batchNameFromDate(dateString, sequence = 1) {
  if (!dateString) return '';
  const seq = Math.max(1, parseInt(sequence, 10) || 1);
  return `SHR-BATCH-${dateString}_${seq}`;
}

function parseBatchName(batchName = '') {
  const match = String(batchName).match(/^SHR-BATCH-(\d{4}-\d{2}-\d{2})(?:_(\d+))?$/);
  if (!match) return { date: '', sequence: 1 };
  return {
    date: match[1] || '',
    sequence: Math.max(1, parseInt(match[2] || '1', 10) || 1)
  };
}

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function moneyValue(value) {
  return Number(value || 0);
}

function orderRevenueValue(order = {}) {
  return NON_REVENUE_ORDER_STATUSES.includes(order.status || 'pending') ? 0 : moneyValue(order.totalPrice);
}

function orderStatusLabel(status = 'pending') {
  const labels = {
    pending: 'Pending',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
    no_show: 'No Show'
  };
  return labels[status] || String(status || 'pending').replace(/_/g, ' ');
}

function locationLabel(location = '') {
  const labels = {
    shortpump: 'Short Pump, VA',
    chesterfield: 'Chesterfield, VA',
    mechanicsville: 'Mechanicsville, VA'
  };
  return labels[location] || location || '';
}

function shippingAddressLines(address = {}) {
  const line1 = String(address.addressLine1 || '').trim();
  const line2 = String(address.addressLine2 || '').trim();
  const city = String(address.city || '').trim();
  const state = String(address.state || '').trim();
  const zip = String(address.zip || '').trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line1, line2, cityLine].filter(Boolean);
}

function shippingAddressText(address = {}) {
  return shippingAddressLines(address).join(', ');
}

function isShippingOrder(order = {}) {
  return order.fulfillmentType === 'shipping' || order.location === 'shipping';
}

// Active Orders location cell: show the full destination address for shipping
// orders. The stored `locationLabel` is intentionally coarse (city/state/zip)
// because it also drives location grouping and pickup tallies, so the full
// street address is read from the saved `shippingAddress` object instead.
function orderLocationCellHtml(order = {}) {
  const address = order.shippingAddress || null;
  if (isShippingOrder(order) && address && (address.addressLine1 || address.city)) {
    const name = String(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`).trim();
    const lines = shippingAddressLines(address)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
    return `<div class="ship-to" style="line-height:1.35">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-light);margin-bottom:2px">Shipping to</div>
        ${name ? `<div style="font-weight:600">${escapeHtml(name)}</div>` : ''}
        ${lines}
      </div>`;
  }
  return escapeHtml(order.locationLabel || order.location || '—');
}

function normalizeLookup(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeDigits(value = '') {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function excelCalcMoneyValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelCalcCountValue(value) {
  return Math.max(0, parseInt(value, 10) || 0);
}

function accounting2Products() {
  const productsById = new Map(
    getSortedProducts(state.products)
      .filter((product) => normalizeProductCategory(product.category) === 'mangoes')
      .map((product) => [product.id, product])
  );
  return PICKUP_TALLY_MANGOES.map((item) => ({
    ...(productsById.get(item.id) || {}),
    id: item.id,
    name: item.label,
    tallyLabel: item.label,
    tallyCode: item.code,
    price: `$${item.price}`
  }));
}

function accounting2ProductPrice(product) {
  return moneyNumber(product?.price || 0);
}

function accounting2ProductUnitPrice(product, productPrices = {}) {
  const savedPrice = productPrices[product.id];
  const savedValue = excelCalcMoneyValue(savedPrice);
  const legacyValue = PICKUP_TALLY_LEGACY_PRICES[product.id];
  if (savedPrice !== undefined && savedPrice !== '' && savedValue !== legacyValue) return savedValue;
  return accounting2ProductPrice(product);
}

function accounting2DefaultDenominations() {
  return ['1', '5', '10', '20', '50', '100'];
}

function accounting2BatchName() {
  const dateValue = document.getElementById('excelCalcDate')?.value || todayDateInputValue();
  const seqValue = document.getElementById('excelCalcBatchSeq')?.value || 1;
  return batchNameFromDate(dateValue, seqValue);
}

function accounting2SavedRecord(batchName = accounting2BatchName()) {
  return state.accounting2Records?.[batchName] || null;
}

function accounting2DocId(batchName = accounting2BatchName()) {
  return `${EXCEL_CALC_DOC_PREFIX}${batchName}`;
}

function syncAccounting2RecordsFromBatches() {
  state.accounting2Records = {
    ...state.accounting2Records,
    ...Object.values(state.accountingBatches || {}).reduce((acc, record) => {
      if (record?.recordType === 'excel_sheet' && record?.batchName) {
        acc[record.batchName] = { ...record };
      }
      return acc;
    }, {})
  };
}

function accounting2SavedSheetNames() {
  return Object.keys(state.accounting2Records || {}).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
}

function accounting2NextSequence(dateValue = todayDateInputValue()) {
  const prefix = `SHR-BATCH-${dateValue}_`;
  const existingSeqs = accounting2SavedSheetNames()
    .filter((name) => name.startsWith(prefix))
    .map((name) => Math.max(1, parseInt(name.split('_')[1] || '1', 10) || 1));
  return existingSeqs.length ? (Math.max(...existingSeqs) + 1) : 1;
}

function setExcelCalcSheet(batchName = '') {
  if (!batchName) return;
  const parsed = parseBatchName(batchName);
  const dateInput = document.getElementById('excelCalcDate');
  const seqInput = document.getElementById('excelCalcBatchSeq');
  if (parsed.date && dateInput) dateInput.value = parsed.date;
  if (seqInput) seqInput.value = String(parsed.sequence || 1);
  renderExcelCalculations();
}

function newExcelCalculationsSheet() {
  const dateInput = document.getElementById('excelCalcDate');
  const seqInput = document.getElementById('excelCalcBatchSeq');
  const dateValue = dateInput?.value || todayDateInputValue();
  const nextSeq = accounting2NextSequence(dateValue);
  if (dateInput && !dateInput.value) dateInput.value = dateValue;
  if (seqInput) seqInput.value = String(nextSeq);
  renderExcelCalculations();
}

function accounting2SheetProducts(products = []) {
  const usedCodes = new Set();
  return products.map((product, index) => {
    const letters = String(product?.name || '').toUpperCase().match(/[A-Z]/g) || [];
    const baseCode = letters[0] || String(index + 1);
    let code = baseCode;
    let suffix = 2;
    while (usedCodes.has(code)) {
      code = `${baseCode}${suffix}`;
      suffix += 1;
    }
    usedCodes.add(code);
    return { product, code };
  });
}

function accounting2MutableMap(record = {}, key) {
  return { ...(record?.[key] || {}) };
}

function accounting2SetMapValue(key, productId, value) {
  const batchName = accounting2BatchName();
  const existing = accounting2SavedRecord(batchName) || {};
  const nextMap = {
    ...accounting2MutableMap(existing, key),
    [productId]: value
  };
  if (value === '' || value === 0 || value === '0') delete nextMap[productId];
  state.accounting2Records[batchName] = { ...existing, batchName, [key]: nextMap };
  renderExcelCalculations();
}

function accounting2SetValue(key, value) {
  const batchName = accounting2BatchName();
  const existing = accounting2SavedRecord(batchName) || {};
  state.accounting2Records[batchName] = { ...existing, batchName, [key]: value };
  renderExcelCalculations();
}

function accounting2ResolveProductIdFromItem(item = {}) {
  if (item.productId && state.products.some((product) => product.id === item.productId)) return item.productId;
  const itemName = String(item.name || '').trim().toLowerCase();
  if (!itemName) return '';

  const products = [...state.products]
    .filter((product) => !product.displayOnly)
    .sort((a, b) => String(b.name || '').length - String(a.name || '').length);

  const match = products.find((product) => {
    const productName = String(product.name || '').trim().toLowerCase();
    return itemName === productName || itemName.startsWith(`${productName} (`) || itemName.includes(productName);
  });
  return match?.id || '';
}

function accounting2BatchOrders(batchName = accounting2BatchName()) {
  return state.orders.filter((order) => (order.accountingBatch || '') === batchName);
}

function accounting2OrderedCounts(batchName = accounting2BatchName()) {
  const counts = {};
  accounting2BatchOrders(batchName).forEach((order) => {
    if (NON_REVENUE_ORDER_STATUSES.includes(order.status || 'pending')) return;
    (order.items || []).forEach((item) => {
      const productId = accounting2ResolveProductIdFromItem(item);
      if (!productId) return;
      counts[productId] = (counts[productId] || 0) + Math.max(0, Number(item.qty || 0));
    });
  });
  return counts;
}

function accounting2ComputedTotals(batchName = accounting2BatchName()) {
  const record = accounting2SavedRecord(batchName) || {};
  const products = accounting2Products();
  const orderedCounts = accounting2MutableMap(record, 'orderedBoxes');
  const extraBoxes = accounting2MutableMap(record, 'extraBoxes');
  const remainingQty = accounting2MutableMap(record, 'remainingQty');
  const productPrices = accounting2MutableMap(record, 'productPrices');
  const invoiceTotal = moneyValue(record.invoiceTotal);
  const zelleAmount = moneyValue(record.zelleAmount);
  const cashFromHand = moneyValue(record.cashFromHand);
  const cashCounts = accounting2MutableMap(record, 'cashCounts');
  const cashCountTotal = accounting2DefaultDenominations().reduce((sum, denomination) => (
    sum + (Number(denomination) * Math.max(0, parseInt(cashCounts[denomination], 10) || 0))
  ), 0);
  const cashSales = cashCountTotal - cashFromHand;
  const orderedBoxesValue = products.reduce((sum, product) => (
    sum + (excelCalcCountValue(orderedCounts[product.id]) * accounting2ProductUnitPrice(product, productPrices))
  ), 0);
  const extraBoxesValue = products.reduce((sum, product) => (
    sum + (accounting2ProductUnitPrice(product, productPrices) * excelCalcCountValue(extraBoxes[product.id]))
  ), 0);
  const batchOrderTotal = orderedBoxesValue + extraBoxesValue;
  const unknownAmount = batchOrderTotal - (cashSales + zelleAmount);
  const remainingValue = products.reduce((sum, product) => (
    sum + (excelCalcCountValue(remainingQty[product.id]) * accounting2ProductUnitPrice(product, productPrices))
  ), 0);
  const damagedCount = excelCalcCountValue(record.damagedCount);
  const damagedPrice = moneyValue(record.damagedPrice || DAMAGED_BOX_UNIT_PRICE);
  const damagedAmount = damagedCount * damagedPrice;
  const orderedBoxesTotal = Object.values(orderedCounts).reduce((sum, qty) => sum + excelCalcCountValue(qty), 0);
  const extraBoxesTotal = Object.values(extraBoxes).reduce((sum, qty) => sum + excelCalcCountValue(qty), 0);
  const invoiceBalance = batchOrderTotal - invoiceTotal;
  const receivedTotal = cashSales + zelleAmount;
  // Walk-up (manual) orders on this batch date
  const batchDate = record.batchDate || '';
  const walkupOrders = (window._adminState?.orders || state.orders || []).filter(o =>
    (o.manualBatchDate === batchDate || o.source === 'admin_manual') &&
    (o.status === 'fulfilled' || o.paymentCollected)
  );
  const walkupRevenue = walkupOrders.reduce((sum, o) => sum + (moneyNumber(o.totalPrice) || 0), 0);
  const walkupBoxes = walkupOrders.reduce((sum, o) => sum + (o.totalBoxes || 0), 0);

  const tallyValue = batchOrderTotal - receivedTotal - (remainingValue + damagedAmount);

  return {
    products,
    orderedCounts,
    extraBoxes,
    remainingQty,
    productPrices,
    cashCounts,
    batchOrderTotal,
    invoiceTotal,
    invoiceBalance,
    zelleAmount,
    cashFromHand,
    cashCountTotal,
    cashSales,
    receivedTotal,
    unknownAmount,
    orderedBoxesValue,
    remainingValue,
    damagedCount,
    damagedPrice,
    damagedAmount,
    orderedBoxesTotal,
    extraBoxesTotal,
    extraBoxesValue,
    totalBoxesCount: orderedBoxesTotal + extraBoxesTotal,
    totalLossValue: remainingValue + damagedAmount,
    walkupRevenue,
    walkupBoxes,
    walkupOrderCount: walkupOrders.length,
    tallyValue
  };
}

function accountingInputIds() {
  return ['actualCash', 'actualZelle', 'actualCard'];
}

function getAccountingBatchRecord(batchName) {
  return state.accountingBatches?.[batchName] || null;
}

function getAllAccountingBatchNames() {
  const names = new Set(
    Object.entries(state.accountingBatches || {})
      .filter(([name, record]) => record?.recordType !== 'excel_sheet' && !String(name).startsWith(EXCEL_CALC_DOC_PREFIX) && name !== 'excel_calculations_store')
      .map(([name]) => name)
  );
  state.orders.forEach((order) => {
    if (order?.accountingBatch) names.add(order.accountingBatch);
  });
  return [...names].filter(Boolean);
}

function getAccountingBatchEntries(view = state.accountingView) {
  return getAllAccountingBatchNames()
    .map((batchName) => {
      const record = getAccountingBatchRecord(batchName) || {};
      const orders = state.orders.filter((order) => (order.accountingBatch || '') === batchName);
      const collectedOrders = orders.filter((order) => order.paymentCollected && order.paymentMethod);
      return {
        batchName,
        status: record.status || 'open',
        orderCount: record.orderCount ?? orders.length,
        collectedTotal: record.collectedTotal ?? collectedOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0),
        lastSavedAt: record.lastSavedAt || null,
        closedAt: record.closedAt || null
      };
    })
    .filter((entry) => entry.status === view)
    .sort((a, b) => String(b.batchName).localeCompare(String(a.batchName)));
}

function setAccountingView(view) {
  state.accountingView = view === 'closed' ? 'closed' : 'open';
  const entries = getAccountingBatchEntries();
  if (!entries.some((entry) => entry.batchName === state.selectedAccountingBatch)) {
    state.selectedAccountingBatch = entries[0]?.batchName || '';
  }
  renderAccounting();
}

function setSelectedAccountingBatch(batchName) {
  state.selectedAccountingBatch = batchName || '';
  const dateInput = document.getElementById('accountingDate');
  const seqInput = document.getElementById('accountingBatchSeq');
  if (batchName?.startsWith('SHR-BATCH-')) {
    const parsed = parseBatchName(batchName);
    if (dateInput) dateInput.value = parsed.date;
    if (seqInput) seqInput.value = String(parsed.sequence);
  }
  renderAccounting();
}

function renderAccountingBatchList(selectedBatchName) {
  const openBtn = document.getElementById('accountingViewOpen');
  const closedBtn = document.getElementById('accountingViewClosed');
  const titleEl = document.getElementById('accountingBatchListTitle');
  const helpEl = document.getElementById('accountingBatchListHelp');
  const summaryEl = document.getElementById('accountingBatchListBody');
  const selectEl = document.getElementById('accountingBatchSelect');
  if (!summaryEl || !selectEl) return;

  openBtn?.classList.toggle('active', state.accountingView === 'open');
  closedBtn?.classList.toggle('active', state.accountingView === 'closed');

  if (titleEl) titleEl.textContent = state.accountingView === 'open' ? 'Open Batches' : 'Closed Batches';
  if (helpEl) {
    helpEl.textContent = state.accountingView === 'open'
      ? 'Open batches stay here until you finish tallying and close them. Closed batches move to their own tab, and reopened batches come back here.'
      : 'Closed batches stay here for reference. Open any batch to review the breakdown, or reopen it if you need to continue collecting and tallying.';
  }

  const dropdownEntries = getAccountingBatchEntries();
  if (!dropdownEntries.length) {
    selectEl.innerHTML = `<option value="">No ${state.accountingView} batches yet</option>`;
    selectEl.disabled = true;
    summaryEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📒</div><p>No ${state.accountingView} batches yet.</p></div>`;
    return;
  }

  const selectedEntry = dropdownEntries.find((entry) => entry.batchName === selectedBatchName) || dropdownEntries[0];
  selectEl.disabled = false;
  selectEl.innerHTML = dropdownEntries.map((entry) => {
    const labelParts = [
      entry.batchName,
      `${entry.orderCount || 0} orders`,
      formatCurrency(entry.collectedTotal || 0)
    ];
    return `<option value="${escapeHtml(entry.batchName)}" ${entry.batchName === selectedEntry.batchName ? 'selected' : ''}>${escapeHtml(labelParts.join(' | '))}</option>`;
  }).join('');

  summaryEl.innerHTML = `
    <div class="accounting-batch-summary-card">
      <div>
        <span>Selected Batch</span>
        <strong>${escapeHtml(selectedEntry.batchName)}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong class="${selectedEntry.status === 'closed' ? 'warn' : 'good'}">${escapeHtml(selectedEntry.status)}</strong>
      </div>
      <div>
        <span>Orders</span>
        <strong>${escapeHtml(String(selectedEntry.orderCount || 0))}</strong>
      </div>
      <div>
        <span>Collected</span>
        <strong>${formatCurrency(selectedEntry.collectedTotal || 0)}</strong>
      </div>
      <div>
        <span>Last Saved</span>
        <strong>${escapeHtml(formatDateTime(selectedEntry.lastSavedAt))}</strong>
      </div>
      <div>
        <span>Closed At</span>
        <strong>${escapeHtml(formatDateTime(selectedEntry.closedAt))}</strong>
      </div>
    </div>`;
}

function syncAccountingInputs(batchName, batchRecord = {}, force = false) {
  const fields = [
    ['actualCash', batchRecord.actualCash],
    ['actualZelle', batchRecord.actualZelle],
    ['actualCard', batchRecord.actualCard]
  ];

  fields.forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const currentBatch = input.dataset.batchName || '';
    const nextValue = Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value).toFixed(2) : '';
    if (force || currentBatch !== batchName) {
      input.value = nextValue;
    }
    input.dataset.batchName = batchName;
  });
}

function specialtyProductForOrderItem(item = {}) {
  const productId = orderItemProductId(item);
  const products = state.products.length ? state.products : BASE_PRODUCTS;
  const byId = products.find((product) => product.id === productId);
  if (byId) return byId;

  const itemName = String(item.name || '').trim().toLowerCase();
  if (!itemName) return null;
  return [...products]
    .sort((a, b) => String(b.name || '').length - String(a.name || '').length)
    .find((product) => itemName.startsWith(String(product.name || '').trim().toLowerCase())) || null;
}

function isNonMangoOrderItem(item = {}) {
  const explicitCategory = normalizeProductCategory(item.category || '');
  if (explicitCategory) return explicitCategory !== 'mangoes';

  const product = specialtyProductForOrderItem(item);
  if (product) return normalizeProductCategory(product.category) !== 'mangoes';

  const productId = orderItemProductId(item).toLowerCase();
  if (productId.startsWith('puth_') || productId.startsWith('picklespodi-')) return true;
  if (['mango_jelly_sugar', 'mango_jelly_jaggery', 'palm_jelly'].includes(productId)) return true;

  const knownMangoNames = state.products
    .filter((candidate) => normalizeProductCategory(candidate.category) === 'mangoes')
    .map((candidate) => String(candidate.name || '').toLowerCase())
    .filter(Boolean);
  const itemName = String(item.name || '').toLowerCase();
  return !knownMangoNames.some((name) => itemName.includes(name));
}

function orderItemsForSheet(order = {}, sheet = state.orderSheet) {
  const items = Array.isArray(order.items) ? order.items : [];
  return sheet === 'specialty' ? items.filter(isNonMangoOrderItem) : items;
}

function orderItemsTotal(items = []) {
  return items.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.qty || 1));
    const lineTotal = moneyNumber(item.lineTotal);
    return sum + (lineTotal > 0 ? lineTotal : moneyNumber(item.price) * qty);
  }, 0);
}

function getOrdersForSheet(sheet = state.orderSheet) {
  if (sheet === 'active') return state.orders.filter((order) => (order.status || 'pending') === 'pending');
  if (sheet === 'specialty') {
    return state.orders.filter((order) =>
      (order.status || 'pending') === 'pending' && orderItemsForSheet(order, 'specialty').length > 0
    );
  }
  if (sheet === 'shipping') {
    // Every order being mailed, newest first. Cancelled orders are excluded but
    // fulfilled ones stay so a packing slip can be reprinted after shipping.
    return state.orders
      .filter((order) => isShippingOrder(order) && (order.status || 'pending') !== 'cancelled')
      .sort((a, b) => orderDateKey(b).localeCompare(orderDateKey(a)));
  }
  if (sheet === 'processed') {
    return state.orders.filter((order) => {
      const status = order.status || 'pending';
      return status === 'fulfilled' && !order.paymentCollected;
    });
  }
  return [...state.orders];
}

function getFilteredOrders(sheet = state.orderSheet) {
  const sheetFilters = state.orderFilters[sheet] || { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' };
  const filterStatus = sheetFilters.status || 'all';
  const filterDateFrom = sheetFilters.dateFrom || '';
  const filterDateTo = sheetFilters.dateTo || '';
  const filterSearch = String(sheetFilters.search || '').trim().toLowerCase();
  const filterLocation = sheetFilters.location || 'all';

  let orders = getOrdersForSheet(sheet);

  if (filterStatus !== 'all') {
    orders = orders.filter((order) => (order.status || 'pending') === filterStatus);
  }

  if (filterLocation !== 'all') {
    orders = orders.filter((order) => String(order.location || '').toLowerCase() === filterLocation);
  }

  if (filterDateFrom) {
    orders = orders.filter((order) => {
      const key = orderDateKey(order);
      return key && key >= filterDateFrom;
    });
  }

  if (filterDateTo) {
    orders = orders.filter((order) => {
      const key = orderDateKey(order);
      return key && key <= filterDateTo;
    });
  }

  if (filterSearch) {
    orders = orders.filter((order) => {
      const haystack = [
        order.orderNumber || order.id || '',
        order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim(),
        order.firstName || '',
        order.lastName || '',
        order.phone || '',
        order.email || '',
        order.locationLabel || order.location || '',
        shippingAddressText(order.shippingAddress || {}),
        ...orderItemsForSheet(order, sheet).map((item) => item?.name || '')
      ].join(' ').toLowerCase();

      return haystack.includes(filterSearch);
    });
  }

  return orders;
}

function updateOrdersSheetUi() {
  const config = {
    active: {
      title: 'Active Orders',
      help: 'Active Orders shows your current pending pickup list.',
    },
    specialty: {
      title: 'Pickles / Sweets / Snacks Orders',
      help: 'Pending orders containing non-mango items. Combo orders also remain in Active Orders.',
    },
    processed: {
      title: 'Processed Orders',
      help: 'Processed Orders shows fulfilled pickups that still need payment or accounting review. Cancelled and no-show records live in All Orders.',
    },
    shipping: {
      title: 'Shipping Orders',
      help: 'Shipping Orders lists every order being mailed, newest first. Tick the orders you are packing and hit Print Packing Slips for a one-page slip per order with the full address and contents, or print a single slip from the row.',
    },
    all: {
      title: 'All Orders',
      help: 'All Orders is the permanent master history in date order. Status can still be updated, but nothing is deleted here.',
    }
  };

  document.querySelectorAll('#ordersSheetSwitcher .sheet-pill').forEach((button) => button.classList.remove('active'));
  document.getElementById(`ordersSheet${state.orderSheet.charAt(0).toUpperCase()}${state.orderSheet.slice(1)}`)?.classList.add('active');

  const title = document.getElementById('ordersSectionTitle');
  const help = document.getElementById('ordersHelpText');
  const bulkButton = document.getElementById('bulkFulfillBtn');
  const sheetSwitcher = document.getElementById('ordersSheetSwitcher');
  const filterSearch = document.getElementById('filterSearch');
  const filterLocation = document.getElementById('filterLocation');
  const filterStatus = document.getElementById('filterStatus');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  const printButton = document.getElementById('printChecklistBtn');
  const exportButton = document.querySelector('.toolbar-actions button[onclick="exportCSV()"]');
  const currentFilters = state.orderFilters[state.orderSheet] || { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' };
  if (title) title.textContent = config[state.orderSheet].title;
  if (help) help.textContent = config[state.orderSheet].help;
  if (bulkButton) bulkButton.style.display = state.orderSheet === 'active' ? 'inline-flex' : 'none';
  if (sheetSwitcher) sheetSwitcher.style.display = document.getElementById('tab-orders')?.style.display === 'none' ? 'none' : 'flex';
  if (printButton) {
    const isSpecialty = state.orderSheet === 'specialty';
    // The pickup checklist is meaningless on the shipping sheet.
    printButton.style.display = state.orderSheet === 'shipping' ? 'none' : 'inline-flex';
    printButton.textContent = isSpecialty ? 'Print Pickles / Sweets / Snacks' : 'Print Checklist';
    printButton.title = isSpecialty ? 'Print the non-mango pickup checklist' : 'Print pickup checklist for today';
  }
  if (exportButton) {
    const exportLabels = {
      active: '⬇ Export Active Excel',
      specialty: '⬇ Export Pickles / Sweets / Snacks',
      shipping: '⬇ Export Shipping Excel',
      processed: '⬇ Export Processed Excel',
      all: '⬇ Export All Excel'
    };
    exportButton.textContent = exportLabels[state.orderSheet] || '⬇ Export Excel';
  }
  if (filterSearch) filterSearch.value = currentFilters.search || '';
  if (filterLocation) filterLocation.value = currentFilters.location || 'all';
  if (filterStatus) filterStatus.value = currentFilters.status || 'all';
  if (filterDateFrom) filterDateFrom.value = currentFilters.dateFrom || '';
  if (filterDateTo) filterDateTo.value = currentFilters.dateTo || '';
}

function syncCurrentOrderFilters() {
  const filterSearch = document.getElementById('filterSearch');
  const filterLocation = document.getElementById('filterLocation');
  const filterStatus = document.getElementById('filterStatus');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  if (!state.orderFilters[state.orderSheet]) {
    state.orderFilters[state.orderSheet] = { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' };
  }
  state.orderFilters[state.orderSheet].search = filterSearch?.value || '';
  state.orderFilters[state.orderSheet].location = filterLocation?.value || 'all';
  state.orderFilters[state.orderSheet].status = filterStatus?.value || 'all';
  state.orderFilters[state.orderSheet].dateFrom = filterDateFrom?.value || '';
  state.orderFilters[state.orderSheet].dateTo = filterDateTo?.value || '';
}

function renderActiveOrderSummary(orders = []) {
  const summaryEl = document.getElementById('activeOrderSummary');
  if (!summaryEl) return;

  if (!['active', 'specialty'].includes(state.orderSheet) || !orders.length) {
    summaryEl.classList.remove('show');
    summaryEl.innerHTML = '';
    return;
  }

  const counts = new Map();
  orders.forEach((order) => {
    orderItemsForSheet(order).forEach((item) => {
      const name = String(item?.name || '').trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + Number(item.qty || 0));
    });
  });

  const summaryItems = [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    });

  if (!summaryItems.length) {
    summaryEl.classList.remove('show');
    summaryEl.innerHTML = '';
    return;
  }

  const totalBoxes = summaryItems.reduce((sum, [, qty]) => sum + Number(qty || 0), 0);

  summaryEl.innerHTML = `
    <div class="summary-label">${state.orderSheet === 'specialty' ? 'Pickles / Sweets / Snacks Counts' : 'Active Counts'}</div>
    <div class="summary-totals">
      <span>${orders.length} orders</span>
      <span>${totalBoxes} boxes</span>
    </div>
    <div class="summary-items">
      ${summaryItems.map(([name, qty]) => `<span class="summary-chip"><span>${escapeHtml(name)}</span><b>${escapeHtml(String(qty))}</b></span>`).join('')}
    </div>`;
  summaryEl.classList.add('show');
}

function orderEditorDraftOrder() {
  return state.orders.find((order) => order.id === state.orderEditor.orderId) || null;
}

function cloneOrderEditorItem(item = {}, index = 0) {
  const rawId = String(item.id || item.productId || '');
  const inferredProductId = rawId.includes('__') ? rawId.split('__')[0] : rawId;
  const inferredVariantId = item.variantId || (rawId.includes('__') ? rawId.split('__')[1] : 'default');
  return {
    draftId: item.draftId || `draft_${Date.now()}_${index}`,
    id: rawId,
    productId: item.productId || inferredProductId,
    variantId: inferredVariantId,
    name: item.name || 'Item',
    price: item.price || '',
    unit: item.unit || '',
    image: item.image || null,
    qty: Math.max(1, parseInt(item.qty, 10) || 1),
    lineTotal: Number(item.lineTotal || 0)
  };
}

function orderEditorItemTotal(item = {}) {
  const qty = Math.max(1, parseInt(item.qty, 10) || 1);
  return moneyNumber(item.price) * qty;
}

function orderEditorTotals(items = []) {
  return items.reduce((acc, item) => {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    acc.totalBoxes += qty;
    acc.totalPrice += orderEditorItemTotal(item);
    return acc;
  }, { totalBoxes: 0, totalPrice: 0 });
}

function getOrderEditorCatalogOptions() {
  return getSortedProducts(state.products)
    .filter((product) => !product.hidden && !product.displayOnly && product.available)
    .flatMap((product) => {
      const variants = Array.isArray(product.variants) && product.variants.length
        ? product.variants.filter((variant) => variant?.label)
        : [];

      if (!variants.length) {
        return [{
          key: `${product.id}::default`,
          productId: product.id,
          variantId: 'default',
          label: product.name,
          name: product.name,
          price: product.price || '',
          unit: product.unit || '',
          image: product.image || null,
          available: Boolean(product.available)
        }];
      }

      return variants.map((variant) => ({
        key: `${product.id}::${variant.id || 'default'}`,
        productId: product.id,
        variantId: variant.id || 'default',
        label: `${product.name} (${variant.label})`,
        name: `${product.name} (${variant.label})`,
        price: variant.price || product.price || '',
        unit: variant.unit || product.unit || '',
        image: product.image || null,
        available: Boolean(product.available)
      }));
    });
}

function renderOrderEditor() {
  const modal = document.getElementById('orderEditorModal');
  const isManual = state.orderEditor.mode === 'manual';
  const order = isManual ? {
    orderNumber: 'Manual Order',
    fullName: 'Walk-up customer',
    phone: ''
  } : orderEditorDraftOrder();
  if (!modal || !order) return;

  const titleEl = document.getElementById('orderEditorOrderNumber');
  const customerEl = document.getElementById('orderEditorCustomer');
  const itemsEl = document.getElementById('orderEditorItems');
  const emptyEl = document.getElementById('orderEditorEmpty');
  const totalEl = document.getElementById('orderEditorTotal');
  const boxesEl = document.getElementById('orderEditorBoxes');
  const addSelect = document.getElementById('orderEditorAddSelect');
  const manualFields = document.getElementById('manualOrderFields');
  const options = getOrderEditorCatalogOptions();
  const totals = orderEditorTotals(state.orderEditor.items);

  if (titleEl) titleEl.textContent = order.orderNumber || order.id;
  if (customerEl) {
    customerEl.textContent = isManual
      ? 'Add a walk-up pickup order after the customer has received items.'
      : `${order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim()} - ${order.phone || ''}`;
  }
  manualFields?.classList.toggle('show', isManual);
  if (totalEl) totalEl.textContent = formatCurrency(totals.totalPrice);
  if (boxesEl) boxesEl.textContent = String(totals.totalBoxes);

  if (addSelect) {
    addSelect.innerHTML = `<option value="">Add an item</option>${options.map((option) => `
      <option value="${escapeHtml(option.key)}">${escapeHtml(option.label)} - ${escapeHtml(option.price || 'No price')}</option>
    `).join('')}`;
  }

  if (!state.orderEditor.items.length) {
    if (itemsEl) itemsEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (itemsEl) {
    itemsEl.innerHTML = state.orderEditor.items.map((item, index) => `
      <div class="order-editor-item">
        <div class="order-editor-item-main">
          <div class="order-editor-item-name">${escapeHtml(item.name || 'Item')}</div>
          <div class="order-editor-item-meta">${escapeHtml(item.price || '')}${item.unit ? ` - ${escapeHtml(item.unit)}` : ''}</div>
        </div>
        <label class="order-editor-item-qty">
          <span>Qty</span>
          <input type="number" min="1" step="1" value="${escapeHtml(String(item.qty || 1))}" onchange="updateOrderDraftQty(${index}, this.value)">
        </label>
        <div class="order-editor-item-total">${escapeHtml(formatCurrency(orderEditorItemTotal(item)))}</div>
        <button class="order-editor-remove" type="button" onclick="removeOrderDraftItem(${index})">Remove</button>
      </div>
    `).join('');
  }
}

function openOrderEditor(id) {
  const order = state.orders.find((item) => item.id === id);
  const modal = document.getElementById('orderEditorModal');
  if (!order || !modal) return;

  state.orderEditor = {
    orderId: id,
    items: Array.isArray(order.items) ? order.items.map((item, index) => cloneOrderEditorItem(item, index)) : [],
    mode: 'edit'
  };
  const saveBtn = document.getElementById('orderEditorSaveBtn');
  if (saveBtn) saveBtn.textContent = 'Save Changes';

  renderOrderEditor();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openManualOrderForm() {
  const modal = document.getElementById('orderEditorModal');
  if (!modal) return;

  state.orderEditor = {
    orderId: '',
    items: [],
    mode: 'manual'
  };

  const today = todayDateInputValue();
  const fieldDefaults = {
    manualFirstName: 'Walk-up',
    manualLastName: 'Customer',
    manualPhone: '',
    manualEmail: '',
    manualLocation: 'chesterfield',
    manualPickupDate: today,
    manualPaymentMethod: 'cash',
    manualNotes: 'Manual walk-up order entered by admin.'
  };
  Object.entries(fieldDefaults).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  const saveBtn = document.getElementById('orderEditorSaveBtn');
  if (saveBtn) saveBtn.textContent = 'Save Manual Order';

  renderOrderEditor();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOrderEditor() {
  const modal = document.getElementById('orderEditorModal');
  if (!modal) return;
  modal.classList.remove('open');
  state.orderEditor = { orderId: '', items: [], mode: 'edit' };
  const manualFields = document.getElementById('manualOrderFields');
  manualFields?.classList.remove('show');
  const saveBtn = document.getElementById('orderEditorSaveBtn');
  if (saveBtn) saveBtn.textContent = 'Save Changes';
  document.body.style.overflow = '';
}

function handleOrderEditorOverlayClick(event) {
  if (event.target?.id === 'orderEditorModal') closeOrderEditor();
}

function updateOrderDraftQty(index, value) {
  const item = state.orderEditor.items[index];
  if (!item) return;
  item.qty = Math.max(1, parseInt(value, 10) || 1);
  renderOrderEditor();
}

function removeOrderDraftItem(index) {
  state.orderEditor.items.splice(index, 1);
  renderOrderEditor();
}

function addOrderDraftItem() {
  const select = document.getElementById('orderEditorAddSelect');
  if (!select || !select.value) {
    showToast('Choose an item to add');
    return;
  }

  const selected = getOrderEditorCatalogOptions().find((option) => option.key === select.value);
  if (!selected) {
    showToast('Could not add that item');
    return;
  }

  const existing = state.orderEditor.items.find((item) =>
    (item.productId || item.id) === selected.productId && (item.variantId || 'default') === selected.variantId
  );

  if (existing) {
    existing.qty = Math.max(1, parseInt(existing.qty, 10) || 1) + 1;
  } else {
    state.orderEditor.items.push(cloneOrderEditorItem({
      id: `${selected.productId}${selected.variantId === 'default' ? '' : `__${selected.variantId}`}`,
      productId: selected.productId,
      variantId: selected.variantId,
      name: selected.name,
      price: selected.price,
      unit: selected.unit,
      image: selected.image,
      qty: 1
    }, state.orderEditor.items.length));
  }

  select.value = '';
  renderOrderEditor();
}

async function saveEditedOrder() {
  const isManual = state.orderEditor.mode === 'manual';
  const order = isManual ? null : orderEditorDraftOrder();
  if (!isManual && !order) return;

  const saveBtn = document.getElementById('orderEditorSaveBtn');
  if (!state.orderEditor.items.length) {
    showToast('Add at least one item before saving');
    return;
  }

  const cleanedItems = state.orderEditor.items.map((item, index) => {
    const cloned = cloneOrderEditorItem(item, index);
    const payload = {
      id: cloned.id,
      name: cloned.name,
      price: cloned.price,
      unit: cloned.unit,
      image: cloned.image || null,
      qty: cloned.qty,
      lineTotal: orderEditorItemTotal(cloned)
    };

    if (cloned.productId) payload.productId = cloned.productId;
    if (cloned.variantId) payload.variantId = cloned.variantId;
    return payload;
  });

  const totals = orderEditorTotals(cleanedItems);

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    if (isManual) {
      const firstName = (document.getElementById('manualFirstName')?.value || 'Walk-up').trim() || 'Walk-up';
      const lastName = (document.getElementById('manualLastName')?.value || 'Customer').trim() || 'Customer';
      const phone = (document.getElementById('manualPhone')?.value || '').trim();
      const email = (document.getElementById('manualEmail')?.value || '').trim();
      const location = document.getElementById('manualLocation')?.value || 'chesterfield';
      const pickupDate = document.getElementById('manualPickupDate')?.value || todayDateInputValue();
      const paymentMethod = document.getElementById('manualPaymentMethod')?.value || '';
      const notes = (document.getElementById('manualNotes')?.value || '').trim();
  const manualBatchDate = document.getElementById('manualBatchDate')?.value || pickupDate || todayDateInputValue();
      const phoneDigits = phone.replace(/\D/g, '');
      const nowIso = new Date().toISOString();
      const orderRef = doc(collection(db, 'orders'));
      const batchName = paymentMethod ? batchNameFromDate(pickupDate || todayDateInputValue()) : '';

      await setDoc(orderRef, {
        orderNumber: `MAN-${Date.now()}`,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        phone,
        phoneDigits,
        email,
        location,
        locationLabel: locationLabel(location),
        referral: 'Manual admin entry',
    manualBatchDate: manualBatchDate,
        notes,
        items: cleanedItems,
        totalBoxes: totals.totalBoxes,
        totalPrice: totals.totalPrice,
        payment: paymentMethod ? 'paid' : 'pending',
        paymentMethod,
        paymentCollected: Boolean(paymentMethod),
        paymentCollectedAt: paymentMethod ? nowIso : null,
        accountingBatch: batchName,
        pickupDate,
        status: 'fulfilled',
        source: 'admin_manual',
        skipCustomerEmail: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'orders', order.id), {
        items: cleanedItems,
        totalBoxes: totals.totalBoxes,
        totalPrice: totals.totalPrice,
        updatedAt: new Date().toISOString()
      });
    }
    closeOrderEditor();
    showToast(isManual ? 'Manual order added' : 'Order updated');
  } catch (error) {
    console.error(error);
    showToast(isManual ? 'Could not add manual order right now' : 'Could not update order right now');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = state.orderEditor.mode === 'manual' ? 'Save Manual Order' : 'Save Changes';
    }
  }
}

function activeReminderOrdersFromSelection() {
  return state.orders.filter((order) =>
    state.selectedReminderOrderIds.has(order.id) && (order.status || 'pending') === 'pending'
  );
}

function defaultReminderSubject() {
  return 'Pickup reminder for your Shrish order {{orderNumber}}';
}

function defaultReminderBody() {
  return [
    'Hi {{firstName}},',
    '',
    'This is a friendly reminder that your Shrish order {{orderNumber}} is ready for pickup at {{pickupLocation}}.',
    '',
    '📍Shortpump orders: Twin Hickory Park & Recreation Center, today from 5:30 PM to 6:30 PM for order pickup.',
    '',
    '📍 Mechanicsville, please plan to pick up from the shortpump location',
    '',
    '📍 Chesterfield orders ping me for pickup',
    '',
    'Order summary:',
    '{{items}}',
    '',
    'Total boxes: {{totalBoxes}}',
    'Estimated total: {{totalPrice}}',
    '',
    'Payment is collected at pickup.',
    '',
    'If you are unable to pick up, please send us a quick WhatsApp message so we can plan accordingly.',
    '',
    'Thank you,',
    'Shrish'
  ].join('\n');
}

function defaultWhatsAppReminderBody() {
  return [
    'Hi {{firstName}},',
    '',
    'This is a friendly reminder that your Shrish order {{orderNumber}} is ready for pickup at {{pickupLocation}}.',
    '',
    'Order summary:',
    '{{items}}',
    '',
    'Total boxes: {{totalBoxes}}',
    'Estimated total: {{totalPrice}}',
    '',
    'Payment is collected at pickup.',
    '',
    'If you are unable to pick up, please send us a quick WhatsApp message so we can plan accordingly.',
    '',
    'Thank you,',
    'Shrish'
  ].join('\n');
}

function reminderItemsText(items = []) {
  if (!Array.isArray(items) || !items.length) return 'Order items are listed in your confirmation email.';
  return items.map((item) => `- ${item.name || 'Item'} x ${Math.max(1, parseInt(item.qty, 10) || 1)}`).join('\n');
}

function reminderTemplateValues(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const totals = {
    totalBoxes: order.totalBoxes || items.reduce((sum, item) => sum + (Math.max(1, parseInt(item.qty, 10) || 1)), 0),
    totalPrice: moneyNumber(order.totalPrice) || items.reduce((sum, item) => {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      return sum + (Number(item.lineTotal || 0) || (moneyNumber(item.price) * qty));
    }, 0)
  };
  const fullName = order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim() || 'Customer';

  return {
    firstName: order.firstName || fullName.split(' ')[0] || 'Customer',
    fullName,
    orderNumber: order.orderNumber || order.id || 'your order',
    pickupLocation: order.locationLabel || order.pickupLocation || locationLabel(order.location) || 'your selected pickup location',
    items: reminderItemsText(items),
    totalBoxes: String(totals.totalBoxes || 0),
    totalPrice: formatCurrency(totals.totalPrice || 0)
  };
}

function applyReminderTemplate(template = '', order = {}) {
  const values = reminderTemplateValues(order);
  return String(template || '').replace(/{{\s*([a-zA-Z]+)\s*}}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

function chunkReminderOrderIds(orderIds = []) {
  const chunks = [];
  for (let i = 0; i < orderIds.length; i += REMINDER_EMAIL_BATCH_SIZE) {
    chunks.push(orderIds.slice(i, i + REMINDER_EMAIL_BATCH_SIZE));
  }
  return chunks;
}

function whatsappPhoneDigits(order = {}) {
  const raw = String(order.phoneDigits || order.phone || '').replace(/\D/g, '');
  if (raw.length === 10) return `1${raw}`;
  if (raw.length === 11 && raw.startsWith('1')) return raw;
  return raw.length > 11 ? raw : '';
}

// Sheets whose rows can be checkbox-selected. 'active' drives reminders,
// 'shipping' drives bulk packing-slip printing.
function isSelectableSheet(sheet = state.orderSheet) {
  return sheet === 'active' || sheet === 'shipping';
}

// Rows selectable on the current sheet: pending only for reminders, any
// non-cancelled shipping order so a slip can be reprinted.
function selectableOrdersForSheet(sheet = state.orderSheet) {
  if (sheet === 'shipping') return getFilteredOrders('shipping');
  if (sheet === 'active') return getFilteredOrders('active').filter((order) => (order.status || 'pending') === 'pending');
  return [];
}

function selectedOrdersOnSheet(sheet = state.orderSheet) {
  return selectableOrdersForSheet(sheet).filter((order) => state.selectedReminderOrderIds.has(order.id));
}

function updateReminderActionUi() {
  const isActiveSheet = state.orderSheet === 'active';
  const selectedOrders = activeReminderOrdersFromSelection();
  const reminderBtn = document.getElementById('emailReminderBtn');
  const whatsappBtn = document.getElementById('whatsappReminderBtn');
  const selectAll = document.getElementById('selectAllActiveOrders');

  if (reminderBtn) {
    reminderBtn.style.display = isActiveSheet ? 'inline-flex' : 'none';
    reminderBtn.disabled = !isActiveSheet;
    reminderBtn.textContent = selectedOrders.length
      ? `Email Reminder (${selectedOrders.length})`
      : 'Email Reminder';
  }

  if (whatsappBtn) {
    whatsappBtn.style.display = isActiveSheet ? 'inline-flex' : 'none';
    whatsappBtn.disabled = !isActiveSheet || !selectedOrders.length;
    whatsappBtn.textContent = selectedOrders.length
      ? `WhatsApp Reminder (${selectedOrders.length})`
      : 'WhatsApp Reminder';
  }

  if (selectAll) {
    const selectable = selectableOrdersForSheet();
    const selectedVisible = selectable.filter((order) => state.selectedReminderOrderIds.has(order.id));
    selectAll.disabled = !isSelectableSheet() || !selectable.length;
    selectAll.checked = Boolean(selectable.length && selectedVisible.length === selectable.length);
    selectAll.indeterminate = Boolean(selectedVisible.length && selectedVisible.length < selectable.length);
  }

  const shippingPrintBtn = document.getElementById('printShippingBtn');
  if (shippingPrintBtn) {
    const isShippingSheet = state.orderSheet === 'shipping';
    const selectedCount = isShippingSheet ? selectedOrdersOnSheet('shipping').length : 0;
    shippingPrintBtn.style.display = isShippingSheet ? 'inline-flex' : 'none';
    shippingPrintBtn.disabled = isShippingSheet && !selectableOrdersForSheet('shipping').length;
    shippingPrintBtn.textContent = selectedCount
      ? `📦 Print Packing Slips (${selectedCount})`
      : '📦 Print All Packing Slips';
  }
}

function toggleReminderOrderSelection(orderId, checked) {
  if (!orderId) return;
  if (checked) {
    state.selectedReminderOrderIds.add(orderId);
  } else {
    state.selectedReminderOrderIds.delete(orderId);
  }
  updateReminderActionUi();
}

function toggleVisibleReminderOrders(checked) {
  if (!isSelectableSheet()) return;
  selectableOrdersForSheet().forEach((order) => {
    if (checked) {
      state.selectedReminderOrderIds.add(order.id);
    } else {
      state.selectedReminderOrderIds.delete(order.id);
    }
  });
  renderOrders();
}

function openEmailReminderModal() {
  const modal = document.getElementById('emailReminderModal');
  if (!modal) return;

  const selectedOrders = activeReminderOrdersFromSelection();
  if (!selectedOrders.length) {
    showToast('Select at least one active order first');
    return;
  }

  const withEmail = selectedOrders.filter((order) => String(order.email || '').trim());
  const subjectInput = document.getElementById('emailReminderSubject');
  const bodyInput = document.getElementById('emailReminderBody');
  const recipientsEl = document.getElementById('emailReminderRecipients');
  const summaryEl = document.getElementById('emailReminderSummary');

  if (subjectInput) subjectInput.value = defaultReminderSubject();
  if (bodyInput) bodyInput.value = defaultReminderBody();
  if (summaryEl) {
    const skipped = selectedOrders.length - withEmail.length;
    summaryEl.textContent = skipped
      ? `${withEmail.length} with email, ${skipped} missing email and will be skipped.`
      : `${withEmail.length} customer${withEmail.length === 1 ? '' : 's'} ready to email.`;
  }
  if (recipientsEl) {
    recipientsEl.innerHTML = selectedOrders.map((order) => {
      const name = order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim() || 'Customer';
      const email = String(order.email || '').trim();
      return `
        <div class="reminder-recipient ${email ? '' : 'missing'}">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(order.orderNumber || order.id)}</span>
          </div>
          <em>${email ? escapeHtml(email) : 'Missing email'}</em>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEmailReminderModal() {
  const modal = document.getElementById('emailReminderModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function handleEmailReminderOverlayClick(event) {
  if (event.target?.id === 'emailReminderModal') closeEmailReminderModal();
}

function openWhatsAppReminderModal() {
  const modal = document.getElementById('whatsappReminderModal');
  if (!modal) return;

  const selectedOrders = activeReminderOrdersFromSelection();
  if (!selectedOrders.length) {
    showToast('Select at least one active order first');
    return;
  }

  const withPhone = selectedOrders.filter((order) => whatsappPhoneDigits(order));
  const bodyInput = document.getElementById('whatsappReminderBody');
  const recipientsEl = document.getElementById('whatsappReminderRecipients');
  const summaryEl = document.getElementById('whatsappReminderSummary');

  if (bodyInput) bodyInput.value = defaultWhatsAppReminderBody();
  if (summaryEl) {
    const skipped = selectedOrders.length - withPhone.length;
    summaryEl.textContent = skipped
      ? `${withPhone.length} with phone, ${skipped} missing phone and cannot open WhatsApp.`
      : `${withPhone.length} customer${withPhone.length === 1 ? '' : 's'} ready for manual WhatsApp send.`;
  }
  if (recipientsEl) {
    recipientsEl.innerHTML = selectedOrders.map((order) => {
      const name = order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim() || 'Customer';
      const phone = String(order.phone || '').trim();
      const hasPhone = Boolean(whatsappPhoneDigits(order));
      return `
        <div class="reminder-recipient ${hasPhone ? '' : 'missing'}">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(order.orderNumber || order.id)}</span>
          </div>
          ${
            hasPhone
              ? `<button class="reminder-link-btn" type="button" data-order-id="${escapeHtml(order.id)}" onclick="openWhatsAppReminderForOrder(this.dataset.orderId)">Open WhatsApp</button>`
              : `<em>${phone ? 'Invalid phone' : 'Missing phone'}</em>`
          }
        </div>
      `;
    }).join('');
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeWhatsAppReminderModal() {
  const modal = document.getElementById('whatsappReminderModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function handleWhatsAppReminderOverlayClick(event) {
  if (event.target?.id === 'whatsappReminderModal') closeWhatsAppReminderModal();
}

function openWhatsAppReminderForOrder(orderId) {
  const order = activeReminderOrdersFromSelection().find((candidate) => candidate.id === orderId);
  const body = document.getElementById('whatsappReminderBody')?.value?.trim() || '';
  const digits = whatsappPhoneDigits(order || {});

  if (!order) {
    showToast('This order is no longer selected');
    return;
  }
  if (!digits) {
    showToast('This customer does not have a valid phone number');
    return;
  }
  if (!body) {
    showToast('Add a WhatsApp message before opening');
    return;
  }

  const message = applyReminderTemplate(body, order);
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  if (!opened) showToast('Allow popups to open WhatsApp');
}

async function sendSelectedReminderEmails() {
  const selectedOrders = activeReminderOrdersFromSelection();
  const subject = document.getElementById('emailReminderSubject')?.value?.trim() || '';
  const body = document.getElementById('emailReminderBody')?.value?.trim() || '';
  const sendBtn = document.getElementById('emailReminderSendBtn');

  if (!selectedOrders.length) {
    showToast('No selected active orders to email');
    return;
  }
  if (!subject || !body) {
    showToast('Add both subject and message before sending');
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
  }

  try {
    const sendReminder = httpsCallable(cloudFunctions, 'sendOrderReminderEmails');
    const orderIdBatches = chunkReminderOrderIds(selectedOrders.map((order) => order.id));
    let sent = 0;
    let skipped = 0;

    for (let i = 0; i < orderIdBatches.length; i += 1) {
      if (sendBtn && orderIdBatches.length > 1) {
        sendBtn.textContent = `Sending ${i + 1}/${orderIdBatches.length}...`;
      }
      const result = await sendReminder({
        orderIds: orderIdBatches[i],
        subject,
        body
      });
      const data = result?.data || {};
      sent += Number(data.sent || 0);
      skipped += Number(data.skipped || 0);
    }

    state.selectedReminderOrderIds.clear();
    closeEmailReminderModal();
    renderOrders();
    showToast(skipped ? `Reminder emails sent to ${sent}; ${skipped} skipped` : `Reminder emails sent to ${sent}`);
  } catch (error) {
    console.error(error);
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code.includes('not-found') || message.toLowerCase().includes('not found')) {
      showToast('Reminder email function is not deployed yet.');
    } else if (code.includes('unauthenticated')) {
      showToast('Please log out and log back in before sending reminders.');
    } else if (message && message !== 'internal') {
      showToast(message);
    } else {
      showToast('Reminder email failed in Firebase Functions. Check deployment/logs.');
    }
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Reminder Emails';
    }
  }
}

function renderOrders() {
  const orders = getFilteredOrders();
  const isActiveSheet = state.orderSheet === 'active';
  const isSpecialtySheet = state.orderSheet === 'specialty';
  const isShippingSheet = state.orderSheet === 'shipping';
  const isPendingSheet = isActiveSheet || isSpecialtySheet;
  updateOrdersSheetUi();
  renderActiveOrderSummary(orders);
  renderOrdersTableHead(isPendingSheet, isSpecialtySheet);

  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📭</div><p>No orders found.</p></div></td></tr>';
    updateReminderActionUi();
    renderStats();
    return;
  }

  tbody.innerHTML = orders.map((order) => {
    const visibleItems = orderItemsForSheet(order);
    const visibleTotal = isSpecialtySheet ? orderItemsTotal(visibleItems) : moneyNumber(order.totalPrice || 0);
    const itemsHtml = visibleItems.length
      ? `<div class="items-list">${visibleItems.map((item) => `<div class="item-row"><strong>${escapeHtml(item.name)}</strong> <span>× ${item.qty} · ${escapeHtml(item.price)}</span></div>`).join('')}</div>`
      : '<span style="color:#ccc">—</span>';

    const status = order.status || 'pending';
    const statusClass = `status-${status}`;
    const statusLabel = orderStatusLabel(status);
    const paymentMethod = order.paymentMethod || '';
    const paymentCollected = Boolean(order.paymentCollected);
    const isPaidOnline = order.paymentStatus === 'paid' || order.payment === 'paid';
    const isStripeOrder = String(order.paymentMethod || '') === 'stripe';
    const payBadgeHtml = isPaidOnline
      ? '<div style="margin-top:4px;display:inline-block;font-size:11px;font-weight:700;color:#1E7B34;background:#E7F5EC;border:1px solid #9FD8B0;border-radius:10px;padding:1px 8px;">💳 Paid online</div>'
      : isStripeOrder
      ? '<div style="margin-top:4px;display:inline-block;font-size:11px;font-weight:700;color:#B54708;background:#FFF3E0;border:1px solid #F0C68A;border-radius:10px;padding:1px 8px;">Online — awaiting payment</div>'
      : '<div style="margin-top:4px;display:inline-block;font-size:11px;font-weight:600;color:#8a6d3b;background:#fbf3e2;border:1px solid #e6d3a8;border-radius:10px;padding:1px 8px;">Pay at pickup</div>';
    const fallbackBatch = batchNameFromDate(todayDateInputValue());
    const canSelect = (isActiveSheet && status === 'pending') || isShippingSheet;
    const checked = state.selectedReminderOrderIds.has(order.id) ? 'checked' : '';
    const quickPaymentButtons = status === 'fulfilled'
      ? `<div class="payment-quick-actions" aria-label="Quick payment method">
          <button type="button" class="payment-quick-btn ${paymentMethod === 'cash' && paymentCollected ? 'active' : ''}" title="Cash collected" onclick="setQuickPaymentMethod('${escapeHtml(order.id)}','cash')">C</button>
          <button type="button" class="payment-quick-btn ${paymentMethod === 'zelle' && paymentCollected ? 'active' : ''}" title="Zelle collected" onclick="setQuickPaymentMethod('${escapeHtml(order.id)}','zelle')">Z</button>
          <button type="button" class="payment-quick-btn ${paymentMethod === 'card' && paymentCollected ? 'active' : ''}" title="Card collected" onclick="setQuickPaymentMethod('${escapeHtml(order.id)}','card')">CD</button>
        </div>`
      : '';
    const paymentCellHtml = status === 'no_show'
      ? `<div class="payment-note">No show. Accounting total is $0.</div>`
      : isPendingSheet
      ? `<div class="payment-note">Collect at pickup. Add method after processing.</div>`
      : `<div class="payment-cell">
          ${quickPaymentButtons}
          <select class="payment-select" onchange="updatePaymentMethod('${escapeHtml(order.id)}', this.value)">
            <option value="" ${paymentMethod === '' ? 'selected' : ''}>Select method</option>
            <option value="cash" ${paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
            <option value="zelle" ${paymentMethod === 'zelle' ? 'selected' : ''}>Zelle</option>
            <option value="card" ${paymentMethod === 'card' ? 'selected' : ''}>Card</option>
          </select>
          <label class="payment-collected">
            <input type="checkbox" ${paymentCollected ? 'checked' : ''} onchange="togglePaymentCollected('${escapeHtml(order.id)}', this.checked)">
            Collected
          </label>
          <div class="payment-note">${escapeHtml(order.accountingBatch || fallbackBatch)}</div>
          <div class="payment-note">${escapeHtml(order.paymentCollectedAt ? formatDateTime(order.paymentCollectedAt) : '--')}</div>
        </div>`;

    return `<tr id="row-${escapeHtml(order.id)}">
      <td class="order-select-col">${canSelect ? `<input type="checkbox" class="order-select-checkbox" ${checked} onchange="toggleReminderOrderSelection('${escapeHtml(order.id)}', this.checked)">` : ''}</td>
      <td><div class="order-id">${escapeHtml(order.orderNumber || order.id)}</div>${payBadgeHtml}</td>
      <td style="font-size:12px;color:var(--text-light)">${formatDate(order.createdAt)}</td>
      <td><div class="customer-name">${escapeHtml(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim())}</div><div class="customer-phone">${escapeHtml(order.phone)}</div><div class="customer-email">${escapeHtml(order.email)}</div></td>
      <td>${itemsHtml}</td>
      <td><div class="total-amount">${formatCurrency(visibleTotal)}</div></td>
      <td style="font-size:13px">${orderLocationCellHtml(order)}</td>
      ${isPendingSheet ? '' : `<td>${paymentCellHtml}</td><td><span class="status-badge ${statusClass}">${statusLabel}</span></td>`}
      <td><div class="action-btns">${isShippingSheet ? `<button class="action-btn btn-print" onclick="printShippingOrders('${escapeHtml(order.id)}')" title="Print packing slip for this order">🖨️ Slip</button>` : ''}<button class="action-btn btn-fulfill" onclick="setStatus('${escapeHtml(order.id)}','fulfilled')">✓ Fulfill</button><button class="action-btn btn-noshow" onclick="setStatus('${escapeHtml(order.id)}','no_show')">No Show</button><button class="action-btn btn-cancel" onclick="setStatus('${escapeHtml(order.id)}','cancelled')">✕ Cancel</button><button class="action-btn btn-reset" onclick="setStatus('${escapeHtml(order.id)}','pending')">↺ Reset</button></div></td>
    </tr>`;
  }).join('');

  if (isPendingSheet) {
    orders.forEach((order) => {
      if ((order.status || 'pending') !== 'pending') return;
      const row = document.getElementById(`row-${order.id}`);
      const actions = row?.querySelector('.action-btns');
      if (!actions || actions.querySelector('.btn-edit')) return;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'action-btn btn-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openOrderEditor(order.id));
      actions.prepend(editBtn);
    });
  }

  renderStats();
  updateReminderActionUi();
}

function renderOrdersTableHead(isPendingSheet = ['active', 'specialty'].includes(state.orderSheet), isSpecialtySheet = state.orderSheet === 'specialty') {
  const headRow = document.querySelector('.orders-table thead tr');
  if (!headRow) return;
  const selectAllHtml = isSelectableSheet()
    ? '<input type="checkbox" id="selectAllActiveOrders" onchange="toggleVisibleReminderOrders(this.checked)" aria-label="Select all visible orders">'
    : '';
  headRow.innerHTML = `
    <th class="order-select-col">${selectAllHtml}</th>
    <th>Order #</th>
    <th>Received Date</th>
    <th>Customer</th>
    <th>Products &amp; Qty</th>
    <th>${isSpecialtySheet ? 'Non-Mango Total' : 'Total'}</th>
    <th>Location</th>
    ${isPendingSheet ? '' : '<th>Payment</th><th>Status</th>'}
    <th>Actions</th>
  `;
}

function productCategoryLabel(category) {
  const normalizedCategory = normalizeProductCategory(category);
  const labels = {
    mangoes: 'Fruits/Mangoes',
    putharekulu: 'Putharekulu',
    jellysnacks: 'Jelly',
    snacks: 'Snacks',
    picklespodi: 'Pickles & Podi'
  };
  return labels[normalizedCategory] || normalizedCategory || 'Product';
}

function getSortedProducts(products = []) {
  return [...products].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

function productFilterMetadata(product = {}) {
  return [
    product.id,
    product.name,
    product.tag,
    product.filterGroup,
    ...(Array.isArray(product.badges) ? product.badges : []),
    ...(Array.isArray(product.recommendationTags) ? product.recommendationTags : []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function isPodiProduct(product = {}) {
  if (normalizeProductCategory(product.category) !== 'picklespodi') return false;
  return /\bpodi\b|\bpowder\b/.test(productFilterMetadata(product));
}

function isPickleProduct(product = {}) {
  return normalizeProductCategory(product.category) === 'picklespodi' && !isPodiProduct(product);
}

function isNonVegPickleProduct(product = {}) {
  if (!isPickleProduct(product)) return false;
  return /non[\s-]?veg|chicken|mutton|fish|prawn|shrimp|seafood|natu kodi|country chicken|koramenu/.test(productFilterMetadata(product));
}

function productMatchesFilter(product, filter = state.productFilter) {
  const category = normalizeProductCategory(product.category);
  if (filter === 'all') return true;
  if (filter === 'sweets') return ['putharekulu', 'jellysnacks'].includes(category);
  if (filter === 'pickles') {
    if (!isPickleProduct(product)) return false;
    if (state.productPickleFilter === 'veg') return !isNonVegPickleProduct(product);
    if (state.productPickleFilter === 'nonveg') return isNonVegPickleProduct(product);
    return true;
  }
  if (filter === 'podi') return isPodiProduct(product);
  return category === filter;
}

function renderProductsFilterBar() {
  const bar = document.getElementById('productsFilterBar');
  if (!bar) return;

  const pickleProducts = state.products.filter(isPickleProduct);
  const podiProducts = state.products.filter(isPodiProduct);
  const nonVegPickles = pickleProducts.filter(isNonVegPickleProduct);
  const vegPickles = pickleProducts.filter((product) => !isNonVegPickleProduct(product));
  const options = [
    { id: 'all', label: 'All', count: state.products.length },
    { id: 'mangoes', label: 'Fruits/Mangoes', count: state.products.filter((product) => normalizeProductCategory(product.category) === 'mangoes').length },
    { id: 'sweets', label: 'Sweets', count: state.products.filter((product) => ['putharekulu', 'jellysnacks'].includes(normalizeProductCategory(product.category))).length },
    { id: 'snacks', label: 'Snacks', count: state.products.filter((product) => normalizeProductCategory(product.category) === 'snacks').length },
    { id: 'pickles', label: 'Pickles', count: pickleProducts.length },
    { id: 'podi', label: 'Podi', count: podiProducts.length },
  ];

  const pickleOptions = [
    { id: 'all', label: 'All Pickles', count: pickleProducts.length },
    { id: 'veg', label: 'Veg Pickles', count: vegPickles.length },
    { id: 'nonveg', label: 'Non-Veg Pickles', count: nonVegPickles.length },
  ];

  bar.innerHTML = `
    <div class="products-filter-primary">
      <span class="products-filter-label">Filter Products</span>
      ${options.map((option) => `
        <button type="button" class="product-filter-pill ${state.productFilter === option.id ? 'active' : ''}" aria-pressed="${state.productFilter === option.id}" onclick="setProductCategoryFilter('${escapeHtml(option.id)}')">
          ${escapeHtml(option.label)} (${option.count})
        </button>`).join('')}
    </div>
    ${state.productFilter === 'pickles' ? `
      <div class="products-filter-secondary">
        <span class="products-filter-label">Pickle Type</span>
        ${pickleOptions.map((option) => `
          <button type="button" class="product-filter-pill ${state.productPickleFilter === option.id ? 'active' : ''}" aria-pressed="${state.productPickleFilter === option.id}" onclick="setProductPickleFilter('${escapeHtml(option.id)}')">
            ${escapeHtml(option.label)} (${option.count})
          </button>`).join('')}
      </div>` : ''}`;
}

function mergeProductsWithBase(docs = []) {
  const normalizedDocs = docs.map((product) => ({ ...product, category: normalizeProductCategory(product.category) }));
  const byId = new Map(normalizedDocs.map((product) => [product.id, product]));
  const mergedBase = BASE_PRODUCTS.map((product) => applyVerifiedProductImageOverride(applyCatalogFieldOverrides({ ...product, ...(byId.get(product.id) || {}) })));
  const extraProducts = normalizedDocs
    .filter((product) => !BASE_PRODUCTS.some((baseProduct) => baseProduct.id === product.id))
    .map((product) => applyVerifiedProductImageOverride(applyCatalogFieldOverrides(applyLegacySweetVariantFallback({ ...product }))));

  return [...mergedBase, ...extraProducts];
}

const CATALOG_FIELD_OVERRIDES = window.SHRISH_CATALOG_FIELD_OVERRIDES || {};
const VERIFIED_PRODUCT_IMAGE_OVERRIDES = window.SHRISH_VERIFIED_PRODUCT_IMAGE_OVERRIDES || {};
const FORCE_CATALOG_FIELD_OVERRIDE_IDS = new Set([
  'picklespodi-drumstick-leaf-podi-munagaku-podi'
]);
const SWEET_CATALOG_OVERRIDE_CATEGORIES = new Set(['putharekulu', 'jellysnacks']);
const LEGACY_SWEET_VARIANT_FALLBACKS = {
  puth_plain: {
    name: 'Putharekulu - Classic Plain (Sugar)',
    price: '$7.49',
    unit: '5 count or 10 count',
    variants: [
      { id: 'opt1', label: '5 count', price: '$7.49', sku: 'POPJKP5' },
      { id: 'opt2', label: '10 count', price: '$13.99', sku: 'POPJKP10' }
    ]
  },
  puth_sugar_kaju_plain: {
    name: 'Putharekulu - Sugar - Kaju',
    price: '$7.99',
    unit: '5 count or 10 count',
    variants: [
      { id: 'opt1', label: '5 count', price: '$7.99', sku: 'PSK5' },
      { id: 'opt2', label: '10 count', price: '$14.99', sku: 'PSK10' }
    ]
  }
};

function hasAdminManagedCatalogFields(product = {}) {
  return Boolean(product.catalogManagedAt);
}

function applyCatalogFieldOverrides(product = {}) {
  const override = CATALOG_FIELD_OVERRIDES[product.id];
  const shouldForce = FORCE_CATALOG_FIELD_OVERRIDE_IDS.has(product.id)
    || SWEET_CATALOG_OVERRIDE_CATEGORIES.has(override?.category);
  if (!override || (hasAdminManagedCatalogFields(product) && !shouldForce)) return product;
  return {
    ...product,
    ...override,
    variants: Array.isArray(override.variants)
      ? override.variants.map((variant) => ({ ...variant }))
      : product.variants
  };
}

function applyVerifiedProductImageOverride(product = {}) {
  const override = VERIFIED_PRODUCT_IMAGE_OVERRIDES[product.id];
  if (!override) return product;
  return {
    ...product,
    image: override.image || '',
    gallery: Array.isArray(override.gallery) ? [...override.gallery] : []
  };
}

function getLegacySweetVariantFallback(product = {}) {
  if (product?.id === 'puth_plain') return LEGACY_SWEET_VARIANT_FALLBACKS.puth_plain;

  const normalizedName = String(product?.name || '')
    .toLowerCase()
    .replace(/â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalizedName === 'putharekulu - classic plain (sugar)') {
    return LEGACY_SWEET_VARIANT_FALLBACKS.puth_plain;
  }

  if (normalizedName === 'putharekulu - sugar, kaju' || normalizedName === 'putharekulu - sugar - kaju') {
    return LEGACY_SWEET_VARIANT_FALLBACKS.puth_sugar_kaju_plain;
  }

  return null;
}

function applyLegacySweetVariantFallback(product = {}) {
  const fallback = getLegacySweetVariantFallback(product);
  if (!fallback) return product;
  return {
    ...product,
    ...fallback,
    variants: fallback.variants.map((variant) => ({ ...variant }))
  };
}

function slugifyProductId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || `product_${Date.now()}`;
}

function getUniqueProductId(name) {
  const base = slugifyProductId(name);
  let id = base;
  let index = 2;
  const existing = new Set(state.products.map((product) => product.id));
  while (existing.has(id)) {
    id = `${base}_${index}`;
    index += 1;
  }
  return id;
}

function getNextSortOrder() {
  const orders = state.products
    .map((product) => Number(product?.sortOrder))
    .filter((value) => Number.isFinite(value));
  return (orders.length ? Math.max(...orders) : 0) + 1;
}

function updateProductFormForStatus() {
  const status = document.getElementById('newProductStatus')?.value || 'live';
  const category = document.getElementById('newProductCategory')?.value || 'mangoes';
  const priceInput = document.getElementById('newProductPrice');
  if (!priceInput) return;

  const isSoon = status === 'soon';
  const usesVariants = productUsesVariants(category);
  priceInput.disabled = isSoon;
  priceInput.required = !isSoon && !usesVariants;
  if (isSoon) {
    priceInput.value = '';
    priceInput.placeholder = 'Coming soon';
  } else if (usesVariants) {
    priceInput.placeholder = 'Optional main price';
  } else {
    priceInput.placeholder = '56';
  }
}

function applyCategoryDefaults() {
  const category = document.getElementById('newProductCategory')?.value || 'mangoes';
  const unitInput = document.getElementById('newProductUnit');
  const defaults = {
    mangoes: 'per box',
    putharekulu: '5 count or 10 count',
    jellysnacks: '250g or 500g',
    snacks: 'per pack',
    picklespodi: '250g or 500g'
  };
  const nextValue = defaults[category] || 'per box';
  if (!unitInput) return nextValue;

  unitInput.value = nextValue;
  return nextValue;
}

function productUsesVariants(category) {
  return ['putharekulu', 'jellysnacks', 'picklespodi'].includes(category);
}

function updateVariantFieldHints() {
  const category = document.getElementById('newProductCategory')?.value || 'mangoes';
  const labelOneText = document.getElementById('variantOneLabelText');
  const labelTwoText = document.getElementById('variantTwoLabelText');
  const priceOneText = document.getElementById('variantOnePriceText');
  const priceTwoText = document.getElementById('variantTwoPriceText');
  const skuOneText = document.getElementById('variantOneSkuText');
  const skuTwoText = document.getElementById('variantTwoSkuText');
  const labelOne = document.getElementById('variantOneLabel');
  const labelTwo = document.getElementById('variantTwoLabel');
  const skuOne = document.getElementById('variantOneSku');
  const skuTwo = document.getElementById('variantTwoSku');
  if (!labelOne || !labelTwo || !skuOne || !skuTwo) return;

  if (category === 'putharekulu') {
    if (labelOneText) labelOneText.textContent = '5 Count Label';
    if (labelTwoText) labelTwoText.textContent = '10 Count Label';
    if (priceOneText) priceOneText.textContent = '5 Count Price';
    if (priceTwoText) priceTwoText.textContent = '10 Count Price';
    if (skuOneText) skuOneText.textContent = '5 Count SKU';
    if (skuTwoText) skuTwoText.textContent = '10 Count SKU';
    labelOne.placeholder = '5 count';
    labelTwo.placeholder = '10 count';
    skuOne.placeholder = 'Ex: PSK5';
    skuTwo.placeholder = 'Ex: PSK10';
  } else if (category === 'jellysnacks') {
    if (labelOneText) labelOneText.textContent = '250g Label';
    if (labelTwoText) labelTwoText.textContent = '500g Label';
    if (priceOneText) priceOneText.textContent = '250g Price';
    if (priceTwoText) priceTwoText.textContent = '500g Price';
    if (skuOneText) skuOneText.textContent = '250g SKU';
    if (skuTwoText) skuTwoText.textContent = '500g SKU';
    labelOne.placeholder = '250g';
    labelTwo.placeholder = '500g';
    skuOne.placeholder = 'Ex: MJS250';
    skuTwo.placeholder = 'Ex: MJS500';
  } else if (category === 'picklespodi') {
    if (labelOneText) labelOneText.textContent = 'Size 1 Label';
    if (labelTwoText) labelTwoText.textContent = 'Size 2 Label';
    if (priceOneText) priceOneText.textContent = 'Size 1 Price';
    if (priceTwoText) priceTwoText.textContent = 'Size 2 Price';
    if (skuOneText) skuOneText.textContent = 'Size 1 SKU';
    if (skuTwoText) skuTwoText.textContent = 'Size 2 SKU';
    labelOne.placeholder = '250g';
    labelTwo.placeholder = '500g';
    skuOne.placeholder = 'Ex: pickle-mango-avakai-250g';
    skuTwo.placeholder = 'Ex: pickle-mango-avakai-500g';
  } else {
    if (labelOneText) labelOneText.textContent = 'Option 1 Label';
    if (labelTwoText) labelTwoText.textContent = 'Option 2 Label';
    if (priceOneText) priceOneText.textContent = 'Option 1 Price';
    if (priceTwoText) priceTwoText.textContent = 'Option 2 Price';
    if (skuOneText) skuOneText.textContent = 'Option 1 SKU';
    if (skuTwoText) skuTwoText.textContent = 'Option 2 SKU';
    labelOne.placeholder = 'Ex: 5 count or 250g';
    labelTwo.placeholder = 'Ex: 10 count or 500g';
    skuOne.placeholder = 'Ex: SKU001';
    skuTwo.placeholder = 'Ex: SKU002';
  }
}

function toggleVariantFields() {
  const category = document.getElementById('newProductCategory')?.value || 'mangoes';
  const wrap = document.getElementById('variantFields');
  if (!wrap) return;
  wrap.classList.toggle('open', productUsesVariants(category));
  updateVariantFieldHints();
}

function productVariantsFromForm(category, status) {
  if (!productUsesVariants(category)) return [];

  const rows = [
    {
      id: 'opt1',
      label: String(document.getElementById('variantOneLabel')?.value || '').trim(),
      price: String(document.getElementById('variantOnePrice')?.value || '').trim(),
      sku: String(document.getElementById('variantOneSku')?.value || '').trim()
    },
    {
      id: 'opt2',
      label: String(document.getElementById('variantTwoLabel')?.value || '').trim(),
      price: String(document.getElementById('variantTwoPrice')?.value || '').trim(),
      sku: String(document.getElementById('variantTwoSku')?.value || '').trim()
    }
  ];

  const variants = rows
    .filter((row) => row.label)
    .map((row) => {
      const numeric = parseFloat(row.price);
      return {
        id: row.id,
        label: row.label,
        price: Number.isFinite(numeric) && numeric > 0 ? `$${numeric}` : (status === 'soon' ? 'Coming Soon' : ''),
        sku: row.sku || ''
      };
    });

  return variants;
}

function primaryPriceFromVariants(variants = [], status = 'live') {
  if (!variants.length) return status === 'soon' ? 'Coming Soon' : '';
  return variants[0].price || (status === 'soon' ? 'Coming Soon' : '');
}

function picklesPodiSaveFields(product = {}) {
  const sourceProduct = product || {};
  if (normalizeProductCategory(sourceProduct.category) !== 'picklespodi') return {};

  return [
    'preorderOnly',
    'filterGroup',
    'ingredientsText',
    'storageNote',
    'shelfLifeDisplay',
    'foodSafetyNote',
    'shippingNote',
    'badges'
  ].reduce((acc, field) => {
    if (sourceProduct[field] !== undefined) acc[field] = sourceProduct[field];
    return acc;
  }, {});
}

function productSaveErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return 'Save blocked: admin session expired. Refresh, log in again, and retry.';
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return 'Save blocked: Firebase/network is unavailable. Check connection and retry.';
  }
  if (code.includes('invalid-argument')) {
    return 'Save blocked: one product field has an invalid value.';
  }
  return 'Could not save product right now. Check browser console for details.';
}

function galleryFromInput(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function shouldSendAvailabilityNotification(previousProduct, nextProduct) {
  if (!previousProduct || !nextProduct) return false;
  const wasUnavailable = !previousProduct.available || previousProduct.displayOnly || previousProduct.hidden;
  const isNowLive = nextProduct.available && !nextProduct.displayOnly && !nextProduct.hidden;
  return wasUnavailable && isNowLive;
}

async function notifyProductSubscribersIfNeeded(productId, previousProduct, nextProduct) {
  if (!shouldSendAvailabilityNotification(previousProduct, nextProduct)) return null;

  try {
    const result = await sendProductAvailabilityEmails({ productId });
    const sent = Number(result?.data?.sent || 0);
    const total = Number(result?.data?.totalSubscribers || 0);
    if (sent > 0) {
      showToast(`${nextProduct.name} is live; emailed ${sent} subscriber${sent === 1 ? '' : 's'}`);
    } else if (total === 0) {
      showToast(`${nextProduct.name} is live; no product subscribers yet`);
    }
    return result?.data || null;
  } catch (error) {
    console.error('Product availability email failed', {
      code: error?.code,
      message: error?.message,
      productId
    });
    showToast(`${nextProduct.name} is live, but notification emails did not send`);
    return null;
  }
}

function openAddProductForm() {
  document.getElementById('addProductForm')?.reset();
  document.getElementById('editingProductId').value = '';
  const title = document.querySelector('#productFormCard .product-form-head h3');
  const submit = document.getElementById('addProductSubmitBtn');
  if (title) title.textContent = 'Add New Product';
  if (submit) submit.textContent = 'Save Product';
  document.getElementById('productFormCard')?.classList.add('open');
  applyCategoryDefaults();
  toggleVariantFields();
  updateProductFormForStatus();
  updateVariantFieldHints();
  document.getElementById('newProductName')?.focus();
}

function closeAddProductForm() {
  document.getElementById('productFormCard')?.classList.remove('open');
}

function resetAddProductForm() {
  const form = document.getElementById('addProductForm');
  if (!form) return;
  form.reset();
  document.getElementById('editingProductId').value = '';
  applyCategoryDefaults();
  toggleVariantFields();
  document.getElementById('newProductStatus').value = 'live';
  updateProductFormForStatus();
  updateVariantFieldHints();
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  document.getElementById('editingProductId').value = product.id;
  document.getElementById('newProductName').value = product.name || '';
  document.getElementById('newProductCategory').value = normalizeProductCategory(product.category) || 'mangoes';
  document.getElementById('newProductLocalName').value = product.localName || '';
  document.getElementById('newProductOrigin').value = product.origin || '';
  document.getElementById('newProductStatus').value = product.displayOnly ? 'soon' : (product.available ? 'live' : 'off');
  document.getElementById('newProductTag').value = product.tag || '';
  document.getElementById('newProductPrice').value = String(product.price || '').replace(/[^0-9.]/g, '');
  document.getElementById('newProductUnit').value = product.unit || '';
  document.getElementById('newProductImage').value = product.image || '';
  document.getElementById('newProductGallery').value = Array.isArray(product.gallery) ? product.gallery.join(', ') : '';
  document.getElementById('newProductSeason').value = product.season || '';
  document.getElementById('newProductTaste').value = product.taste || '';
  document.getElementById('newProductBestFor').value = product.bestFor || '';
  document.getElementById('newProductDescription').value = product.description || '';

  const variants = Array.isArray(product.variants) ? product.variants : [];
  document.getElementById('variantOneLabel').value = variants[0]?.label || '';
  document.getElementById('variantOnePrice').value = String(variants[0]?.price || '').replace(/[^0-9.]/g, '');
  document.getElementById('variantOneSku').value = variants[0]?.sku || '';
  document.getElementById('variantTwoLabel').value = variants[1]?.label || '';
  document.getElementById('variantTwoPrice').value = String(variants[1]?.price || '').replace(/[^0-9.]/g, '');
  document.getElementById('variantTwoSku').value = variants[1]?.sku || '';

  const title = document.querySelector('#productFormCard .product-form-head h3');
  const submit = document.getElementById('addProductSubmitBtn');
  if (title) title.textContent = 'Edit Product';
  if (submit) submit.textContent = 'Update Product';
  document.getElementById('productFormCard')?.classList.add('open');
  toggleVariantFields();
  updateProductFormForStatus();
  updateVariantFieldHints();
  document.getElementById('newProductName')?.focus();
}

async function submitAddProduct(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = document.getElementById('addProductSubmitBtn');
  if (!form || !submitButton) return;

  const formData = new FormData(form);
  const editingProductId = String(formData.get('editingProductId') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const category = normalizeProductCategory(String(formData.get('category') || '').trim());
  const localName = String(formData.get('localName') || '').trim();
  const origin = String(formData.get('origin') || '').trim();
  const status = String(formData.get('status') || 'live').trim();
  const tag = String(formData.get('tag') || '').trim();
  const priceValue = String(formData.get('price') || '').trim();
  const unit = String(formData.get('unit') || '').trim();
  const image = String(formData.get('image') || '').trim();
  const gallery = galleryFromInput(formData.get('gallery'));
  const season = String(formData.get('season') || '').trim();
  const taste = String(formData.get('taste') || '').trim();
  const bestFor = String(formData.get('bestFor') || '').trim();
  const description = String(formData.get('description') || '').trim();

  if (!name || !category || !origin || !unit || !description) {
    showToast('Fill the required product fields');
    return;
  }

  const isSoon = status === 'soon';
  const isLive = status === 'live';
  const numericPrice = parseFloat(priceValue);
  const variants = productVariantsFromForm(category, status);
  const usesVariants = productUsesVariants(category);

  if (!isSoon && !usesVariants && (!Number.isFinite(numericPrice) || numericPrice <= 0)) {
    showToast('Enter a valid price for live or sold out products');
    return;
  }
  if (!isSoon && usesVariants && variants.some((variant) => !variant.price)) {
    showToast('Enter both option prices for this category');
    return;
  }
  if (usesVariants && !variants.length) {
    showToast('Add at least one size/count option for this category');
    return;
  }

  const id = editingProductId || getUniqueProductId(name);
  const existingProduct = editingProductId
    ? state.products.find((product) => product.id === editingProductId)
    : null;
  const baseUnit = usesVariants ? (unit || applyCategoryDefaults()) : unit;
  const nowIso = new Date().toISOString();
  const payload = {
    id,
    category,
    name,
    localName: localName || '',
    origin,
    price: usesVariants ? primaryPriceFromVariants(variants, status) : (isSoon ? 'Coming Soon' : `$${numericPrice}`),
    unit: baseUnit,
    available: isLive,
    displayOnly: isSoon,
    tag: tag || '',
    image: image || null,
    gallery,
    description,
    season: season || '',
    taste: taste || '',
    bestFor: bestFor || '',
    variants,
    hidden: Boolean(existingProduct?.hidden),
    ...picklesPodiSaveFields(existingProduct),
    sortOrder: editingProductId
      ? (existingProduct?.sortOrder ?? getNextSortOrder())
      : getNextSortOrder(),
    catalogManagedAt: nowIso,
    updatedAt: nowIso
  };
  if (!editingProductId) payload.createdAt = nowIso;

  if (!auth.currentUser) {
    showToast('Admin session expired. Refresh, log in again, and retry.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';

  try {
    await setDoc(doc(db, 'products', id), payload);
    showToast(editingProductId ? `${name} updated` : `${name} added to catalog`);
    await notifyProductSubscribersIfNeeded(id, existingProduct, payload);
    resetAddProductForm();
    closeAddProductForm();
  } catch (error) {
    console.error('Product save failed', {
      code: error?.code,
      message: error?.message,
      productId: id,
      payload
    });
    showToast(productSaveErrorMessage(error));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Save Product';
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  renderProductsFilterBar();

  const products = getSortedProducts(state.products).filter((product) => productMatchesFilter(product));

  if (!products.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1 / -1"><div class="empty-icon">!</div><p>No products match this filter.</p></div>';
    return;
  }

  grid.innerHTML = products.map((product) => {
    const isComingSoon = product.displayOnly;
    const isHidden = Boolean(product.hidden);
    const statusText = isHidden ? 'Hidden' : isComingSoon ? 'Soon' : (product.available ? 'Live' : 'Off');
    const statusClass = isHidden ? 'pm-status-hidden' : isComingSoon ? 'pm-status-soon' : (product.available ? 'pm-status-live' : 'pm-status-off');
    const shortDescription = String(product.description || '').trim();
    const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => variant?.label) : [];
    const variantSummary = variants.length
      ? variants.map((variant) => `${variant.label}${variant.price ? ` ${variant.price}` : ''}${variant.sku ? ` (${variant.sku})` : ''}`).join(' | ')
      : '';
    const priceSummary = variants.length
      ? variantSummary
      : (product.price ? `${product.price} - ${product.unit || 'per box'}` : (isComingSoon ? 'Coming Soon' : `No price set - ${product.unit || 'per box'}`));

    return `<div class="pm-card ${isHidden ? 'is-hidden' : ''}" id="pmc-${escapeHtml(product.id)}">
      <div class="pm-emoji">🥭</div>
      <div class="pm-info">
        <div class="pm-meta">
          <span class="pm-chip pm-status ${statusClass}">${escapeHtml(statusText)}</span>
          <span class="pm-chip">${escapeHtml(productCategoryLabel(product.category))}</span>
          ${product.tag ? `<span class="pm-chip">${escapeHtml(product.tag)}</span>` : ''}
        </div>
        <h4 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h4>
        <div class="pm-sub pm-desc">${escapeHtml(shortDescription || 'No description added yet.')}</div>
        <div class="pm-price">${escapeHtml(priceSummary)}</div>
        <div class="pm-sort-wrap"><span class="pm-sort-label">Order</span><input type="number" class="pm-sort-input" id="sort-${escapeHtml(product.id)}" value="${escapeHtml(String(product.sortOrder ?? ''))}" min="1" step="1"><button class="pm-save-btn" onclick="saveProductSortOrder('${escapeHtml(product.id)}')">Save</button></div>
      </div>
      <div class="pm-controls"><label class="toggle-switch"><input type="checkbox" ${product.available && !isHidden ? 'checked' : ''} onchange="toggleAvailable('${escapeHtml(product.id)}', this.checked)"><span class="toggle-slider"></span></label><button class="pm-edit-btn" type="button" onclick="editProduct('${escapeHtml(product.id)}')">Edit</button><button class="pm-edit-btn" type="button" onclick="toggleProductHidden('${escapeHtml(product.id)}', ${isHidden ? 'false' : 'true'})">${isHidden ? 'Unhide' : 'Hide'}</button></div>
    </div>`;
  }).join('');
}

function setProductCategoryFilter(filter) {
  state.productFilter = filter || 'all';
  state.productPickleFilter = 'all';
  renderProducts();
}

function setProductPickleFilter(filter) {
  const allowedFilters = ['all', 'veg', 'nonveg'];
  state.productPickleFilter = allowedFilters.includes(filter) ? filter : 'all';
  renderProducts();
}

function customerMatchesOrder(customer = {}, order = {}) {
  if (!customer?.id && !customer?.uid) return false;
  const customerUid = customer.uid || customer.id;
  if (order.customerUid && order.customerUid === customerUid) return true;

  const customerEmail = normalizeLookup(customer.email);
  const orderEmail = normalizeLookup(order.email || order.customerEmail);
  if (customerEmail && orderEmail && customerEmail === orderEmail) return true;

  const customerPhone = normalizeDigits(customer.phoneDigits || customer.phone);
  const orderPhone = normalizeDigits(order.phoneDigits || order.phone);
  return Boolean(customerPhone && orderPhone && customerPhone === orderPhone);
}

function customerOrderCount(customer = {}) {
  return state.orders.filter((order) => customerMatchesOrder(customer, order)).length;
}

function isProtectedCustomerAccount(customer = {}) {
  const email = normalizeLookup(customer.email);
  const uid = customer.uid || customer.id;
  return email === ADMIN_EMAIL || (auth.currentUser?.uid && uid === auth.currentUser.uid);
}

function customerFullName(customer = {}) {
  return customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
}

function customerAddress(customer = {}) {
  return [
    customer.addressLine1,
    customer.addressLine2,
    [customer.city, customer.state, customer.zip].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ');
}

function filteredCustomers() {
  const search = normalizeLookup(document.getElementById('customerSearch')?.value || '');
  return [...state.customers]
    .sort((a, b) => {
      const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    })
    .filter((customer) => {
      if (!search) return true;
      const haystack = [
        customerFullName(customer),
        customer.email,
        customer.phone,
        customer.phoneDigits,
        customer.preferredPickupLocationLabel,
        locationLabel(customer.preferredPickupLocation),
        customer.id
      ].map(normalizeLookup).join(' ');
      return haystack.includes(search);
    });
}

function renderCustomerSummary(customers) {
  const summary = document.getElementById('customersSummary');
  if (!summary) return;
  const withOrders = customers.filter((customer) => customerOrderCount(customer) > 0).length;
  const deletable = customers.length - withOrders;
  const newest = customers[0]?.email || '--';
  summary.innerHTML = `
    <div class="customers-summary-card"><span>Total Customers</span><strong>${customers.length}</strong></div>
    <div class="customers-summary-card"><span>With Orders</span><strong>${withOrders}</strong></div>
    <div class="customers-summary-card"><span>Can Delete</span><strong>${deletable}</strong></div>
    <div class="customers-summary-card"><span>Newest Account</span><strong style="font-size:15px;line-height:1.25">${escapeHtml(newest)}</strong></div>
  `;
}

function renderCustomers() {
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;

  const customers = filteredCustomers();
  renderCustomerSummary(customers);

  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">C</div><p>No customer accounts found.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = customers.map((customer) => {
    const ordersCount = customerOrderCount(customer);
    const name = customerFullName(customer) || 'No name saved';
    const pickup = customer.preferredPickupLocationLabel || locationLabel(customer.preferredPickupLocation) || '--';
    const address = customerAddress(customer) || '--';
    const protectedAccount = isProtectedCustomerAccount(customer);
    const canDelete = ordersCount === 0 && !protectedAccount;
    const deleteButton = canDelete
      ? `<button class="action-btn btn-cancel delete-customer-btn" type="button" data-customer-uid="${escapeHtml(customer.id)}" data-customer-email="${escapeHtml(customer.email || '')}">Delete</button>`
      : `<button class="action-btn" type="button" disabled title="${protectedAccount ? 'Admin account is protected' : 'Customer has order history'}">${protectedAccount ? 'Protected' : 'Has orders'}</button>`;

    return `<tr>
      <td><div class="customer-name">${escapeHtml(name)}</div><div class="customer-profile-muted">${escapeHtml(customer.city || '')}</div></td>
      <td><div class="customer-name">${escapeHtml(customer.email || '--')}</div><div class="customer-profile-muted">${escapeHtml(customer.id || customer.uid || '')}</div></td>
      <td>${escapeHtml(customer.phone || '--')}</td>
      <td>${escapeHtml(pickup)}</td>
      <td><div class="customer-profile-muted">${escapeHtml(address)}</div></td>
      <td><span class="status-badge ${ordersCount ? 'status-fulfilled' : 'status-pending'}">${ordersCount}</span></td>
      <td><div class="customer-profile-muted">Created: ${escapeHtml(formatDate(customer.createdAt))}<br>Updated: ${escapeHtml(formatDate(customer.updatedAt))}</div></td>
      <td><div class="action-btns">${deleteButton}</div></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.delete-customer-btn').forEach((button) => {
    button.addEventListener('click', () => {
      deleteCustomerAccountFromAdmin(button.dataset.customerUid || '', button.dataset.customerEmail || '');
    });
  });
}

async function deleteCustomerAccountFromAdmin(uid, email = '') {
  if (!uid) {
    showToast('Could not find this customer account');
    return;
  }

  const customer = state.customers.find((entry) => entry.id === uid || entry.uid === uid);
  if (customer && isProtectedCustomerAccount(customer)) {
    showToast('Admin account cannot be deleted here');
    return;
  }
  if (customer && customerOrderCount(customer) > 0) {
    showToast('This account has order history and cannot be deleted');
    return;
  }

  const confirmed = window.confirm(`Delete customer account${email ? ` ${email}` : ''}? This is only for fake accounts with no orders and cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteCustomerAccount({ uid });
    showToast('Customer account deleted');
  } catch (error) {
    console.error(error);
    const message = error?.message || 'Could not delete customer account';
    showToast(message.includes('order history') ? 'Customer has order history and cannot be deleted' : 'Could not delete customer account');
  }
}

function exportCustomersCSV() {
  const customers = filteredCustomers();
  if (!customers.length) {
    showToast('No customer accounts to export');
    return;
  }

  const rows = [['Name', 'Email', 'UID', 'Phone', 'Preferred Pickup', 'Address', 'Orders', 'Created', 'Updated']];
  customers.forEach((customer) => {
    rows.push([
      customerFullName(customer),
      customer.email || '',
      customer.id || customer.uid || '',
      customer.phone || '',
      customer.preferredPickupLocationLabel || locationLabel(customer.preferredPickupLocation) || '',
      customerAddress(customer),
      customerOrderCount(customer),
      formatDate(customer.createdAt),
      formatDate(customer.updatedAt)
    ]);
  });

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shrish_customers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast('Customer accounts CSV downloaded');
}

function feedbackRatingValue(entry = {}) {
  return Number(entry.responses?.overallRating || entry.feedbackRating || 0);
}

function feedbackItemSummary(entry = {}) {
  const items = Array.isArray(entry.items) ? entry.items : [];
  if (!items.length) return '--';
  return items.map((item) => `${item.name || 'Item'} x ${item.qty || 1}`).join(', ');
}

function feedbackAnswerSummary(entry = {}) {
  const responses = entry.responses || {};
  return [
    entry.hasMangoItems && responses.mangoSweetness ? `Sweetness: ${responses.mangoSweetness}` : '',
    !entry.hasMangoItems && responses.itemCondition ? `Condition: ${responses.itemCondition}` : '',
    responses.pickupExperience ? `Pickup: ${responses.pickupExperience}` : '',
    responses.reorderIntent ? `Buy again: ${responses.reorderIntent}` : '',
    responses.recommend ? `Recommend: ${responses.recommend}` : ''
  ].filter(Boolean);
}

function orderFeedbackFallbacks() {
  const feedbackIds = new Set(state.feedback.map((entry) => entry.orderId).filter(Boolean));
  return state.orders
    .filter((order) => order.feedbackSubmitted || order.feedbackRating || order.feedbackResponses)
    .filter((order) => !feedbackIds.has(order.id))
    .map((order) => ({
      id: `order-${order.id}`,
      orderId: order.id,
      orderNumber: order.orderNumber || '',
      customerUid: order.customerUid || '',
      customerEmail: order.customerEmail || order.email || '',
      location: order.location || '',
      locationLabel: order.locationLabel || '',
      items: Array.isArray(order.items) ? order.items : [],
      hasMangoItems: Boolean(order.feedbackHasMangoItems),
      responses: {
        ...(order.feedbackResponses || {}),
        overallRating: order.feedbackResponses?.overallRating || order.feedbackRating || ''
      },
      feedbackRating: order.feedbackRating || '',
      createdAt: order.feedbackSubmittedAt || order.updatedAt || order.createdAt || ''
    }));
}

function feedbackEntries() {
  return [...state.feedback, ...orderFeedbackFallbacks()];
}

function filteredFeedback() {
  const search = normalizeLookup(document.getElementById('feedbackSearch')?.value || '');
  const ratingFilter = document.getElementById('feedbackRating')?.value || 'all';
  const locationFilter = document.getElementById('feedbackLocation')?.value || 'all';

  return feedbackEntries().filter((entry) => {
    const rating = feedbackRatingValue(entry);
    const location = entry.location || '';
    if (ratingFilter === 'low' && rating > 3) return false;
    if (ratingFilter !== 'all' && ratingFilter !== 'low' && rating !== Number(ratingFilter)) return false;
    if (locationFilter !== 'all' && location !== locationFilter) return false;
    if (!search) return true;

    const haystack = [
      entry.orderNumber,
      entry.orderId,
      entry.customerEmail,
      entry.locationLabel,
      locationLabel(entry.location),
      feedbackItemSummary(entry),
      feedbackAnswerSummary(entry).join(' '),
      entry.responses?.comment
    ].map(normalizeLookup).join(' ');
    return haystack.includes(search);
  });
}

function renderFeedbackSummary(entries) {
  const summary = document.getElementById('feedbackSummary');
  if (!summary) return;

  const ratings = entries.map(feedbackRatingValue).filter(Boolean);
  const average = ratings.length
    ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
    : '--';
  const lowRatings = ratings.filter((rating) => rating <= 3).length;
  const reorderLikely = entries.filter((entry) => ['Definitely', 'Probably'].includes(entry.responses?.reorderIntent)).length;
  const recommendLikely = entries.filter((entry) => ['Very likely', 'Likely'].includes(entry.responses?.recommend)).length;

  summary.innerHTML = `
    <div class="customers-summary-card"><span>Total Feedback</span><strong>${entries.length}</strong></div>
    <div class="customers-summary-card"><span>Average Rating</span><strong>${average}</strong></div>
    <div class="customers-summary-card"><span>Low Ratings</span><strong>${lowRatings}</strong></div>
    <div class="customers-summary-card"><span>Would Reorder</span><strong>${reorderLikely}</strong></div>
    <div class="customers-summary-card"><span>Would Recommend</span><strong>${recommendLikely}</strong></div>
  `;
}

function renderFeedback() {
  const tbody = document.getElementById('feedbackBody');
  if (!tbody) return;

  const entries = filteredFeedback();
  renderFeedbackSummary(entries);

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">F</div><p>No feedback found.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = entries.map((entry) => {
    const rating = feedbackRatingValue(entry);
    const ratingClass = rating && rating <= 3 ? 'status-cancelled' : 'status-fulfilled';
    const comment = entry.responses?.comment || '';
    const answers = feedbackAnswerSummary(entry);
    const location = entry.locationLabel || locationLabel(entry.location) || '--';

    return `<tr>
      <td><div class="order-id">${escapeHtml(entry.orderNumber || entry.orderId || entry.id)}</div><div class="customer-profile-muted">${escapeHtml(entry.orderId || '')}</div></td>
      <td><div class="customer-name">${escapeHtml(entry.customerEmail || '--')}</div><div class="customer-profile-muted">${escapeHtml(entry.customerUid || '')}</div></td>
      <td><span class="status-badge ${ratingClass}">${rating ? `${rating}/5` : '--'}</span></td>
      <td><div class="feedback-answer-list">${answers.map((answer) => `<span>${escapeHtml(answer)}</span>`).join('')}${comment ? `<strong>Note: ${escapeHtml(comment)}</strong>` : ''}</div></td>
      <td><div class="customer-profile-muted">${escapeHtml(feedbackItemSummary(entry))}</div></td>
      <td>${escapeHtml(location)}</td>
      <td>${escapeHtml(formatDateTime(entry.createdAt))}</td>
    </tr>`;
  }).join('');
}

function exportFeedbackCSV() {
  const entries = filteredFeedback();
  if (!entries.length) {
    showToast('No feedback to export');
    return;
  }

  const rows = [[
    'Submitted', 'Order Number', 'Order ID', 'Customer Email', 'Rating', 'Items', 'Pickup Location',
    'Sweetness', 'Condition', 'Pickup Experience', 'Buy Again', 'Recommend', 'Comment'
  ]];
  entries.forEach((entry) => {
    const responses = entry.responses || {};
    rows.push([
      formatDateTime(entry.createdAt),
      entry.orderNumber || '',
      entry.orderId || '',
      entry.customerEmail || '',
      feedbackRatingValue(entry),
      feedbackItemSummary(entry),
      entry.locationLabel || locationLabel(entry.location) || '',
      responses.mangoSweetness || '',
      responses.itemCondition || '',
      responses.pickupExperience || '',
      responses.reorderIntent || '',
      responses.recommend || '',
      responses.comment || ''
    ]);
  });

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shrish_feedback_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast('Feedback CSV downloaded');
}

function renderSubscribers() {
  const tbody = document.getElementById('subscribersBody');
  if (!tbody) return;

  if (!state.subscribers.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">✉</div><p>No subscribers found.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.subscribers.map((entry) => {
    const statusLabel = entry.status || 'subscribed';
    const statusClass = statusLabel === 'subscribed' ? 'status-fulfilled' : 'status-pending';
    const consent = entry.marketingConsent ? 'Yes' : 'No';
    const subscription = entry.subscriptionLabel || entry.productName || 'General';
    const source = entry.source || 'website';

    return `<tr>
      <td><div class="customer-name">${escapeHtml(entry.email || '—')}</div></td>
      <td>${escapeHtml(subscription)}</td>
      <td>${escapeHtml(source)}</td>
      <td><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
      <td>${consent}</td>
      <td>${formatDate(entry.createdAt)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn btn-cancel" onclick="deleteSubscriber('${escapeHtml(entry.id)}', '${escapeHtml(entry._collection || '')}', '${escapeHtml(entry.email || '')}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function deleteSubscriber(id, collectionName, email) {
  if (!id || !collectionName) {
    showToast('Could not delete this subscriber');
    return;
  }

  const confirmed = window.confirm(`Delete subscriber${email ? ` ${email}` : ''}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, collectionName, id));
    showToast('Subscriber deleted');
  } catch (error) {
    console.error(error);
    showToast('Could not delete subscriber');
  }
}

async function saveProductPrice(id) {
  const input = document.getElementById(`price-${id}`);
  if (!input) return;
  const value = parseFloat(input.value);
  if (!Number.isFinite(value) || value < 1) {
    showToast('Enter a valid price');
    return;
  }

  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  const nowIso = new Date().toISOString();
  const price = `$${value}`;
  await updateDoc(doc(db, 'products', id), {
    price,
    catalogManagedAt: nowIso,
    updatedAt: nowIso
  });
  showToast(`${product.name} price updated`);
}

async function saveProductSortOrder(id) {
  const input = document.getElementById(`sort-${id}`);
  if (!input) return;
  const value = parseInt(input.value, 10);
  if (!Number.isFinite(value) || value < 1) {
    showToast('Enter a valid order number');
    return;
  }

  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  await updateDoc(doc(db, 'products', id), { sortOrder: value, updatedAt: new Date().toISOString() });
  showToast(`${product.name} order updated`);
}

async function toggleAvailable(id, available) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const payload = {
    available,
    hidden: available ? false : Boolean(product.hidden),
    displayOnly: available ? false : Boolean(product.displayOnly),
    updatedAt: new Date().toISOString()
  };
  await updateDoc(doc(db, 'products', id), payload);
  showToast(`${product.name} ${available ? 'is live' : 'is off'}`);
  await notifyProductSubscribersIfNeeded(id, product, { ...product, ...payload });
}

async function toggleProductHidden(id, hidden) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const payload = {
    hidden,
    updatedAt: new Date().toISOString()
  };
  await updateDoc(doc(db, 'products', id), payload);
  showToast(`${product.name} ${hidden ? 'hidden from shop' : 'visible in shop'}`);
}

async function applyOrderStatus(id, status, silent = false) {
  const order = state.orders.find((item) => item.id === id);
  const nowIso = new Date().toISOString();
  const payload = {
    status,
    updatedAt: nowIso
  };

  if (status === 'no_show') {
    payload.payment = 'pending';
    payload.paymentMethod = '';
    payload.paymentCollected = false;
    payload.paymentCollectedAt = null;
    payload.accountingBatch = order?.accountingBatch || batchNameFromDate(order?.pickupDate || todayDateInputValue());
  }

  if (status === 'pending' && order?.status === 'no_show') {
    payload.accountingBatch = '';
  }

  await updateDoc(doc(db, 'orders', id), payload);

  if (order?.phoneDigits) {
    const lockRef = doc(db, 'order_locks', order.phoneDigits);

    if (status === 'fulfilled') {
      await deleteDoc(lockRef);
    } else {
      await setDoc(lockRef, {
        phoneDigits: order.phoneDigits,
        orderId: id,
        status,
        updatedAt: nowIso
      }, { merge: true });
    }
  }

  if (!silent) showToast(`Order updated to ${orderStatusLabel(status)}`);
}

async function setStatus(id, status) {
  await applyOrderStatus(id, status, false);
}

async function updatePickupDate(id, pickupDate) {
  await updateDoc(doc(db, 'orders', id), { pickupDate: pickupDate || '', updatedAt: new Date().toISOString() });
  showToast('Pickup date saved');
}

async function updatePaymentMethod(id, paymentMethod) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;

  const payload = {
    paymentMethod: paymentMethod || '',
    payment: paymentMethod ? 'paid' : 'pending',
    accountingBatch: paymentMethod ? (order.accountingBatch || batchNameFromDate(todayDateInputValue())) : '',
    updatedAt: new Date().toISOString()
  };

  if (!paymentMethod) {
    payload.paymentCollected = false;
    payload.paymentCollectedAt = null;
  }

  await updateDoc(doc(db, 'orders', id), payload);
  showToast(paymentMethod ? 'Payment method updated' : 'Payment method cleared');
}

async function setQuickPaymentMethod(id, paymentMethod) {
  const order = state.orders.find((item) => item.id === id);
  if (!order || !['cash', 'zelle', 'card'].includes(paymentMethod)) return;

  const methodLabels = {
    cash: 'Cash',
    zelle: 'Zelle',
    card: 'Card'
  };
  const nowIso = new Date().toISOString();
  await updateDoc(doc(db, 'orders', id), {
    paymentMethod,
    payment: 'paid',
    paymentCollected: true,
    paymentCollectedAt: nowIso,
    accountingBatch: order.accountingBatch || batchNameFromDate(todayDateInputValue()),
    updatedAt: nowIso
  });
  showToast(`${methodLabels[paymentMethod]} payment marked collected`);
}

async function togglePaymentCollected(id, collected) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;

  const hasMethod = Boolean(order.paymentMethod);
  const payload = {
    paymentCollected: collected && hasMethod,
    paymentCollectedAt: collected && hasMethod ? new Date().toISOString() : null,
    accountingBatch: collected && hasMethod ? (order.accountingBatch || batchNameFromDate(todayDateInputValue())) : (order.accountingBatch || ''),
    payment: collected && hasMethod ? 'paid' : (order.paymentMethod ? 'paid' : 'pending'),
    updatedAt: new Date().toISOString()
  };

  await updateDoc(doc(db, 'orders', id), payload);
  showToast(collected && hasMethod ? 'Payment marked collected' : 'Payment marked uncollected');
}

function buildAccountingBatchPayload(batchName, batchOrders, metrics, options = {}) {
  const existing = getAccountingBatchRecord(batchName) || {};
  const isClosing = Boolean(options.closeBatch);
  const isReopening = Boolean(options.reopenBatch);
  const nextStatus = isClosing ? 'closed' : (isReopening ? 'open' : (existing.status || 'open'));
  const nowIso = new Date().toISOString();

  return {
    batchName,
    batchDate: batchName.replace('SHR-BATCH-', ''),
    status: nextStatus,
    orderCount: batchOrders.length,
    expectedTotal: metrics.expectedTotal,
    collectedTotal: metrics.collectedTotal,
    cashTotal: metrics.cashTotal,
    zelleTotal: metrics.zelleTotal,
    cardTotal: metrics.cardTotal,
    unpaidCount: metrics.unpaidCount,
    actualCash: metrics.actualCash,
    actualZelle: metrics.actualZelle,
    actualCard: metrics.actualCard,
    actualTotal: metrics.actualTotal,
    difference: metrics.mismatch,
    lastSavedAt: nowIso,
    closedAt: isClosing ? nowIso : (isReopening ? null : (existing.closedAt || null)),
    updatedAt: nowIso
  };
}

async function saveAccountingBatch(options = {}) {
  const dateInput = document.getElementById('accountingDate');
  const seqInput = document.getElementById('accountingBatchSeq');
  if (!dateInput) return;

  if (!dateInput.value) dateInput.value = todayDateInputValue();
  if (seqInput && (!seqInput.value || Number(seqInput.value) < 1)) seqInput.value = '1';
  const batchName = state.selectedAccountingBatch || batchNameFromDate(dateInput.value, seqInput?.value || 1);
  const batchOrders = state.orders.filter((order) => (order.accountingBatch || '') === batchName);

  const expectedTotal = batchOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const collectedOrders = batchOrders.filter((order) => order.paymentCollected && order.paymentMethod);
  const collectedTotal = collectedOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const cashTotal = collectedOrders.filter((order) => order.paymentMethod === 'cash').reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const zelleTotal = collectedOrders.filter((order) => order.paymentMethod === 'zelle').reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const cardTotal = collectedOrders.filter((order) => order.paymentMethod === 'card').reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const unpaidCount = batchOrders.filter((order) => !order.paymentCollected && (order.status || '') !== 'no_show').length;
  const actualCash = moneyValue(document.getElementById('actualCash')?.value);
  const actualZelle = moneyValue(document.getElementById('actualZelle')?.value);
  const actualCard = moneyValue(document.getElementById('actualCard')?.value);
  const actualTotal = actualCash + actualZelle + actualCard;
  const mismatch = actualTotal - collectedTotal;

  const payload = buildAccountingBatchPayload(batchName, batchOrders, {
    expectedTotal,
    collectedTotal,
    cashTotal,
    zelleTotal,
    cardTotal,
    unpaidCount,
    actualCash,
    actualZelle,
    actualCard,
    actualTotal,
    mismatch
  }, options);

  try {
    await setDoc(doc(db, 'accounting_batches', batchName), payload, { merge: true });
    state.selectedAccountingBatch = batchName;

    if (options.closeBatch) {
      showToast('Batch closed');
    } else if (options.reopenBatch) {
      showToast('Batch reopened');
    } else {
      showToast('Accounting tally saved');
    }
    return true;
  } catch (error) {
    console.error(error);
    const message = String(error?.code || error?.message || '');
    if (message.includes('permission-denied')) {
      showToast('Accounting save blocked by Firestore rules. Deploy the latest firestore.rules.');
    } else {
      showToast('Could not save accounting batch right now');
    }
    return false;
  }
}

async function closeAccountingBatch() {
  const dateInput = document.getElementById('accountingDate');
  const seqInput = document.getElementById('accountingBatchSeq');
  if (!dateInput?.value) dateInput.value = todayDateInputValue();
  const batchName = state.selectedAccountingBatch || batchNameFromDate(dateInput?.value || todayDateInputValue(), seqInput?.value || 1);
  const confirmed = window.confirm(`Close ${batchName}? You can reopen it later if needed.`);
  if (!confirmed) return;
  const saved = await saveAccountingBatch({ closeBatch: true });
  if (!saved) return;
  state.accountingView = 'open';
  state.selectedAccountingBatch = '';
  renderAccounting();
}

async function reopenAccountingBatch() {
  const dateInput = document.getElementById('accountingDate');
  const seqInput = document.getElementById('accountingBatchSeq');
  if (!dateInput?.value) dateInput.value = todayDateInputValue();
  const batchName = state.selectedAccountingBatch || batchNameFromDate(dateInput?.value || todayDateInputValue(), seqInput?.value || 1);
  const confirmed = window.confirm(`Reopen ${batchName}? This lets you continue editing the tally.`);
  if (!confirmed) return;
  const saved = await saveAccountingBatch({ reopenBatch: true });
  if (!saved) return;
  state.accountingView = 'open';
  state.selectedAccountingBatch = batchName;
  renderAccounting();
}

function exportAccountingBatchCSV() {
  const dateInput = document.getElementById('accountingDate');
  const seqInput = document.getElementById('accountingBatchSeq');
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = todayDateInputValue();
  const batchName = state.selectedAccountingBatch || batchNameFromDate(dateInput.value, seqInput?.value || 1);
  const batchOrders = state.orders.filter((order) => (order.accountingBatch || '') === batchName);
  const batchRecord = getAccountingBatchRecord(batchName) || {};
  const rows = [[
    'Batch', 'Status', 'Order #', 'Customer', 'Phone', 'Total', 'Method', 'Collected', 'Payment Time'
  ]];

  batchOrders.forEach((order) => {
    rows.push([
      batchName,
      batchRecord.status || 'open',
      order.orderNumber || order.id,
      order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim(),
      order.phone || '',
      orderRevenueValue(order),
      order.paymentMethod || '',
      order.paymentCollected ? 'Yes' : 'No',
      formatDateTime(order.paymentCollectedAt)
    ]);
  });

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${batchName.toLowerCase()}_accounting.csv`;
  a.click();
  showToast('Accounting batch CSV downloaded');
}

async function clearFulfilled() {
  state.orderSheet = 'processed';
  renderOrders();
  showToast('Processed Orders now shows fulfilled pickups that still need review.');
}

function exportCSV() {
  const orders = getFilteredOrders(state.orderSheet);
  if (!orders.length) {
    showToast('No orders match the current view and filters.');
    return;
  }

  const rows = [[
    'Order ID', 'Customer', 'Phone', 'Email', 'Items', 'Boxes', 'Total',
    'Location', 'Shipping Address', 'Pickup Date', 'Payment', 'Payment Method', 'Collected', 'Status', 'Created'
  ]];
  orders.forEach((order) => {
    const visibleItems = orderItemsForSheet(order);
    const visibleBoxes = visibleItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const visibleTotal = state.orderSheet === 'specialty' ? orderItemsTotal(visibleItems) : order.totalPrice || 0;
    rows.push([
      order.orderNumber || order.id,
      order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim(),
      order.phone || '',
      order.email || '',
      orderItemsSummary(visibleItems),
      state.orderSheet === 'specialty' ? visibleBoxes : order.totalBoxes || 0,
      visibleTotal,
      order.locationLabel || order.location || '',
      shippingAddressText(order.shippingAddress || {}),
      order.pickupDate || '',
      order.payment || 'pending',
      order.paymentMethod || '',
      order.paymentCollected ? 'Yes' : 'No',
      orderStatusLabel(order.status || 'pending'),
      formatDate(order.createdAt)
    ]);
  });

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shrish_${state.orderSheet}_orders_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  const sheetLabel = state.orderSheet.charAt(0).toUpperCase() + state.orderSheet.slice(1);
  showToast(`${sheetLabel} orders Excel download ready`);
}

function setOrderSheet(sheet) {
  syncCurrentOrderFilters();
  const previous = state.orderSheet;
  state.orderSheet = sheet;
  // Selection is per-sheet in meaning (reminders vs packing slips), so drop it
  // whenever we leave a selectable sheet or switch between them.
  if (!isSelectableSheet(sheet) || sheet !== previous) state.selectedReminderOrderIds.clear();
  renderOrders();
}

async function markFilteredActiveFulfilled() {
  const orders = getFilteredOrders('active');
  if (!orders.length) {
    showToast('No active orders match the current filters.');
    return;
  }

  for (const order of orders) {
    await applyOrderStatus(order.id, 'fulfilled', true);
  }

  showToast(`${orders.length} active order${orders.length === 1 ? '' : 's'} marked fulfilled.`);
}

function printableItems(order, items = order.items || []) {
  return items
    .map((item) => `${escapeHtml(item.name || 'Item')} x ${escapeHtml(String(item.qty || 1))}`)
    .join('<br>');
}

function printableQty(order, items = order.items || [], useOrderTotal = true) {
  if (useOrderTotal && order.totalBoxes) return order.totalBoxes;
  return items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function printableTotal(order, items = order.items || [], useOrderTotal = true) {
  const explicit = useOrderTotal ? moneyNumber(order.totalPrice) : 0;
  if (explicit > 0) return explicit;
  return orderItemsTotal(items);
}

function printActiveOrders() {
  const printSheet = state.orderSheet === 'specialty' ? 'specialty' : 'active';
  const isSpecialty = printSheet === 'specialty';
  const allActive = getFilteredOrders(printSheet);
  if (!allActive.length) {
    showToast(isSpecialty ? 'No pickles, sweets, or snacks orders to print.' : 'No active orders to print.');
    return;
  }

  const locationOrder = { shortpump: 1, chesterfield: 2, mechanicsville: 3 };
  const orders = [...allActive].sort((a, b) => {
    const la = locationOrder[a.location] || 9;
    const lb = locationOrder[b.location] || 9;
    if (la !== lb) return la - lb;
    return String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''));
  });

  const groups = {};
  orders.forEach(o => {
    const loc = o.locationLabel || locationLabel(o.location) || 'Other';
    if (!groups[loc]) groups[loc] = [];
    groups[loc].push(o);
  });

  const totalBoxes = orders.reduce((sum, order) => {
    const items = orderItemsForSheet(order, printSheet);
    return sum + printableQty(order, items, !isSpecialty);
  }, 0);
  const totalAmount = orders.reduce((sum, order) => {
    const items = orderItemsForSheet(order, printSheet);
    return sum + printableTotal(order, items, !isSpecialty);
  }, 0);
  const now = new Date();
  const printDate = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const printTime = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const printHeading = isSpecialty ? 'Pickles / Sweets / Snacks Checklist' : 'Pickup Day Checklist';
  const printSubheading = isSpecialty ? 'Pending non-mango items only' : 'Pending orders only';

  let rowNum = 1;
  let bodyHtml = '';
  Object.entries(groups).forEach(([loc, locOrders]) => {
    bodyHtml += `<tr class="loc-hdr"><td colspan="7">&#128205; ${escapeHtml(loc)}<span class="loc-meta">${locOrders.length} orders</span></td></tr>`;
    locOrders.forEach(order => {
      const name  = escapeHtml((order.fullName || `${order.firstName||''} ${order.lastName||''}`.trim()).trim());
      const phone = escapeHtml(order.phone || '');
      const visibleItems = orderItemsForSheet(order, printSheet);
      const items = visibleItems.map(it => `<span class="pill">${escapeHtml(it.name||'Item')} &times;${it.qty||1}</span>`).join(' ');
      const qty   = printableQty(order, visibleItems, !isSpecialty);
      const total = escapeHtml(formatCurrency(printableTotal(order, visibleItems, !isSpecialty)));
      const onum  = escapeHtml(String(order.orderNumber || order.id || ''));
      const pref  = (order.paymentMethod || '').toLowerCase();
      const Z = pref === 'zelle' ? ' pre' : '';
      const C = pref === 'cash'  ? ' pre' : '';
      const K = pref === 'card'  ? ' pre' : '';
      bodyHtml += `
        <tr class="orow">
          <td class="c-num">${rowNum++}</td>
          <td class="c-ord">${onum}</td>
          <td class="c-name">${name}<div class="phone">${phone}</div></td>
          <td class="c-items">${items}</td>
          <td class="c-qty">${qty}</td>
          <td class="c-total">${total}</td>
          <td class="c-pay">
            <div class="pay-row">
              <label class="cb-lbl"><span class="cb${C}"></span>Cash</label>
              <label class="cb-lbl"><span class="cb${Z}"></span>Zelle</label>
              <label class="cb-lbl"><span class="cb${K}"></span>Card</label>
            </div>
          </td>
        </tr>`;
    });
  });

  const pw = window.open('', '_blank', 'width=1100,height=860');
  if (!pw) { showToast('Allow popups to print.'); return; }

  pw.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Shrish ${escapeHtml(printHeading)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#111;background:#fff;padding:14px 18px}

  /* ── HEADER ── */
  .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:9px;border-bottom:3px solid #C8791A;margin-bottom:11px}
  .hdr-left h1{font-size:19px;color:#7A4800;line-height:1.2}
  .hdr-left .sub{font-size:10.5px;color:#777;margin-top:3px}
  .hdr-right{text-align:right;font-size:11px}
  .hdr-right .big{font-size:17px;font-weight:700;color:#C8791A;display:block}

  /* ── TABLE ── */
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  colgroup col:nth-child(1){width:28px}
  colgroup col:nth-child(2){width:62px}
  colgroup col:nth-child(3){width:132px}
  colgroup col:nth-child(4){width:auto}
  colgroup col:nth-child(5){width:36px}
  colgroup col:nth-child(6){width:62px}
  colgroup col:nth-child(7){width:105px}

  thead th{background:#7A4800;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:6px 7px;text-align:left;border:1px solid #5A3000}
  thead th:nth-child(5){text-align:center}
  thead th:nth-child(6){text-align:right}

  /* location header */
  tr.loc-hdr td{background:#F5E4C8;color:#7A4800;font-weight:700;font-size:11.5px;padding:6px 9px;border:1px solid #D9C0A0}
  .loc-meta{font-weight:400;color:#A07040;margin-left:10px;font-size:10.5px}

  /* order row */
  tr.orow td{border:1px solid #D9C0A0;padding:6px 7px;vertical-align:top}
  tr.orow:nth-child(odd) td{background:#FDFAF6}
  tr.orow:nth-child(even) td{background:#FBF7F1}

  .c-num{text-align:center;color:#AAA;font-size:10.5px}
  .c-ord{font-weight:700;color:#7A4800;font-size:11px;white-space:nowrap}
  .c-name{font-weight:700;font-size:12.5px}
  .phone{font-size:10.5px;color:#666;font-weight:400;margin-top:1px}
  .c-items{}
  .pill{display:inline-block;background:#FDF3E3;border:1px solid #EDD5A0;border-radius:3px;padding:1px 5px;margin:1px 2px 1px 0;font-size:10.5px;font-weight:700;color:#7A4800;white-space:nowrap}
  .c-qty{text-align:center;font-weight:800;font-size:15px;color:#2E7D32;vertical-align:middle!important}
  .c-total{text-align:right;font-weight:800;font-size:12px;color:#7A4800;vertical-align:middle!important;white-space:nowrap}
  .c-pay{vertical-align:middle!important}

  /* payment type checkboxes */
  .pay-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
  .cb-lbl{display:flex;align-items:center;gap:3px;font-size:10.5px;font-weight:600;white-space:nowrap;cursor:default}
  .cb{display:inline-block;width:15px;height:15px;border:2px solid #444;border-radius:2px;flex-shrink:0}
  .cb.pre{background:#FDF3E3;border-color:#C8791A}

  .done-txt{}

  /* grand total */
  .grand{margin-top:10px;background:#7A4800;color:#fff;border-radius:5px;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;font-size:12px}
  /* notes */
  .notes{margin-top:12px;border:1.5px dashed #C8791A;border-radius:5px;padding:9px 13px}
  .notes h3{font-size:11.5px;font-weight:700;color:#7A4800;margin-bottom:7px}
  .nl{border-bottom:1px solid #ddd;height:22px;margin-bottom:4px}

  /* print overrides */
  @media print{
    @page{size:A4 portrait;margin:9mm 8mm}
    body{padding:0;font-size:10px}
    table{font-size:10px}
    thead th{font-size:8.5px;padding:5px 4px}
    tr.orow td{padding:5px 4px}
    .c-name{font-size:11px}
    .phone,.pill,.cb-lbl{font-size:9px}
    .c-qty{font-size:13px}
    .c-total{font-size:10px}
    .cb{width:12px;height:12px}
    thead{display:table-header-group}
    tr.orow{page-break-inside:avoid}
    tr.loc-hdr{page-break-before:auto}
    .grand{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    tr.loc-hdr td,.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    thead th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <h1>&#129389; Shrish LLC &mdash; ${escapeHtml(printHeading)}</h1>
    <div class="sub">Printed: ${escapeHtml(printDate)} &nbsp;&bull;&nbsp; ${escapeHtml(printTime)} &nbsp;&bull;&nbsp; ${escapeHtml(printSubheading)}</div>
  </div>
  <div class="hdr-right">
    <span class="big">${orders.length} orders &nbsp; ${totalBoxes} boxes</span>
  </div>
</div>

<table>
  <colgroup><col><col><col><col><col><col><col></colgroup>
  <thead>
    <tr>
      <th>#</th>
      <th>Order</th>
      <th>Name &amp; Phone</th>
      <th>Items Ordered</th>
      <th style="text-align:center">Boxes</th>
      <th style="text-align:right">Total</th>
      <th>Payment Type</th>
    </tr>
  </thead>
  <tbody>${bodyHtml}</tbody>
</table>

<div class="grand">
  <span>GRAND TOTAL &nbsp;&bull;&nbsp; ${orders.length} orders &nbsp;&bull;&nbsp; ${totalBoxes} boxes &nbsp;&bull;&nbsp; ${escapeHtml(formatCurrency(totalAmount))}</span>
</div>

<div class="notes">
  <h3>Notes / Walk-up sales / Damaged boxes</h3>
  <div class="nl"></div><div class="nl"></div><div class="nl"></div><div class="nl"></div>
</div>

<script>window.onload=()=>window.print();<\/script>
</body></html>`);
  pw.document.close();
}

// Money helper that tolerates older orders missing the derived total fields.
function slipAmount(value) {
  const n = moneyNumber(value);
  return Number.isFinite(n) ? n : 0;
}

function buildPackingSlipHtml(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const address = order.shippingAddress || {};
  const name = String(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`).trim();
  const addressLines = shippingAddressLines(address);

  const subtotal = slipAmount(order.itemSubtotal) || orderItemsTotal(items);
  const shipping = slipAmount(order.shippingAmount);
  const tax = slipAmount(order.salesTaxAmount);
  const discount = slipAmount(order.promoDiscount);
  const total = slipAmount(order.totalPrice) || (subtotal + shipping + tax - discount);
  const boxes = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  const paid = String(order.payment || '').toLowerCase() === 'paid'
    || String(order.paymentStatus || '').toLowerCase() === 'paid'
    || Boolean(order.paymentCollected);
  const payBadge = paid
    ? '<span class="badge paid">PAID</span>'
    : `<span class="badge due">${escapeHtml(order.paymentMethodLabel || 'Payment due')}</span>`;

  const itemRows = items.map((item) => {
    const qty = Number(item.qty || 1);
    const line = slipAmount(item.lineTotal) || slipAmount(item.price) * qty;
    const unit = item.unit ? ` <span class="unit">(${escapeHtml(item.unit)})</span>` : '';
    return `<tr>
      <td class="pack"><span class="chk"></span></td>
      <td>${escapeHtml(item.name || 'Item')}${unit}</td>
      <td class="qty">${escapeHtml(String(qty))}</td>
      <td class="amt">${escapeHtml(formatCurrency(line))}</td>
    </tr>`;
  }).join('');

  const totalRow = (label, value, cls = '') =>
    `<tr class="${cls}"><td colspan="2"></td><td class="tl">${escapeHtml(label)}</td><td class="amt">${escapeHtml(formatCurrency(value))}</td></tr>`;

  return `<section class="slip">
    <header class="slip-hdr">
      <div class="brand">
        <div class="brand-name">SHRISH</div>
        <div class="brand-sub">Handcrafted Andhra Pickles, Podi &amp; Sweets</div>
      </div>
      <div class="slip-meta">
        <div class="slip-title">PACKING SLIP</div>
        <div class="onum">${escapeHtml(String(order.orderNumber || order.id || ''))}</div>
        <div class="odate">${escapeHtml(formatDate(order.createdAt))}</div>
        ${payBadge}
      </div>
    </header>

    <div class="addr-row">
      <div class="from">
        <div class="lbl">FROM</div>
        <div><strong>Shrish LLC</strong></div>
        <div>Richmond, VA</div>
        <div>contact@shrish.co</div>
        <div>+1 (765) 325-5577</div>
      </div>
      <div class="shipto">
        <div class="lbl">SHIP TO</div>
        <div class="to-name">${escapeHtml(name || '--')}</div>
        ${addressLines.length
          ? addressLines.map((line) => `<div class="to-line">${escapeHtml(line)}</div>`).join('')
          : '<div class="to-line missing">No shipping address on file</div>'}
        ${order.phone ? `<div class="to-phone">${escapeHtml(order.phone)}</div>` : ''}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr><th class="pack">Packed</th><th>Item</th><th class="qty">Qty</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="4" class="empty">No items on this order.</td></tr>'}
      </tbody>
      <tfoot>
        ${totalRow('Subtotal', subtotal)}
        ${discount > 0 ? totalRow(`Discount${order.promoCode ? ` (${order.promoCode})` : ''}`, -discount) : ''}
        ${shipping > 0 ? totalRow(order.shippingLabel || 'Shipping', shipping) : totalRow('Shipping', 0)}
        ${tax > 0 ? totalRow(order.salesTaxLabel || 'Sales tax', tax) : ''}
        ${totalRow('TOTAL', total, 'grand')}
      </tfoot>
    </table>

    <div class="foot">
      <div class="count">${escapeHtml(String(items.length))} line item(s) &bull; ${escapeHtml(String(boxes))} unit(s)</div>
      ${order.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>` : ''}
      <div class="thanks">Thank you for ordering from Shrish! &nbsp;shrish.co</div>
    </div>
  </section>`;
}

// Prints one packing slip per shipping order, one per page.
// printShippingOrders('<id>') prints a single order; with no argument it prints
// the checked orders, falling back to every order matching the current filters.
function printShippingOrders(orderId = null) {
  let orders;
  if (orderId) {
    const single = state.orders.find((order) => order.id === orderId);
    if (!single) { showToast('Order not found.'); return; }
    orders = [single];
  } else {
    const selected = selectedOrdersOnSheet('shipping');
    orders = selected.length ? selected : getFilteredOrders('shipping');
  }

  if (!orders.length) { showToast('No shipping orders to print.'); return; }

  const withoutAddress = orders.filter((order) => !shippingAddressLines(order.shippingAddress || {}).length).length;
  const slips = orders.map(buildPackingSlipHtml).join('');
  const now = new Date();

  const pw = window.open('', '_blank', 'width=980,height=900');
  if (!pw) { showToast('Allow popups to print.'); return; }

  pw.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Shrish Packing Slips (${orders.length})</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#f4f4f4;font-size:12px}
  .slip{background:#fff;width:7.9in;min-height:10.2in;margin:0 auto 16px;padding:0.42in 0.45in;page-break-after:always;break-after:page;display:flex;flex-direction:column}
  .slip:last-child{page-break-after:auto;break-after:auto}

  .slip-hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C8791A;padding-bottom:10px;margin-bottom:16px}
  .brand-name{font-size:27px;font-weight:700;letter-spacing:3px;color:#C8791A;line-height:1}
  .brand-sub{font-size:10.5px;color:#777;margin-top:4px}
  .slip-meta{text-align:right}
  .slip-title{font-size:13px;font-weight:700;letter-spacing:2px;color:#7A4410}
  .onum{font-size:17px;font-weight:700;margin-top:3px}
  .odate{font-size:10.5px;color:#777;margin-top:2px}
  .badge{display:inline-block;margin-top:6px;padding:3px 9px;border-radius:11px;font-size:10px;font-weight:700;letter-spacing:.5px}
  .badge.paid{background:#E4F4E9;color:#1E7A46;border:1px solid #1E7A46}
  .badge.due{background:#FDF0E4;color:#B3402B;border:1px solid #B3402B}

  .addr-row{display:flex;gap:16px;margin-bottom:16px}
  .from{width:33%;font-size:10.5px;color:#555;line-height:1.5}
  .shipto{flex:1;border:2px solid #111;border-radius:5px;padding:11px 13px}
  .lbl{font-size:9.5px;font-weight:700;letter-spacing:1.3px;color:#999;margin-bottom:5px}
  .shipto .lbl{color:#C8791A}
  .to-name{font-size:17px;font-weight:700;line-height:1.3}
  .to-line{font-size:15px;line-height:1.45}
  .to-line.missing{font-size:12px;color:#B3402B;font-style:italic}
  .to-phone{font-size:12px;color:#555;margin-top:5px}

  table.items{width:100%;border-collapse:collapse;margin-bottom:14px}
  table.items th{background:#7C1C22;color:#fff;font-size:10px;letter-spacing:.8px;text-transform:uppercase;padding:7px 8px;text-align:left}
  table.items td{padding:7px 8px;border-bottom:1px solid #E5DED2;font-size:12.5px;vertical-align:middle}
  th.qty,td.qty{text-align:center;width:52px}
  th.amt,td.amt{text-align:right;width:88px}
  th.pack,td.pack{width:58px;text-align:center}
  .chk{display:inline-block;width:13px;height:13px;border:1.6px solid #999;border-radius:3px}
  .unit{color:#888;font-size:10.5px}
  td.empty{text-align:center;color:#999;font-style:italic;padding:16px}
  tfoot td{border-bottom:none;padding:3px 8px;font-size:12.5px}
  tfoot .tl{text-align:right;color:#555}
  tfoot tr.grand td{padding-top:8px;font-size:15px;font-weight:700;color:#7C1C22;border-top:2px solid #7C1C22}

  .foot{margin-top:auto;padding-top:12px;border-top:1px dashed #CFC4B2;font-size:10.5px;color:#666}
  .foot .count{font-weight:700;color:#444}
  .foot .notes{margin-top:5px}
  .foot .thanks{margin-top:7px;color:#C8791A;font-weight:700}

  .warn{max-width:7.9in;margin:0 auto 12px;padding:9px 12px;background:#FDF0E4;border:1px solid #B3402B;color:#B3402B;border-radius:5px;font-size:11.5px}

  @page{size:letter portrait;margin:0.3in}
  @media print{
    body{background:#fff}
    .slip{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
    .warn{display:none}
    tr,section{page-break-inside:avoid;break-inside:avoid}
  }
</style>
</head><body>
${withoutAddress ? `<div class="warn"><strong>Heads up:</strong> ${withoutAddress} of ${orders.length} order(s) have no shipping address saved and will print without one.</div>` : ''}
${slips}
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
  pw.document.close();
  showToast(`Packing slip${orders.length === 1 ? '' : 's'} ready for ${orders.length} order${orders.length === 1 ? '' : 's'}.`);
}

function renderExcelCalculations() {
  const tab = document.getElementById('tab-pickup-tally');
  if (!tab) return;

  const dateInput = document.getElementById('excelCalcDate');
  const seqInput = document.getElementById('excelCalcBatchSeq');
  const batchNameEl = document.getElementById('excelCalcBatchName');
  const savedSheetSelect = document.getElementById('excelCalcSavedSheet');
  const sheetEl = document.getElementById('excelCalcSheet');
  if (!dateInput || !seqInput || !batchNameEl || !savedSheetSelect || !sheetEl) return;

  if (!dateInput.value) dateInput.value = todayDateInputValue();
  const safeSeq = Math.max(1, parseInt(seqInput.value || '1', 10) || 1);
  if (String(safeSeq) !== seqInput.value) seqInput.value = String(safeSeq);

  const batchName = accounting2BatchName();
  const record = accounting2SavedRecord(batchName) || { batchName, batchDate: dateInput.value };
  if (!state.accounting2Records[batchName]) state.accounting2Records[batchName] = record;

  const computed = accounting2ComputedTotals(batchName);
  batchNameEl.textContent = batchName;

  const savedSheetNames = accounting2SavedSheetNames();
  savedSheetSelect.innerHTML = [
    `<option value="" ${savedSheetNames.includes(batchName) ? '' : 'selected'}>Current Sheet</option>`,
    ...savedSheetNames.map((name) => `<option value="${escapeHtml(name)}" ${name === batchName ? 'selected' : ''}>${escapeHtml(name)}</option>`)
  ].join('');

  const VARIETIES = accounting2Products().map((product) => ({
    id: product.id,
    label: product.tallyLabel || product.name,
    code: product.tallyCode || '',
    price: accounting2ProductPrice(product)
  }));

  // Get values from record
  const extraBoxes   = accounting2MutableMap(record, 'extraBoxes');
  const boxCount     = accounting2MutableMap(record, 'orderedBoxes');
  const remainingQty = accounting2MutableMap(record, 'remainingQty');
  const productPrices = accounting2MutableMap(record, 'productPrices');
  const cashCounts   = accounting2MutableMap(record, 'cashCounts');
  const legacyZelleEntries = Array.isArray(record.zelleEntries) ? record.zelleEntries : [];
  const zelleAmount = record.zelleAmount !== undefined
    ? moneyValue(record.zelleAmount)
    : legacyZelleEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const priceOf = (v) => accounting2ProductUnitPrice(v, productPrices);

  // Computed totals
  const totalExtraBoxes = VARIETIES.reduce((s, v) => s + (Number(extraBoxes[v.id]) || 0), 0);
  const totalExtraValue = VARIETIES.reduce((s, v) => s + (Number(extraBoxes[v.id]) || 0) * priceOf(v), 0);
  const totalBoxCount   = VARIETIES.reduce((s, v) => s + (Number(boxCount[v.id]) || 0), 0);
  const totalInvoice    = VARIETIES.reduce((s, v) => s + (Number(boxCount[v.id]) || 0) * priceOf(v), 0)
                        + totalExtraValue;

  const DENOMS = [1, 5, 10, 20, 50, 100];
  const cashTotal = DENOMS.reduce((s, d) => s + d * (Number(cashCounts[d]) || 0), 0);
  const cashFromHand = Number(record.cashFromHand || 300);
  const cashSales = cashTotal - cashFromHand;

  const zelleTotal = zelleAmount;
  const unknownAmt = totalInvoice - cashSales - zelleTotal;

  const totalReceived = cashSales + zelleTotal;
  const totalZelleHeld = zelleTotal;
  const balanceCash   = (record.totalCashHeld || 0) - cashSales;
  const balanceZelle  = totalZelleHeld - zelleTotal;

  const remainingValue = VARIETIES.reduce((s, v) => {
    const qty = Number(remainingQty[v.id]) || 0;
    return s + qty * priceOf(v);
  }, 0);
  const damagedCount = Number(record.damagedCount || 0);
  const damagedPrice = Number(record.damagedPrice || DAMAGED_BOX_UNIT_PRICE);
  const damagedValue = damagedCount * damagedPrice;
  const totalRemDamaged = remainingValue + damagedValue;

  const tally = totalInvoice - totalReceived - totalRemDamaged;
  const tallyOk = Math.abs(tally) < 1;

  // Walk-up orders
  const batchDate = record.batchDate || dateInput.value || '';
  const walkupOrders = state.orders.filter(o =>
    o.manualBatchDate === batchDate && (o.status === 'fulfilled' || o.paymentCollected)
  );
  const walkupRevenue = walkupOrders.reduce((s, o) => s + (moneyNumber(o.totalPrice) || 0), 0);
  const walkupBoxes   = walkupOrders.reduce((s, o) => s + (o.totalBoxes || 0), 0);

  const invoiceBalance = totalInvoice - (record.invoiceTotal || 0);

  sheetEl.innerHTML = `
  <div class="ptally-wrap">

    <!-- ─── SECTION 1: EXTRA BOXES (from vendor above pre-orders) ─── -->
    <div class="ptally-section">
      <div class="ptally-section-head">📦 Extra Boxes from Vendor <span class="ptally-hint">(boxes received above what was pre-ordered)</span></div>
      <div class="ptally-variety-row">
        ${VARIETIES.map(v => `
          <div class="ptally-variety-cell">
            <div class="ptally-vcell-label">${v.code} — ${v.label}</div>
            <input class="ptally-num-input" type="number" min="0" step="1"
              value="${extraBoxes[v.id] || ''}"
              placeholder="0"
              onchange="setExcelCalcProductMap('extraBoxes','${escapeHtml(v.id)}',this.value)">
          </div>`).join('')}
        <div class="ptally-variety-cell ptally-total-cell">
          <div class="ptally-vcell-label">Total Extra</div>
          <div class="ptally-total-val">${totalExtraBoxes}</div>
        </div>
      </div>
    </div>

    <!-- ─── SECTION 2: BOX COUNT DISTRIBUTED ─── -->
    <div class="ptally-section">
      <div class="ptally-section-head">🤝 Boxes Distributed <span class="ptally-hint">(pre-orders fulfilled + walk-up; enter per variety)</span></div>
      <div class="ptally-variety-row">
        ${VARIETIES.map(v => `
          <div class="ptally-variety-cell">
            <div class="ptally-vcell-label">${v.code} — ${v.label}</div>
            <input class="ptally-num-input" type="number" min="0" step="1"
              value="${boxCount[v.id] || ''}"
              placeholder="0"
              onchange="setExcelCalcProductMap('orderedBoxes','${escapeHtml(v.id)}',this.value)">
          </div>`).join('')}
        <div class="ptally-variety-cell ptally-total-cell">
          <div class="ptally-vcell-label">Total Boxes</div>
          <div class="ptally-total-val">${totalBoxCount}</div>
        </div>
      </div>
      ${walkupBoxes > 0 ? `<div class="ptally-walkup-note">🚶 Includes ${walkupBoxes} walk-up boxes logged today (${walkupOrders.length} manual orders = ${formatCurrency(walkupRevenue)})</div>` : ''}
    </div>

    <!-- ─── SECTION 3: PRICES + INVOICE ─── -->
    <div class="ptally-section ptally-two-col">
      <div>
        <div class="ptally-section-head">💰 Price per Box <span class="ptally-hint">(edit if prices changed this season)</span></div>
        <table class="ptally-table">
          <tr><th>Variety</th><th>$/box</th></tr>
          ${VARIETIES.map(v => `
            <tr>
              <td>${v.label}</td>
              <td><input class="ptally-price-input" type="number" min="0" step="1"
                value="${priceOf(v)}"
                onchange="setExcelCalcProductMap('productPrices','${escapeHtml(v.id)}',this.value)"></td>
            </tr>`).join('')}
        </table>
      </div>
      <div>
        <div class="ptally-section-head">🧾 Invoice</div>
        <table class="ptally-table">
          <tr><td>Total boxes × price</td><td class="ptally-num">${formatCurrency(totalInvoice - totalExtraValue)}</td></tr>
          <tr><td>Extra boxes value</td><td class="ptally-num">${formatCurrency(totalExtraValue)}</td></tr>
          <tr class="ptally-subtotal"><td><strong>Total Invoice</strong></td><td class="ptally-num"><strong>${formatCurrency(totalInvoice)}</strong></td></tr>
          <tr><td>Entered invoice amount</td>
            <td><input class="ptally-price-input" type="number" min="0" step="0.01"
              value="${record.invoiceTotal || ''}" placeholder="0.00"
              onchange="setExcelCalcValue('invoiceTotal',this.value)"></td></tr>
          <tr class="ptally-balance-row"><td>Balance</td><td class="ptally-num ${invoiceBalance < 0 ? 'ptally-neg' : ''}">${formatCurrency(invoiceBalance)}</td></tr>
        </table>
      </div>
    </div>

    <!-- ─── SECTION 4: CASH COUNTING ─── -->
    <div class="ptally-section ptally-two-col">
      <div>
        <div class="ptally-section-head">💵 Cash Count <span class="ptally-hint">(count bills in hand)</span></div>
        <table class="ptally-table">
          <tr><th>Bill</th><th>Count</th><th>Amount</th></tr>
          ${DENOMS.map(d => `
            <tr>
              <td>$${d}</td>
              <td><input class="ptally-count-input" type="number" min="0" step="1"
                value="${cashCounts[d] || ''}" placeholder="0"
                onchange="setExcelCalcCashCount('${d}',this.value)"></td>
              <td class="ptally-num">${formatCurrency(d * (Number(cashCounts[d]) || 0))}</td>
            </tr>`).join('')}
          <tr class="ptally-subtotal">
            <td colspan="2"><strong>Total Cash in Hand</strong></td>
            <td class="ptally-num"><strong>${formatCurrency(cashTotal)}</strong></td>
          </tr>
          <tr>
            <td colspan="2">Cash from hand (change float)
              <input class="ptally-price-input" type="number" min="0" step="1"
                value="${cashFromHand}" style="width:60px;margin-left:6px"
                onchange="setExcelCalcValue('cashFromHand',this.value)">
            </td>
            <td class="ptally-num ptally-neg">${formatCurrency(-cashFromHand)}</td>
          </tr>
          <tr class="ptally-subtotal">
            <td colspan="2"><strong>Cash Sales</strong></td>
            <td class="ptally-num ${cashSales < 0 ? 'ptally-neg' : ''}" ><strong>${formatCurrency(cashSales)}</strong></td>
          </tr>
        </table>
      </div>
      <div>
        <div class="ptally-section-head">📱 Zelle Received</div>
        <table class="ptally-table" id="zelleTable">
          <tr>
            <td><strong>Zelle total</strong></td>
            <td><input class="ptally-price-input" type="number" min="0" step="0.01" value="${zelleTotal || ''}" placeholder="0.00"
              onchange="setExcelCalcValue('zelleAmount',this.value)"></td>
          </tr>
        </table>

        <div class="ptally-section-head" style="margin-top:16px">📊 Summary</div>
        <table class="ptally-table">
          <tr><th></th><th>Cash</th><th>Zelle</th><th>Unknown</th><th>Total</th></tr>
          <tr>
            <td>Total held</td>
            <td><input class="ptally-price-input" type="number" min="0" step="0.01" value="${record.totalCashHeld||''}" placeholder="0.00" onchange="setExcelCalcValue('totalCashHeld',this.value)"></td>
            <td class="ptally-num">${formatCurrency(totalZelleHeld)}</td>
            <td class="ptally-num">${formatCurrency(Math.max(0, unknownAmt))}</td>
            <td class="ptally-num">${formatCurrency((record.totalCashHeld||0) + totalZelleHeld + Math.max(0, unknownAmt))}</td>
          </tr>
          <tr>
            <td>Received</td>
            <td class="ptally-num">${formatCurrency(cashSales)}</td>
            <td class="ptally-num">${formatCurrency(zelleTotal)}</td>
            <td></td>
            <td class="ptally-num"><strong>${formatCurrency(totalReceived)}</strong></td>
          </tr>
          <tr class="ptally-balance-row">
            <td>Balance left</td>
            <td class="ptally-num ${balanceCash < 0 ? 'ptally-neg' : ''}">${formatCurrency(balanceCash)}</td>
            <td class="ptally-num ${balanceZelle < 0 ? 'ptally-neg' : ''}">${formatCurrency(balanceZelle)}</td>
            <td></td><td></td>
          </tr>
        </table>
      </div>
    </div>

    <!-- ─── SECTION 5: REMAINING + DAMAGED ─── -->
    <div class="ptally-section">
      <div class="ptally-section-head">📦 Remaining & Damaged Boxes</div>
      <table class="ptally-table">
        <tr><th>Variety</th><th>Boxes left</th><th>Value</th></tr>
        ${VARIETIES.map(v => {
          const qty = Number(remainingQty[v.id]) || 0;
          return `
            <tr>
              <td>${v.label} (${v.code})</td>
              <td><input class="ptally-count-input" type="number" min="0" step="1"
                value="${remainingQty[v.id] || ''}" placeholder="0"
                onchange="setExcelCalcProductMap('remainingQty','${escapeHtml(v.id)}',this.value)"></td>
              <td class="ptally-num">${formatCurrency(qty * priceOf(v))}</td>
            </tr>`;}).join('')}
        <tr>
          <td>Damaged/Spoiled boxes
            <input class="ptally-price-input" type="number" min="0" step="1"
              value="${damagedPrice}" style="width:50px;margin-left:4px"
              onchange="setExcelCalcValue('damagedPrice',this.value)"> $/box
          </td>
          <td><input class="ptally-count-input" type="number" min="0" step="1"
            value="${record.damagedCount || ''}" placeholder="0"
            onchange="setExcelCalcValue('damagedCount',this.value)"></td>
          <td class="ptally-num">${formatCurrency(damagedValue)}</td>
        </tr>
        <tr class="ptally-subtotal">
          <td colspan="2"><strong>Total Remaining + Damaged</strong></td>
          <td class="ptally-num"><strong>${formatCurrency(totalRemDamaged)}</strong></td>
        </tr>
      </table>
    </div>

    <!-- ─── SECTION 6: TALLY ─── -->
    <div class="ptally-section ptally-tally-section ${tallyOk ? 'ptally-tally-ok' : 'ptally-tally-warn'}">
      <div class="ptally-tally-row">
        <span class="ptally-tally-label">🧾 Invoice Total</span>
        <span class="ptally-tally-val">${formatCurrency(totalInvoice)}</span>
      </div>
      <div class="ptally-tally-row">
        <span class="ptally-tally-label">💰 Total Received (Cash + Zelle)</span>
        <span class="ptally-tally-val">−${formatCurrency(totalReceived)}</span>
      </div>
      <div class="ptally-tally-row">
        <span class="ptally-tally-label">📦 Remaining + Damaged</span>
        <span class="ptally-tally-val">−${formatCurrency(totalRemDamaged)}</span>
      </div>
      <div class="ptally-tally-divider"></div>
      <div class="ptally-tally-row ptally-tally-result">
        <span class="ptally-tally-label"><strong>TALLY</strong> ${tallyOk ? '✅ Balanced!' : '⚠️ Check numbers'}</span>
        <span class="ptally-tally-big ${tally < 0 ? 'ptally-neg' : ''}">${formatCurrency(tally)}</span>
      </div>
    </div>

    <!-- ─── ACTIONS ─── -->
    <div class="ptally-actions">
      <button class="toolbar-btn" onclick="saveExcelCalculations()">💾 Save Tally</button>
      <button class="toolbar-btn" onclick="exportTallyAsExcel()">📥 Export as Excel</button>
      ${(function() {
        const r = accounting2SavedRecord(accounting2BatchName());
        const isClosed = (r?.status || 'open') === 'closed';
        return isClosed
          ? `<button class="toolbar-btn" onclick="reopenExcelCalculations()">Reopen Batch</button>`
          : `<button class="toolbar-btn" style="background:var(--saffron);color:white" onclick="closeExcelCalculations()">Close Batch</button>`;
      })()}
    </div>

  </div>`;
}

function setExcelCalcValue(key, value) {
  if (key === 'damagedCount') {
    accounting2SetValue(key, value === '' ? '' : excelCalcCountValue(value));
    return;
  }
  accounting2SetValue(key, value === '' ? '' : excelCalcMoneyValue(value));
}

function setExcelCalcCashCount(denomination, value) {
  const batchName = accounting2BatchName();
  const existing = accounting2SavedRecord(batchName) || {};
  const cashCounts = {
    ...accounting2MutableMap(existing, 'cashCounts'),
    [denomination]: Math.max(0, parseInt(value, 10) || 0)
  };
  if (!cashCounts[denomination]) delete cashCounts[denomination];
  state.accounting2Records[batchName] = { ...existing, batchName, cashCounts };
  renderExcelCalculations();
}

function setExcelCalcProductMap(key, productId, value) {
  if (key === 'extraBoxes' || key === 'orderedBoxes' || key === 'remainingQty') {
    accounting2SetMapValue(key, productId, excelCalcCountValue(value));
    return;
  }
  if (key === 'productPrices') {
    accounting2SetMapValue(key, productId, value === '' ? '' : excelCalcMoneyValue(value));
    return;
  }
  accounting2SetMapValue(key, productId, value === '' ? '' : excelCalcMoneyValue(value));
}

async function saveExcelCalculations(options = {}) {
  const dateInput = document.getElementById('excelCalcDate');
  const saveBtn = document.getElementById('excelCalcSaveBtn');
  if (!dateInput) return;

  const batchName = accounting2BatchName();
  const existing = accounting2SavedRecord(batchName) || {};
  const computed = accounting2ComputedTotals(batchName);
  const nowIso = new Date().toISOString();
  const status = options.closeBatch ? 'closed' : (options.reopenBatch ? 'open' : (existing.status || 'open'));
  const payload = {
    batchName,
    batchDate: dateInput.value || todayDateInputValue(),
    orderedBoxes: accounting2MutableMap(existing, 'orderedBoxes'),
    invoiceTotal: moneyValue(existing.invoiceTotal),
    cashFromHand: Number(existing.cashFromHand || 0),
    zelleAmount: moneyValue(existing.zelleAmount),
    totalCashHeld: moneyValue(existing.totalCashHeld),
    totalZelleHeld: moneyValue(existing.zelleAmount),
    damagedCount: computed.damagedCount,
    damagedAmount: computed.damagedAmount,
    damagedPrice: moneyValue(existing.damagedPrice || DAMAGED_BOX_UNIT_PRICE),
    extraBoxes: accounting2MutableMap(existing, 'extraBoxes'),
    productPrices: accounting2MutableMap(existing, 'productPrices'),
    remainingQty: accounting2MutableMap(existing, 'remainingQty'),
    cashCounts: accounting2MutableMap(existing, 'cashCounts'),
    status,
    closedAt: options.closeBatch ? nowIso : (options.reopenBatch ? null : (existing.closedAt || null)),
    updatedAt: nowIso,
    recordType: 'excel_sheet',
    sheetName: batchName
  };

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    await setDoc(doc(db, 'accounting_batches', accounting2DocId(batchName)), payload, { merge: true });
    state.accounting2Records[batchName] = payload;
    if (options.closeBatch) {
      showToast('Pickup tally batch closed');
    } else if (options.reopenBatch) {
      showToast('Pickup tally batch reopened');
    } else {
      showToast('Excel calculations saved');
    }
    renderExcelCalculations();
    return true;
  } catch (error) {
    console.error(error);
    showToast('Could not save Excel calculations right now');
    return false;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Sheet';
    }
  }
}

async function closeExcelCalculations() {
  const batchName = accounting2BatchName();
  const computed = accounting2ComputedTotals(batchName);
  const tallyOff = Math.abs(computed.tallyValue || 0) >= 1;
  const message = tallyOff
    ? `Close ${batchName}? Tally is still ${formatCurrency(computed.tallyValue)}. You can reopen it later if needed.`
    : `Close ${batchName}? You can reopen it later if needed.`;
  if (!window.confirm(message)) return;
  await saveExcelCalculations({ closeBatch: true });
}

async function reopenExcelCalculations() {
  const batchName = accounting2BatchName();
  if (!window.confirm(`Reopen ${batchName}? This lets you continue editing the tally.`)) return;
  await saveExcelCalculations({ reopenBatch: true });
}

function renderAccounting() {
  const dateInput = document.getElementById('accountingDate');
  const seqInput = document.getElementById('accountingBatchSeq');
  const statsEl = document.getElementById('accountingStats');
  const bodyEl = document.getElementById('accountingBody');
  const batchNameEl = document.getElementById('accountingBatchName');
  const batchStatusBox = document.getElementById('batchStatusBox');
  const closeBatchBtn = document.getElementById('closeBatchBtn');
  const reopenBatchBtn = document.getElementById('reopenBatchBtn');

  if (!dateInput || !statsEl || !bodyEl || !batchNameEl) return;

  if (!dateInput.value) dateInput.value = todayDateInputValue();
  if (seqInput && (!seqInput.value || Number(seqInput.value) < 1)) seqInput.value = '1';
  const entries = getAccountingBatchEntries();
  const fallbackBatch = state.accountingView === 'open'
    ? (entries[0]?.batchName || batchNameFromDate(dateInput.value, seqInput?.value || 1))
    : (entries[0]?.batchName || '');
  const batchName = (state.selectedAccountingBatch && entries.some((entry) => entry.batchName === state.selectedAccountingBatch))
    ? state.selectedAccountingBatch
    : fallbackBatch;
  state.selectedAccountingBatch = batchName;
  if (batchName?.startsWith('SHR-BATCH-')) {
    const parsed = parseBatchName(batchName);
    dateInput.value = parsed.date;
    if (seqInput) seqInput.value = String(parsed.sequence);
  }
  batchNameEl.textContent = batchName || 'No batch selected';
  renderAccountingBatchList(batchName);

  if (!batchName) {
    if (batchStatusBox) {
      batchStatusBox.innerHTML = '<strong>No batch selected.</strong> Pick a batch from the list above to review and save tally details.';
    }
    accountingInputIds().forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.readOnly = true;
      input.value = '';
      input.dataset.batchName = '';
    });
    if (closeBatchBtn) closeBatchBtn.style.display = 'none';
    if (reopenBatchBtn) reopenBatchBtn.style.display = 'none';
    statsEl.innerHTML = `
      <div class="accounting-card"><div class="a-label">Batch Status</div><div class="a-value">--</div></div>
      <div class="accounting-card"><div class="a-label">Batch Orders</div><div class="a-value">0</div></div>
      <div class="accounting-card"><div class="a-label">Expected Total</div><div class="a-value accent">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Collected Total</div><div class="a-value good">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Cash Total</div><div class="a-value">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Zelle Total</div><div class="a-value">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Card Total</div><div class="a-value">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Unpaid Orders</div><div class="a-value warn">0</div></div>
      <div class="accounting-card"><div class="a-label">Actual Counted</div><div class="a-value">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Difference</div><div class="a-value good">${formatCurrency(0)}</div></div>
      <div class="accounting-card"><div class="a-label">Closed At</div><div class="a-value" style="font-size:1.1rem">--</div></div>
    `;
    bodyEl.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📒</div><p>No batch selected in this view.</p></div></td></tr>';
    return;
  }

  const batchRecord = getAccountingBatchRecord(batchName) || {};
  const activeBatchOnInputs = document.getElementById('actualCash')?.dataset.batchName || '';
  syncAccountingInputs(batchName, batchRecord, activeBatchOnInputs !== batchName);

  const batchOrders = state.orders
    .filter((order) => (order.accountingBatch || '') === batchName)
    .sort((a, b) => {
      const aTime = a?.paymentCollectedAt ? new Date(a.paymentCollectedAt).getTime() : 0;
      const bTime = b?.paymentCollectedAt ? new Date(b.paymentCollectedAt).getTime() : 0;
      return bTime - aTime;
    });

  const expectedTotal = batchOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const collectedOrders = batchOrders.filter((order) => order.paymentCollected && order.paymentMethod);
  const collectedTotal = collectedOrders.reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const cashTotal = collectedOrders.filter((order) => order.paymentMethod === 'cash').reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const zelleTotal = collectedOrders.filter((order) => order.paymentMethod === 'zelle').reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const cardTotal = collectedOrders.filter((order) => order.paymentMethod === 'card').reduce((sum, order) => sum + orderRevenueValue(order), 0);
  const unpaidCount = batchOrders.filter((order) => !order.paymentCollected && (order.status || '') !== 'no_show').length;

  const actualCash = moneyValue(document.getElementById('actualCash')?.value);
  const actualZelle = moneyValue(document.getElementById('actualZelle')?.value);
  const actualCard = moneyValue(document.getElementById('actualCard')?.value);
  const actualTotal = actualCash + actualZelle + actualCard;
  const mismatch = actualTotal - collectedTotal;
  const batchStatus = batchRecord.status || 'open';
  const isClosed = batchStatus === 'closed';

  if (batchStatusBox) {
    const closedLabel = batchRecord.closedAt ? ` Closed on ${formatDateTime(batchRecord.closedAt)}.` : '';
    const savedLabel = batchRecord.lastSavedAt ? ` Last saved ${formatDateTime(batchRecord.lastSavedAt)}.` : '';
    batchStatusBox.innerHTML = isClosed
      ? `<strong>Batch closed.</strong>${closedLabel}${savedLabel} Reopen the batch if you need to adjust the tally.`
      : `<strong>Batch open.</strong>${savedLabel} Save the tally during pickup and close the batch once the day is finalized.`;
  }

  accountingInputIds().forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.readOnly = isClosed;
  });
  if (closeBatchBtn) closeBatchBtn.style.display = isClosed ? 'none' : 'inline-flex';
  if (reopenBatchBtn) reopenBatchBtn.style.display = isClosed ? 'inline-flex' : 'none';

  statsEl.innerHTML = `
    <div class="accounting-card"><div class="a-label">Batch Status</div><div class="a-value ${isClosed ? 'accent' : 'good'}">${escapeHtml(batchStatus)}</div></div>
    <div class="accounting-card"><div class="a-label">Batch Orders</div><div class="a-value">${batchOrders.length}</div></div>
    <div class="accounting-card"><div class="a-label">Expected Total</div><div class="a-value accent">${formatCurrency(expectedTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Collected Total</div><div class="a-value good">${formatCurrency(collectedTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Cash Total</div><div class="a-value">${formatCurrency(cashTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Zelle Total</div><div class="a-value">${formatCurrency(zelleTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Card Total</div><div class="a-value">${formatCurrency(cardTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Unpaid Orders</div><div class="a-value warn">${unpaidCount}</div></div>
    <div class="accounting-card"><div class="a-label">Actual Counted</div><div class="a-value">${formatCurrency(actualTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Difference</div><div class="a-value ${Math.abs(mismatch) < 0.005 ? 'good' : 'warn'}">${formatCurrency(mismatch)}</div></div>
    <div class="accounting-card"><div class="a-label">Closed At</div><div class="a-value" style="font-size:1.1rem">${escapeHtml(batchRecord.closedAt ? formatDateTime(batchRecord.closedAt) : '--')}</div></div>
  `;

  if (!batchOrders.length) {
    bodyEl.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📒</div><p>No orders are assigned to this batch yet.</p></div></td></tr>';
    return;
  }

  bodyEl.innerHTML = batchOrders.map((order) => `
    <tr>
      <td><div class="order-id">${escapeHtml(order.orderNumber || order.id)}</div></td>
      <td><div class="customer-name">${escapeHtml(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim())}</div><div class="customer-phone">${escapeHtml(order.phone || '')}</div></td>
      <td><div class="total-amount">${formatCurrency(orderRevenueValue(order))}</div></td>
      <td>${escapeHtml(order.paymentMethod || '--')}</td>
      <td>${(order.status || '') === 'no_show' ? '<span class="status-badge status-no_show">No Show</span>' : (order.paymentCollected ? '<span class="status-badge status-fulfilled">Collected</span>' : '<span class="status-badge status-pending">Pending</span>')}</td>
      <td>${escapeHtml(formatDateTime(order.paymentCollectedAt))}</td>
      <td>${escapeHtml(order.accountingBatch || batchName)}</td>
    </tr>
  `).join('');
}

function exportSubscribersCSV() {
  const rows = [['Email', 'Subscription Type', 'Subscribed For', 'Source', 'Status', 'Marketing Consent', 'Created']];
  state.subscribers.forEach((entry) => {
    rows.push([
      entry.email || '',
      entry.subscriptionType || '',
      entry.subscriptionLabel || entry.productName || 'General',
      entry.source || '',
      entry.status || 'subscribed',
      entry.marketingConsent ? 'Yes' : 'No',
      formatDate(entry.createdAt)
    ]);
  });

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shrish_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast('Subscribers CSV downloaded');
}

function switchTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach((button) => button.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-orders').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tab-customers').style.display = tab === 'customers' ? 'block' : 'none';
  document.getElementById('tab-feedback').style.display = tab === 'feedback' ? 'block' : 'none';
  document.getElementById('tab-subscribers').style.display = tab === 'subscribers' ? 'block' : 'none';
  document.getElementById('tab-growth').style.display = tab === 'growth' ? 'block' : 'none';
  document.getElementById('tab-accounting').style.display = tab === 'accounting' ? 'block' : 'none';
  document.getElementById('tab-pickup-tally').style.display = tab === 'pickup-tally' ? 'block' : 'none';
  const refundsPanel = document.getElementById('tab-refunds');
  if (refundsPanel) refundsPanel.style.display = tab === 'refunds' ? 'block' : 'none';
  const promosPanel = document.getElementById('tab-promos');
  if (promosPanel) promosPanel.style.display = tab === 'promos' ? 'block' : 'none';
  if (tab === 'products') renderProducts();
  if (tab === 'orders') renderOrders();
  if (tab === 'customers') renderCustomers();
  if (tab === 'feedback') renderFeedback();
  if (tab === 'subscribers') renderSubscribers();
  if (tab === 'growth') {
    renderOwnerAnalytics();
    if (!state.ownerAnalytics && !state.ownerAnalyticsError) refreshOwnerAnalytics();
  }
  if (tab === 'accounting') renderAccounting();
  if (tab === 'pickup-tally') renderExcelCalculations();
  if (tab === 'refunds') loadRefundTab();
  if (tab === 'promos') loadPromoTab();
  updateOrdersSheetUi();
}

function isAdminTabVisible(tab) {
  const panel = document.getElementById(`tab-${tab}`);
  return Boolean(panel && panel.style.display !== 'none');
}

function subscribeData() {
  state.unsubOrders?.();
  state.unsubProducts?.();
  state.unsubCustomers?.();
  state.unsubFeedback?.();
  state.unsubSubscribersGeneral?.();
  state.unsubSubscribersProduct?.();
  state.unsubAccountingBatches?.();
  state.unsubAccounting2Records?.();

  state.unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
    state.orders = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    renderOrders();
    if (isAdminTabVisible('customers')) renderCustomers();
    if (isAdminTabVisible('accounting')) renderAccounting();
    if (isAdminTabVisible('pickup-tally')) renderExcelCalculations();
    if (isAdminTabVisible('feedback')) renderFeedback();
    if (isAdminTabVisible('growth')) renderOwnerAnalytics();
  }, (error) => {
    console.error(error);
    showToast('Orders sync failed');
  });

  state.unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
    const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    state.products = mergeProductsWithBase(docs);
    window.SHRISH_DATA.products = [...state.products];
    if (isAdminTabVisible('products')) renderProducts();
    renderStats();
  }, (error) => {
    console.error(error);
    showToast('Products sync failed');
  });

  state.unsubCustomers = onSnapshot(collection(db, 'user_profiles'), (snapshot) => {
    state.customers = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    if (isAdminTabVisible('customers')) renderCustomers();
  }, (error) => {
    console.error(error);
    showToast('Customer accounts sync failed');
  });

  state.unsubFeedback = onSnapshot(query(collection(db, 'order_feedback'), orderBy('createdAt', 'desc')), (snapshot) => {
    state.feedback = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    if (isAdminTabVisible('feedback')) renderFeedback();
  }, (error) => {
    console.error(error);
    showToast('Feedback sync failed');
  });

  const syncSubscribers = () => {
    const merged = [...state._generalSubscribers || [], ...state._productSubscribers || []]
      .sort((a, b) => {
        const aTime = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a?.createdAt || 0).getTime();
        const bTime = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      });
    state.subscribers = merged;
    if (isAdminTabVisible('subscribers')) renderSubscribers();
    renderStats();
    if (isAdminTabVisible('growth')) renderOwnerAnalytics();
  };

  state.unsubSubscribersGeneral = onSnapshot(collection(db, 'email_subscribers'), (snapshot) => {
    state._generalSubscribers = snapshot.docs.map((snap) => ({ id: snap.id, _collection: 'email_subscribers', ...snap.data() }));
    syncSubscribers();
  }, (error) => {
    console.error(error);
    showToast('General subscribers sync failed');
  });

  state.unsubSubscribersProduct = onSnapshot(collection(db, 'notify_requests'), (snapshot) => {
    state._productSubscribers = snapshot.docs.map((snap) => ({ id: snap.id, _collection: 'notify_requests', ...snap.data() }));
    syncSubscribers();
  }, (error) => {
    console.error(error);
    showToast('Product notifications sync failed');
  });

  state.unsubAccountingBatches = onSnapshot(collection(db, 'accounting_batches'), (snapshot) => {
    state.accountingBatches = snapshot.docs.reduce((acc, snap) => {
      acc[snap.id] = { id: snap.id, ...snap.data() };
      return acc;
    }, {});
    syncAccounting2RecordsFromBatches();
    if (isAdminTabVisible('accounting')) renderAccounting();
    if (isAdminTabVisible('pickup-tally')) renderExcelCalculations();
  }, (error) => {
    console.error(error);
    showToast('Accounting batches sync failed');
  });
}

function bindUi() {
  document.getElementById('filterSearch')?.addEventListener('input', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('filterLocation')?.addEventListener('change', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('filterStatus')?.addEventListener('change', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('filterDateFrom')?.addEventListener('change', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('filterDateTo')?.addEventListener('change', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('accountingDate')?.addEventListener('change', (event) => {
    const seqValue = document.getElementById('accountingBatchSeq')?.value || 1;
    state.selectedAccountingBatch = batchNameFromDate(event.target.value || todayDateInputValue(), seqValue);
    renderAccounting();
  });
  document.getElementById('accountingBatchSeq')?.addEventListener('change', (event) => {
    const nextSeq = Math.max(1, parseInt(event.target.value || '1', 10) || 1);
    event.target.value = String(nextSeq);
    state.selectedAccountingBatch = batchNameFromDate(document.getElementById('accountingDate')?.value || todayDateInputValue(), nextSeq);
    renderAccounting();
  });
  document.getElementById('newProductCategory')?.addEventListener('change', () => {
    applyCategoryDefaults();
    toggleVariantFields();
    updateProductFormForStatus();
  });
  document.getElementById('excelCalcDate')?.addEventListener('change', renderExcelCalculations);
  document.getElementById('excelCalcBatchSeq')?.addEventListener('change', renderExcelCalculations);
  document.getElementById('newProductStatus')?.addEventListener('change', updateProductFormForStatus);
  document.getElementById('addProductForm')?.addEventListener('submit', submitAddProduct);
  document.getElementById('adminPw')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeOrderEditor();
      closeEmailReminderModal();
      closeWhatsAppReminderModal();
    }
  });
}

function initAuthWatch() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      unsubscribeAdminData();
      setLoggedInUi(false);
      return;
    }

    if (!isAuthorizedAdmin(user)) {
      unsubscribeAdminData();
      setLoggedInUi(false);
      showLoginError(`Admin access is only available for ${ADMIN_EMAIL}.`);
      await signOut(auth);
      return;
    }

    clearLoginError();
    setLoggedInUi(true, user.email || '');
    subscribeData();
    window.setTimeout(() => {
      seedProductsIfNeeded().catch((error) => {
        console.warn('Deferred product seed failed', error);
      });
    }, 2200);
  });
}

window.doLogin = doLogin;
window.doLogout = doLogout;
window.switchTab = switchTab;
window.saveProductPrice = saveProductPrice;
window.syncCatalogPrices = syncCatalogPrices;
window.toggleAvailable = toggleAvailable;
window.toggleProductHidden = toggleProductHidden;
window.setStatus = setStatus;
window.updatePickupDate = updatePickupDate;
window.updatePaymentMethod = updatePaymentMethod;
window.setQuickPaymentMethod = setQuickPaymentMethod;
window.togglePaymentCollected = togglePaymentCollected;
window.clearFulfilled = clearFulfilled;
window.setOrderSheet = setOrderSheet;
window.markFilteredActiveFulfilled = markFilteredActiveFulfilled;
window.toggleReminderOrderSelection = toggleReminderOrderSelection;
window.toggleVisibleReminderOrders = toggleVisibleReminderOrders;
window.openEmailReminderModal = openEmailReminderModal;
window.closeEmailReminderModal = closeEmailReminderModal;
window.handleEmailReminderOverlayClick = handleEmailReminderOverlayClick;
window.sendSelectedReminderEmails = sendSelectedReminderEmails;
window.openWhatsAppReminderModal = openWhatsAppReminderModal;
window.closeWhatsAppReminderModal = closeWhatsAppReminderModal;
window.handleWhatsAppReminderOverlayClick = handleWhatsAppReminderOverlayClick;
window.openWhatsAppReminderForOrder = openWhatsAppReminderForOrder;
window.printActiveOrders = printActiveOrders;
window.printShippingOrders = printShippingOrders;
window.exportCSV = exportCSV;
window.renderCustomers = renderCustomers;
window.exportCustomersCSV = exportCustomersCSV;
window.deleteCustomerAccountFromAdmin = deleteCustomerAccountFromAdmin;
window.renderFeedback = renderFeedback;
window.exportFeedbackCSV = exportFeedbackCSV;
window.exportSubscribersCSV = exportSubscribersCSV;
window.renderOwnerAnalytics = renderOwnerAnalytics;
window.refreshOwnerAnalytics = refreshOwnerAnalytics;
window.deleteSubscriber = deleteSubscriber;
window.renderAccounting = renderAccounting;
window.setAccountingView = setAccountingView;
window.setSelectedAccountingBatch = setSelectedAccountingBatch;
window.saveAccountingBatch = saveAccountingBatch;
window.closeAccountingBatch = closeAccountingBatch;
window.reopenAccountingBatch = reopenAccountingBatch;
window.exportAccountingBatchCSV = exportAccountingBatchCSV;
window.openAddProductForm = openAddProductForm;
window.openManualOrderForm = openManualOrderForm;
window.closeAddProductForm = closeAddProductForm;
window.resetAddProductForm = resetAddProductForm;
window.editProduct = editProduct;
window.setProductCategoryFilter = setProductCategoryFilter;
window.setProductPickleFilter = setProductPickleFilter;
window.saveProductSortOrder = saveProductSortOrder;
window.openOrderEditor = openOrderEditor;
window.closeOrderEditor = closeOrderEditor;
window.handleOrderEditorOverlayClick = handleOrderEditorOverlayClick;
window.updateOrderDraftQty = updateOrderDraftQty;
window.removeOrderDraftItem = removeOrderDraftItem;
window.addOrderDraftItem = addOrderDraftItem;
window.saveEditedOrder = saveEditedOrder;
window.renderExcelCalculations = renderExcelCalculations;
window.setExcelCalcSheet = setExcelCalcSheet;
window.newExcelCalculationsSheet = newExcelCalculationsSheet;
window.setExcelCalcValue = setExcelCalcValue;
window.setExcelCalcCashCount = setExcelCalcCashCount;
window.setExcelCalcProductMap = setExcelCalcProductMap;
window.saveExcelCalculations = saveExcelCalculations;
window.closeExcelCalculations = closeExcelCalculations;
window.reopenExcelCalculations = reopenExcelCalculations;

bindUi();
initAuthWatch();


// ══════════════════════════════════════════════════════════════════════════════
// REFUND MODULE
// ══════════════════════════════════════════════════════════════════════════════

let refundRequests = [];
let refundFilter = 'pending';
let unsubRefunds = null;

// ═══════════════════════════════════════════════════════════════
// PROMO CODES
// ═══════════════════════════════════════════════════════════════
let promoCodes = [];
let unsubPromos = null;

function promoDiscountLabel(p) {
  if (p.type === 'percent') return `${p.value}% off`;
  if (p.type === 'fixed') return `$${Number(p.value || 0).toFixed(2)} off`;
  return 'Free shipping';
}

function loadPromoTab() {
  if (unsubPromos) { renderPromoCodes(); return; }
  unsubPromos = onSnapshot(collection(db, 'promo_codes'),
    (snap) => {
      promoCodes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
      renderPromoCodes();
    },
    (err) => console.error('Promo listener error:', err));
}

function renderPromoCodes() {
  const tbody = document.getElementById('promoList');
  if (!tbody) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!promoCodes.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:16px">No promo codes yet. Create one above.</td></tr>';
    return;
  }
  tbody.innerHTML = promoCodes.map(p => {
    const uses = `${p.usedCount || 0}${p.maxUses ? ' / ' + p.maxUses : ''}`;
    const expDate = p.expiresAt ? new Date(p.expiresAt.seconds ? p.expiresAt.seconds * 1000 : p.expiresAt) : null;
    const exp = (expDate && !isNaN(expDate)) ? expDate.toLocaleDateString() : '—';
    const min = p.minSubtotal ? '$' + Number(p.minSubtotal).toFixed(2) : '—';
    const expired = expDate && !isNaN(expDate) && expDate < new Date();
    const status = !p.active
      ? '<span style="color:#B02A37;font-weight:700">Off</span>'
      : expired
      ? '<span style="color:#B54708;font-weight:700">Expired</span>'
      : '<span style="color:#1E7B34;font-weight:700">Active</span>';
    return `<tr>
      <td><strong>${esc(p.code || p.id)}</strong></td>
      <td>${esc(promoDiscountLabel(p))}</td>
      <td>${min}</td>
      <td>${exp}</td>
      <td>${uses}</td>
      <td>${p.perCustomerLimit ? 'Once each' : 'Unlimited'}</td>
      <td>${status}</td>
      <td><div class="action-btns">
        <button class="action-btn" onclick="togglePromoActive('${esc(p.id)}', ${p.active ? 'false' : 'true'})">${p.active ? 'Deactivate' : 'Activate'}</button>
        <button class="action-btn btn-cancel" onclick="deletePromoCode('${esc(p.id)}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function createPromoCode() {
  const msg = document.getElementById('promoFormMsg');
  const setMsg = (t, ok) => { if (msg) { msg.textContent = t; msg.style.color = ok ? '#1E7B34' : '#B02A37'; } };
  const code = (document.getElementById('promoCode')?.value || '').trim().toUpperCase();
  const type = document.getElementById('promoType')?.value || 'percent';
  const value = parseFloat(document.getElementById('promoValue')?.value || '0');
  const minSubtotal = parseFloat(document.getElementById('promoMin')?.value || '0') || 0;
  const maxUses = parseInt(document.getElementById('promoMaxUses')?.value || '0', 10) || null;
  const perCustomerLimit = document.getElementById('promoPerCustomer')?.checked ? 1 : null;
  const expiryStr = document.getElementById('promoExpiry')?.value || '';
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return setMsg('Code must be 3–20 letters/numbers, no spaces.', false);
  if (type !== 'free_shipping' && !(value > 0)) return setMsg('Enter a discount value greater than 0.', false);
  if (type === 'percent' && value > 100) return setMsg('Percent cannot exceed 100.', false);
  if (promoCodes.some(p => String(p.id || p.code || '').toUpperCase() === code)) return setMsg('That code already exists.', false);
  try {
    const ref = doc(db, 'promo_codes', code);
    await setDoc(ref, {
      code, type,
      value: type === 'free_shipping' ? 0 : value,
      minSubtotal, maxUses, perCustomerLimit,
      expiresAt: expiryStr ? new Date(expiryStr + 'T23:59:59') : null,
      active: true, usedCount: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    setMsg('Promo code created ✓', true);
    ['promoCode', 'promoValue', 'promoMin', 'promoMaxUses', 'promoExpiry'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const pc = document.getElementById('promoPerCustomer'); if (pc) pc.checked = false;
  } catch (e) { setMsg('Could not create: ' + (e.message || e), false); }
}

async function togglePromoActive(code, active) {
  try { await updateDoc(doc(db, 'promo_codes', code), { active: active === true || active === 'true', updatedAt: serverTimestamp() }); }
  catch (e) { alert('Update failed: ' + (e.message || e)); }
}

async function deletePromoCode(code) {
  if (!confirm('Delete promo code ' + code + '? This cannot be undone.')) return;
  try { await deleteDoc(doc(db, 'promo_codes', code)); }
  catch (e) { alert('Delete failed: ' + (e.message || e)); }
}

window.loadPromoTab = loadPromoTab;
window.createPromoCode = createPromoCode;
window.togglePromoActive = togglePromoActive;
window.deletePromoCode = deletePromoCode;

function loadRefundTab() {
  if (unsubRefunds) return; // already subscribed
  const { onSnapshot, collection, query, orderBy } = window._firestoreExports;
  unsubRefunds = onSnapshot(
    query(collection(db, 'refund_requests'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      refundRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderRefunds();
    },
    (err) => console.error('Refund listener error:', err)
  );
}

function renderRefunds() {
  const container = document.getElementById('refundsContainer');
  if (!container) return;

  const filtered = refundFilter === 'all'
    ? refundRequests
    : refundRequests.filter(r => (r.status || 'pending') === refundFilter);

  // Update counts on filter buttons
  const counts = { pending: 0, approved: 0, rejected: 0, all: refundRequests.length };
  refundRequests.forEach(r => { const s = r.status || 'pending'; if (counts[s] !== undefined) counts[s]++; });
  ['pending','approved','rejected','all'].forEach(f => {
    const btn = document.getElementById(`refundFilter_${f}`);
    if (btn) btn.textContent = `${f.charAt(0).toUpperCase()+f.slice(1)} (${counts[f]})`;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="refund-empty">No ${refundFilter === 'all' ? '' : refundFilter} refund requests.</div>`;
    return;
  }

  container.innerHTML = filtered.map(r => {
    const isStripe = r.paymentMethod === 'stripe';
    const statusClass = `status-${r.status || 'pending'}`;
    const payBadge = isStripe
      ? `<span class="refund-payment-type refund-payment-stripe">Stripe</span>`
      : `<span class="refund-payment-type refund-payment-pickup">Pickup</span>`;
    const orderTotal = r.orderTotal ? `$${parseFloat(r.orderTotal).toFixed(2)}` : '—';
    const requestedAmt = r.requestedAmount ? `$${parseFloat(r.requestedAmount).toFixed(2)}` : '—';
    const createdAt = r.createdAt ? new Date(r.createdAt).toLocaleString('en-US', {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : '—';

    const actionHtml = (() => {
      if ((r.status || 'pending') === 'approved') {
        return `<div class="refund-issued-badge">✓ Refunded $${parseFloat(r.refundedAmount||0).toFixed(2)}</div>
                <div class="refund-meta" style="text-align:center;margin-top:4px">${r.refundedAt ? new Date(r.refundedAt).toLocaleDateString() : ''}</div>`;
      }
      if ((r.status || 'pending') === 'rejected') {
        return `<div class="refund-rejected-badge">✗ Rejected</div>
                <div class="refund-meta" style="text-align:center;margin-top:4px">${r.rejectedAt ? new Date(r.rejectedAt).toLocaleDateString() : ''}</div>`;
      }
      return `<div class="refund-actions">
        <div style="font-size:11px;color:var(--text-light);font-weight:600;margin-bottom:2px">REFUND AMOUNT ($)</div>
        <input class="refund-amount-input" type="number" id="refundAmt_${r.id}"
               min="0" max="${r.orderTotal||999}" step="0.01"
               value="${r.requestedAmount || r.orderTotal || ''}"
               placeholder="Enter amount">
        <button class="btn-refund-issue" onclick="issueRefund('${r.id}')">
          ${isStripe ? '💳 Issue Stripe Refund' : '✓ Mark as Refunded'}
        </button>
        <button class="btn-refund-reject" onclick="rejectRefund('${r.id}')">✗ Reject Request</button>
      </div>`;
    })();

    return `<div class="refund-card ${statusClass}" id="refundCard_${r.id}">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong style="font-size:14px">${escapeHtml(r.customerName||'Customer')}</strong>
          ${payBadge}
          <span class="status-badge status-${r.status||'pending'}" style="font-size:11px">${(r.status||'pending').toUpperCase()}</span>
        </div>
        <div class="refund-meta">
          <strong>Order #</strong> ${escapeHtml(r.orderNumber||r.orderId||'—')} &nbsp;·&nbsp;
          <strong>Total</strong> ${orderTotal} &nbsp;·&nbsp;
          <strong>Requested</strong> ${requestedAmt} &nbsp;·&nbsp;
          <strong>Email</strong> ${escapeHtml(r.customerEmail||'—')} &nbsp;·&nbsp;
          <strong>Phone</strong> ${escapeHtml(r.customerPhone||'—')}<br>
          <strong>Submitted</strong> ${createdAt}
          ${r.stripePaymentIntentId ? ` &nbsp;·&nbsp; <strong>Stripe PI</strong> ${escapeHtml(r.stripePaymentIntentId)}` : ''}
        </div>
        <div class="refund-reason">"${escapeHtml(r.reason||'No reason provided')}"</div>
      </div>
      <div>${actionHtml}</div>
    </div>`;
  }).join('');
}

async function issueRefund(refundId) {
  const refund = refundRequests.find(r => r.id === refundId);
  if (!refund) return;

  const amtInput = document.getElementById(`refundAmt_${refundId}`);
  const amount = parseFloat(amtInput?.value || '0');
  if (!amount || amount <= 0) { showToast('Enter a valid refund amount'); return; }

  const btn = document.querySelector(`#refundCard_${refundId} .btn-refund-issue`);
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  const { doc, updateDoc, Timestamp } = window._firestoreExports;

  try {
    // For Stripe orders — call cloud function
    if (refund.paymentMethod === 'stripe' && refund.stripePaymentIntentId) {
      try {
        const issueStripeRefund = httpsCallable(cloudFunctions, 'issueStripeRefund');
        await issueStripeRefund({
          paymentIntentId: refund.stripePaymentIntentId,
          amount: Math.round(amount * 100), // cents
          refundRequestId: refundId
        });
      } catch (stripeErr) {
        console.warn('Stripe refund function error (may not be deployed):', stripeErr);
        throw new Error('Stripe refund did not complete. Do not mark this request refunded until Stripe confirms it.');
      }
    }

    // Update Firestore record
    await updateDoc(doc(db, 'refund_requests', refundId), {
      status: 'approved',
      refundedAmount: amount,
      refundedAt: new Date().toISOString(),
      refundedBy: auth.currentUser?.email || 'admin',
      updatedAt: new Date().toISOString()
    });

    showToast(`Refund of $${amount.toFixed(2)} issued successfully`);
  } catch (err) {
    console.error('Issue refund error:', err);
    showToast('Error issuing refund. Check console.');
    if (btn) { btn.disabled = false; btn.textContent = refund.paymentMethod === 'stripe' ? '💳 Issue Stripe Refund' : '✓ Mark as Refunded'; }
  }
}

async function rejectRefund(refundId) {
  if (!confirm('Reject this refund request? The customer will not be notified automatically.')) return;
  const { doc, updateDoc } = window._firestoreExports;
  try {
    await updateDoc(doc(db, 'refund_requests', refundId), {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: auth.currentUser?.email || 'admin',
      updatedAt: new Date().toISOString()
    });
    showToast('Refund request rejected');
  } catch (err) {
    console.error('Reject refund error:', err);
    showToast('Error rejecting. Check console.');
  }
}

function setRefundFilter(f) {
  refundFilter = f;
  document.querySelectorAll('.refund-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`refundFilter_${f}`)?.classList.add('active');
  renderRefunds();
}

window.issueRefund = issueRefund;
window.rejectRefund = rejectRefund;
window.setRefundFilter = setRefundFilter;
window.loadRefundTab = loadRefundTab;


// ── PICKUP TALLY HELPERS ──────────────────────────────────────────────────────
function updateZelleEntry(index, field, value) {
  const batchName = accounting2BatchName();
  if (!state.accounting2Records[batchName]) state.accounting2Records[batchName] = {};
  const record = state.accounting2Records[batchName];
  const entries = record.zelleEntries ? JSON.parse(JSON.stringify(record.zelleEntries)) : [];
  while (entries.length <= index) entries.push({ name: '', amount: '' });
  entries[index][field] = field === 'amount' ? (parseFloat(value) || '') : value;
  record.zelleEntries = entries;
  renderExcelCalculations();
}

function addZelleEntry() {
  const batchName = accounting2BatchName();
  if (!state.accounting2Records[batchName]) state.accounting2Records[batchName] = {};
  const record = state.accounting2Records[batchName];
  const entries = record.zelleEntries ? JSON.parse(JSON.stringify(record.zelleEntries)) : [];
  entries.push({ name: '', amount: '' });
  record.zelleEntries = entries;
  renderExcelCalculations();
}

function exportTallyAsExcel() {
  const batchName = accounting2BatchName();
  const computed = accounting2ComputedTotals(batchName);
  showToast('Export feature — use the CSV export from the Accounting tab for now.');
}

window.updateZelleEntry = updateZelleEntry;
window.addZelleEntry = addZelleEntry;
window.exportTallyAsExcel = exportTallyAsExcel;
