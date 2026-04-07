import { db, collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp, escapeHtml } from './firebase-app.js';

let homeModalProductId = null;
let homeModalQty = 1;

function getCart() {
  return JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
}

function saveCart(cart) {
  sessionStorage.setItem('shrish_cart', JSON.stringify(cart));
}

function updateNavCartState() {
  const cart = getCart();
  const total = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  const badge = document.getElementById('navCartBadge');
  if (badge) badge.textContent = total;

  const navCartLink = document.getElementById('navCartLink');
  if (navCartLink) navCartLink.href = total > 0 ? 'order.html' : 'shop.html';
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function setSubscribeMessage(type, message) {
  const el = document.getElementById('footerSubscribeMessage');
  if (!el) return;
  el.className = `subscribe-message ${type}`;
  el.textContent = message;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

async function subscribeFooterEmail(event) {
  event.preventDefault();

  const emailInput = document.getElementById('footerSubscribeEmail');
  const submitButton = document.getElementById('footerSubscribeButton');
  if (!emailInput || !submitButton) return;

  const email = normalizeEmail(emailInput.value);
  if (!isValidEmail(email)) {
    setSubscribeMessage('error', 'Please enter a valid email address.');
    emailInput.focus();
    return;
  }

  submitButton.disabled = true;
  setSubscribeMessage('info', 'Saving your subscription...');

  try {
    const subscriberRef = doc(db, 'email_subscribers', email);
    const existing = await getDoc(subscriberRef);

    if (existing.exists()) {
      setSubscribeMessage('info', 'This email is already subscribed for updates.');
      return;
    }

    await setDoc(subscriberRef, {
      email,
      status: 'subscribed',
      subscriptionType: 'general',
      subscriptionLabel: 'General',
      marketingConsent: true,
      consentText: 'Subscriber agreed to receive marketing and promotional emails from Shrish via the homepage footer form.',
      source: 'homepage_footer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    emailInput.value = '';
    setSubscribeMessage('success', 'Thanks. You are subscribed for new product updates and promotions.');
  } catch (error) {
    console.error('Footer subscribe failed', error);
    setSubscribeMessage('error', 'We could not save your subscription right now. Please try again in a minute.');
  } finally {
    submitButton.disabled = false;
  }
}

function initFooterSubscribe() {
  const form = document.getElementById('footerSubscribeForm');
  if (!form) return;
  form.addEventListener('submit', subscribeFooterEmail);
}

function addToCart(productId, qty = 1) {
  const product = window.SHRISH_DATA?.products?.find((item) => item.id === productId);
  if (!product || !product.available || product.displayOnly) return;

  const cart = getCart();
  const existing = cart.find((item) => item.id === productId);
  if (existing) existing.qty += qty;
  else cart.push({ id: product.id, qty, price: product.price, name: product.name, unit: product.unit, image: product.image });

  saveCart(cart);
  updateNavCartState();
  showToast(`${product.name} added to cart`);
  renderHomeCardQty(productId);
}

function renderHomeCardQty(productId) {
  const wrap = document.getElementById(`home-card-actions-${productId}`);
  if (!wrap) return;

  const item = getCart().find((cartItem) => cartItem.id === productId);
  const qty = item ? item.qty : 0;
  const safeId = escapeHtml(productId);

  if (qty === 0) {
    wrap.innerHTML = `<button type="button" class="product-card-btn product-card-btn-secondary" onclick="openHomeProductModal('${safeId}')">Details</button><button type="button" class="product-card-btn product-card-btn-primary" onclick="quickAddHomeProduct('${safeId}')">Add to Cart</button>`;
    return;
  }

  wrap.innerHTML = `<button type="button" class="product-card-btn product-card-btn-secondary" onclick="openHomeProductModal('${safeId}')">Details</button><div class="home-card-qty-wrap"><button type="button" class="home-card-qty-btn remove-btn" onclick="homeCardQtyChange('${safeId}',-1)" title="Remove one">-</button><div class="home-card-qty-mid"><span class="hcqn">${qty}</span><span style="font-size:11px;opacity:.85">box${qty !== 1 ? 'es' : ''}</span></div><button type="button" class="home-card-qty-btn" onclick="homeCardQtyChange('${safeId}',1)" title="Add one">+</button></div>`;
}

function homeCardQtyChange(productId, delta) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.id === productId);
  if (!item) return;

  item.qty = Math.max(0, item.qty + delta);
  const product = window.SHRISH_DATA?.products?.find((entry) => entry.id === productId);

  if (item.qty === 0) {
    const nextCart = cart.filter((cartItem) => cartItem.id !== productId);
    saveCart(nextCart);
    updateNavCartState();
    renderHomeCardQty(productId);
    showToast('Removed from cart');
    return;
  }

  saveCart(cart);
  updateNavCartState();
  renderHomeCardQty(productId);
  showToast(delta > 0 ? `${product?.name || 'Item'} quantity updated` : 'Removed one box');
}

function renderHomeModal(productId) {
  const product = window.SHRISH_DATA?.products?.find((item) => item.id === productId);
  const modal = document.getElementById('homeProductModal');
  const media = document.getElementById('homeProductModalMedia');
  const content = document.getElementById('homeProductModalContent');
  if (!product || !modal || !media || !content) return;

  homeModalProductId = productId;
  homeModalQty = 1;
  const isAvailable = product.available && !product.displayOnly;

  const chips = [product.season, product.taste]
    .filter(Boolean)
    .map((value) => `<span class="home-product-modal-chip">${escapeHtml(value)}</span>`)
    .join('');

  media.innerHTML = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">`
    : '<div class="home-product-modal-fallback">🥭</div>';

  content.innerHTML = `
    <div class="home-product-modal-origin">${escapeHtml(product.origin || 'Indian Mango')}</div>
    <h3 class="home-product-modal-title" id="homeProductModalTitle">${escapeHtml(product.name)}</h3>
    ${product.localName ? `<div class="home-product-modal-local">${escapeHtml(product.localName)}</div>` : ''}
    <div class="home-product-modal-status ${isAvailable ? 'available' : 'unavailable'}">${isAvailable ? 'Available now' : 'Currently sold out'}</div>
    <div class="home-product-modal-desc">${escapeHtml(product.description || '')}</div>
    ${chips ? `<div class="home-product-modal-meta">${chips}</div>` : ''}
    ${product.bestFor ? `<div class="home-product-modal-best"><strong>Best for:</strong> ${escapeHtml(product.bestFor)}</div>` : ''}
    <div class="home-product-modal-price">${escapeHtml(product.price || '')}</div>
    <div class="home-product-modal-unit">${escapeHtml(product.unit || '')}</div>
    <div class="home-product-modal-actions">
      <div class="home-product-qty">
        <button type="button" onclick="changeHomeProductQty(-1)">-</button>
        <span id="homeProductQtyValue">1</span>
        <button type="button" onclick="changeHomeProductQty(1)">+</button>
      </div>
      <button type="button" class="home-product-modal-add" onclick="addHomeProductToCart()" ${isAvailable ? '' : 'disabled'}>${isAvailable ? 'Add to Cart' : 'Sold Out'}</button>
    </div>`;

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeHomeProductModal() {
  const modal = document.getElementById('homeProductModal');
  if (!modal) return;

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function handleHomeProductOverlayClick(event) {
  if (event.target.id === 'homeProductModal') closeHomeProductModal();
}

function changeHomeProductQty(delta) {
  homeModalQty = Math.max(1, Math.min(20, homeModalQty + delta));
  const qty = document.getElementById('homeProductQtyValue');
  if (qty) qty.textContent = String(homeModalQty);
}

function addHomeProductToCart() {
  if (!homeModalProductId) return;
  addToCart(homeModalProductId, homeModalQty);
}

function renderHomeProducts(products) {
  const productsGrid = document.getElementById('productsGrid');
  if (!productsGrid) return;

  const mangoes = products.filter((p) => p.category === 'mangoes');
  const available = mangoes.filter((p) => p.available);
  const toShow = (available.length ? available : mangoes).slice(0, 3);

  productsGrid.innerHTML = '';

  toShow.forEach((p) => {
    const description = (p.description || '').slice(0, 80);
    const hasMore = (p.description || '').length > 80;
    const imgHtml = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const fallbackStyle = p.image ? 'style="display:none"' : '';
    productsGrid.innerHTML += `
      <div class="product-card ${p.available ? '' : 'product-card-unavailable'}">
        ${p.tag ? `<div class="product-card-badge">${escapeHtml(p.tag)}</div>` : ''}
        <div class="product-card-img product-card-clickable" onclick="openHomeProductModal('${escapeHtml(p.id)}')" style="padding:0;overflow:hidden;${p.image ? '' : 'display:flex;align-items:center;justify-content:center'}">
          ${imgHtml}
          <span ${fallbackStyle} style="font-size:56px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">🥭</span>
        </div>
        <div class="product-card-body">
          <h3 class="product-card-clickable" onclick="openHomeProductModal('${escapeHtml(p.id)}')">${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(description)}${hasMore ? '...' : ''}</p>
          <div class="product-card-footer">
            <div>
              <div class="product-price">${escapeHtml(p.price)}</div>
              <div class="product-unit">${escapeHtml(p.unit)}</div>
            </div>
            <span class="product-status-badge ${p.available ? 'available' : 'unavailable'}">
              ${p.available ? 'Available' : 'Sold Out'}
            </span>
          </div>
          <div class="product-card-actions" id="home-card-actions-${escapeHtml(p.id)}">
            <button type="button" class="product-card-btn product-card-btn-secondary" onclick="openHomeProductModal('${escapeHtml(p.id)}')">Details</button>
            <button type="button" class="product-card-btn product-card-btn-primary" onclick="quickAddHomeProduct('${escapeHtml(p.id)}')" ${p.available && !p.displayOnly ? '' : 'disabled'}>${p.available && !p.displayOnly ? 'Add to Cart' : 'Sold Out'}</button>
          </div>
        </div>
      </div>`;

    if (p.available && !p.displayOnly) {
      renderHomeCardQty(p.id);
    }
  });
}

function mergeProducts(baseProducts, docs) {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return baseProducts.map((product) => ({ ...product, ...(byId.get(product.id) || {}) }));
}

function init() {
  initFooterSubscribe();
  if (!window.SHRISH_DATA?.products) return;
  const baseProducts = JSON.parse(JSON.stringify(window.SHRISH_DATA.products));
  updateNavCartState();
  renderHomeProducts(baseProducts);

  onSnapshot(collection(db, 'products'), (snapshot) => {
    const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    window.SHRISH_DATA.products = mergeProducts(baseProducts, docs);
    renderHomeProducts(window.SHRISH_DATA.products);
  }, (error) => {
    console.error('Homepage catalog sync failed', error);
  });
}

window.openHomeProductModal = renderHomeModal;
window.closeHomeProductModal = closeHomeProductModal;
window.handleHomeProductOverlayClick = handleHomeProductOverlayClick;
window.changeHomeProductQty = changeHomeProductQty;
window.addHomeProductToCart = addHomeProductToCart;
window.quickAddHomeProduct = (productId) => addToCart(productId, 1);
window.homeCardQtyChange = homeCardQtyChange;

init();
