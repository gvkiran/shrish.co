import {
  db,
  auth,
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  onSnapshot,
  onAuthStateChanged,
  cloudFunctions,
  httpsCallable,
  serverTimestamp,
  normalizePhone,
  escapeHtml,
  formatCurrency
} from './firebase-app.js';

let cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
let selectedLoc = '';
let selectedFulfillmentType = 'pickup';
let isSubmitting = false;
let currentCustomer = null;
let currentCustomerProfile = null;
// Expose Firestore for refund module
window._firestoreExports = { collection, doc, updateDoc, addDoc, onSnapshot };

let selectedPaymentMethod = 'pickup';
let guestStripeConfirmed = false;
const RECENT_ORDER_CLAIM_KEY = 'shrish_recent_order_claim';
const CHECKOUT_ACCOUNT_PREFILL_KEY = 'shrish_checkout_account_prefill';
const CONFIRMATION_WAIT_MS = 30000;
const createStripeCheckoutSession = httpsCallable(cloudFunctions, 'createStripeCheckoutSession');
const LOCATION_LABELS = {
  shortpump: 'Short Pump, VA',
  chesterfield: 'Chesterfield, VA',
  mechanicsville: 'Mechanicsville, VA'
};
const VIRGINIA_SALES_TAX_RATE = Number(window.SHRISH_APP_CONFIG?.virginiaSalesTaxRate ?? 0.01);
const VIRGINIA_SALES_TAX_LABEL = 'Virginia sales tax';
const SHIPPING_STANDARD_AMOUNT = Number(window.SHRISH_APP_CONFIG?.standardShippingAmount ?? 8.99);
const SHIPPING_FREE_THRESHOLD = Number(window.SHRISH_APP_CONFIG?.freeShippingThreshold ?? 75);
const SHIPPING_LABEL = 'Standard shipping';
const GOOGLE_MAPS_API_KEY = String(window.SHRISH_APP_CONFIG?.googleMapsApiKey || '').trim();
const MANGO_CATEGORY_HINTS = new Set([
  'mangoes',
  'mango',
  'fruits',
  'fruits/mangoes'
]);
const MANGO_NAME_HINTS = [
  'alphonso',
  'hapus',
  'banganapalli',
  'banginapalli',
  'safeda',
  'kesar',
  'himayat',
  'imam pasand',
  'rasalu',
  'dasheri',
  'langra',
  'mallika',
  'mango box'
];
const NON_MANGO_NAME_HINTS = [
  'pickle',
  'podi',
  'powder',
  'putharekulu',
  'jelly',
  'thandra',
  'sweet',
  'snack',
  'gongura',
  'avakai',
  'mango ginger'
];

function customerAccountsEnabled() {
  return window.SHRISH_APP_CONFIG?.customerAccountsEnabled === true;
}

function adminEmail() {
  return String(window.SHRISH_APP_CONFIG?.adminEmailHint || 'contact@shrish.co').trim().toLowerCase();
}

function isCustomerUser(user) {
  return Boolean(user?.uid) && String(user.email || '').trim().toLowerCase() !== adminEmail();
}

function recentOrderClaimPayload(orderRef, order, displayNumber) {
  return {
    orderId: orderRef.id,
    orderNumber: friendlyOrderLabel(displayNumber || order.orderNumber),
    email: order.email || '',
    phone: order.phone || '',
    phoneDigits: order.phoneDigits || '',
    firstName: order.firstName || '',
    lastName: order.lastName || '',
    createdAt: Date.now()
  };
}

function rememberRecentOrderForAccount(orderRef, order, displayNumber) {
  if (!customerAccountsEnabled()) return;
  if (currentCustomer) {
    sessionStorage.removeItem(RECENT_ORDER_CLAIM_KEY);
    return;
  }

  sessionStorage.setItem(
    RECENT_ORDER_CLAIM_KEY,
    JSON.stringify(recentOrderClaimPayload(orderRef, order, displayNumber))
  );
}

function rememberExistingOrderForAccount(orderId, displayNumber) {
  if (!customerAccountsEnabled() || !orderId) return;
  const email = document.getElementById('email')?.value?.trim() || '';
  const phone = document.getElementById('phone')?.value?.trim() || '';
  const phoneDigits = extractUsPhoneDigits(phone);
  if (!email || !phoneDigits) return;

  sessionStorage.setItem(
    RECENT_ORDER_CLAIM_KEY,
    JSON.stringify({
      orderId,
      orderNumber: friendlyOrderLabel(displayNumber),
      email,
      phone,
      phoneDigits,
      firstName: document.getElementById('firstName')?.value?.trim() || '',
      lastName: document.getElementById('lastName')?.value?.trim() || '',
      createdAt: Date.now()
    })
  );
}

function rememberCheckoutAccountPrefill(details = {}) {
  if (!customerAccountsEnabled()) return;
  sessionStorage.setItem(CHECKOUT_ACCOUNT_PREFILL_KEY, JSON.stringify({
    email: details.email || '',
    phone: details.phone || '',
    phoneDigits: details.phoneDigits || '',
    firstName: details.firstName || '',
    lastName: details.lastName || '',
    location: selectedLoc || '',
    createdAt: Date.now()
  }));
}

function accountCheckoutHref(mode) {
  return `account.html?mode=${encodeURIComponent(mode)}&return=checkout`;
}

function isShrishOrderNumber(value) {
  return typeof value === 'string' && /^SHR-\d+$/.test(value);
}

function friendlyOrderLabel(displayNumber) {
  return isShrishOrderNumber(displayNumber) ? displayNumber : 'your recent order';
}

function orderNumberHighlight(value) {
  return `<span class="success-order-number">${escapeHtml(value)}</span>`;
}

function renderSuccessAccountPrompt(orderRef, order, displayNumber) {
  const prompt = document.getElementById('successAccountPrompt');
  if (!prompt || !customerAccountsEnabled()) return;

  const signupHref = 'account.html?claim=recent&mode=signup';
  const signinHref = 'account.html?claim=recent&mode=signin';
  const orderLabel = friendlyOrderLabel(displayNumber);
  if (currentCustomer) {
    prompt.classList.add('show');
    prompt.innerHTML = `
      <strong>Track or edit this order</strong>
      <p>This order is saved to your Shrish account. You can <strong>view history</strong>, <strong>change pending quantities</strong>, or <strong>cancel before pickup is confirmed</strong>.</p>
      <div class="success-account-actions">
        <a href="account.html" class="btn-primary">View My Orders</a>
        <span class="success-account-note">${orderNumberHighlight(orderLabel)} is ready in your account.</span>
      </div>`;
    return;
  }

  prompt.classList.add('show');
  prompt.innerHTML = `
    <strong>Want to edit this order later?</strong>
    <p>Create or sign in with the <strong>same email and phone from checkout</strong>. Your recent order will link automatically so you can <strong>see purchase history</strong>, <strong>update pending boxes</strong>, or <strong>cancel before pickup is confirmed</strong>.</p>
    <div class="success-account-actions">
      <a href="${signupHref}" class="btn-primary">Create Account</a>
      <a href="${signinHref}" class="btn-outline">Sign In</a>
      <span class="success-account-note">Use <strong>${escapeHtml(order.email || 'the same email')}</strong> to link ${orderNumberHighlight(orderLabel)}.</span>
    </div>`;
}

function readRecentOrderClaim() {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_ORDER_CLAIM_KEY) || 'null');
  } catch {
    return null;
  }
}

function renderStripeSuccessAccountPrompt(orderId, orderNumber, customer) {
  const prompt = document.getElementById('successAccountPrompt');
  if (!prompt || !customerAccountsEnabled()) return;

  const displayNumber = orderNumber || 'this order';
  const claim = readRecentOrderClaim() || {};
  if (customer) {
    prompt.classList.add('show');
    prompt.innerHTML = `
      <strong>Track this order in your account</strong>
      <p>Your paid order is linked to your Shrish account. You can view order history, pickup details, and eligible pending order changes from one place.</p>
      <div class="success-account-actions">
        <a href="account.html" class="btn-primary">View My Orders</a>
        <span class="success-account-note">${orderNumberHighlight(displayNumber)} is ready in your account.</span>
      </div>`;
    return;
  }

  const signupHref = 'account.html?claim=recent&mode=signup';
  const signinHref = 'account.html?claim=recent&mode=signin';
  prompt.classList.add('show');
  prompt.innerHTML = `
    <strong>Create an account to track this order</strong>
    <p>Save ${orderNumberHighlight(displayNumber)} to see your purchase history, keep pickup details handy, and modify eligible pending orders before pickup is confirmed.</p>
    <div class="success-account-actions">
      <a href="${signupHref}" class="btn-primary">Create Account</a>
      <a href="${signinHref}" class="btn-outline">Sign In</a>
      <span class="success-account-note">Use ${escapeHtml(claim.email || 'the same checkout email')} and phone to link the order.</span>
    </div>`;
}

function waitForCustomerAuthState() {
  if (auth.currentUser) return Promise.resolve(isCustomerUser(auth.currentUser) ? auth.currentUser : null);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (user) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(isCustomerUser(user) ? user : null);
    };

    unsubscribe = onAuthStateChanged(auth, finish);
    setTimeout(() => finish(null), 1000);
  });
}

async function resolveStripeOrderNumber(orderId, params) {
  const urlOrderNumber = params.get('orderNumber') || '';
  if (/^SHR-\d+$/.test(urlOrderNumber)) return urlOrderNumber;
  if (!orderId) return '';
  return waitForOrderConfirmationNumber(doc(db, 'orders', orderId));
}

async function renderStripeReturnMessage() {
  const params = new URLSearchParams(window.location.search);
  const paymentState = params.get('payment');
  if (!paymentState) return false;

  const orderId = params.get('orderId') || '';
  if (paymentState === 'success') {
    const customer = await waitForCustomerAuthState();
    currentCustomer = customer;
    const orderNumber = await resolveStripeOrderNumber(orderId, params);
    sessionStorage.removeItem('shrish_cart');
    cart = [];
    updateNavCart();

    document.getElementById('checkoutWrap').style.display = 'none';
    document.getElementById('successScreen').style.display = 'block';
    document.getElementById('successOrderNum').innerHTML = orderNumber
      ? `Payment received - Order Confirmation No: ${orderNumberHighlight(orderNumber)}`
      : 'Payment received';
    document.querySelector('#successScreen > p')?.replaceChildren(document.createTextNode('Your online payment was received. Watch the WhatsApp group for pickup details.'));
    const paymentCopy = document.querySelectorAll('#successScreen > p')[1];
    if (paymentCopy) paymentCopy.textContent = 'Payment is already completed online.';
    const summary = document.getElementById('successSummary');
    if (summary) {
      summary.innerHTML = `
        <div class="ss-row"><span>Payment</span><span style="color:#2E7D32;font-weight:700">Paid online</span></div>
        <div class="ss-row"><span>Order Confirmation No</span><span>${orderNumber ? orderNumberHighlight(orderNumber) : escapeHtml('Your confirmation email will include it')}</span></div>`;
    }
    renderStripeSuccessAccountPrompt(orderId, orderNumber, customer);

    // Show refund request section for Stripe orders
    // orderId available, get order data from Firestore
    try {
      const { doc, getDoc } = window._firestoreExports || {};
      if (doc && getDoc) {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const od = orderSnap.data();
          if (summary) {
            const fulfillmentType = od.fulfillmentType || 'pickup';
            const destination = fulfillmentType === 'shipping'
              ? shippingAddressLabel(od.shippingAddress || {})
              : (od.pickupLocationLabel || od.locationLabel || 'Selected pickup location');
            summary.innerHTML = `
              <div class="ss-row"><span>Payment</span><span style="color:#2E7D32;font-weight:700">Paid online</span></div>
              <div class="ss-row"><span>Subtotal</span><span>${formatCurrency(od.itemSubtotal || 0)}</span></div>
              <div class="ss-row"><span>${escapeHtml(od.salesTaxLabel || VIRGINIA_SALES_TAX_LABEL)}</span><span>${formatCurrency(od.salesTaxAmount || 0)}</span></div>
              <div class="ss-row"><span>Shipping</span><span>${Number(od.shippingAmount || 0) > 0 ? formatCurrency(od.shippingAmount) : (fulfillmentType === 'shipping' ? 'Free' : 'Not selected')}</span></div>
              <div class="ss-row"><span>Total</span><span>${formatCurrency(od.totalPrice || 0)}</span></div>
              <div class="ss-row"><span>${fulfillmentType === 'shipping' ? 'Ship to' : 'Pickup'}</span><span>${escapeHtml(destination)}</span></div>
              <div class="ss-row"><span>Order Confirmation No</span><span>${orderNumber ? orderNumberHighlight(orderNumber) : escapeHtml('Your confirmation email will include it')}</span></div>`;
          }
          injectRefundSection(
            orderId,
            orderNumber,
            od.totalPrice || 0,
            'stripe',
            od.stripePaymentIntentId || null,
            od.fullName || '',
            od.email || customer?.email || '',
            od.phone || ''
          );
        }
      }
    } catch(e) { console.warn('Could not load order for refund section', e); }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  if (paymentState === 'cancelled') {
    setErrorBannerTitle('Online payment was cancelled');
    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    if (banner && list) {
      list.innerHTML = '<li>Your card was not charged. You can try online payment again or switch to pay at pickup.</li>';
      banner.className = 'error-banner show';
    }
    return false;
  }

  return false;
}

function trackCheckoutEvent(eventName, props = {}) {
  window.SHRISH_ANALYTICS?.track(eventName, props);
}

function cartAnalyticsSummary() {
  const totalItems = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalValue = cart.reduce((sum, item) => {
    return sum + (moneyValue(item.price) * (item.qty || 1));
  }, 0);
  const productIds = [];
  const productTitles = [];
  const categories = new Set();
  cart.forEach((item) => {
    const productId = cartItemProductId(item);
    const product = productId ? window.SHRISH_DATA?.products?.find((entry) => entry.id === productId) : null;
    if (productId) productIds.push(productId);
    if (item.name) productTitles.push(item.name);
    if (product?.category) categories.add(product.category);
  });
  return {
    cart_total_items: totalItems,
    cart_distinct_items: cart.length,
    cart_estimated_total: Number(totalValue.toFixed(2)),
    cart_product_ids: productIds,
    cart_product_titles: productTitles,
    cart_categories: [...categories],
    cart_primary_category: [...categories][0] || '',
    cart_distinct_products: new Set(productIds).size
  };
}

function moneyValue(value) {
  const num = parseFloat(String(value ?? '0').replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function calculateSalesTax(subtotal) {
  const rate = Number.isFinite(VIRGINIA_SALES_TAX_RATE) ? VIRGINIA_SALES_TAX_RATE : 0;
  return roundMoney(Math.max(0, subtotal) * Math.max(0, rate));
}

function calculateShippingAmount(subtotal, fulfillmentType = selectedFulfillmentType) {
  if (fulfillmentType !== 'shipping' || !cartPaymentPolicy().allowShipping) return 0;
  const threshold = Number.isFinite(SHIPPING_FREE_THRESHOLD) ? SHIPPING_FREE_THRESHOLD : 75;
  const standard = Number.isFinite(SHIPPING_STANDARD_AMOUNT) ? SHIPPING_STANDARD_AMOUNT : 8.99;
  return roundMoney(Math.max(0, subtotal) >= threshold ? 0 : standard);
}

function cartItemSubtotal(items = cart) {
  return roundMoney(items.reduce((sum, item) => {
    return sum + (moneyValue(item.price) * (item.qty || 1));
  }, 0));
}

function cartProductForItem(item = {}) {
  const productId = cartItemProductId(item);
  return productId ? window.SHRISH_DATA?.products?.find((entry) => entry.id === productId) : null;
}

function cartItemCategory(item = {}) {
  const product = cartProductForItem(item);
  const rawCategory = String(product?.category || item.category || item.productCategory || '').trim().toLowerCase();
  if (MANGO_CATEGORY_HINTS.has(rawCategory)) return 'mangoes';
  if (rawCategory) return rawCategory;

  const haystack = `${cartItemProductId(item)} ${item.name || ''}`.toLowerCase();
  if (NON_MANGO_NAME_HINTS.some((hint) => haystack.includes(hint))) return 'non-mango';
  if (MANGO_NAME_HINTS.some((hint) => haystack.includes(hint))) return 'mangoes';
  return 'non-mango';
}

function isMangoCartItem(item = {}) {
  return cartItemCategory(item) === 'mangoes';
}

function cartPaymentPolicy(items = cart) {
  const purchasableItems = items.filter((item) => Number(item.qty || 0) > 0);
  const hasMango = purchasableItems.some(isMangoCartItem);
  const hasNonMango = purchasableItems.some((item) => !isMangoCartItem(item));
  const requiresStripe = hasNonMango && !hasMango;

  return {
    hasMango,
    hasNonMango,
    requiresStripe,
    allowPickup: !requiresStripe,
    allowStripe: requiresStripe,
    allowShipping: hasNonMango && !hasMango,
    note: requiresStripe
      ? 'Pickles, podi, sweets, and snacks without mangoes must be paid online securely with Stripe.'
      : hasMango && hasNonMango
        ? 'Mixed mango orders stay pickup-only for now. You can pay for the full order at pickup.'
        : 'Mango-only orders stay pickup payment only.'
  };
}

function pickupLocationLabel(locationId) {
  return LOCATION_LABELS[locationId] || locationId || '';
}

function customerProfileRef(uid) {
  return doc(db, 'user_profiles', uid);
}

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

function cartItemProductId(item = {}) {
  return item.productId || String(item.id || '').split('__')[0] || '';
}

function cartItemVariantId(item = {}) {
  if (item.variantId) return item.variantId;
  const id = String(item.id || '');
  return id.includes('__') ? id.split('__')[1] : 'default';
}

function cartItemId(productId, variantId = 'default') {
  return variantId === 'default' ? productId : `${productId}__${variantId}`;
}

const CATALOG_FIELD_OVERRIDES = window.SHRISH_CATALOG_FIELD_OVERRIDES || {};
const FORCE_CATALOG_FIELD_OVERRIDE_IDS = new Set([
  'picklespodi-drumstick-leaf-podi-munagaku-podi'
]);
const SWEET_CATALOG_OVERRIDE_CATEGORIES = new Set(['putharekulu', 'jellysnacks']);

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

function staticCatalogProduct(productId) {
  return window.SHRISH_DATA?.products?.find((product) => product.id === productId) || null;
}

function variantIdForOption(variant, index) {
  return variant?.id || `opt${index + 1}`;
}

function hasVariantId(product = {}, variantId = 'default') {
  if (variantId === 'default') return true;
  return Array.isArray(product.variants)
    && product.variants.some((variant, index) => variantIdForOption(variant, index) === variantId);
}

function applyStaticVariantFallback(product = {}, cartItem = {}) {
  const productId = cartItemProductId(cartItem);
  const variantId = cartItemVariantId(cartItem);
  if (!productId || hasVariantId(product, variantId)) return product;

  const staticProduct = staticCatalogProduct(productId);
  if (!staticProduct || !hasVariantId(staticProduct, variantId)) return product;

  return applyCatalogFieldOverrides({
    ...staticProduct,
    ...product,
    unit: staticProduct.unit || product.unit,
    price: staticProduct.price || product.price,
    variants: staticProduct.variants
  });
}

function liveProductVariants(product = {}) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants
      .filter((variant) => variant?.label)
      .map((variant, index) => ({
        id: variant.id || `opt${index + 1}`,
        label: variant.label,
        price: variant.price || product.price || '',
        unit: variant.label || product.unit || ''
      }));
  }

  return [{
    id: 'default',
    label: product.unit || 'Default',
    price: product.price || '',
    unit: product.unit || ''
  }];
}

function liveCartItemFromProduct(product, cartItem) {
  const productId = cartItemProductId(cartItem);
  const variantId = cartItemVariantId(cartItem);
  const variants = liveProductVariants(product);
  const selectedVariant = variants.find((variant) => variant.id === variantId);
  if (!selectedVariant) return null;

  const price = selectedVariant.price || product.price || '';
  if (moneyValue(price) <= 0) return null;

  const qty = Math.max(1, parseInt(cartItem.qty, 10) || 1);

  return {
    id: cartItemId(productId, selectedVariant.id),
    productId,
    variantId: selectedVariant.id,
    category: product.category || cartItem.category || '',
    name: selectedVariant.id === 'default' ? (product.name || cartItem.name || 'Item') : `${product.name || cartItem.name || 'Item'} (${selectedVariant.label})`,
    price,
    unit: selectedVariant.unit || product.unit || '',
    image: product.image || cartItem.image || null,
    qty
  };
}

function showCartValidationMessage(messages = []) {
  const banner = document.getElementById('errorBanner');
  const list = document.getElementById('errorList');
  if (!banner || !list) return;

  list.innerHTML = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('');
  banner.className = 'error-banner show hard-error';
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function verifyCartAgainstLiveProducts() {
  const messages = [];
  const verifiedCart = [];
  let cartChanged = false;

  for (const item of cart) {
    const productId = cartItemProductId(item);
    const itemName = item.name || 'This item';

    if (!productId) {
      cartChanged = true;
      messages.push(`${itemName} could not be verified and was removed from your cart.`);
      continue;
    }

    let productSnap;
    try {
      productSnap = await getDoc(doc(db, 'products', productId));
    } catch (error) {
      console.error('Live product check failed', error);
      throw new Error('LIVE_PRODUCT_CHECK_FAILED');
    }

    if (!productSnap.exists()) {
      cartChanged = true;
      messages.push(`${itemName} is no longer in the live catalog and was removed from your cart.`);
      continue;
    }

    const product = applyStaticVariantFallback(
      applyCatalogFieldOverrides({ id: productId, ...productSnap.data() }),
      item
    );
    if (product.hidden || !product.available || product.displayOnly) {
      cartChanged = true;
      messages.push(`${product.name || itemName} is currently not available and was removed from your cart.`);
      continue;
    }

    const liveItem = liveCartItemFromProduct(product, item);
    if (!liveItem) {
      cartChanged = true;
      messages.push(`${product.name || itemName} is no longer available in the selected option and was removed from your cart.`);
      continue;
    }

    const oldPrice = moneyValue(item.price);
    const newPrice = moneyValue(liveItem.price);
    if (oldPrice !== newPrice) {
      cartChanged = true;
      messages.push(`${liveItem.name} price changed from ${formatCurrency(oldPrice)} to ${formatCurrency(newPrice)}. Please review your cart and place the order again.`);
    }

    if (
      liveItem.id !== item.id ||
      liveItem.name !== item.name ||
      liveItem.price !== item.price ||
      liveItem.unit !== item.unit ||
      liveItem.image !== item.image ||
      liveItem.category !== item.category ||
      liveItem.qty !== item.qty
    ) {
      cartChanged = true;
    }

    verifiedCart.push(liveItem);
  }

  if (cartChanged) {
    cart = verifiedCart;
    saveCart();
    renderCartReview();
    updateNavCart();
  }

  if (messages.length) {
    showCartValidationMessage(messages);
    trackCheckoutEvent('checkout_cart_revalidated', {
      changed_count: messages.length,
      cart_remaining_items: cart.reduce((sum, item) => sum + (item.qty || 0), 0),
      ...cartAnalyticsSummary()
    });
    return false;
  }

  return true;
}

function renderCartReview() {
  const container = document.getElementById('cartReviewContainer');
  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `<div class="cart-empty-note"><div class="en-icon">&#128722;</div><p>Your cart is empty. <a href="shop.html" style="color:var(--saffron);font-weight:700">Go back to shop</a></p></div>`;
    return;
  }

  const totalQty = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  if (!cartPaymentPolicy().allowShipping && selectedFulfillmentType === 'shipping') selectedFulfillmentType = 'pickup';
  const itemSubtotal = cartItemSubtotal();
  const salesTaxAmount = calculateSalesTax(itemSubtotal);
  const shippingAmount = calculateShippingAmount(itemSubtotal);
  const orderTotal = roundMoney(itemSubtotal + salesTaxAmount + shippingAmount);

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
        const lineTotal = moneyValue(item.price) * qty;
        const unitLabel = String(item.unit || '').trim();

        return `<div class="review-item">
  <div class="ri-info">
    <div class="ri-name">${escapeHtml(item.name)}</div>
    <div class="ri-unit">${escapeHtml(unitLabel)}</div>
  </div>
  <div class="ri-qty">
    <div class="ri-qty-ctrl">
      <button type="button" class="ri-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="-1">&minus;</button>
      <span class="ri-qty-value">${qty}</span>
      <button type="button" class="ri-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="1">+</button>
    </div>
  </div>
  <div class="ri-price">${formatCurrency(lineTotal)}</div>
  <div class="ri-actions">
    <button type="button" class="ri-remove" data-id="${escapeHtml(item.id)}" title="Remove item" aria-label="Remove ${escapeHtml(item.name)} from cart">&#128465;</button>
  </div>
</div>`;
      })
      .join('') +
    `<div class="review-total">
      <div class="rt-label">Total</div>
      <div class="rt-qty">${totalQty}</div>
      <div>
        <div class="rt-price">${formatCurrency(orderTotal)}</div>
        <div class="review-total-note">Includes ${escapeHtml(VIRGINIA_SALES_TAX_LABEL)}</div>
      </div>
      <div></div>
    </div>
    <div class="review-total">
      <div></div>
      <div></div>
      <div class="review-total-lines">
        <div class="review-total-line"><span>Subtotal</span><span>${formatCurrency(itemSubtotal)}</span></div>
        <div class="review-total-line"><span>${escapeHtml(VIRGINIA_SALES_TAX_LABEL)}</span><span>${formatCurrency(salesTaxAmount)}</span></div>
        <div class="review-total-line"><span>${escapeHtml(SHIPPING_LABEL)}</span><span>${shippingAmount > 0 ? formatCurrency(shippingAmount) : (selectedFulfillmentType === 'shipping' ? 'Free' : 'Not selected')}</span></div>
        <div class="review-total-line total"><span>Total</span><span>${formatCurrency(orderTotal)}</span></div>
      </div>
      <div></div>
    </div>
  </div>`;

  const confirmRemoveCartItem = (item) => {
    const itemName = item?.name || 'this item';

    return new Promise((resolve) => {
      document.getElementById('cartRemoveModal')?.remove();

      const modal = document.createElement('div');
      modal.id = 'cartRemoveModal';
      modal.className = 'cart-remove-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="cart-remove-card">
          <div class="cart-remove-kicker">Confirm remove</div>
          <h3>Remove this item?</h3>
          <p>This will remove the item from your current cart and recalculate your total.</p>
          <div class="cart-remove-item">${escapeHtml(itemName)}</div>
          <div class="cart-remove-actions">
            <button type="button" class="cart-remove-cancel">Keep item</button>
            <button type="button" class="cart-remove-confirm">Remove</button>
          </div>
        </div>`;

      const close = (value) => {
        modal.remove();
        document.removeEventListener('keydown', handleKeydown);
        resolve(value);
      };
      const handleKeydown = (event) => {
        if (event.key === 'Escape') close(false);
      };

      modal.querySelector('.cart-remove-cancel')?.addEventListener('click', () => close(false));
      modal.querySelector('.cart-remove-confirm')?.addEventListener('click', () => close(true));
      modal.addEventListener('click', (event) => {
        if (event.target === modal) close(false);
      });
      document.addEventListener('keydown', handleKeydown);
      document.body.appendChild(modal);
      modal.querySelector('.cart-remove-confirm')?.focus();
    });
  };

  const removeCartItemById = (id) => {
    cart = cart.filter((entry) => entry.id !== id);
    saveCart();
    renderCartReview();
    updateNavCart();
    trackCheckoutEvent('checkout_cart_item_removed', cartAnalyticsSummary());
  };

  container.querySelectorAll('.ri-qty-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta, 10);
      const item = cart.find((entry) => entry.id === id);
      if (!item) return;

      if (delta < 0 && Number(item.qty || 0) <= 1) {
        if (await confirmRemoveCartItem(item)) removeCartItemById(id);
        return;
      }

      item.qty = Math.max(1, item.qty + delta);
      saveCart();
      renderCartReview();
      updateNavCart();
      trackCheckoutEvent('checkout_cart_quantity_changed', {
        quantity_delta: delta,
        ...cartAnalyticsSummary()
      });
    });
  });

  container.querySelectorAll('.ri-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = cart.find((entry) => entry.id === btn.dataset.id);
      if (!item || await confirmRemoveCartItem(item)) removeCartItemById(btn.dataset.id);
    });
  });

  updatePaymentUi();
}

function rebuildErrorBanner() {
  const banner = document.getElementById('errorBanner');
  const list = document.getElementById('errorList');
  if (!banner || !list) return;

  const errors = [];
  if (document.getElementById('err-firstName')?.style.display === 'block') errors.push('First name is required');
  if (document.getElementById('err-lastName')?.style.display === 'block') errors.push('Last name must be at least 2 characters or left blank');
  if (document.getElementById('err-phone')?.style.display === 'block') {
    errors.push(document.getElementById('err-phone').textContent || 'Valid phone number required');
  }
  if (document.getElementById('err-email')?.style.display === 'block') {
    errors.push(document.getElementById('err-email').textContent || 'Valid email required');
  }
  if (selectedFulfillmentType === 'pickup' && !selectedLoc) errors.push('Please select a pickup location');
  if (selectedFulfillmentType === 'shipping') {
    [
      'err-shippingAddress1',
      'err-shippingCity',
      'err-shippingState',
      'err-shippingZip'
    ].forEach((id) => {
      const err = document.getElementById(id);
      if (err?.style.display === 'block') errors.push(err.textContent || 'Please complete your shipping address');
    });
  }
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

function extractUsPhoneDigits(value) {
  const digits = normalizePhone(value);
  if (!digits) return '';
  if (digits.startsWith('1')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

function formatUsPhoneDisplay(value) {
  const digits = extractUsPhoneDigits(value);
  if (!digits.length) return '+1 ';
  if (digits.length < 4) return `+1 (${digits}`;
  if (digits.length < 7) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function setErrorBannerTitle(text) {
  const title = document.querySelector('#errorBanner .error-banner-title');
  if (title) title.textContent = text;
}

function showDuplicateOrderMessage(phone, existingOrderId = '') {
  const banner = document.getElementById('errorBanner');
  const list = document.getElementById('errorList');
  if (!banner || !list) return;

  rememberExistingOrderForAccount(existingOrderId, existingOrderId);
  banner.className = 'error-banner';
  list.innerHTML = '';

  document.getElementById('duplicateOrderModal')?.remove();
  const accountHref = existingOrderId ? 'account.html?claim=recent&mode=signin' : 'account.html?mode=signin';
  const primaryLabel = currentCustomer ? 'Open My Orders' : 'Login to Modify Order';

  const modal = document.createElement('div');
  modal.id = 'duplicateOrderModal';
  modal.className = 'duplicate-order-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="duplicate-order-card">
      <button type="button" class="duplicate-order-close" aria-label="Close">&times;</button>
      <h3>You already have a pending order</h3>
      <p>You already have an active order for <strong>${escapeHtml(phone)}</strong>.</p>
      <p>To change boxes, cancel, or view details, log in or create a Shrish account using the same email and phone from your order.</p>
      <div class="duplicate-order-actions">
        <a class="primary" href="${accountHref}">${primaryLabel}</a>
        <a class="secondary" href="account.html?claim=recent&mode=signup">Create Account</a>
        <a class="secondary" href="https://wa.me/17653255577" target="_blank" rel="noopener">WhatsApp Help</a>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  modal.querySelector('.duplicate-order-close')?.addEventListener('click', () => {
    modal.remove();
    document.body.style.overflow = '';
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  });
}

async function isActivePendingLock(lockSnap) {
  if (!lockSnap?.exists()) return false;
  const lock = lockSnap.data() || {};
  if ((lock.status || 'pending') !== 'pending') return false;
  if (!lock.orderId) return false;

  const orderSnap = await getDoc(doc(db, 'orders', lock.orderId)).catch((error) => {
    if (error?.code === 'permission-denied' && currentCustomer) return null;
    if (error?.code === 'permission-denied') return { exists: () => true, data: () => ({ status: 'pending' }) };
    return null;
  });
  return orderSnap?.exists() && (orderSnap.data()?.status || 'pending') === 'pending';
}

function showNoShowNotice() {
  return new Promise((resolve) => {
    const existing = document.getElementById('noShowNoticeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'noShowNoticeModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="nsn-card">
        <h3>Pickup Reminder</h3>
        <p>Your last order was marked as a <strong>no-show</strong>. We completely understand that <strong>plans can change</strong> or you may get busy.</p>
        <p>But next time, please send us a <strong>quick WhatsApp message</strong> if you're unable to pick up. That helps us <strong>offer those boxes to other customers</strong>.</p>
        <p>Thank you for understanding!</p>
        <button type="button" id="noShowNoticeOk">I Understand</button>
      </div>`;

    const style = document.createElement('style');
    style.textContent = `
      #noShowNoticeModal {
        position: fixed; inset: 0; z-index: 5000;
        display: flex; align-items: center; justify-content: center;
        padding: 20px; background: rgba(26,18,8,.58);
        backdrop-filter: blur(4px);
      }
      #noShowNoticeModal .nsn-card {
        width: min(520px, 100%); background: #fff; color: var(--text);
        border-radius: 20px; padding: 26px 24px; box-shadow: var(--shadow-lg);
      }
      #noShowNoticeModal h3 {
        margin: 0 0 12px; font-family: var(--font-display);
        font-size: 28px; color: var(--dark);
      }
      #noShowNoticeModal p {
        margin: 0 0 14px; font-size: 15px; line-height: 1.7;
        color: var(--text-light);
      }
      #noShowNoticeModal strong {
        color: var(--dark); font-weight: 800;
      }
      #noShowNoticeModal button {
        width: 100%; margin-top: 6px; padding: 13px 18px;
        border: none; border-radius: 999px; background: var(--saffron);
        color: #fff; font: inherit; font-weight: 700; cursor: pointer;
      }`;

    document.head.appendChild(style);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    document.getElementById('noShowNoticeOk')?.addEventListener('click', () => {
      modal.remove();
      style.remove();
      document.body.style.overflow = '';
      resolve();
    }, { once: true });
  });
}

async function waitForOrderConfirmationNumber(orderRef) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONFIRMATION_WAIT_MS) {
    const snap = await getDoc(orderRef).catch((error) => {
      if (error?.code === 'permission-denied') return null;
      console.warn('Could not read order confirmation number yet', error);
      return null;
    });
    if (!snap?.exists()) return '';
    const orderNumber = snap.data()?.orderNumber;
    if (typeof orderNumber === 'string' && /^SHR-\d+$/.test(orderNumber)) {
      return orderNumber;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return '';
}

function selectPickupLocation(locationId, shouldTrack = false) {
  if (!locationId || !LOCATION_LABELS[locationId]) return;

  selectedLoc = locationId;
  document.querySelectorAll('.loc-card').forEach((entry) => {
    entry.classList.toggle('selected', entry.dataset.loc === selectedLoc);
  });

  if (shouldTrack) {
    trackCheckoutEvent('pickup_location_selected', {
      pickup_location: selectedLoc
    });
  }

  const errEl = document.getElementById('err-location');
  if (errEl) errEl.style.display = 'none';
  rebuildErrorBanner();
}

function shippingInputValue(id) {
  return String(document.getElementById(id)?.value || '').trim();
}

function getShippingAddress() {
  return {
    addressLine1: shippingInputValue('shippingAddress1'),
    addressLine2: shippingInputValue('shippingAddress2'),
    city: shippingInputValue('shippingCity'),
    state: shippingInputValue('shippingState').toUpperCase(),
    zip: shippingInputValue('shippingZip')
  };
}

function shippingAddressLabel(address = getShippingAddress()) {
  const line1 = address.addressLine1 || '';
  const line2 = address.addressLine2 ? `, ${address.addressLine2}` : '';
  return `${line1}${line2}, ${address.city || ''}, ${address.state || ''} ${address.zip || ''}`.replace(/\s+/g, ' ').trim();
}

function setAddressAssist(message = '', state = '') {
  const assist = document.getElementById('shippingAddressAssist');
  if (!assist) return;

  assist.textContent = message;
  assist.classList.toggle('show', Boolean(message));
  assist.classList.toggle('valid', state === 'valid');
}

function addressComponent(place, type, format = 'long_name') {
  const component = place?.address_components?.find((entry) => entry.types?.includes(type));
  return component?.[format] || '';
}

function applyPlaceAddress(place) {
  if (!place?.address_components?.length) return false;

  const streetNumber = addressComponent(place, 'street_number');
  const route = addressComponent(place, 'route');
  const city = addressComponent(place, 'locality')
    || addressComponent(place, 'postal_town')
    || addressComponent(place, 'sublocality')
    || addressComponent(place, 'administrative_area_level_3');
  const state = addressComponent(place, 'administrative_area_level_1', 'short_name');
  const zip = addressComponent(place, 'postal_code');
  const zipSuffix = addressComponent(place, 'postal_code_suffix');
  const unit = addressComponent(place, 'subpremise');

  const updates = {
    shippingAddress1: [streetNumber, route].filter(Boolean).join(' '),
    shippingCity: city,
    shippingState: state,
    shippingZip: zipSuffix ? `${zip}-${zipSuffix}` : zip
  };

  Object.entries(updates).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (!field || !value) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const unitField = document.getElementById('shippingAddress2');
  if (unitField && unit && !unitField.value.trim()) {
    unitField.value = unit;
    unitField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  setAddressAssist('Address selected. Please confirm apartment/suite if needed.', 'valid');
  return true;
}

function loadGoogleMapsPlaces() {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (window.__shrishPlacesPromise) return window.__shrishPlacesPromise;

  window.__shrishPlacesPromise = new Promise((resolve, reject) => {
    const callbackName = `shrishPlacesReady_${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google);
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[callbackName];
      reject(new Error('Google Places failed to load'));
    };
    document.head.appendChild(script);
  });

  return window.__shrishPlacesPromise;
}

async function initShippingAddressAutocomplete() {
  const addressField = document.getElementById('shippingAddress1');
  if (!addressField) return;

  if (!GOOGLE_MAPS_API_KEY) {
    setAddressAssist('Enter your complete shipping address.');
    return;
  }

  setAddressAssist('Start typing your street address for suggestions.');

  try {
    const google = await loadGoogleMapsPlaces();
    if (!google?.maps?.places?.Autocomplete) return;

    const autocomplete = new google.maps.places.Autocomplete(addressField, {
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address', 'geometry'],
      types: ['address']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!applyPlaceAddress(place)) {
        setAddressAssist('Please choose a full street address from the suggestions or complete it manually.');
      }
      validateShippingFields(false);
      rebuildErrorBanner();
    });
  } catch (error) {
    console.warn('Shipping address suggestions unavailable', error);
    setAddressAssist('Address suggestions are temporarily unavailable. You can still enter the address manually.');
  }
}

function validateShippingFields(showErrors = true) {
  if (selectedFulfillmentType !== 'shipping') return true;

  const address = getShippingAddress();
  const checks = [
    ['shippingAddress1', address.addressLine1.length >= 5],
    ['shippingCity', address.city.length >= 2],
    ['shippingState', /^[A-Z]{2}$/.test(address.state)],
    ['shippingZip', /^\d{5}(-\d{4})?$/.test(address.zip)]
  ];

  checks.forEach(([id, valid]) => {
    const err = document.getElementById(`err-${id}`);
    if (err) err.style.display = showErrors && !valid ? 'block' : 'none';
  });

  return checks.every(([, valid]) => valid);
}

function updateFulfillmentUi() {
  const paymentPolicy = cartPaymentPolicy();
  const allowShipping = paymentPolicy.allowShipping;
  if (!allowShipping && selectedFulfillmentType === 'shipping') selectedFulfillmentType = 'pickup';

  document.querySelectorAll('.fulfillment-option').forEach((option) => {
    const type = option.dataset.fulfillment === 'shipping' ? 'shipping' : 'pickup';
    option.hidden = type === 'shipping' && !allowShipping;
    option.classList.toggle('selected', type === selectedFulfillmentType);
    const input = option.querySelector('input[type="radio"]');
    if (input) {
      input.checked = type === selectedFulfillmentType;
      input.disabled = option.hidden;
    }
  });

  const pickupSection = document.getElementById('pickupLocationSection');
  if (pickupSection) pickupSection.style.display = selectedFulfillmentType === 'shipping' ? 'none' : '';
  const shippingFields = document.getElementById('shippingFields');
  if (shippingFields) shippingFields.classList.toggle('show', selectedFulfillmentType === 'shipping');
  const locationError = document.getElementById('err-location');
  if (selectedFulfillmentType === 'shipping' && locationError) locationError.style.display = 'none';

  const subtotal = cartItemSubtotal();
  const shippingAmount = calculateShippingAmount(subtotal);
  const shippingRateLine = document.getElementById('shippingRateLine');
  if (shippingRateLine) {
    const remaining = roundMoney(SHIPPING_FREE_THRESHOLD - subtotal);
    shippingRateLine.innerHTML = shippingAmount > 0
      ? `<strong>${escapeHtml(SHIPPING_LABEL)}:</strong> ${formatCurrency(shippingAmount)}. Add ${formatCurrency(remaining)} more eligible items for free shipping.`
      : `<strong>${escapeHtml(SHIPPING_LABEL)}:</strong> Free shipping applied for eligible orders ${formatCurrency(SHIPPING_FREE_THRESHOLD)}+.`;
  }

  const note = document.getElementById('fulfillmentRuleNote');
  if (note) {
    note.innerHTML = allowShipping
      ? `<strong>Fulfillment:</strong> Pick up locally or ship eligible non-mango items. Shipping is ${formatCurrency(SHIPPING_STANDARD_AMOUNT)} under ${formatCurrency(SHIPPING_FREE_THRESHOLD)} and free at ${formatCurrency(SHIPPING_FREE_THRESHOLD)}+.`
      : `<strong>Fulfillment:</strong> Mango or mixed mango carts are pickup-only so fruit quality and pickup timing stay controlled.`;
  }
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el || !value) return;

  const currentValue = String(el.value || '').trim();
  const emptyPhonePlaceholder = id === 'phone' && /^\+?1?\s*$/.test(currentValue.replace(/[()\-]/g, ''));
  if (!currentValue || emptyPhonePlaceholder) el.value = value;
}

function splitProfileName(profile = {}) {
  const fullName = String(profile.fullName || '').trim();
  if (profile.firstName || profile.lastName) {
    return {
      firstName: profile.firstName || '',
      lastName: profile.lastName || ''
    };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
}

function applyCustomerDefaults(profile = {}) {
  const names = splitProfileName(profile);
  setFieldValue('firstName', names.firstName);
  setFieldValue('lastName', names.lastName);
  setFieldValue('phone', profile.phone);
  setFieldValue('email', profile.email || currentCustomer?.email || '');

  if (profile.preferredPickupLocation && !selectedLoc) {
    selectPickupLocation(profile.preferredPickupLocation, false);
  }
}

function updatePaymentUi() {
  updateFulfillmentUi();
  const paymentPolicy = cartPaymentPolicy();
  if (paymentPolicy.requiresStripe) {
    selectedPaymentMethod = 'stripe';
  } else {
    selectedPaymentMethod = 'pickup';
    guestStripeConfirmed = false;
  }

  document.querySelectorAll('.payment-option').forEach((option) => {
    const paymentType = option.dataset.payment === 'stripe' ? 'stripe' : 'pickup';
    option.hidden = paymentType === 'stripe' ? !paymentPolicy.allowStripe : !paymentPolicy.allowPickup;
    option.setAttribute('aria-hidden', option.hidden ? 'true' : 'false');
    const isSelected = option.dataset.payment === selectedPaymentMethod;
    option.classList.toggle('selected', isSelected);
    const input = option.querySelector('input[type="radio"]');
    if (input) {
      input.checked = isSelected;
      input.disabled = option.hidden;
    }
  });

  const paymentRuleNote = document.getElementById('paymentRuleNote');
  if (paymentRuleNote) {
    paymentRuleNote.innerHTML = `<strong>Payment rule:</strong> ${escapeHtml(paymentPolicy.note)} ${VIRGINIA_SALES_TAX_RATE > 0 ? `${escapeHtml(VIRGINIA_SALES_TAX_LABEL)} is added at checkout.` : ''}`;
  }

  const saveCardRow = document.getElementById('saveCardRow');
  const saveCardInput = document.getElementById('saveCardForFuture');
  const saveCardLabel = saveCardRow?.querySelector('label');
  const canSaveCard = selectedPaymentMethod === 'stripe' && Boolean(currentCustomer);
  if (saveCardRow) saveCardRow.classList.toggle('show', selectedPaymentMethod === 'stripe');
  if (saveCardInput) {
    saveCardInput.disabled = !canSaveCard;
    if (!canSaveCard) saveCardInput.checked = false;
  }
  if (saveCardLabel) {
    saveCardLabel.innerHTML = currentCustomer
      ? `<strong>Save this card for future Shrish purchases.</strong><br>
          Stripe stores the card securely; Shrish never sees your full card number.`
      : `<strong>Sign in to save a card for future purchases.</strong><br>
          You can still pay online as a guest. To save this card, <a href="account.html?mode=signin">sign in</a> or <a href="account.html?mode=signup">create an account</a> first.`;
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.textContent = selectedPaymentMethod === 'stripe'
      ? 'Continue to Secure Payment'
      : 'Place Order - Pay at Pickup';
  }

  const note = document.getElementById('paymentNote');
  if (note) {
    note.textContent = selectedPaymentMethod === 'stripe'
      ? (currentCustomer ? 'You will be redirected to Stripe. Signed-in customers can save a card for future purchases.' : 'You will be redirected to Stripe. Sign in first if you want to save a card for future purchases.')
      : 'No payment needed now. Pay when you pick up.';
  }
}

function closeCheckoutAccountModal(resolve, value = 'close') {
  const modal = document.getElementById('checkoutAccountModal');
  if (modal) modal.remove();
  document.body.style.overflow = '';
  resolve(value);
}

function showCheckoutAccountChoice(details = {}) {
  rememberCheckoutAccountPrefill(details);
  document.getElementById('checkoutAccountModal')?.remove();

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.id = 'checkoutAccountModal';
    modal.className = 'checkout-account-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="checkout-account-card">
        <button type="button" class="checkout-account-close" aria-label="Close">&times;</button>
        <h3>Pay online securely</h3>
        <p>You can pay with card as a guest, or sign in first to save this order to your Shrish account.</p>
        <div class="checkout-account-benefits">
          <span>View purchase history and pickup details anytime.</span>
          <span>Edit eligible pending orders before pickup is confirmed.</span>
          <span>Save checkout details for faster ordering next time.</span>
        </div>
        <div class="checkout-account-actions">
          <a class="primary" href="${accountCheckoutHref('signin')}">Sign In</a>
          <a class="secondary" href="${accountCheckoutHref('signup')}">Create Account</a>
          <button type="button" class="guest" id="continueAsGuestBtn">Checkout as Guest</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    modal.querySelector('.checkout-account-close')?.addEventListener('click', () => closeCheckoutAccountModal(resolve));
    modal.querySelector('#continueAsGuestBtn')?.addEventListener('click', () => closeCheckoutAccountModal(resolve, 'guest'));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeCheckoutAccountModal(resolve);
    });
  });
}

function bindPaymentUi() {
  document.querySelectorAll('.payment-option').forEach((option) => {
    option.addEventListener('click', () => {
      if (option.hidden) return;
      const paymentPolicy = cartPaymentPolicy();
      if (option.dataset.payment === 'stripe' && !paymentPolicy.allowStripe) return;
      if (option.dataset.payment !== 'stripe' && !paymentPolicy.allowPickup) return;

      selectedPaymentMethod = option.dataset.payment === 'stripe' ? 'stripe' : 'pickup';
      if (selectedPaymentMethod !== 'stripe') guestStripeConfirmed = false;
      updatePaymentUi();
      trackCheckoutEvent('checkout_payment_method_selected', {
        payment_method: selectedPaymentMethod
      });
    });

    option.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        option.click();
      }
    });
  });

  updatePaymentUi();
}

function bindFulfillmentUi() {
  document.querySelectorAll('.fulfillment-option').forEach((option) => {
    option.addEventListener('click', () => {
      if (option.hidden) return;
      const requested = option.dataset.fulfillment === 'shipping' ? 'shipping' : 'pickup';
      const paymentPolicy = cartPaymentPolicy();
      if (requested === 'shipping' && !paymentPolicy.allowShipping) return;

      selectedFulfillmentType = requested;
      if (selectedFulfillmentType === 'pickup') validateShippingFields(false);
      renderCartReview();
      updatePaymentUi();
      trackCheckoutEvent('checkout_fulfillment_selected', {
        fulfillment_type: selectedFulfillmentType,
        shipping_amount: calculateShippingAmount(cartItemSubtotal())
      });
    });

    option.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        option.click();
      }
    });
  });

  ['shippingAddress1', 'shippingAddress2', 'shippingCity', 'shippingState', 'shippingZip'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (id === 'shippingState') {
        const el = document.getElementById(id);
        el.value = el.value.toUpperCase().slice(0, 2);
      }
      validateShippingFields(false);
      rebuildErrorBanner();
    });
  });

  initShippingAddressAutocomplete();

  updatePaymentUi();
}

function bindCustomerProfile() {
  if (!customerAccountsEnabled()) return;

  onAuthStateChanged(auth, async (user) => {
    currentCustomer = isCustomerUser(user) ? user : null;
    currentCustomerProfile = null;
    updatePaymentUi();

    if (!currentCustomer) return;

    const emailInput = document.getElementById('email');
    if (emailInput && !emailInput.value) emailInput.value = currentCustomer.email || '';

    const snap = await getDoc(customerProfileRef(currentCustomer.uid)).catch(() => null);
    if (!snap?.exists()) return;

    currentCustomerProfile = snap.data() || {};
    applyCustomerDefaults(currentCustomerProfile);
    updatePaymentUi();
  });
}

async function saveCheckoutDetailsToProfile(order) {
  if (!customerAccountsEnabled()) return;
  if (!currentCustomer) return;

  await setDoc(customerProfileRef(currentCustomer.uid), {
    uid: currentCustomer.uid,
    email: order.email || currentCustomer.email || '',
    firstName: order.firstName || '',
    lastName: order.lastName || '',
    fullName: order.fullName || '',
    phone: order.phone || '',
    phoneDigits: order.phoneDigits || '',
    preferredPickupLocation: order.fulfillmentType === 'pickup' ? (order.pickupLocation || order.location || '') : (currentCustomerProfile?.preferredPickupLocation || ''),
    preferredPickupLocationLabel: order.fulfillmentType === 'pickup' ? (order.pickupLocationLabel || order.locationLabel || '') : (currentCustomerProfile?.preferredPickupLocationLabel || ''),
    addressLine1: order.shippingAddress?.addressLine1 || currentCustomerProfile?.addressLine1 || '',
    addressLine2: order.shippingAddress?.addressLine2 || currentCustomerProfile?.addressLine2 || '',
    city: order.shippingAddress?.city || currentCustomerProfile?.city || '',
    state: order.shippingAddress?.state || currentCustomerProfile?.state || 'VA',
    zip: order.shippingAddress?.zip || currentCustomerProfile?.zip || '',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function bindFormUi() {
  document.querySelectorAll('.loc-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectPickupLocation(card.dataset.loc, true);
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
    phoneInput.value = formatUsPhoneDisplay(phoneInput.value);

    phoneInput.addEventListener('input', () => {
      const digits = extractUsPhoneDigits(phoneInput.value);
      phoneInput.value = formatUsPhoneDisplay(phoneInput.value);

      if (!digits.length) {
        phoneCounter.textContent = '10 digits required';
        phoneCounter.className = 'phone-counter';
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
      const digits = extractUsPhoneDigits(phoneInput.value);
      phoneInput.value = formatUsPhoneDisplay(phoneInput.value);

      const errEl = document.getElementById('err-phone');
      if (!digits.length || digits.length < 10) {
        errEl.textContent = digits.length
          ? `Too short - need 10 digits, you entered ${digits.length}`
          : 'Please enter a valid 10-digit phone number';
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
  const attemptCartAnalytics = cartAnalyticsSummary();
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const phoneInput = document.getElementById('phone');
  const phone = formatUsPhoneDisplay(phoneInput?.value || '').trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const referral = document.getElementById('referral').value;
  const notes = document.getElementById('notes').value.trim();
  updatePaymentUi();
  let paymentPolicy = cartPaymentPolicy();
  let payOnline = selectedPaymentMethod === 'stripe';
  const saveCard = Boolean(document.getElementById('saveCardForFuture')?.checked && currentCustomer);
  const phoneDigits = extractUsPhoneDigits(phone);
  const emailValid = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
  trackCheckoutEvent('order_submit_attempted', {
    ...attemptCartAnalytics,
    pickup_location: selectedLoc || '',
    fulfillment_type: selectedFulfillmentType,
    referral: referral || 'Not specified',
    payment_method: selectedPaymentMethod,
    save_card_requested: saveCard
  });

  if (phoneInput) phoneInput.value = phone;

  let ok = true;
  ok = validateField('firstName', firstName.length >= 2, 'First name must be at least 2 characters') && ok;
  ok = validateField('lastName', !lastName || lastName.length >= 2, 'Last name must be at least 2 characters or left blank') && ok;
  ok = validateField(
    'phone',
    phoneDigits.length === 10,
    phoneDigits.length < 10
      ? `Phone too short - need 10 digits, you entered ${phoneDigits.length}`
      : 'Please enter a valid 10-digit phone number'
  ) && ok;
  ok = validateField(
    'email',
    emailValid,
    email.includes('@') ? 'Invalid email format - e.g. name@gmail.com' : 'Missing @ - e.g. name@gmail.com'
  ) && ok;

  if (!cart.length) {
    trackCheckoutEvent('checkout_validation_failed', {
      reason: 'empty_cart'
    });
    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    list.innerHTML = '<li>Your cart is empty - go back to shop and add items first</li>';
    banner.className = 'error-banner show hard-error';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (selectedFulfillmentType === 'pickup' && !selectedLoc) {
    document.getElementById('err-location').style.display = 'block';
    ok = false;
  } else {
    document.getElementById('err-location').style.display = 'none';
  }
  if (selectedFulfillmentType === 'shipping' && !validateShippingFields(true)) {
    ok = false;
  }

  if (!ok) {
    trackCheckoutEvent('checkout_validation_failed', {
      reason: 'invalid_required_fields',
      has_pickup_location: Boolean(selectedLoc),
      fulfillment_type: selectedFulfillmentType,
      ...cartAnalyticsSummary()
    });
    setErrorBannerTitle('Please fix the following before placing your order:');
    rebuildErrorBanner();
    return;
  }

  if (payOnline && !currentCustomer && !guestStripeConfirmed) {
    const choice = await showCheckoutAccountChoice({ firstName, lastName, phone, phoneDigits, email });
    if (choice !== 'guest') return;
    guestStripeConfirmed = true;
    trackCheckoutEvent('checkout_guest_payment_confirmed', {
      ...cartAnalyticsSummary(),
      pickup_location: selectedLoc || '',
      fulfillment_type: selectedFulfillmentType
    });
  }

  try {
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = payOnline ? 'Preparing secure payment...' : 'Submitting...';
    }

    const cartIsCurrent = await verifyCartAgainstLiveProducts();
    if (!cartIsCurrent) return;
    paymentPolicy = cartPaymentPolicy();
    updatePaymentUi();
    payOnline = selectedPaymentMethod === 'stripe';
    if (paymentPolicy.requiresStripe && !payOnline) {
      throw new Error('ONLINE_PAYMENT_REQUIRED');
    }
    if (selectedFulfillmentType === 'pickup' && !selectedLoc) {
      throw new Error('PICKUP_LOCATION_REQUIRED');
    }
    if (selectedFulfillmentType === 'shipping' && !validateShippingFields(true)) {
      throw new Error('SHIPPING_ADDRESS_REQUIRED');
    }

    const lockRef = orderLockRef(phoneDigits);
    const lockSnap = await getDoc(lockRef);
    const lockStatus = lockSnap.exists() ? (lockSnap.data()?.status || 'pending') : '';
    if (!currentCustomer && await isActivePendingLock(lockSnap)) {
      trackCheckoutEvent('order_duplicate_blocked', {
        ...cartAnalyticsSummary(),
        pickup_location: selectedLoc
      });
      showDuplicateOrderMessage(phone, lockSnap.data()?.orderId || '');
      return;
    }
    if (lockStatus === 'no_show') {
      await showNoShowNotice();
    }

    const shippingAddress = selectedFulfillmentType === 'shipping' ? getShippingAddress() : null;
    const locLabel = selectedFulfillmentType === 'shipping'
      ? `Shipping to ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}`
      : pickupLocationLabel(selectedLoc);
    const orderRef = doc(collection(db, 'orders'));
    const itemSubtotal = cartItemSubtotal();
    const salesTaxAmount = calculateSalesTax(itemSubtotal);
    const shippingAmount = calculateShippingAmount(itemSubtotal);
    const orderTotal = roundMoney(itemSubtotal + salesTaxAmount + shippingAmount);
    const order = {
      orderNumber: '',
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      phone,
      phoneDigits,
      email,
      fulfillmentType: selectedFulfillmentType,
      fulfillmentLabel: selectedFulfillmentType === 'shipping' ? 'Shipping' : 'Pickup',
      location: selectedFulfillmentType === 'shipping' ? 'shipping' : selectedLoc,
      locationLabel: locLabel,
      pickupLocation: selectedFulfillmentType === 'pickup' ? selectedLoc : '',
      pickupLocationLabel: selectedFulfillmentType === 'pickup' ? locLabel : '',
      shippingAddress: shippingAddress || null,
      referral: referral || 'Not specified',
      notes: notes || '',
      items: cart.map((item) => {
        const productId = cartItemProductId(item);
        const variantId = cartItemVariantId(item);
        const product = cartProductForItem(item);
        return {
          id: item.id,
          productId,
          variantId,
          category: product?.category || item.category || '',
          name: item.name || 'Unknown',
          price: item.price || 'TBD',
          unit: item.unit || '',
          qty: item.qty || 1,
          lineTotal: roundMoney(moneyValue(item.price) * (item.qty || 1))
        };
      }),
      totalBoxes: cart.reduce((sum, item) => sum + (item.qty || 1), 0),
      itemSubtotal,
      salesTaxState: 'VA',
      salesTaxLabel: VIRGINIA_SALES_TAX_LABEL,
      salesTaxRate: VIRGINIA_SALES_TAX_RATE,
      salesTaxAmount,
      shippingLabel: SHIPPING_LABEL,
      shippingAmount,
      shippingFreeThreshold: SHIPPING_FREE_THRESHOLD,
      totalPrice: orderTotal,
      payment: payOnline ? 'online_pending' : 'pending',
      paymentMethod: payOnline ? 'stripe' : 'pay_at_pickup',
      paymentMethodLabel: payOnline ? 'Pay online' : 'Pay at pickup',
      paymentStatus: payOnline ? 'awaiting_payment' : 'pay_at_pickup',
      saveCardRequested: saveCard,
      status: payOnline ? 'awaiting_payment' : 'pending',
      source: 'website',
      skipCustomerEmail: payOnline,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (customerAccountsEnabled() && currentCustomer) {
      order.customerUid = currentCustomer.uid;
      order.customerEmail = currentCustomer.email || email;
    }

    await runTransaction(db, async (transaction) => {
      const pendingLock = await transaction.get(lockRef);
      const pendingLockStatus = pendingLock.exists() ? (pendingLock.data()?.status || 'pending') : '';
      if (!currentCustomer && pendingLockStatus === 'pending') {
        const pendingLockData = pendingLock.data() || {};
        if (pendingLockData.orderId) {
          throw new Error('DUPLICATE_PENDING_ORDER');
        }
      }

      transaction.set(orderRef, order);
      if (!payOnline) {
        transaction.set(lockRef, {
          phoneDigits,
          orderId: orderRef.id,
          status: 'pending',
          updatedAt: serverTimestamp()
        });
      }
    });

    await saveCheckoutDetailsToProfile(order).catch((error) => {
      console.warn('Could not update customer profile from checkout', error);
    });

    if (payOnline) {
      trackCheckoutEvent('stripe_checkout_redirect_started', {
        ...cartAnalyticsSummary(),
        pickup_location: selectedLoc,
        fulfillment_type: selectedFulfillmentType,
        save_card_requested: saveCard
      });
      const session = await createStripeCheckoutSession({
        orderId: orderRef.id,
        saveCard,
        origin: window.location.origin
      });
      const checkoutUrl = session?.data?.url;
      if (!checkoutUrl) throw new Error('STRIPE_CHECKOUT_URL_MISSING');
      rememberRecentOrderForAccount(orderRef, order, session?.data?.orderNumber || orderRef.id);
      window.location.href = checkoutUrl;
      return;
    }

    const submittedOrderAnalytics = {
      ...cartAnalyticsSummary(),
      pickup_location: selectedLoc,
      fulfillment_type: selectedFulfillmentType,
      referral: referral || 'Not specified',
      payment_method: selectedPaymentMethod
    };
    const submittedCartItems = cart.map((item) => ({ ...item }));

    sessionStorage.removeItem('shrish_cart');
    cart = [];
    updateNavCart();

    document.getElementById('checkoutWrap').style.display = 'none';
    document.getElementById('successScreen').style.display = 'block';
    document.getElementById('successOrderNum').textContent = 'Generating confirmation number...';

    const confirmationNumber = currentCustomer ? await waitForOrderConfirmationNumber(orderRef) : '';
    const displayNumber = confirmationNumber || '';
    document.getElementById('successOrderNum').innerHTML = confirmationNumber
      ? `Order Confirmation No: ${orderNumberHighlight(confirmationNumber)}`
      : 'Order received - your SHR confirmation number will be sent by email.';

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
      <div class="ss-row"><span>Subtotal</span><span>${formatCurrency(order.itemSubtotal || 0)}</span></div>
      <div class="ss-row"><span>${escapeHtml(order.salesTaxLabel || VIRGINIA_SALES_TAX_LABEL)}</span><span>${formatCurrency(order.salesTaxAmount || 0)}</span></div>
      <div class="ss-row"><span>Shipping</span><span>${order.shippingAmount > 0 ? formatCurrency(order.shippingAmount) : (order.fulfillmentType === 'shipping' ? 'Free' : 'Not selected')}</span></div>
      <div class="ss-row"><span>${order.fulfillmentType === 'shipping' ? 'Ship to' : 'Pickup'}</span><span>${escapeHtml(order.fulfillmentType === 'shipping' ? shippingAddressLabel(order.shippingAddress || {}) : locLabel)}</span></div>
      <div class="ss-row"><span>Name</span><span>${escapeHtml(`${firstName} ${lastName}`.trim())}</span></div>
      <div class="ss-row"><span>Phone</span><span>${escapeHtml(phone)}</span></div>
      <div class="ss-row"><span>Payment</span><span style="color:#2E7D32;font-weight:700">Pay at Pickup</span></div>
      <div class="ss-row"><span>Order Confirmation No</span><span>${confirmationNumber ? orderNumberHighlight(confirmationNumber) : escapeHtml('Sending by email')}</span></div>`;

    rememberRecentOrderForAccount(orderRef, order, displayNumber);
    renderSuccessAccountPrompt(orderRef, order, displayNumber);

    // Show refund request section
    injectRefundSection(
      orderRef.id,
      displayNumber,
      order.totalPrice || 0,
      order.paymentMethod || 'pay_at_pickup',
      null,
      `${firstName} ${lastName}`.trim(),
      email,
      phone
    );

    trackCheckoutEvent('order_submitted', {
      ...submittedOrderAnalytics
    });
    submittedCartItems.forEach((item) => {
      const productId = cartItemProductId(item);
      const product = productId ? window.SHRISH_DATA?.products?.find((entry) => entry.id === productId) : null;
      trackCheckoutEvent('order_item_submitted', {
        product_id: productId,
        product_title: item.name || product?.name || '',
        category: product?.category || '',
        filter_group: product?.filterGroup || '',
        quantity: Number(item.qty || 1),
        line_total: Number((moneyValue(item.price) * (item.qty || 1)).toFixed(2)),
        pickup_location: selectedLoc,
        fulfillment_type: selectedFulfillmentType,
        payment_method: selectedPaymentMethod,
        ...submittedOrderAnalytics
      });
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Order submit failed', error);
    trackCheckoutEvent('order_submit_failed', {
      reason: error?.message === 'DUPLICATE_PENDING_ORDER'
        ? 'duplicate_pending_order'
        : error?.message === 'LIVE_PRODUCT_CHECK_FAILED'
          ? 'live_product_check_failed'
          : (error?.code || 'submit_error'),
      attempt_cart_total_items: attemptCartAnalytics.cart_total_items || 0,
      attempt_cart_distinct_items: attemptCartAnalytics.cart_distinct_items || 0,
      attempt_cart_estimated_total: attemptCartAnalytics.cart_estimated_total || 0,
      attempt_cart_product_ids: attemptCartAnalytics.cart_product_ids || [],
      attempt_cart_product_titles: attemptCartAnalytics.cart_product_titles || [],
      attempt_cart_categories: attemptCartAnalytics.cart_categories || [],
      ...cartAnalyticsSummary(),
      pickup_location: selectedLoc || ''
    });

    const banner = document.getElementById('errorBanner');
    const list = document.getElementById('errorList');
    if (
      error?.message === 'DUPLICATE_PENDING_ORDER' ||
      (!currentCustomer && error?.code === 'permission-denied')
    ) {
      const lockRef = orderLockRef(phoneDigits);
      const existingLock = await getDoc(lockRef).catch(() => null);
      if (await isActivePendingLock(existingLock)) {
        showDuplicateOrderMessage(phone, existingLock.data()?.orderId || '');
        return;
      }

      setErrorBannerTitle('You already have a pending order');
      list.innerHTML = '<li>Please sign in to your Shrish account to modify your existing pending order, or contact us on WhatsApp if you need help.</li>';
    } else if (currentCustomer && error?.code === 'permission-denied') {
      setErrorBannerTitle('Could not verify this checkout');
      list.innerHTML = '<li>Please refresh and try again. If this keeps happening, contact us on WhatsApp and we can help clean up the old order status.</li>';
    } else if (error?.message === 'LIVE_PRODUCT_CHECK_FAILED') {
      setErrorBannerTitle('Please refresh before placing your order');
      list.innerHTML = '<li>We could not verify live product availability right now. Please refresh and try again before placing the order.</li>';
    } else if (error?.message === 'ONLINE_PAYMENT_REQUIRED') {
      setErrorBannerTitle('Online payment is required for this cart');
      list.innerHTML = '<li>This cart does not include mangoes, so it must be paid online securely with Stripe.</li>';
    } else if (error?.message === 'PICKUP_LOCATION_REQUIRED') {
      setErrorBannerTitle('Pickup location required');
      list.innerHTML = '<li>Please select a pickup location before placing this order.</li>';
    } else if (error?.message === 'SHIPPING_ADDRESS_REQUIRED') {
      setErrorBannerTitle('Shipping address required');
      list.innerHTML = '<li>Please complete the shipping address before placing this order.</li>';
    } else if (payOnline) {
      setErrorBannerTitle('Online payment could not start');
      const detail = error?.message || error?.code || '';
      list.innerHTML = `<li>Your order was not charged. Please try again or contact us on WhatsApp.</li>${detail ? `<li style="font-size:12px">Payment setup detail: ${escapeHtml(detail)}</li>` : ''}`;
    } else {
      setErrorBannerTitle('Please fix the following before placing your order:');
      list.innerHTML = '<li>We could not submit your order right now. Please try again in a minute.</li>';
    }
    banner.className = 'error-banner show hard-error';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      updatePaymentUi();
    }
  }
}

async function init() {
  if (await renderStripeReturnMessage()) return;
  renderCartReview();
  updateNavCart();
  bindFormUi();
  bindFulfillmentUi();
  bindPaymentUi();
  bindCustomerProfile();
  trackCheckoutEvent('checkout_viewed', {
    has_cart: Boolean(cart.length),
    ...cartAnalyticsSummary()
  });
}

init();


// ══════════════════════════════════════════════════════════════════════════════
// REFUND REQUEST — Customer Side
// ══════════════════════════════════════════════════════════════════════════════

async function submitRefundRequest({ orderId, orderNumber, orderTotal, paymentMethod, stripePaymentIntentId, customerName, customerEmail, customerPhone }) {
  const form = document.getElementById('refundReqForm');
  const submitBtn = document.getElementById('refundReqSubmit');
  const reason = document.getElementById('refundReason')?.value?.trim();
  const requestedAmount = document.getElementById('refundAmount')?.value?.trim();
  const reasonType = document.getElementById('refundReasonType')?.value;

  if (!reason || reason.length < 10) {
    alert('Please describe your reason (at least 10 characters).');
    return;
  }
  if (!requestedAmount || parseFloat(requestedAmount) <= 0) {
    alert('Please enter the refund amount you are requesting.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const { collection, addDoc } = window._firestoreExports || {};
    if (!collection || !addDoc) throw new Error('Firestore not loaded');

    await addDoc(collection(db, 'refund_requests'), {
      orderId,
      orderNumber: orderNumber || orderId,
      orderTotal: orderTotal || 0,
      requestedAmount: parseFloat(requestedAmount),
      paymentMethod: paymentMethod || 'pickup',
      stripePaymentIntentId: stripePaymentIntentId || null,
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || '',
      reason: `[${reasonType || 'other'}] ${reason}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Show success message
    if (form) form.style.display = 'none';
    const successMsg = document.getElementById('refundReqSuccess');
    if (successMsg) successMsg.style.display = 'block';

  } catch (err) {
    console.error('Refund request error:', err);
    alert('Could not submit your request. Please contact us on WhatsApp or email contact@shrish.co');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Refund Request';
  }
}

function injectRefundSection(orderId, orderNumber, orderTotal, paymentMethod, stripePaymentIntentId, customerName, customerEmail, customerPhone) {
  // ── REFUND REQUEST FEATURE TEMPORARILY DISABLED ──
  // To re-enable, delete the next two lines.
  return;
  /* eslint-disable no-unreachable */
  const container = document.getElementById('refundSection');
  if (!container) return;
  container.innerHTML = `
    <div class="refund-request-section">
      <h4>🔄 Request a Refund</h4>
      <p>Need a refund? Submit your request below. We process refunds within <strong>3–5 business days</strong>.
         For Stripe payments, the refund goes back to your original card.
         For pickup payments, we'll arrange a Zelle or cash refund at your next pickup.</p>
      <div class="refund-req-form" id="refundReqForm">
        <select id="refundReasonType">
          <option value="">-- Select reason --</option>
          <option value="wrong_item">Wrong item received</option>
          <option value="quality_issue">Quality issue / damaged product</option>
          <option value="order_cancelled">I want to cancel my order</option>
          <option value="overcharged">I was overcharged</option>
          <option value="partial">Partial refund for missing items</option>
          <option value="other">Other</option>
        </select>
        <textarea id="refundReason" rows="3" placeholder="Please describe the issue in detail..."></textarea>
        <div style="display:flex;gap:10px;align-items:center">
          <label style="font-size:13px;white-space:nowrap;font-weight:600">Refund amount ($)</label>
          <input id="refundAmount" type="number" min="0" max="${orderTotal||999}" step="0.01"
                 value="${orderTotal||''}" placeholder="0.00" style="flex:1">
        </div>
        <div style="font-size:11px;color:var(--text-light)">Order total: $${parseFloat(orderTotal||0).toFixed(2)} &nbsp;·&nbsp; You may request a partial or full refund.</div>
        <button class="refund-req-submit" id="refundReqSubmit"
          onclick="submitRefundRequest({
            orderId:'${escapeHtml(orderId)}',
            orderNumber:'${escapeHtml(orderNumber||'')}',
            orderTotal:${parseFloat(orderTotal||0)},
            paymentMethod:'${escapeHtml(paymentMethod||'pickup')}',
            stripePaymentIntentId:${stripePaymentIntentId ? `'${escapeHtml(stripePaymentIntentId)}'` : 'null'},
            customerName:'${escapeHtml(customerName||'')}',
            customerEmail:'${escapeHtml(customerEmail||'')}',
            customerPhone:'${escapeHtml(customerPhone||'')}'
          })">
          Submit Refund Request
        </button>
      </div>
      <div id="refundReqSuccess" class="refund-submitted-msg" style="display:none">
        ✅ Refund request submitted! We'll review it within 3–5 business days and contact you at ${escapeHtml(customerEmail||'your email')}.
      </div>
    </div>`;
  container.style.display = 'block';
}

window.submitRefundRequest = submitRefundRequest;
window.injectRefundSection = injectRefundSection;
