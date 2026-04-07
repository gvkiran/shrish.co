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

const state = {
  orders: [],
  products: JSON.parse(JSON.stringify(window.SHRISH_DATA?.products || [])),
  subscribers: [],
  orderSheet: 'active',
  orderFilters: {
    active: { status: 'pending', date: '' },
    processed: { status: 'all', date: '' },
    all: { status: 'all', date: '' }
  },
  unsubOrders: null,
  unsubProducts: null,
  unsubSubscribersGeneral: null,
  unsubSubscribersProduct: null
};

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
  if (!snapshot.empty) return;

  await Promise.all(state.products.map((product) => setDoc(doc(db, 'products', product.id), {
    ...product,
    updatedAt: new Date().toISOString()
  })));
  showToast('Products seeded to Firestore');
}

function renderStats() {
  const orders = state.orders;
  const total = orders.length;
  const pending = orders.filter((o) => o.status === 'pending').length;
  const fulfilled = orders.filter((o) => o.status === 'fulfilled').length;
  const totalBoxes = orders.filter((o) => o.status !== 'cancelled').reduce((sum, order) => sum + (order.totalBoxes || 0), 0);
  const totalRevenue = orders.filter((o) => o.status !== 'cancelled').reduce((sum, order) => sum + (order.totalPrice || 0), 0);
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

function batchNameFromDate(dateString) {
  if (!dateString) return '';
  return `SHR-BATCH-${dateString}`;
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

function getOrdersForSheet(sheet = state.orderSheet) {
  if (sheet === 'active') return state.orders.filter((order) => (order.status || 'pending') === 'pending');
  if (sheet === 'processed') return state.orders.filter((order) => ['fulfilled', 'cancelled'].includes(order.status || 'pending'));
  return [...state.orders];
}

function getFilteredOrders(sheet = state.orderSheet) {
  const sheetFilters = state.orderFilters[sheet] || { status: 'all', date: '' };
  const filterStatus = sheetFilters.status || 'all';
  const filterDate = sheetFilters.date || '';

  let orders = getOrdersForSheet(sheet);

  if (filterStatus !== 'all') {
    orders = orders.filter((order) => (order.status || 'pending') === filterStatus);
  }

  if (filterDate) {
    orders = orders.filter((order) => orderDateKey(order) === filterDate);
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
      help: 'Processed Orders shows fulfilled and cancelled records. You can reset one back to pending if needed.',
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
  const filterStatus = document.getElementById('filterStatus');
  const filterDate = document.getElementById('filterDate');
  const currentFilters = state.orderFilters[state.orderSheet] || { status: 'all', date: '' };
  if (title) title.textContent = config[state.orderSheet].title;
  if (help) help.textContent = config[state.orderSheet].help;
  if (bulkButton) bulkButton.style.display = state.orderSheet === 'active' ? 'inline-flex' : 'none';
  if (sheetSwitcher) sheetSwitcher.style.display = document.getElementById('tab-orders')?.style.display === 'none' ? 'none' : 'flex';
  if (filterStatus) filterStatus.value = currentFilters.status || 'all';
  if (filterDate) filterDate.value = currentFilters.date || '';
}

function syncCurrentOrderFilters() {
  const filterStatus = document.getElementById('filterStatus');
  const filterDate = document.getElementById('filterDate');
  if (!state.orderFilters[state.orderSheet]) {
    state.orderFilters[state.orderSheet] = { status: 'all', date: '' };
  }
  state.orderFilters[state.orderSheet].status = filterStatus?.value || 'all';
  state.orderFilters[state.orderSheet].date = filterDate?.value || '';
}

function renderOrders() {
  const orders = getFilteredOrders();
  updateOrdersSheetUi();

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

  renderStats();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  grid.innerHTML = state.products.map((product) => {
    const isComingSoon = product.displayOnly;
    const priceDisplay = isComingSoon ? '' : (product.price || '');
    const priceNum = String(priceDisplay).replace(/[^0-9.]/g, '');

    return `<div class="pm-card" id="pmc-${escapeHtml(product.id)}">
      <div class="pm-emoji">🥭</div>
      <div class="pm-info">
        <h4 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h4>
        ${isComingSoon ? '<span style="font-size:11px;color:#aaa">Coming Soon — no price</span>' : `<div class="pm-price-wrap"><span style="font-size:12px;color:var(--text-light)">$</span><input type="number" class="pm-price-input" id="price-${escapeHtml(product.id)}" value="${escapeHtml(priceNum)}" min="1" max="999" step="1"><button class="pm-save-btn" onclick="saveProductPrice('${escapeHtml(product.id)}')">Save</button></div>`}
      </div>
      <div class="pm-controls"><label class="toggle-switch"><input type="checkbox" ${product.available ? 'checked' : ''} ${isComingSoon ? 'disabled' : ''} onchange="toggleAvailable('${escapeHtml(product.id)}', this.checked)"><span class="toggle-slider"></span></label><span style="font-size:10px;color:var(--text-light)">${isComingSoon ? 'Soon' : (product.available ? 'Live' : 'Off')}</span></div>
    </div>`;
  }).join('');
}

function renderSubscribers() {
  const tbody = document.getElementById('subscribersBody');
  if (!tbody) return;

  if (!state.subscribers.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✉</div><p>No subscribers found.</p></div></td></tr>';
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
    </tr>`;
  }).join('');
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

async function toggleAvailable(id, available) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  await updateDoc(doc(db, 'products', id), { available, updatedAt: new Date().toISOString() });
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

async function clearFulfilled() {
  state.orderSheet = 'processed';
  renderOrders();
  showToast('Fulfilled and cancelled orders are shown in Processed Orders.');
}

function exportCSV() {
  const rows = [['Order ID', 'Customer', 'Phone', 'Email', 'Items', 'Boxes', 'Total', 'Location', 'Pickup Date', 'Payment', 'Status', 'Created']];
  state.orders.forEach((order) => {
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
      order.status || 'pending',
      formatDate(order.createdAt)
    ]);
  });

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shrish_orders_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast('CSV downloaded');
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

  const selectedDate = document.getElementById('filterDate')?.value || 'All dates';
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
        th:nth-child(4), td:nth-child(4) { width: 31%; }
        th:nth-child(5), td:nth-child(5) { width: 5%; white-space: nowrap; text-align: center; }
        th:nth-child(6), td:nth-child(6) { width: 10%; white-space: nowrap; }
        th:nth-child(7), td:nth-child(7) { width: 11%; white-space: nowrap; }
        th:nth-child(8), td:nth-child(8) { width: 12%; }
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

function renderAccounting() {
  const dateInput = document.getElementById('accountingDate');
  const statsEl = document.getElementById('accountingStats');
  const bodyEl = document.getElementById('accountingBody');
  const batchNameEl = document.getElementById('accountingBatchName');

  if (!dateInput || !statsEl || !bodyEl || !batchNameEl) return;

  if (!dateInput.value) dateInput.value = todayDateInputValue();
  const batchName = batchNameFromDate(dateInput.value);
  batchNameEl.textContent = batchName;

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

  statsEl.innerHTML = `
    <div class="accounting-card"><div class="a-label">Batch Orders</div><div class="a-value">${batchOrders.length}</div></div>
    <div class="accounting-card"><div class="a-label">Expected Total</div><div class="a-value accent">${formatCurrency(expectedTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Collected Total</div><div class="a-value good">${formatCurrency(collectedTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Cash Total</div><div class="a-value">${formatCurrency(cashTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Zelle Total</div><div class="a-value">${formatCurrency(zelleTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Card Total</div><div class="a-value">${formatCurrency(cardTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Unpaid Orders</div><div class="a-value warn">${unpaidCount}</div></div>
    <div class="accounting-card"><div class="a-label">Actual Counted</div><div class="a-value">${formatCurrency(actualTotal)}</div></div>
    <div class="accounting-card"><div class="a-label">Difference</div><div class="a-value ${Math.abs(mismatch) < 0.005 ? 'good' : 'warn'}">${formatCurrency(mismatch)}</div></div>
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
  if (tab === 'products') renderProducts();
  if (tab === 'orders') renderOrders();
  if (tab === 'subscribers') renderSubscribers();
  if (tab === 'accounting') renderAccounting();
  updateOrdersSheetUi();
}

function subscribeData() {
  state.unsubOrders?.();
  state.unsubProducts?.();
  state.unsubSubscribersGeneral?.();
  state.unsubSubscribersProduct?.();

  state.unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
    state.orders = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    renderOrders();
    renderAccounting();
  }, (error) => {
    console.error(error);
    showToast('Orders sync failed');
  });

  state.unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
    state.products = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
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
    state._generalSubscribers = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    syncSubscribers();
  }, (error) => {
    console.error(error);
    showToast('General subscribers sync failed');
  });

  state.unsubSubscribersProduct = onSnapshot(collection(db, 'notify_requests'), (snapshot) => {
    state._productSubscribers = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    syncSubscribers();
  }, (error) => {
    console.error(error);
    showToast('Product notifications sync failed');
  });
}

function bindUi() {
  document.getElementById('filterStatus')?.addEventListener('change', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('filterDate')?.addEventListener('change', () => {
    syncCurrentOrderFilters();
    renderOrders();
  });
  document.getElementById('accountingDate')?.addEventListener('change', renderAccounting);
  document.getElementById('adminPw')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

function initAuthWatch() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.unsubOrders?.();
      state.unsubProducts?.();
      state.unsubSubscribersGeneral?.();
      state.unsubSubscribersProduct?.();
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
window.renderAccounting = renderAccounting;

bindUi();
initAuthWatch();

