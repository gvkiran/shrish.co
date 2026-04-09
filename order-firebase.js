import {
  db,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  normalizePhone,
  escapeHtml,
  formatCurrency
} from './firebase-app.js';

let cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
let selectedLoc = '';
let isSubmitting = false;
const CONFIRMATION_WAIT_MS = 15000;

function updateNavCart() {
  const total = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const badge = document.getElementById('navCartBadge');
  if (badge) badge.textContent = total;

  const mobileCount = document.getElementById('mobileCartCount');
  if (mobileCount) mobileCount.textContent = total;

  const navCartLink = document.getElementById('navCartLink');
  if (navCartLink && total > 0) navCartLink.href = 'order.html';
}

function saveCart() {
  sessionStorage.setItem('shrish_cart', JSON.stringify(cart));
}

function renderCartReview() {
  const container = document.getElementById('cartReviewContainer');
  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `<div class="cart-empty-note"><div class="en-icon">&#128722;</div><p>Your cart is empty. <a href="shop.html" style="color:var(--saffron);font-weight:700">Go back to shop</a></p></div>`;
    return;
  }

  const totalQty = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalPrice = cart.reduce((sum, item) => {
    const num = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));
    return sum + (Number.isNaN(num) ? 0 : num * (item.qty || 1));
  }, 0);

  container.innerHTML =
    `<div class="review-table">
      <div class="review-head">
        <div>Item</div>
        <div style="text-align:center">Qty</div>
        <div style="text-align:right">Price</div>
        <div></div>
      </div>` +
    cart
      .map((item) => {
        const qty = Number(item.qty || 0);
        const unitPrice = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));
        const lineTotal = Number.isNaN(unitPrice) ? 0 : unitPrice * qty;
        const unitLabel = String(item.unit || '').trim();

        return `<div class="review-item">
  <div class="ri-info">
    <div class="ri-name">${escapeHtml(item.name)}</div>
    <div class="ri-unit">${escapeHtml(unitLabel)}</div>
  </div>
  <div class="ri-qty">${qty}</div>
  <div class="ri-price">${formatCurrency(lineTotal)}</div>
  <div class="ri-qty-ctrl">
    <button type="button" class="ri-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="-1">&minus;</button>
    <button type="button" class="ri-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="1">+</button>
    <button type="button" class="ri-remove" data-id="${escapeHtml(item.id)}" title="Remove">&times;</button>
  </div>
</div>`;
      })
      .join('') +
    `<div class="review-total">
      <div class="rt-label">Total</div>
      <div class="rt-qty">${totalQty}</div>
      <div>
        <div class="rt-price">${formatCurrency(totalPrice)}</div>
        <div class="review-total-note">Estimated total</div>
      </div>
      <div></div>
    </div>
  </div>`;

  container.querySelectorAll('.ri-qty-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta, 10);
      const item = cart.find((entry) => entry.id === id);
      if (!item) return;

      item.qty = Math.max(1, item.qty + delta);
      saveCart();
      renderCartReview();
      updateNavCart();
    });
  });

  container.querySelectorAll('.ri-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart = cart.filter((entry) => entry.id !== btn.dataset.id);
      saveCart();
      renderCartReview();
      updateNavCart();
    });
  });
}

function rebuildErrorBanner() {
  const banner = document.getElementById('errorBanner');
  const list = document.getElementById('errorList');
  if (!banner || !list) return;

  const errors = [];
  if (document.getElementById('err-firstName')?.style.display === 'block') errors.push('First name is required');
  if (document.getElementById('err-lastName')?.style.display === 'block') errors.push('Last name is required');
  if (document.getElementById('err-phone')?.style.display === 'block') {
    errors.push(document.getElementById('err-phone').textContent || 'Valid phone number required');
  }
  if (document.getElementById('err-email')?.style.display === 'block') {
    errors.push(document.getElementById('err-email').textContent || 'Valid email required');
  }
  if (!selectedLoc) errors.push('Please select a pickup location (Short Pump or Chesterfield)');
  if (!cart.length) errors.push('Your cart is empty - go back to shop and add items');

  if (!errors.length) {
    banner.className = 'error-banner';
    return;
  }

  list.innerHTML = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('');
  banner.className = 'error-banner show';
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function validateField(id, condition, message) {
  const el = document.getElementById(id);
  const err = document.getElementById(`err-${id}`);
  if (!el) return condition;

  if (!condition) {
    el.classList.add('error');
    if (err) {
      err.textContent = message || err.textContent;
      err.style.display = 'block';
    }
    return false;
  }

  el.classList.remove('error');
  if (err) err.style.display = 'none';
  return true;
}

function orderLockRef(phoneDigits) {
  return doc(db, 'order_locks', phoneDigits);
}

function showDuplicateOrderMessage(phone) {
  const banner = document.getElementById('errorBanner');
  const list = document.getElementById('errorList');
  if (!banner || !list) return;

  list.innerHTML = `
    <li>You already have an active order for <strong>${escapeHtml(phone)}</strong>.</li>
    <li>If you would like to modify it, please contact us on <a href="https://wa.me/17653255577" target="_blank" rel="noopener" style="color:inherit;font-weight:700">WhatsApp</a>.</li>`;
  banner.className = 'error-banner show hard-error';
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function waitForOrderConfirmationNumber(orderRef) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONFIRMATION_WAIT_MS) {
    const snap = await getDoc(orderRef);
    const orderNumber = snap.data()?.orderNumber;
    if (typeof orderNumber === 'string' && /^SHR-\d+$/.test(orderNumber)) {
      return orderNumber;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return '';
}

function bindFormUi() {
  document.querySelectorAll('.loc-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedLoc = card.dataset.loc;
      document.querySelectorAll('.loc-card').forEach((entry) => entry.classList.remove('selected'));
      card.classList.add('selected');
      const errEl = document.getElementById('err-location');
      if (errEl) errEl.style.display = 'none';
      rebuildErrorBanner();
    });

    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  const phoneInput = document.getElementById('phone');
  const phoneCounter = document.getElementById('phoneCounter');
  if (phoneInput && phoneCounter) {
    phoneInput.addEventListener('input', () => {
      const digits = normalizePhone(phoneInput.value);
      if (!digits.length) {
        phoneCounter.textContent = '';
        return;
      }

      if (digits.length < 10) {
        phoneCounter.textContent = `${digits.length}/10 digits`;
        phoneCounter.className = 'phone-counter bad';
      } else {
        phoneCounter.textContent = `${digits.length} digits`;
        phoneCounter.className = 'phone-counter ok';
        document.getElementById('err-phone').style.display = 'none';
        phoneInput.classList.remove('error');
      }
    });

    phoneInput.addEventListener('blur', () => {
      const digits = normalizePhone(phoneInput.value);
      if (!phoneInput.value.trim()) return;

      const errEl = document.getElementById('err-phone');
      if (digits.length < 10) {
        errEl.textContent = `Too short - need 10 digits, you entered ${digits.length}`;
        errEl.style.display = 'block';
        phoneInput.classList.add('error');
      } else {
        errEl.style.display = 'none';
        phoneInput.classList.remove('error');
      }
    });
  }

  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('blur', () => {
      const val = emailInput.value.trim();
      if (!val) return;

      const errEl = document.getElementById('err-email');
      const valid = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(val);
      if (!valid) {
        errEl.textContent = val.includes('@')
          ? 'Invalid format - check after the @ (e.g. name@gmail.com)'
          : 'Missing @ symbol - try name@gmail.com';
        errEl.style.display = 'block';
        emailInput.classList.add('error');
      } else {
        errEl.style.display = 'none';
        emailInput.classList.remove('error');
      }
    });
  }

  document.getElementById('submitBtn')?.addEventListener('click', submitOrder);
}

async function submitOrder() {
  if (isSubmitting) return;

  const submitBtn = document.getElementById('submitBtn');
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const referral = document.getElementById('referral').value;
  const notes = document.getElementById('notes').value.trim();
  const phoneDigits = normalizePhone(phone);
  const emailValid = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);

  let ok = true;
  ok = validateField('firstName', firstName.length >= 2, 'First name must be at least 2 characters') && ok;
  ok = validateField('lastName', lastName.length >= 2, 'Last name must be at least 2 characters') && ok;
  ok = validateField(
    'phone',
    phoneDigits.length >= 10 && phoneDigits.length <= 15,
    phoneDigits.length < 10
      ? `Phone too short - need 10 digits, you entered ${phoneDigits.length}`
      : 'Invalid phone number'
  ) && ok;
  ok = validateField(
    'email',
    emailValid,
    email.includes('@') ? 'Invalid email format - e.g. name@gmail.com' : 'Missing @ - e.g. name@gmail.com'
  ) && ok;

  if (!cart.length) {
    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    list.innerHTML = '<li>Your cart is empty - go back to shop and add items first</li>';
    banner.className = 'error-banner show hard-error';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!selectedLoc) {
    document.getElementById('err-location').style.display = 'block';
    ok = false;
  } else {
    document.getElementById('err-location').style.display = 'none';
  }

  if (!ok) {
    rebuildErrorBanner();
    return;
  }

  try {
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    const lockRef = orderLockRef(phoneDigits);
    const lockSnap = await getDoc(lockRef);
    if (lockSnap.exists()) {
      showDuplicateOrderMessage(phone);
      return;
    }

    const locLabel = selectedLoc === 'shortpump' ? 'Short Pump, VA' : 'Chesterfield, VA';
    const orderRef = doc(collection(db, 'orders'));
    const order = {
      orderNumber: '',
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      phone,
      phoneDigits,
      email,
      location: selectedLoc,
      locationLabel: locLabel,
      referral: referral || 'Not specified',
      notes: notes || '',
      items: cart.map((item) => ({
        id: item.id,
        name: item.name || 'Unknown',
        price: item.price || 'TBD',
        unit: item.unit || '',
        qty: item.qty || 1,
        lineTotal: parseFloat(String(item.price || '0').replace(/[^0-9.]/g, '')) * (item.qty || 1)
      })),
      totalBoxes: cart.reduce((sum, item) => sum + (item.qty || 1), 0),
      totalPrice: cart.reduce((sum, item) => {
        const num = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));
        return sum + (Number.isNaN(num) ? 0 : num * (item.qty || 1));
      }, 0),
      payment: 'pending',
      status: 'pending',
      source: 'website',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await runTransaction(db, async (transaction) => {
      const pendingLock = await transaction.get(lockRef);
      if (pendingLock.exists()) {
        throw new Error('DUPLICATE_PENDING_ORDER');
      }

      transaction.set(orderRef, order);
      transaction.set(lockRef, {
        phoneDigits,
        orderId: orderRef.id,
        status: 'pending',
        updatedAt: serverTimestamp()
      });
    });

    sessionStorage.removeItem('shrish_cart');
    cart = [];
    updateNavCart();

    document.getElementById('checkoutWrap').style.display = 'none';
    document.getElementById('successScreen').style.display = 'block';
    document.getElementById('successOrderNum').textContent = 'Generating confirmation number...';

    const confirmationNumber = await waitForOrderConfirmationNumber(orderRef);
    const displayNumber = confirmationNumber || orderRef.id;
    document.getElementById('successOrderNum').textContent = confirmationNumber
      ? `Order Confirmation No: ${confirmationNumber}`
      : `Order received - Ref ${orderRef.id}`;

    const itemLines = order.items
      .map((item) => {
        const qty = Number(item.qty || 0);
        return `<div class="ss-item">
          <div class="ss-item-name">${escapeHtml(item.name)}</div>
          <div class="ss-item-qty">${qty}</div>
          <div class="ss-item-price">${escapeHtml(item.price || '')}</div>
        </div>`;
      })
      .join('');
    const totalQty = order.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    document.getElementById('successSummary').innerHTML = `
      <div class="ss-table">
        <div class="ss-head">
          <div>Item</div>
          <div class="ss-item-qty">Qty</div>
          <div class="ss-item-price">Price</div>
        </div>
        ${itemLines}
        <div class="ss-total">
          <div>Total</div>
          <div class="ss-total-qty">${totalQty}</div>
          <div class="ss-total-price">${formatCurrency(order.totalPrice)}</div>
        </div>
      </div>
      <div class="ss-row"><span>Pickup</span><span>${escapeHtml(locLabel)}</span></div>
      <div class="ss-row"><span>Name</span><span>${escapeHtml(firstName)} ${escapeHtml(lastName)}</span></div>
      <div class="ss-row"><span>Phone</span><span>${escapeHtml(phone)}</span></div>
      <div class="ss-row"><span>Payment</span><span style="color:#2E7D32;font-weight:700">Pay at Pickup</span></div>
      <div class="ss-row"><span>Order Confirmation No</span><span>${escapeHtml(displayNumber)}</span></div>`;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Order submit failed', error);

    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    if (
      error?.message === 'DUPLICATE_PENDING_ORDER' ||
      error?.code === 'permission-denied'
    ) {
      const lockRef = orderLockRef(phoneDigits);
      const existingLock = await getDoc(lockRef).catch(() => null);
      if (existingLock?.exists()) {
        showDuplicateOrderMessage(phone);
        return;
      }

      list.innerHTML = '<li>You already have an active order. If you would like to modify it, please contact us on WhatsApp.</li>';
    } else {
      list.innerHTML = '<li>We could not submit your order right now. Please try again in a minute.</li>';
    }
    banner.className = 'error-banner show hard-error';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place Order - Pay at Pickup';
    }
  }
}

function init() {
  renderCartReview();
  updateNavCart();
  bindFormUi();
}

init();
