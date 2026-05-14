import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  serverTimestamp,
  normalizePhone,
  escapeHtml,
  formatCurrency
} from './firebase-app.js';

const LOCATION_LABELS = {
  shortpump: 'Short Pump, VA',
  chesterfield: 'Chesterfield, VA',
  mechanicsville: 'Mechanicsville, VA'
};

let unsubOrders = null;
let currentOrders = [];

function customerAccountsEnabled() {
  return window.SHRISH_APP_CONFIG?.customerAccountsEnabled === true;
}

function adminEmail() {
  return normalizeEmail(window.SHRISH_APP_CONFIG?.adminEmailHint || 'contact@shrish.co');
}

function isAdminUser(user) {
  return normalizeEmail(user?.email || '') === adminEmail();
}

function trackAccountEvent(eventName, props = {}) {
  window.SHRISH_ANALYTICS?.track(eventName, props);
}

function profileRef(uid) {
  return doc(db, 'user_profiles', uid);
}

function el(id) {
  return document.getElementById(id);
}

function showMessage(id, type, text) {
  const node = el(id);
  if (!node) return;
  node.className = `account-message show ${type}`;
  node.textContent = text;
}

function clearMessage(id) {
  const node = el(id);
  if (!node) return;
  node.className = 'account-message';
  node.textContent = '';
}

function setButtonBusy(button, busy, label) {
  if (!button) return;
  if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.idleText;
}

function phoneDigits(value) {
  const digits = normalizePhone(value);
  if (digits.startsWith('1')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

function formatPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  if (digits.length < 4) return `+1 (${digits}`;
  if (digits.length < 7) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(value);
}

function validPhone(value) {
  return phoneDigits(value).length === 10;
}

function authErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('email-already-in-use')) return 'An account already exists for that email. Try signing in.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) {
    return 'Email or password did not match.';
  }
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a bit and try again.';
  return 'Something went wrong. Please try again.';
}

function setAuthMode(mode) {
  const isSignup = mode === 'signup';
  el('signinForm').style.display = isSignup ? 'none' : 'grid';
  el('signupForm').style.display = isSignup ? 'grid' : 'none';
  el('signinTab').classList.toggle('active', !isSignup);
  el('signupTab').classList.toggle('active', isSignup);
  clearMessage('authMessage');
}

function setAuthedUi(user) {
  const isAuthed = Boolean(user);
  el('authPanel').style.display = isAuthed ? 'none' : 'block';
  el('profilePanel').classList.toggle('active', isAuthed);
  el('ordersPanel').classList.toggle('active', isAuthed);
  el('adminPanel').classList.remove('active');
  if (user) el('profileEmail').textContent = user.email || '';
}

function setAdminUi(user) {
  el('authPanel').style.display = 'none';
  el('profilePanel').classList.remove('active');
  el('ordersPanel').classList.remove('active');
  el('adminPanel').classList.add('active');
  el('adminAccountEmail').textContent = user?.email || '';
}

function profilePayloadFromSignup(user) {
  const firstName = el('signupFirstName').value.trim();
  const lastName = el('signupLastName').value.trim();
  const phone = formatPhone(el('signupPhone').value);
  const preferredPickupLocation = el('signupPickup').value || 'chesterfield';

  return {
    uid: user.uid,
    email: normalizeEmail(user.email),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    phone,
    phoneDigits: phoneDigits(phone),
    preferredPickupLocation,
    preferredPickupLocationLabel: LOCATION_LABELS[preferredPickupLocation] || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'VA',
    zip: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function profilePayloadFromForm(user) {
  const firstName = el('profileFirstName').value.trim();
  const lastName = el('profileLastName').value.trim();
  const phone = formatPhone(el('profilePhone').value);
  const preferredPickupLocation = el('profilePickup').value || 'chesterfield';

  return {
    uid: user.uid,
    email: normalizeEmail(user.email),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    phone,
    phoneDigits: phoneDigits(phone),
    preferredPickupLocation,
    preferredPickupLocationLabel: LOCATION_LABELS[preferredPickupLocation] || '',
    addressLine1: el('profileAddress1').value.trim(),
    addressLine2: el('profileAddress2').value.trim(),
    city: el('profileCity').value.trim(),
    state: 'VA',
    zip: el('profileZip').value.trim(),
    updatedAt: serverTimestamp()
  };
}

function fillProfile(profile = {}, user) {
  const email = normalizeEmail(profile.email || user?.email || '');
  el('profileEmail').textContent = email;
  el('profileFirstName').value = profile.firstName || '';
  el('profileLastName').value = profile.lastName || '';
  el('profilePhone').value = profile.phone || '';
  el('profilePickup').value = profile.preferredPickupLocation || 'chesterfield';
  el('profileAddress1').value = profile.addressLine1 || '';
  el('profileAddress2').value = profile.addressLine2 || '';
  el('profileCity').value = profile.city || '';
  el('profileZip').value = profile.zip || '';
}

function dateValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDateTime(value) {
  const ms = dateValue(value);
  if (!ms) return 'Date pending';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function orderItemsText(items = []) {
  if (!Array.isArray(items) || !items.length) return 'Items pending';
  return items.map((item) => `${item.name || 'Item'} x ${item.qty || 1}`).join(', ');
}

function lineTotalValue(item = {}) {
  const explicit = Number(item.lineTotal || 0);
  if (explicit > 0) return explicit;
  const price = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));
  const qty = Number(item.qty || 1);
  return Number.isFinite(price) ? price * qty : 0;
}

function orderTotalValue(order = {}) {
  const explicit = Number(order.totalPrice || 0);
  if (explicit > 0) return explicit;
  return Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + lineTotalValue(item), 0) : 0;
}

function orderPaymentLabel(order = {}) {
  const method = String(order.paymentMethod || '').trim();
  if (method) return method.charAt(0).toUpperCase() + method.slice(1);
  if (order.paymentCollected) return 'Collected at pickup';
  if ((order.payment || '').toLowerCase() === 'paid') return 'Paid';
  return 'Pay at pickup';
}

function orderPaymentStatus(order = {}) {
  if (order.paymentCollected || (order.payment || '').toLowerCase() === 'paid') return 'Paid';
  return 'Pending';
}

function orderStatusMessage(order = {}) {
  const status = String(order.status || 'pending').toLowerCase();
  if (status === 'fulfilled') return 'Picked up. Thank you for ordering from Shrish.';
  if (status === 'no_show') return 'Pickup was missed. If plans change next time, a quick WhatsApp note helps us offer the items to another customer.';
  if (status === 'cancelled') return 'This order was cancelled. You can start a fresh order anytime.';
  return 'Order received. Please follow WhatsApp updates for pickup timing and exact address details.';
}

function orderWhatsAppHref(order = {}) {
  const number = order.orderNumber || order.id || 'my order';
  const text = `Hi Shrish! I have a question about ${number}.`;
  return `https://wa.me/17653255577?text=${encodeURIComponent(text)}`;
}

function normalizeCartItem(item = {}) {
  return {
    id: item.id || String(item.name || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: item.name || 'Item',
    price: item.price || formatCurrency(lineTotalValue(item)),
    unit: item.unit || '',
    qty: Number(item.qty || 1)
  };
}

function renderAccountInsights(orders = []) {
  const panel = el('accountInsights');
  if (!panel) return;

  if (!orders.length) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  const totalSpent = orders.reduce((sum, order) => sum + orderTotalValue(order), 0);
  const pickupCounts = new Map();
  const itemCounts = new Map();

  orders.forEach((order) => {
    const location = order.locationLabel || LOCATION_LABELS[order.location] || 'Pickup';
    pickupCounts.set(location, (pickupCounts.get(location) || 0) + 1);
    (order.items || []).forEach((item) => {
      const name = item.name || 'Item';
      itemCounts.set(name, (itemCounts.get(name) || 0) + Number(item.qty || 1));
    });
  });

  const favoritePickup = [...pickupCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Pickup';
  const favoriteItem = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Shrish picks';

  panel.style.display = 'grid';
  panel.innerHTML = `
    <div class="account-insight"><strong>${orders.length}</strong><span>Order${orders.length === 1 ? '' : 's'} placed</span></div>
    <div class="account-insight"><strong>${escapeHtml(formatCurrency(totalSpent))}</strong><span>Estimated total</span></div>
    <div class="account-insight"><strong>${escapeHtml(favoritePickup)}</strong><span>Favorite pickup</span></div>
    <div class="account-insight"><strong>${escapeHtml(favoriteItem)}</strong><span>Most ordered</span></div>`;
}

function renderOrderItemsTable(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '<div class="order-note">Items are still being prepared for this order summary.</div>';
  }

  return `
    <div class="order-items-table">
      <div class="order-items-row order-items-head">
        <div>Item</div><div class="order-items-qty">Qty</div><div class="order-items-price">Line</div>
      </div>
      ${items.map((item) => `
        <div class="order-items-row">
          <div><strong>${escapeHtml(item.name || 'Item')}</strong>${item.unit ? `<br><span>${escapeHtml(item.unit)}</span>` : ''}</div>
          <div class="order-items-qty">${escapeHtml(String(item.qty || 1))}</div>
          <div class="order-items-price">${escapeHtml(formatCurrency(lineTotalValue(item)))}</div>
        </div>`).join('')}
    </div>`;
}

function bindOrderHistoryActions(orders = []) {
  document.querySelectorAll('[data-order-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.order-history-card');
      const isOpen = card?.classList.toggle('open');
      button.textContent = isOpen ? 'Hide details' : 'View details';
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });

  document.querySelectorAll('[data-order-reorder]').forEach((button) => {
    button.addEventListener('click', () => {
      const order = orders.find((item) => item.id === button.dataset.orderReorder);
      if (!order?.items?.length) return;
      sessionStorage.setItem('shrish_cart', JSON.stringify(order.items.map(normalizeCartItem)));
      trackAccountEvent('customer_order_reordered', {
        order_number: order.orderNumber || order.id || ''
      });
      window.location.href = 'order.html';
    });
  });

  document.querySelectorAll('[data-order-print]').forEach((button) => {
    button.addEventListener('click', () => {
      const order = orders.find((item) => item.id === button.dataset.orderPrint);
      if (order) printOrderSummary(order);
    });
  });
}

function printOrderSummary(order = {}) {
  const win = window.open('', '_blank', 'width=720,height=860');
  if (!win) return;

  const rows = (order.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name || 'Item')}</td>
      <td>${escapeHtml(String(item.qty || 1))}</td>
      <td>${escapeHtml(formatCurrency(lineTotalValue(item)))}</td>
    </tr>`).join('');

  win.document.write(`<!doctype html><html><head><title>${escapeHtml(order.orderNumber || 'Shrish Order')}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#2b2218;padding:28px}
      h1{font-size:24px;margin:0 0 8px} p{margin:5px 0;color:#66513a}
      table{width:100%;border-collapse:collapse;margin-top:18px}
      th,td{border-bottom:1px solid #e0d2bd;padding:10px;text-align:left}
      th:last-child,td:last-child{text-align:right}
    </style></head><body>
      <h1>Shrish Order Summary</h1>
      <p><strong>${escapeHtml(order.orderNumber || order.id || 'Order')}</strong></p>
      <p>${escapeHtml(formatDateTime(order.createdAt))} - ${escapeHtml(order.locationLabel || LOCATION_LABELS[order.location] || 'Pickup')}</p>
      <p>Payment: ${escapeHtml(orderPaymentLabel(order))} (${escapeHtml(orderPaymentStatus(order))})</p>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="text-align:right;margin-top:18px"><strong>Total: ${escapeHtml(formatCurrency(orderTotalValue(order)))}</strong></p>
    </body></html>`);
  win.document.close();
  win.print();
}

function renderOrders(orders = []) {
  const list = el('ordersList');
  if (!list) return;

  if (!orders.length) {
    currentOrders = [];
    renderAccountInsights([]);
    list.innerHTML = '<div class="empty-orders">No signed-in orders yet. Your next order will appear here after checkout.</div>';
    return;
  }

  const sorted = [...orders].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  currentOrders = sorted;
  renderAccountInsights(sorted);
  list.innerHTML = sorted.map((order) => {
    const total = orderTotalValue(order);
    const status = String(order.status || 'pending').replace(/_/g, ' ');
    const location = order.locationLabel || LOCATION_LABELS[order.location] || 'Pickup location pending';
    const paymentMethod = orderPaymentLabel(order);
    const paymentStatus = orderPaymentStatus(order);
    const orderNumber = order.orderNumber || order.id || 'Order received';
    return `
      <article class="order-history-card" data-order-id="${escapeHtml(order.id)}">
        <div class="order-history-top">
          <div>
            <div class="order-history-id">${escapeHtml(orderNumber)}</div>
            <div class="order-history-date">${escapeHtml(formatDateTime(order.createdAt))}</div>
          </div>
          <span class="order-history-status">${escapeHtml(status)}</span>
        </div>
        <div class="order-history-items">${escapeHtml(orderItemsText(order.items))}</div>
        <div class="order-history-meta">
          <span>${escapeHtml(location)}</span>
          <span>${escapeHtml(formatCurrency(total))}</span>
          <span>${escapeHtml(paymentMethod)}</span>
        </div>
        <div class="order-history-actions">
          <button class="order-mini-btn primary" type="button" data-order-toggle="${escapeHtml(order.id)}" aria-expanded="false">View details</button>
          <button class="order-mini-btn" type="button" data-order-reorder="${escapeHtml(order.id)}">Order again</button>
          <a class="order-mini-btn" href="${escapeHtml(orderWhatsAppHref(order))}" target="_blank" rel="noopener">Ask about this</a>
        </div>
        <div class="order-detail-panel">
          <div class="order-detail-grid">
            <div class="order-detail-cell"><span>Order number</span><strong>${escapeHtml(orderNumber)}</strong></div>
            <div class="order-detail-cell"><span>Pickup</span><strong>${escapeHtml(location)}</strong></div>
            <div class="order-detail-cell"><span>Payment method</span><strong>${escapeHtml(paymentMethod)}</strong></div>
            <div class="order-detail-cell"><span>Payment status</span><strong>${escapeHtml(paymentStatus)}</strong></div>
            <div class="order-detail-cell"><span>Total boxes</span><strong>${escapeHtml(String(order.totalBoxes || (order.items || []).reduce((sum, item) => sum + Number(item.qty || 1), 0)))}</strong></div>
            <div class="order-detail-cell"><span>Estimated total</span><strong>${escapeHtml(formatCurrency(total))}</strong></div>
          </div>
          ${renderOrderItemsTable(order.items || [])}
          <div class="order-note">${escapeHtml(orderStatusMessage(order))}</div>
          <div class="order-history-actions">
            <button class="order-mini-btn" type="button" data-order-print="${escapeHtml(order.id)}">Print summary</button>
            <a class="order-mini-btn" href="shop.html">Shop fresh arrivals</a>
          </div>
        </div>
      </article>`;
  }).join('');
  bindOrderHistoryActions(sorted);
}

function subscribeOrders(user) {
  unsubOrders?.();
  unsubOrders = null;

  if (!user) {
    renderOrders([]);
    return;
  }

  const ordersQuery = query(collection(db, 'orders'), where('customerUid', '==', user.uid));
  unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
    const orders = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    renderOrders(orders);
  }, (error) => {
    console.error('Could not load customer orders', error);
    el('ordersList').innerHTML = '<div class="empty-orders">We could not load order history right now.</div>';
  });
}

async function loadProfile(user) {
  const snap = await getDoc(profileRef(user.uid)).catch(() => null);
  if (snap?.exists()) {
    fillProfile(snap.data() || {}, user);
    return;
  }

  const fallback = {
    email: user.email || '',
    preferredPickupLocation: 'chesterfield',
    state: 'VA'
  };
  fillProfile(fallback, user);
}

function bindForms() {
  document.querySelectorAll('.account-tab').forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.mode));
  });

  ['signupPhone', 'profilePhone'].forEach((id) => {
    el(id)?.addEventListener('blur', (event) => {
      event.target.value = formatPhone(event.target.value);
    });
  });

  el('signinForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('authMessage');

    const button = event.submitter;
    const email = normalizeEmail(el('signinEmail').value);
    const password = el('signinPassword').value;
    if (!validEmail(email) || !password) {
      showMessage('authMessage', 'error', 'Enter your email and password.');
      return;
    }

    try {
      setButtonBusy(button, true, 'Signing in...');
      await signInWithEmailAndPassword(auth, email, password);
      trackAccountEvent('customer_signed_in');
    } catch (error) {
      showMessage('authMessage', 'error', authErrorMessage(error));
    } finally {
      setButtonBusy(button, false);
    }
  });

  el('signupForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('authMessage');

    const button = event.submitter;
    const email = normalizeEmail(el('signupEmail').value);
    const password = el('signupPassword').value;
    if (email === adminEmail()) {
      showMessage('authMessage', 'error', 'Use the admin dashboard for this email.');
      return;
    }
    if (!validEmail(email)) {
      showMessage('authMessage', 'error', 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      showMessage('authMessage', 'error', 'Use a password with at least 6 characters.');
      return;
    }
    if (!validPhone(el('signupPhone').value)) {
      showMessage('authMessage', 'error', 'Enter a valid 10-digit phone number.');
      return;
    }

    try {
      setButtonBusy(button, true, 'Creating...');
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(profileRef(credential.user.uid), profilePayloadFromSignup(credential.user), { merge: true });
      showMessage('profileMessage', 'ok', 'Account created. Your checkout details are saved.');
      trackAccountEvent('customer_account_created');
    } catch (error) {
      showMessage('authMessage', 'error', authErrorMessage(error));
    } finally {
      setButtonBusy(button, false);
    }
  });

  el('resetPasswordBtn')?.addEventListener('click', async () => {
    const email = normalizeEmail(el('signinEmail').value);
    if (!validEmail(email)) {
      showMessage('authMessage', 'error', 'Enter your email first, then reset password.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      showMessage('authMessage', 'ok', 'Password reset email sent.');
    } catch (error) {
      showMessage('authMessage', 'error', authErrorMessage(error));
    }
  });

  el('profileForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('profileMessage');
    const user = auth.currentUser;
    if (!user) return;

    if (!validPhone(el('profilePhone').value)) {
      showMessage('profileMessage', 'error', 'Enter a valid 10-digit phone number.');
      return;
    }

    const button = event.submitter;
    try {
      setButtonBusy(button, true, 'Saving...');
      await setDoc(profileRef(user.uid), profilePayloadFromForm(user), { merge: true });
      showMessage('profileMessage', 'ok', 'Details saved for future checkout.');
      trackAccountEvent('customer_profile_saved');
    } catch (error) {
      console.error('Profile save failed', error);
      showMessage('profileMessage', 'error', 'Could not save details right now.');
    } finally {
      setButtonBusy(button, false);
    }
  });

  el('signOutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    trackAccountEvent('customer_signed_out');
  });

  el('adminSignOutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    trackAccountEvent('admin_account_signed_out');
  });
}

function showDisabledState() {
  setAuthedUi(null);
  el('signinForm').style.display = 'none';
  el('signupForm').style.display = 'none';
  document.querySelector('.account-tabs').style.display = 'none';
  showMessage('authMessage', 'info', 'Customer accounts are being prepared and are not enabled yet.');
}

function init() {
  if (!customerAccountsEnabled()) {
    showDisabledState();
    return;
  }

  bindForms();
  setAuthMode('signin');

  onAuthStateChanged(auth, async (user) => {
    clearMessage('authMessage');
    unsubOrders?.();
    unsubOrders = null;

    if (!user) {
      setAuthedUi(null);
      renderOrders([]);
      return;
    }

    if (isAdminUser(user)) {
      setAdminUi(user);
      renderOrders([]);
      return;
    }

    setAuthedUi(user);
    await loadProfile(user);
    subscribeOrders(user);
  });
}

init();
