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

const state = {
  orders: [],
  products: JSON.parse(JSON.stringify(BASE_PRODUCTS)),
  subscribers: [],
  accountingBatches: {},
  accounting2Records: {},
  accountingView: 'open',
  selectedAccountingBatch: '',
  productFilter: 'all',
  orderSheet: 'active',
  orderEditor: {
    orderId: '',
    items: []
  },
  orderFilters: {
    active: { status: 'pending', dateFrom: '', dateTo: '', search: '', location: 'all' },
    processed: { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' },
    all: { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' }
  },
  unsubOrders: null,
  unsubProducts: null,
  unsubSubscribersGeneral: null,
  unsubSubscribersProduct: null,
  unsubAccountingBatches: null,
  unsubAccounting2Records: null
};

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

async function doLogin() {
  const email = document.getElementById('adminEmail')?.value?.trim();
  const password = document.getElementById('adminPw')?.value || '';
  const errorEl = document.getElementById('loginErr');

  if (!email || !password) {
    if (errorEl) {
      errorEl.textContent = 'Enter admin email and password.';
      errorEl.style.display = 'block';
    }
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    if (errorEl) errorEl.style.display = 'none';
  } catch (error) {
    console.error(error);
    if (errorEl) {
      errorEl.textContent = 'Login failed. Check your Firebase Auth admin user.';
      errorEl.style.display = 'block';
    }
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

function renderStats() {
  const orders = state.orders;
  const statsOrders = orders.filter((order) => {
    const createdKey = orderDateKey(order);
    return createdKey && createdKey >= GO_LIVE_STATS_DATE;
  });
  const total = statsOrders.length;
  const pending = orders.filter((o) => o.status === 'pending').length;
  const fulfilled = statsOrders.filter((o) => o.status === 'fulfilled').length;
  const totalBoxes = statsOrders.filter((o) => o.status !== 'cancelled').reduce((sum, order) => sum + (order.totalBoxes || 0), 0);
  const totalRevenue = statsOrders.filter((o) => o.status !== 'cancelled').reduce((sum, order) => sum + (order.totalPrice || 0), 0);
  const available = state.products.filter((product) => product.available && !product.displayOnly).length;
  const totalProducts = state.products.filter((product) => !product.displayOnly).length;
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

function excelCalcMoneyValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function accounting2Products() {
  return getSortedProducts(state.products).filter((product) => !product.displayOnly && normalizeProductCategory(product.category) === 'mangoes');
}

function accounting2ProductPrice(product) {
  return moneyNumber(product?.price || 0);
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
  const batchOrderTotal = products.reduce((sum, product) => (
    sum + (Math.max(0, Number(orderedCounts[product.id] || 0)) * moneyValue(productPrices[product.id] ?? accounting2ProductPrice(product)))
  ), 0);
  const unknownAmount = batchOrderTotal - (cashSales + zelleAmount);
  const remainingValue = products.reduce((sum, product) => (
    sum + Math.max(0, excelCalcMoneyValue(remainingQty[product.id]))
  ), 0);
  const damagedAmount = moneyValue(record.damagedAmount);
  const orderedBoxesTotal = Object.values(orderedCounts).reduce((sum, qty) => sum + Number(qty || 0), 0);
  const extraBoxesTotal = Object.values(extraBoxes).reduce((sum, qty) => sum + Number(qty || 0), 0);
  const extraBoxesValue = products.reduce((sum, product) => (
    sum + (moneyValue(productPrices[product.id] ?? accounting2ProductPrice(product)) * Math.max(0, parseInt(extraBoxes[product.id], 10) || 0))
  ), 0);
  const invoiceBalance = batchOrderTotal - invoiceTotal;
  const receivedTotal = cashSales + zelleAmount;
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
    remainingValue,
    damagedAmount,
    orderedBoxesTotal,
    extraBoxesTotal,
    extraBoxesValue,
    totalBoxesCount: orderedBoxesTotal + extraBoxesTotal,
    totalLossValue: remainingValue + damagedAmount,
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
        collectedTotal: record.collectedTotal ?? collectedOrders.reduce((sum, order) => sum + moneyValue(order.totalPrice), 0),
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
  const bodyEl = document.getElementById('accountingBatchListBody');
  if (!bodyEl) return;

  openBtn?.classList.toggle('active', state.accountingView === 'open');
  closedBtn?.classList.toggle('active', state.accountingView === 'closed');

  if (titleEl) titleEl.textContent = state.accountingView === 'open' ? 'Open Batches' : 'Closed Batches';
  if (helpEl) {
    helpEl.textContent = state.accountingView === 'open'
      ? 'Open batches stay here until you finish tallying and close them. Closed batches move to their own tab, and reopened batches come back here.'
      : 'Closed batches stay here for reference. Open any batch to review the breakdown, or reopen it if you need to continue collecting and tallying.';
  }

  const entries = getAccountingBatchEntries();
  if (!entries.length) {
    bodyEl.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📒</div><p>No ${state.accountingView} batches yet.</p></div></td></tr>`;
    return;
  }

  bodyEl.innerHTML = entries.map((entry) => `
    <tr>
      <td><strong>${escapeHtml(entry.batchName)}</strong></td>
      <td><span class="status-badge ${entry.status === 'closed' ? 'status-cancelled' : 'status-fulfilled'}">${escapeHtml(entry.status)}</span></td>
      <td>${escapeHtml(String(entry.orderCount || 0))}</td>
      <td>${formatCurrency(entry.collectedTotal || 0)}</td>
      <td>${escapeHtml(formatDateTime(entry.lastSavedAt))}</td>
      <td>${escapeHtml(formatDateTime(entry.closedAt))}</td>
      <td><button class="toolbar-btn batch-open-btn" onclick="setSelectedAccountingBatch('${escapeHtml(entry.batchName)}')">${entry.batchName === selectedBatchName ? 'Viewing' : 'Open Breakdown'}</button></td>
    </tr>
  `).join('');
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

function getOrdersForSheet(sheet = state.orderSheet) {
  if (sheet === 'active') return state.orders.filter((order) => (order.status || 'pending') === 'pending');
  if (sheet === 'processed') {
    return state.orders.filter((order) => {
      const status = order.status || 'pending';
      return ['fulfilled', 'cancelled'].includes(status) && !order.paymentCollected;
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
        ...(order.items || []).map((item) => item?.name || '')
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
      processed: {
        title: 'Processed Orders',
        help: 'Processed Orders shows fulfilled and cancelled records that still need payment follow-up. Once payment is collected, they move out of this list.',
      },
    all: {
      title: 'All Orders',
      help: 'All Orders is the permanent master history in date order. Status can still be updated, but nothing is deleted here.',
    }
  };

  document.querySelectorAll('.sheet-pill').forEach((button) => button.classList.remove('active'));
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
  const exportButton = document.querySelector('.toolbar-actions button[onclick="exportCSV()"]');
  const currentFilters = state.orderFilters[state.orderSheet] || { status: 'all', dateFrom: '', dateTo: '', search: '', location: 'all' };
  if (title) title.textContent = config[state.orderSheet].title;
  if (help) help.textContent = config[state.orderSheet].help;
  if (bulkButton) bulkButton.style.display = state.orderSheet === 'active' ? 'inline-flex' : 'none';
  if (sheetSwitcher) sheetSwitcher.style.display = document.getElementById('tab-orders')?.style.display === 'none' ? 'none' : 'flex';
  if (exportButton) {
    const exportLabels = {
      active: '⬇ Export Active Excel',
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

  if (state.orderSheet !== 'active' || !orders.length) {
    summaryEl.classList.remove('show');
    summaryEl.innerHTML = '';
    return;
  }

  const counts = new Map();
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
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

  summaryEl.innerHTML = `
    <div class="summary-label">Active Item Counts</div>
    <div class="summary-items">
      ${summaryItems.map(([name, qty]) => `<span class="summary-chip"><strong>${escapeHtml(name)}:</strong> ${escapeHtml(String(qty))}</span>`).join('')}
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
    .filter((product) => !product.displayOnly && product.available)
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
  const order = orderEditorDraftOrder();
  if (!modal || !order) return;

  const titleEl = document.getElementById('orderEditorOrderNumber');
  const customerEl = document.getElementById('orderEditorCustomer');
  const itemsEl = document.getElementById('orderEditorItems');
  const emptyEl = document.getElementById('orderEditorEmpty');
  const totalEl = document.getElementById('orderEditorTotal');
  const boxesEl = document.getElementById('orderEditorBoxes');
  const addSelect = document.getElementById('orderEditorAddSelect');
  const options = getOrderEditorCatalogOptions();
  const totals = orderEditorTotals(state.orderEditor.items);

  if (titleEl) titleEl.textContent = order.orderNumber || order.id;
  if (customerEl) {
    customerEl.textContent = `${order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim()} - ${order.phone || ''}`;
  }
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
    items: Array.isArray(order.items) ? order.items.map((item, index) => cloneOrderEditorItem(item, index)) : []
  };

  renderOrderEditor();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOrderEditor() {
  const modal = document.getElementById('orderEditorModal');
  if (!modal) return;
  modal.classList.remove('open');
  state.orderEditor = { orderId: '', items: [] };
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
  const order = orderEditorDraftOrder();
  if (!order) return;

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
    await updateDoc(doc(db, 'orders', order.id), {
      items: cleanedItems,
      totalBoxes: totals.totalBoxes,
      totalPrice: totals.totalPrice,
      updatedAt: new Date().toISOString()
    });
    closeOrderEditor();
    showToast('Order updated');
  } catch (error) {
    console.error(error);
    showToast('Could not update order right now');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }
}

function renderOrders() {
  const orders = getFilteredOrders();
  updateOrdersSheetUi();
  renderActiveOrderSummary(orders);

  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📭</div><p>No orders found.</p></div></td></tr>';
    renderStats();
    return;
  }

  tbody.innerHTML = orders.map((order) => {
    const itemsHtml = order.items?.length
      ? `<div class="items-list">${order.items.map((item) => `<div class="item-row"><strong>${escapeHtml(item.name)}</strong> <span>× ${item.qty} · ${escapeHtml(item.price)}</span></div>`).join('')}</div>`
      : '<span style="color:#ccc">—</span>';

    const statusClass = `status-${order.status || 'pending'}`;
    const statusLabel = (order.status || 'pending').charAt(0).toUpperCase() + (order.status || 'pending').slice(1);
    const paymentMethod = order.paymentMethod || '';
    const paymentCollected = Boolean(order.paymentCollected);
    const fallbackBatch = batchNameFromDate(todayDateInputValue());
    const paymentCellHtml = state.orderSheet === 'active'
      ? `<div class="payment-note">Collect at pickup. Add method after processing.</div>`
      : `<div class="payment-cell">
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
      <td><div class="order-id">${escapeHtml(order.orderNumber || order.id)}</div></td>
      <td style="font-size:12px;color:var(--text-light)">${formatDate(order.createdAt)}</td>
      <td><div class="customer-name">${escapeHtml(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim())}</div><div class="customer-phone">${escapeHtml(order.phone)}</div><div class="customer-email">${escapeHtml(order.email)}</div></td>
      <td>${itemsHtml}</td>
      <td><div class="total-amount">${formatCurrency(order.totalPrice || 0)}</div></td>
      <td style="font-size:13px">${escapeHtml(order.locationLabel || order.location || '—')}</td>
      <td><input type="date" class="pickup-date-input" value="${formatDateInput(order.pickupDate)}" onchange="updatePickupDate('${escapeHtml(order.id)}', this.value)"></td>
      <td>${paymentCellHtml}</td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td><div class="action-btns"><button class="action-btn btn-fulfill" onclick="setStatus('${escapeHtml(order.id)}','fulfilled')">✓ Fulfill</button><button class="action-btn btn-cancel" onclick="setStatus('${escapeHtml(order.id)}','cancelled')">✕ Cancel</button><button class="action-btn btn-reset" onclick="setStatus('${escapeHtml(order.id)}','pending')">↺ Reset</button></div></td>
    </tr>`;
  }).join('');

  if (state.orderSheet === 'active') {
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
}

function productCategoryLabel(category) {
  const normalizedCategory = normalizeProductCategory(category);
  const labels = {
    mangoes: 'Mangoes',
    putharekulu: 'Putharekulu',
    jellysnacks: 'Jelly & Snacks'
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

function productMatchesFilter(product, filter = state.productFilter) {
  const category = normalizeProductCategory(product.category);
  if (filter === 'all') return true;
  if (filter === 'sweets') return ['putharekulu', 'jellysnacks'].includes(category);
  return category === filter;
}

function renderProductsFilterBar() {
  const bar = document.getElementById('productsFilterBar');
  if (!bar) return;

  const options = [
    { id: 'all', label: 'All', count: state.products.length },
    { id: 'mangoes', label: 'Mangoes', count: state.products.filter((product) => normalizeProductCategory(product.category) === 'mangoes').length },
    { id: 'putharekulu', label: 'Putharekulu', count: state.products.filter((product) => normalizeProductCategory(product.category) === 'putharekulu').length },
    { id: 'jellysnacks', label: 'Jelly & Snacks', count: state.products.filter((product) => normalizeProductCategory(product.category) === 'jellysnacks').length },
    { id: 'sweets', label: 'Sweets', count: state.products.filter((product) => ['putharekulu', 'jellysnacks'].includes(normalizeProductCategory(product.category))).length }
  ];

  bar.innerHTML = `<span class="products-filter-label">Filter Products</span>${options.map((option) => `
    <button type="button" class="product-filter-pill ${state.productFilter === option.id ? 'active' : ''}" onclick="setProductCategoryFilter('${escapeHtml(option.id)}')">
      ${escapeHtml(option.label)} (${option.count})
    </button>`).join('')}`;
}

function mergeProductsWithBase(docs = []) {
  const normalizedDocs = docs.map((product) => ({ ...product, category: normalizeProductCategory(product.category) }));
  const byId = new Map(normalizedDocs.map((product) => [product.id, product]));
  const mergedBase = BASE_PRODUCTS.map((product) => ({ ...product, ...(byId.get(product.id) || {}) }));
  const extraProducts = normalizedDocs
    .filter((product) => !BASE_PRODUCTS.some((baseProduct) => baseProduct.id === product.id))
    .map((product) => ({ ...product }));

  return [...mergedBase, ...extraProducts];
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
    jellysnacks: '250g or 500g'
  };
  const nextValue = defaults[category] || 'per box';
  if (!unitInput) return nextValue;

  unitInput.value = nextValue;
  return nextValue;
}

function productUsesVariants(category) {
  return ['putharekulu', 'jellysnacks'].includes(category);
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

function galleryFromInput(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
  const baseUnit = usesVariants ? (unit || applyCategoryDefaults()) : unit;
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
    sortOrder: editingProductId
      ? (state.products.find((product) => product.id === editingProductId)?.sortOrder ?? getNextSortOrder())
      : getNextSortOrder(),
    updatedAt: new Date().toISOString()
  };
  if (!editingProductId) payload.createdAt = new Date().toISOString();

  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';

  try {
    await setDoc(doc(db, 'products', id), payload);
    showToast(editingProductId ? `${name} updated` : `${name} added to catalog`);
    resetAddProductForm();
    closeAddProductForm();
  } catch (error) {
    console.error(error);
    showToast('Could not save product right now');
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
    const statusText = isComingSoon ? 'Soon' : (product.available ? 'Live' : 'Off');
    const shortDescription = String(product.description || '').trim();
    const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => variant?.label) : [];
    const variantSummary = variants.length
      ? variants.map((variant) => `${variant.label}${variant.price ? ` ${variant.price}` : ''}${variant.sku ? ` (${variant.sku})` : ''}`).join(' | ')
      : '';
    const priceSummary = variants.length
      ? variantSummary
      : (product.price ? `${product.price} - ${product.unit || 'per box'}` : (isComingSoon ? 'Coming Soon' : `No price set - ${product.unit || 'per box'}`));

    return `<div class="pm-card" id="pmc-${escapeHtml(product.id)}">
      <div class="pm-emoji">🥭</div>
      <div class="pm-info">
        <div class="pm-meta">
          <span class="pm-chip">${escapeHtml(productCategoryLabel(product.category))}</span>
          ${product.tag ? `<span class="pm-chip">${escapeHtml(product.tag)}</span>` : ''}
        </div>
        <h4 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h4>
        <div class="pm-sub">${escapeHtml(shortDescription || 'No description added yet.')}</div>
        <div class="pm-sub">${escapeHtml(product.unit || 'per box')}</div>
        <div class="pm-sub">${escapeHtml(priceSummary)}</div>
        <div class="pm-sort-wrap"><span class="pm-sort-label">Order</span><input type="number" class="pm-sort-input" id="sort-${escapeHtml(product.id)}" value="${escapeHtml(String(product.sortOrder ?? ''))}" min="1" step="1"><button class="pm-save-btn" onclick="saveProductSortOrder('${escapeHtml(product.id)}')">Save</button></div>
        <div class="pm-sub">Use Edit to update ${variants.length ? 'size and price options' : 'price and product details'}.</div>
      </div>
      <div class="pm-controls"><label class="toggle-switch"><input type="checkbox" ${product.available ? 'checked' : ''} onchange="toggleAvailable('${escapeHtml(product.id)}', this.checked)"><span class="toggle-slider"></span></label><span style="font-size:10px;color:var(--text-light)">${statusText}</span><button class="pm-edit-btn" type="button" onclick="editProduct('${escapeHtml(product.id)}')">Edit</button></div>
    </div>`;
  }).join('');
}

function setProductCategoryFilter(filter) {
  state.productFilter = filter || 'all';
  renderProducts();
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

  const price = `$${value}`;
  await updateDoc(doc(db, 'products', id), { price, updatedAt: new Date().toISOString() });
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
    displayOnly: available ? false : Boolean(product.displayOnly),
    updatedAt: new Date().toISOString()
  };
  await updateDoc(doc(db, 'products', id), payload);
  showToast(`${product.name} ${available ? 'is live' : 'hidden'}`);
}

async function applyOrderStatus(id, status, silent = false) {
  const order = state.orders.find((item) => item.id === id);

  await updateDoc(doc(db, 'orders', id), { status, updatedAt: new Date().toISOString() });

  if (order?.phoneDigits) {
    const lockRef = doc(db, 'order_locks', order.phoneDigits);

    if (status === 'fulfilled') {
      await deleteDoc(lockRef);
    } else {
      await setDoc(lockRef, {
        phoneDigits: order.phoneDigits,
        orderId: id,
        status,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  }

  if (!silent) showToast(`Order updated to ${status}`);
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

  const expectedTotal = batchOrders.reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const collectedOrders = batchOrders.filter((order) => order.paymentCollected && order.paymentMethod);
  const collectedTotal = collectedOrders.reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const cashTotal = collectedOrders.filter((order) => order.paymentMethod === 'cash').reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const zelleTotal = collectedOrders.filter((order) => order.paymentMethod === 'zelle').reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const cardTotal = collectedOrders.filter((order) => order.paymentMethod === 'card').reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const unpaidCount = batchOrders.filter((order) => !order.paymentCollected).length;
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
      order.totalPrice || 0,
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
  showToast('Fulfilled and cancelled orders are shown in Processed Orders.');
}

function exportCSV() {
  const orders = getFilteredOrders(state.orderSheet);
  if (!orders.length) {
    showToast('No orders match the current view and filters.');
    return;
  }

  const rows = [[
    'Order ID', 'Customer', 'Phone', 'Email', 'Items', 'Boxes', 'Total',
    'Location', 'Pickup Date', 'Payment', 'Payment Method', 'Collected', 'Status', 'Created'
  ]];
  orders.forEach((order) => {
    rows.push([
      order.orderNumber || order.id,
      order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim(),
      order.phone || '',
      order.email || '',
      orderItemsSummary(order.items || []),
      order.totalBoxes || 0,
      order.totalPrice || 0,
      order.locationLabel || order.location || '',
      order.pickupDate || '',
      order.payment || 'pending',
      order.paymentMethod || '',
      order.paymentCollected ? 'Yes' : 'No',
      order.status || 'pending',
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
  state.orderSheet = sheet;
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

function printableItems(order) {
  return (order.items || [])
    .map((item) => `${escapeHtml(item.name || 'Item')} x ${escapeHtml(String(item.qty || 1))}`)
    .join('<br>');
}

function printableQty(order) {
  return order.totalBoxes || (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function printActiveOrders() {
  const orders = getFilteredOrders('active');
  if (!orders.length) {
    showToast('No active orders to print.');
    return;
  }

  const rows = orders.map((order) => `
    <tr>
      <td>${escapeHtml(order.orderNumber || order.id)}</td>
      <td>${escapeHtml(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim())}</td>
      <td>${escapeHtml(order.phone || '')}</td>
      <td>${printableItems(order)}</td>
      <td>${escapeHtml(String(printableQty(order)))}</td>
      <td>${escapeHtml(formatCurrency(order.totalPrice || 0))}</td>
      <td>${escapeHtml(order.locationLabel || order.location || '—')}</td>
      <td>Cash [&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]<br>Zelle [&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]<br>Card [&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]</td>
    </tr>
  `).join('');

  const selectedFrom = document.getElementById('filterDateFrom')?.value || '';
  const selectedTo = document.getElementById('filterDateTo')?.value || '';
  const selectedDate = selectedFrom || selectedTo
    ? `${selectedFrom || 'Any'} to ${selectedTo || 'Any'}`
    : 'All dates';
  const printWindow = window.open('', '_blank', 'width=1200,height=900');
  if (!printWindow) {
    showToast('Allow popups to print orders.');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
  <html>
    <head>
      <title>Shrish Active Orders Print</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #1A1208; }
        h1 { margin: 0 0 8px; font-size: 26px; }
        p { margin: 0 0 18px; color: #6B4A20; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; table-layout: auto; }
        th, td { border: 1px solid #d9c8ab; padding: 10px 8px; vertical-align: top; font-size: 12px; text-align: left; }
        th { background: #f5e9d4; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
        th:nth-child(1), td:nth-child(1) { width: 10%; white-space: nowrap; }
        th:nth-child(2), td:nth-child(2) { width: 14%; white-space: nowrap; }
        th:nth-child(3), td:nth-child(3) { width: 11%; white-space: nowrap; }
          th:nth-child(4), td:nth-child(4) { width: 24%; }
          th:nth-child(5), td:nth-child(5) { width: 5%; white-space: nowrap; text-align: center; }
          th:nth-child(6), td:nth-child(6) { width: 10%; white-space: nowrap; }
          th:nth-child(7), td:nth-child(7) { width: 11%; white-space: nowrap; }
          th:nth-child(8), td:nth-child(8) { width: 19%; }
        .meta { margin-bottom: 16px; font-size: 13px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>Shrish Active Orders</h1>
      <p class="meta">Pending pickup orders only. Filter date: ${escapeHtml(selectedDate)}. Printed on ${escapeHtml(new Date().toLocaleString())}.</p>
      <table>
        <thead>
          <tr>
            <th>Order No</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Total</th>
            <th>Location</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => { window.print(); };</script>
    </body>
  </html>`);
  printWindow.document.close();
}

function renderExcelCalculations() {
  const tab = document.getElementById('tab-excel-calculations');
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
  const sheetProducts = accounting2SheetProducts(computed.products);
  const balanceLeft = computed.batchOrderTotal - computed.receivedTotal;
  const countedTotal = computed.cashCountTotal + computed.zelleAmount;

  savedSheetSelect.innerHTML = [
    `<option value="" ${savedSheetNames.includes(batchName) ? '' : 'selected'}>Current Sheet</option>`,
    ...savedSheetNames.map((name) => `<option value="${escapeHtml(name)}" ${name === batchName ? 'selected' : ''}>${escapeHtml(name)}</option>`)
  ].join('');

  const columnHeaders = sheetProducts.map(({ product, code }) => `
    <th title="${escapeHtml(product.name || '')}">${escapeHtml(code)}</th>
  `).join('');

  const extraValueCells = sheetProducts.map(({ product }) => `
    <td><input type="number" min="0" step="1" value="${computed.extraBoxes[product.id] || ''}" onchange="setExcelCalcProductMap('extraBoxes','${escapeHtml(product.id)}', this.value)"></td>
  `).join('');

  const orderedValueCells = sheetProducts.map(({ product }) => `
    <td><input type="number" min="0" step="1" value="${computed.orderedCounts[product.id] ?? ''}" onchange="setExcelCalcProductMap('orderedBoxes','${escapeHtml(product.id)}', this.value)"></td>
  `).join('');

  const priceRows = sheetProducts.map(({ product, code }) => `
    <tr>
      <td title="${escapeHtml(product.name || '')}">${escapeHtml(code)}</td>
      <td><input type="text" inputmode="decimal" value="${computed.productPrices[product.id] ?? accounting2ProductPrice(product)}" onchange="setExcelCalcProductMap('productPrices','${escapeHtml(product.id)}', this.value)"></td>
    </tr>
  `).join('');

  const cashRows = accounting2DefaultDenominations().map((denomination) => {
    const count = computed.cashCounts[denomination] || '';
    return `
      <tr>
        <td>${formatCurrency(denomination)}</td>
        <td><input type="number" min="0" step="1" value="${count}" onchange="setExcelCalcCashCount('${denomination}', this.value)"></td>
        <td>${formatCurrency(Number(denomination) * Number(count || 0))}</td>
      </tr>
    `;
  }).join('');

  const remainingRows = sheetProducts.map(({ product }) => `
    <tr>
      <td>${escapeHtml(product.name || '')}</td>
      <td><input type="text" inputmode="decimal" value="${computed.remainingQty[product.id] ?? ''}" onchange="setExcelCalcProductMap('remainingQty','${escapeHtml(product.id)}', this.value)"></td>
    </tr>
  `).join('');

  sheetEl.innerHTML = `
    <div class="excel-spreadsheet">
      <div class="excel-sheet-meta">
        <span>Saved Sheets: <strong>${savedSheetNames.length}</strong></span>
        <span>Sheet: <strong>${escapeHtml(batchName)}</strong></span>
      </div>

      <table class="excel-sheet-table excel-sheet-table-top">
        <tbody>
          <tr>
            <th class="excel-sheet-label">Extra Box's</th>
            ${columnHeaders}
            <th class="excel-sheet-money-head">Total Extra</th>
          </tr>
          <tr>
            <td></td>
            ${extraValueCells}
            <td class="excel-sheet-money">${formatCurrency(computed.extraBoxesValue)}</td>
          </tr>
        </tbody>
      </table>

      <table class="excel-sheet-table excel-sheet-table-top">
        <tbody>
          <tr>
            <th class="excel-sheet-label">Box Count</th>
            ${columnHeaders}
          </tr>
          <tr>
            <td></td>
            ${orderedValueCells}
          </tr>
        </tbody>
      </table>

      <table class="excel-sheet-table excel-sheet-summary-head">
        <tbody>
          <tr>
            <th>Date</th>
            <th>Total Box count</th>
            <th>Total</th>
          </tr>
          <tr>
            <td>${formatDate(dateInput.value)}</td>
            <td>${computed.totalBoxesCount}</td>
            <td>${formatCurrency(computed.batchOrderTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div class="excel-sheet-workarea">
        <div class="excel-sheet-left">
          <div class="excel-sheet-panel">
            <div class="excel-sheet-panel-title">Cash</div>
            <table class="excel-sheet-table">
              <tbody>
                <tr>
                  <th></th>
                  <th>Count</th>
                  <th>Sum</th>
                </tr>
                ${cashRows}
                <tr class="excel-calc-total-row">
                  <td>Total</td>
                  <td></td>
                  <td>${formatCurrency(computed.cashCountTotal)}</td>
                </tr>
                <tr>
                  <td>Cash from hand</td>
                  <td colspan="2"><input type="text" inputmode="decimal" value="${record.cashFromHand ?? ''}" onchange="setExcelCalcValue('cashFromHand', this.value)"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="excel-sheet-panel">
            <div class="excel-sheet-panel-title">Zelle</div>
            <table class="excel-sheet-table">
              <tbody>
                <tr>
                  <td>Amount</td>
                  <td><input type="text" inputmode="decimal" value="${record.zelleAmount ?? ''}" onchange="setExcelCalcValue('zelleAmount', this.value)"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="excel-sheet-panel">
            <table class="excel-sheet-table">
              <tbody>
                <tr>
                  <th></th>
                  <th>Cash</th>
                  <th>Zelle</th>
                  <th>Unknown</th>
                  <th>Total</th>
                </tr>
                <tr>
                  <td>Total</td>
                  <td>${formatCurrency(computed.cashSales)}</td>
                  <td>${formatCurrency(computed.zelleAmount)}</td>
                  <td>${formatCurrency(computed.unknownAmount)}</td>
                  <td>${formatCurrency(computed.batchOrderTotal)}</td>
                </tr>
                <tr>
                  <td>Received</td>
                  <td>${formatCurrency(computed.cashCountTotal)}</td>
                  <td>${formatCurrency(computed.zelleAmount)}</td>
                  <td></td>
                  <td>${formatCurrency(countedTotal)}</td>
                </tr>
                <tr>
                  <td>Balance left</td>
                  <td>${formatCurrency(computed.cashFromHand)}</td>
                  <td></td>
                  <td>${formatCurrency(computed.unknownAmount)}</td>
                  <td class="${balanceLeft < 0 ? 'warn' : ''}">${formatCurrency(balanceLeft)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="excel-sheet-right">
          <div class="excel-sheet-panel excel-sheet-panel-narrow">
            <table class="excel-sheet-table">
              <tbody>
                <tr>
                  <td>Invoice</td>
                  <td><input type="text" inputmode="decimal" value="${record.invoiceTotal ?? ''}" onchange="setExcelCalcValue('invoiceTotal', this.value)"></td>
                </tr>
                <tr>
                  <td>Balance</td>
                  <td class="${computed.invoiceBalance < 0 ? 'warn' : ''}">${formatCurrency(computed.invoiceBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="excel-sheet-panel excel-sheet-panel-narrow">
            <table class="excel-sheet-table">
              <tbody>
                ${priceRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="excel-sheet-panel excel-sheet-panel-bottom">
        <div class="excel-sheet-panel-title">Remaining and Damaged:</div>
        <table class="excel-sheet-table excel-sheet-table-remaining">
          <tbody>
            ${remainingRows}
            <tr>
              <td>Damaged</td>
              <td><input type="text" inputmode="decimal" value="${record.damagedAmount ?? ''}" onchange="setExcelCalcValue('damagedAmount', this.value)"></td>
            </tr>
            <tr class="excel-calc-total-row">
              <td>Total</td>
              <td>${formatCurrency(computed.totalLossValue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="excel-sheet-tally">
        <span>Tally</span>
        <strong class="${computed.tallyValue < 0 ? 'warn' : ''}">${formatCurrency(computed.tallyValue)}</strong>
      </div>
    </div>
  `;
}

function setExcelCalcValue(key, value) {
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
  if (key === 'extraBoxes' || key === 'orderedBoxes') {
    accounting2SetMapValue(key, productId, Math.max(0, parseInt(value, 10) || 0));
    return;
  }
  if (key === 'productPrices') {
    accounting2SetMapValue(key, productId, value === '' ? '' : excelCalcMoneyValue(value));
    return;
  }
  accounting2SetMapValue(key, productId, value === '' ? '' : excelCalcMoneyValue(value));
}

async function saveExcelCalculations() {
  const dateInput = document.getElementById('excelCalcDate');
  const saveBtn = document.getElementById('excelCalcSaveBtn');
  if (!dateInput) return;

  const batchName = accounting2BatchName();
  const existing = accounting2SavedRecord(batchName) || {};
  const payload = {
    batchName,
    batchDate: dateInput.value || todayDateInputValue(),
    orderedBoxes: accounting2MutableMap(existing, 'orderedBoxes'),
    invoiceTotal: moneyValue(existing.invoiceTotal),
    cashFromHand: Number(existing.cashFromHand || 0),
    zelleAmount: moneyValue(existing.zelleAmount),
    damagedAmount: moneyValue(existing.damagedAmount),
    extraBoxes: accounting2MutableMap(existing, 'extraBoxes'),
    productPrices: accounting2MutableMap(existing, 'productPrices'),
    remainingQty: accounting2MutableMap(existing, 'remainingQty'),
    cashCounts: accounting2MutableMap(existing, 'cashCounts'),
    updatedAt: new Date().toISOString()
  };

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    await setDoc(doc(db, 'accounting_batches', accounting2DocId(batchName)), {
      ...payload,
      recordType: 'excel_sheet',
      sheetName: batchName
    }, { merge: true });
    state.accounting2Records[batchName] = payload;
    showToast('Excel calculations saved');
  } catch (error) {
    console.error(error);
    showToast('Could not save Excel calculations right now');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Excel Calculations';
    }
  }
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

  const expectedTotal = batchOrders.reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const collectedOrders = batchOrders.filter((order) => order.paymentCollected && order.paymentMethod);
  const collectedTotal = collectedOrders.reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const cashTotal = collectedOrders.filter((order) => order.paymentMethod === 'cash').reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const zelleTotal = collectedOrders.filter((order) => order.paymentMethod === 'zelle').reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const cardTotal = collectedOrders.filter((order) => order.paymentMethod === 'card').reduce((sum, order) => sum + moneyValue(order.totalPrice), 0);
  const unpaidCount = batchOrders.filter((order) => !order.paymentCollected).length;

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
      <td><div class="total-amount">${formatCurrency(order.totalPrice || 0)}</div></td>
      <td>${escapeHtml(order.paymentMethod || '--')}</td>
      <td>${order.paymentCollected ? '<span class="status-badge status-fulfilled">Collected</span>' : '<span class="status-badge status-pending">Pending</span>'}</td>
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
  document.getElementById('tab-subscribers').style.display = tab === 'subscribers' ? 'block' : 'none';
  document.getElementById('tab-accounting').style.display = tab === 'accounting' ? 'block' : 'none';
  document.getElementById('tab-excel-calculations').style.display = tab === 'excel-calculations' ? 'block' : 'none';
  if (tab === 'products') renderProducts();
  if (tab === 'orders') renderOrders();
  if (tab === 'subscribers') renderSubscribers();
  if (tab === 'accounting') renderAccounting();
  if (tab === 'excel-calculations') renderExcelCalculations();
  updateOrdersSheetUi();
}

function subscribeData() {
  state.unsubOrders?.();
  state.unsubProducts?.();
  state.unsubSubscribersGeneral?.();
  state.unsubSubscribersProduct?.();
  state.unsubAccountingBatches?.();
  state.unsubAccounting2Records?.();

  state.unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
    state.orders = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    renderOrders();
    renderAccounting();
  }, (error) => {
    console.error(error);
    showToast('Orders sync failed');
  });

  state.unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
    const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    state.products = mergeProductsWithBase(docs);
    window.SHRISH_DATA.products = [...state.products];
    renderProducts();
    renderStats();
  }, (error) => {
    console.error(error);
    showToast('Products sync failed');
  });

  const syncSubscribers = () => {
    const merged = [...state._generalSubscribers || [], ...state._productSubscribers || []]
      .sort((a, b) => {
        const aTime = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a?.createdAt || 0).getTime();
        const bTime = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      });
    state.subscribers = merged;
    renderSubscribers();
    renderStats();
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
    renderAccounting();
    renderExcelCalculations();
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
    if (e.key === 'Escape') closeOrderEditor();
  });
}

function initAuthWatch() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.unsubOrders?.();
      state.unsubProducts?.();
      state.unsubSubscribersGeneral?.();
      state.unsubSubscribersProduct?.();
      state.unsubAccountingBatches?.();
      state.unsubAccounting2Records?.();
      setLoggedInUi(false);
      return;
    }

    setLoggedInUi(true, user.email || '');
    await seedProductsIfNeeded();
    subscribeData();
  });
}

window.doLogin = doLogin;
window.doLogout = doLogout;
window.switchTab = switchTab;
window.saveProductPrice = saveProductPrice;
window.toggleAvailable = toggleAvailable;
window.setStatus = setStatus;
window.updatePickupDate = updatePickupDate;
window.updatePaymentMethod = updatePaymentMethod;
window.togglePaymentCollected = togglePaymentCollected;
window.clearFulfilled = clearFulfilled;
window.setOrderSheet = setOrderSheet;
window.markFilteredActiveFulfilled = markFilteredActiveFulfilled;
window.printActiveOrders = printActiveOrders;
window.exportCSV = exportCSV;
window.exportSubscribersCSV = exportSubscribersCSV;
window.deleteSubscriber = deleteSubscriber;
window.renderAccounting = renderAccounting;
window.setAccountingView = setAccountingView;
window.setSelectedAccountingBatch = setSelectedAccountingBatch;
window.saveAccountingBatch = saveAccountingBatch;
window.closeAccountingBatch = closeAccountingBatch;
window.reopenAccountingBatch = reopenAccountingBatch;
window.exportAccountingBatchCSV = exportAccountingBatchCSV;
window.openAddProductForm = openAddProductForm;
window.closeAddProductForm = closeAddProductForm;
window.resetAddProductForm = resetAddProductForm;
window.editProduct = editProduct;
window.setProductCategoryFilter = setProductCategoryFilter;
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

bindUi();
initAuthWatch();
