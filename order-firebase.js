import { db, collection, addDoc, query, where, getDocs, limit, serverTimestamp, normalizePhone, escapeHtml, formatCurrency } from './firebase-app.js';

let cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
let selectedLoc = '';
let isSubmitting = false;

function updateNavCart() {
  const total = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const badge = document.getElementById('navCartBadge');
  if (badge) badge.textContent = total;
  const navCartLink = document.getElementById('navCartLink');
  if (navCartLink && total > 0) navCartLink.href = 'order.html';
}

function renderCartReview() {
  // FIX: was 'cartReview', correct ID is 'cartReviewContainer'
  const container = document.getElementById('cartReviewContainer');
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = `<div class="cart-empty-note"><div class="en-icon">🛒</div><p>Your cart is empty. <a href="shop.html" style="color:var(--saffron);font-weight:700">Go back to shop</a></p></div>`;
    return;
  }
  const totalQty = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalPrice = cart.reduce((sum, item) => {
    const num = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));
    return sum + (isNaN(num) ? 0 : num * (item.qty || 1));
  }, 0);
  container.innerHTML =
    cart
      .map((item) => {
        const imgHtml = item.image
          ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.textContent='🥭'">`
          : '🥭';
        return `<div class="review-item">
  <div class="ri-thumb">${imgHtml}</div>
  <div class="ri-info">
    <div class="ri-name">${escapeHtml(item.name)}</div>
    <div class="ri-price">${escapeHtml(item.price)} · ${escapeHtml(item.unit)}</div>
  </div>
  <div class="ri-qty-ctrl">
    <button class="ri-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="-1">−</button>
    <span>${item.qty}</span>
    <button class="ri-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="1">+</button>
    <button class="ri-remove" data-id="${escapeHtml(item.id)}" title="Remove">✕</button>
  </div>
</div>`;
      })
      .join('') +
    `<div class="review-total">
      <span>Total</span>
      <div style="text-align:right;line-height:1.4">
        <div style="font-size:13px;color:var(--text-light,#888)">${totalQty} box${totalQty !== 1 ? 'es' : ''}</div>
        <div style="font-size:17px;font-weight:700;color:var(--saffron,#C8791A)">${formatCurrency(totalPrice)}</div>
      </div>
    </div>`;

  container.querySelectorAll('.ri-qty-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta, 10);
      const item = cart.find((x) => x.id === id);
      if (!item) return;
      item.qty = Math.max(1, item.qty + delta);
      sessionStorage.setItem('shrish_cart', JSON.stringify(cart));
      renderCartReview();
      updateNavCart();
    });
  });
  container.querySelectorAll('.ri-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart = cart.filter((x) => x.id !== btn.dataset.id);
      sessionStorage.setItem('shrish_cart', JSON.stringify(cart));
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
  if (document.getElementById('err-phone')?.style.display === 'block')
    errors.push(document.getElementById('err-phone').textContent || 'Valid phone number required');
  if (document.getElementById('err-email')?.style.display === 'block')
    errors.push(document.getElementById('err-email').textContent || 'Valid email required');
  if (!selectedLoc) errors.push('Please select a pickup location (Short Pump or Chesterfield)');
  if (!cart.length) errors.push('Your cart is empty — go back to shop and add items');
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

async function hasDuplicatePendingOrder(phone) {
  // Customers only have CREATE permission on orders (not READ).
  // If the read is blocked by Firestore rules, skip the check silently
  // rather than crashing the entire order submission.
  try {
    const phoneDigits = normalizePhone(phone);
    const ordersRef = collection(db, 'orders');
    const duplicateQuery = query(
      ordersRef,
      where('phoneDigits', '==', phoneDigits),
      where('status', '==', 'pending'),
      limit(1)
    );
    const snapshot = await getDocs(duplicateQuery);
    return !snapshot.empty;
  } catch (e) {
    // Permission denied — can't check, assume no duplicate and let order proceed
    console.warn('Duplicate check skipped (permissions):', e.message);
    return false;
  }
}

function bindFormUi() {
  document.querySelectorAll('.loc-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedLoc = card.dataset.loc;
      document.querySelectorAll('.loc-card').forEach((c) => c.classList.remove('selected'));
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
      if (!digits.length) { phoneCounter.textContent = ''; return; }
      if (digits.length < 10) {
        phoneCounter.textContent = `${digits.length}/10 digits`;
        phoneCounter.className = 'phone-counter bad';
      } else {
        phoneCounter.textContent = `✓ ${digits.length} digits`;
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
        errEl.textContent = `Too short — need 10 digits, you entered ${digits.length}`;
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
          ? 'Invalid format — check after the @ (e.g. name@gmail.com)'
          : 'Missing @ symbol — try name@gmail.com';
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
  ok =
    validateField(
      'phone',
      phoneDigits.length >= 10 && phoneDigits.length <= 15,
      phoneDigits.length < 10
        ? `Phone too short — need 10 digits, you entered ${phoneDigits.length}`
        : 'Invalid phone number'
    ) && ok;
  ok =
    validateField(
      'email',
      emailValid,
      email.includes('@') ? 'Invalid email format — e.g. name@gmail.com' : 'Missing @ — e.g. name@gmail.com'
    ) && ok;

  if (!cart.length) {
    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    list.innerHTML = '<li>Your cart is empty — go back to shop and add items first</li>';
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

  if (!ok) { rebuildErrorBanner(); return; }

  try {
    isSubmitting = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

    if (await hasDuplicatePendingOrder(phone)) {
      const banner = document.getElementById('errorBanner');
      const list = document.getElementById('errorList');
      list.innerHTML = `<li>An order with phone <strong>${escapeHtml(phone)}</strong> is already pending.</li><li>To modify it, call us at <a href="tel:+17653255577" style="color:inherit;font-weight:700">+1 (765) 325-5577</a> or <a href="https://wa.me/17653255577" style="color:inherit;font-weight:700">WhatsApp</a>.</li>`;
      banner.className = 'error-banner show hard-error';
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const orderNumber = `SHR-${Date.now().toString().slice(-6)}`;
    const locLabel = selectedLoc === 'shortpump' ? 'Short Pump, VA' : 'Chesterfield, VA';
    const order = {
      orderNumber,
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
        lineTotal: parseFloat(String(item.price || '0').replace(/[^0-9.]/g, '')) * (item.qty || 1),
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
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'orders'), order);

    sessionStorage.removeItem('shrish_cart');
    cart = [];
    updateNavCart();

    document.getElementById('checkoutWrap').style.display = 'none';
    document.getElementById('successScreen').style.display = 'block';
    document.getElementById('successOrderNum').textContent = `Order #${orderNumber}`;

    const itemLines = order.items
      .map((item) => `<div style="font-size:13px">• ${escapeHtml(item.name)} × ${item.qty} box${item.qty !== 1 ? 'es' : ''}</div>`)
      .join('');
    document.getElementById('successSummary').innerHTML = `
      <div class="ss-row"><span>Items</span><span style="display:flex;flex-direction:column;gap:3px">${itemLines}</span></div>
      <div class="ss-row"><span>Total</span><span style="color:var(--saffron);font-weight:700">${formatCurrency(order.totalPrice)}</span></div>
      <div class="ss-row"><span>Pickup</span><span>${escapeHtml(locLabel)}</span></div>
      <div class="ss-row"><span>Name</span><span>${escapeHtml(firstName)} ${escapeHtml(lastName)}</span></div>
      <div class="ss-row"><span>Phone</span><span>${escapeHtml(phone)}</span></div>
      <div class="ss-row"><span>Payment</span><span style="color:#2E7D32;font-weight:700">💵 Cash at Pickup</span></div>
      <div class="ss-row"><span>Reference</span><span>${escapeHtml(docRef.id)}</span></div>`;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Order submit failed', error);
    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    list.innerHTML = '<li>We could not submit your order right now. Please try again in a minute.</li>';
    banner.className = 'error-banner show hard-error';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🥭 Place Order — Pay at Pickup';
    }
  }
}

function init() {
  renderCartReview();
  updateNavCart();
  bindFormUi();
}

init();