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
  unsubOrders: null,
  unsubProducts: null
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

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card"><div class="s-label">Total Orders</div><div class="s-value">${total}</div></div>
    <div class="stat-card"><div class="s-label">Pending Pickup</div><div class="s-value gold">${pending}</div></div>
    <div class="stat-card"><div class="s-label">Fulfilled</div><div class="s-value">${fulfilled}</div></div>
    <div class="stat-card"><div class="s-label">Revenue</div><div class="s-value gold">${formatCurrency(totalRevenue)}</div></div>
    <div class="stat-card"><div class="s-label">Boxes</div><div class="s-value">${totalBoxes}</div></div>
    <div class="stat-card"><div class="s-label">Products Live</div><div class="s-value">${available} / ${totalProducts}</div></div>`;
}

function renderOrders() {
  const filter = document.getElementById('filterStatus')?.value || 'all';
  let orders = [...state.orders];
  if (filter !== 'all') orders = orders.filter((o) => o.status === filter);

  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📭</div><p>No orders found.</p></div></td></tr>';
    renderStats();
    return;
  }

  tbody.innerHTML = orders.map((order) => {
    const itemsHtml = order.items?.length
      ? `<div class="items-list">${order.items.map((item) => `<div class="item-row"><strong>${escapeHtml(item.name)}</strong> <span>× ${item.qty} · ${escapeHtml(item.price)}</span></div>`).join('')}</div>`
      : '<span style="color:#ccc">—</span>';

    const statusClass = `status-${order.status || 'pending'}`;
    const statusLabel = (order.status || 'pending').charAt(0).toUpperCase() + (order.status || 'pending').slice(1);

    return `<tr id="row-${escapeHtml(order.id)}">
      <td><div class="order-id">${escapeHtml(order.orderNumber || order.id)}</div><div style="font-size:11px;color:var(--text-light);margin-top:3px">${formatDate(order.createdAt)}</div></td>
      <td><div class="customer-name">${escapeHtml(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`.trim())}</div><div class="customer-phone">${escapeHtml(order.phone)}</div><div class="customer-email">${escapeHtml(order.email)}</div></td>
      <td>${itemsHtml}</td>
      <td><div class="total-amount">${formatCurrency(order.totalPrice || 0)}</div></td>
      <td style="font-size:13px">${escapeHtml(order.locationLabel || order.location || '—')}</td>
      <td><input type="date" class="pickup-date-input" value="${formatDateInput(order.pickupDate)}" onchange="updatePickupDate('${escapeHtml(order.id)}', this.value)"></td>
      <td><select class="payment-select" onchange="updatePayment('${escapeHtml(order.id)}', this.value)"><option value="pending" ${order.payment === 'pending' ? 'selected' : ''}>💰 Pending</option><option value="paid" ${order.payment === 'paid' ? 'selected' : ''}>✅ Paid</option></select></td>
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

async function setStatus(id, status) {
  const order = state.orders.find((item) => item.id === id);

  await updateDoc(doc(db, 'orders', id), { status, updatedAt: new Date().toISOString() });

  if (order?.phoneDigits) {
    const lockRef = doc(db, 'order_locks', order.phoneDigits);

    if (status === 'pending') {
      await setDoc(lockRef, {
        phoneDigits: order.phoneDigits,
        orderId: id,
        status: 'pending',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } else {
      await deleteDoc(lockRef);
    }
  }

  showToast(`Order updated to ${status}`);
}

async function updatePickupDate(id, pickupDate) {
  await updateDoc(doc(db, 'orders', id), { pickupDate: pickupDate || '', updatedAt: new Date().toISOString() });
  showToast('Pickup date saved');
}

async function updatePayment(id, payment) {
  await updateDoc(doc(db, 'orders', id), { payment, updatedAt: new Date().toISOString() });
  showToast('Payment status updated');
}

async function clearFulfilled() {
  showToast('For safety, clear fulfilled manually in Firestore if needed.');
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

function switchTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach((button) => button.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-orders').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
  if (tab === 'products') renderProducts();
}

function subscribeData() {
  state.unsubOrders?.();
  state.unsubProducts?.();

  state.unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
    state.orders = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    renderOrders();
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
}

function bindUi() {
  document.getElementById('filterStatus')?.addEventListener('change', renderOrders);
  document.getElementById('adminPw')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

function initAuthWatch() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.unsubOrders?.();
      state.unsubProducts?.();
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
window.updatePayment = updatePayment;
window.clearFulfilled = clearFulfilled;
window.exportCSV = exportCSV;

bindUi();
initAuthWatch();
