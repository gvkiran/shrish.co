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

function renderOrders(orders = []) {
  const list = el('ordersList');
  if (!list) return;

  if (!orders.length) {
    list.innerHTML = '<div class="empty-orders">No signed-in orders yet. Your next order will appear here after checkout.</div>';
    return;
  }

  const sorted = [...orders].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  list.innerHTML = sorted.map((order) => {
    const total = Number(order.totalPrice || 0);
    const status = String(order.status || 'pending').replace(/_/g, ' ');
    const location = order.locationLabel || LOCATION_LABELS[order.location] || 'Pickup location pending';
    return `
      <article class="order-history-card">
        <div class="order-history-top">
          <div>
            <div class="order-history-id">${escapeHtml(order.orderNumber || order.id || 'Order received')}</div>
            <div class="order-history-date">${escapeHtml(formatDateTime(order.createdAt))}</div>
          </div>
          <span class="order-history-status">${escapeHtml(status)}</span>
        </div>
        <div class="order-history-items">${escapeHtml(orderItemsText(order.items))}</div>
        <div class="order-history-meta">
          <span>${escapeHtml(location)}</span>
          <span>${escapeHtml(formatCurrency(total))}</span>
          <span>${escapeHtml(order.payment || 'pending')}</span>
        </div>
      </article>`;
  }).join('');
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
