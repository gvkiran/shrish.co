import { db, collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp, escapeHtml } from './firebase-app.js';

'use strict';

let cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
let activeFilter = 'all';
let baseProducts = JSON.parse(JSON.stringify(window.SHRISH_DATA?.products || []));
let modalQty = 1;
let modalProductId = null;
let notifyTarget = null;

const PRODUCT_IMAGES = {
  alphonso: ['img_alphonso.jpeg'],
  kesar: ['img_kesar.jpeg'],
  banganapalli: ['img_banganapalli.jpg'],
  langra: ['img_langra.jpg'],
  rasalu: ['img_rasalu.jpeg'],
  himayat: ['img_himayath_real.jpg', 'img_himayat.jpg'],
  payari: ['img_payari.jpg', 'img_payri.webp'],
  puth_plain: ['img_puth_plain.jpeg'],
  puth_sugar_kaju: ['img_puth_sugar_kaju.jpg'],
  puth_sugar_kaju_pista: ['img_puth_sugar_kaju_pista.png'],
  puth_jaggery_kaju_pista: ['img_puth_jaggery_kaju_pista.png'],
  puth_sugarfree: ['img_puth_sugarfree.jpg'],
  mango_jelly_sugar: ['img_mango_jelly.webp'],
  mango_jelly_jaggery: ['img_mango_jelly.webp'],
  palm_jelly: ['img_palm_jelly.webp']
};

function saveCart() {
  sessionStorage.setItem('shrish_cart', JSON.stringify(cart));
}

function mergeProducts(docs) {
  const byId = new Map(docs.map((item) => [item.id, item]));
  const mergedBase = baseProducts.map((product) => ({ ...product, ...(byId.get(product.id) || {}) }));
  const extraProducts = docs
    .filter((item) => !baseProducts.some((product) => product.id === item.id))
    .map((item) => ({ ...item }));
  window.SHRISH_DATA.products = [...mergedBase, ...extraProducts];
}

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const cartFabCount = document.getElementById('cartFabCount');
  if (cartFabCount) cartFabCount.textContent = total;
  const navBadge = document.getElementById('navCartBadge');
  if (navBadge) navBadge.textContent = total;
  const fab = document.getElementById('cartFab');
  if (fab) fab.style.display = 'flex';
  const cta = document.getElementById('orderCta');
  if (cta) cta.style.display = total > 0 ? 'block' : 'none';
  renderCartDrawer();
}

function renderCartDrawer() {
  const list = document.getElementById('cartItemsList');
  const foot = document.getElementById('cartFootPanel');
  const totalEl = document.getElementById('cartTotalQty');
  if (!list || !foot || !totalEl) return;

  if (!cart.length) {
    list.innerHTML = `<div class="cart-empty-state">
      <div class="ce-icon">🛒</div>
      <p style="font-size:16px;font-weight:600;color:var(--dark);margin-bottom:8px">Your cart is empty</p>
      <p style="font-size:14px;color:var(--text-light);margin-bottom:20px">Browse our fresh Indian mangoes and add some to your cart!</p>
      <a href="shop.html" onclick="closeCart()" style="display:inline-flex;align-items:center;gap:8px;background:var(--saffron);color:white;padding:12px 24px;border-radius:50px;font-family:var(--font-body);font-size:14px;font-weight:700;text-decoration:none;transition:all .3s">🥭 Shop Mangoes</a>
    </div>`;
    foot.style.display = 'none';
    return;
  }

  foot.style.display = 'block';
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  totalEl.textContent = `${totalQty} box${totalQty !== 1 ? 'es' : ''}`;
  list.innerHTML = cart.map((item) => {
    const imgHtml = item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.textContent='🥭'">` : '🥭';
    return `<div class="cart-item">
      <div class="ci-img">${imgHtml}</div>
      <div class="ci-info">
        <div class="ci-name">${escapeHtml(item.name)}</div>
        <div class="ci-price">${escapeHtml(item.price)} · ${escapeHtml(item.unit)}</div>
        <div class="ci-qty-row">
          <button class="ci-qty-btn" onclick="cartQty('${escapeHtml(item.id)}',-1)">−</button>
          <span class="ci-qty-num">${item.qty}</span>
          <button class="ci-qty-btn" onclick="cartQty('${escapeHtml(item.id)}',1)">+</button>
          <span style="font-size:11px;color:var(--text-light);margin-left:4px">box${item.qty > 1 ? 'es' : ''}</span>
        </div>
      </div>
      <button class="ci-remove" onclick="cartRemove('${escapeHtml(item.id)}')">✕</button>
    </div>`;
  }).join('');
}

function cartQty(id, delta) {
  const item = cart.find((x) => x.id === id);
  if (!item) return;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) cart = cart.filter((x) => x.id !== id);
  saveCart();
  updateCartUI();
  renderCardQty(id);
}

function cartRemove(id) {
  cart = cart.filter((x) => x.id !== id);
  saveCart();
  updateCartUI();
  renderCardQty(id);
}

function addToCart(productId, qty) {
  const p = window.SHRISH_DATA.products.find((x) => x.id === productId);
  if (!p || !p.available || p.displayOnly) return;
  const existing = cart.find((x) => x.id === productId);
  if (existing) existing.qty += qty;
  else cart.push({ id: p.id, name: p.name, price: p.price, unit: p.unit, image: p.image || null, qty });
  saveCart();
  updateCartUI();
  showToast(`✓ ${p.name} added!`);
  renderCardQty(productId);
}

function openCart() {
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function goCheckout() {
  if (!cart.length) {
    showToast('Your cart is empty!');
    return;
  }
  saveCart();
  window.location.href = 'order.html';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function openModal(productId) {
  const p = window.SHRISH_DATA.products.find((x) => x.id === productId);
  if (!p) return;
  modalProductId = productId;
  modalQty = 1;

  const isAvail = p.available && !p.displayOnly;
  const isSoon = p.displayOnly;
  const imgs = PRODUCT_IMAGES[productId] || (p.image ? [p.image] : []);

  const mainWrap = document.getElementById('modalMainImgWrap');
  if (mainWrap) {
    mainWrap.innerHTML = imgs.length
      ? `<img class="modal-main-img" id="modalMainImg" src="${escapeHtml(imgs[0])}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none'">`
      : `<div class="modal-img-placeholder">🥭</div>`;
  }

  const thumbs = document.getElementById('modalThumbs');
  if (thumbs) {
    if (imgs.length > 1) {
      thumbs.innerHTML = imgs.map((src, i) => `<img class="modal-thumb ${i === 0 ? 'active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(p.name)} ${i + 1}" onclick="switchModalImg('${escapeHtml(src)}',this)" onerror="this.style.display='none'">`).join('');
      thumbs.style.display = 'flex';
    } else {
      thumbs.innerHTML = '';
      thumbs.style.display = 'none';
    }
  }

  const statusCls = isSoon ? 'soon' : isAvail ? 'avail' : 'sold';
  const statusText = isSoon ? '🔔 Coming Soon' : isAvail ? '✓ Available Now' : '✗ Currently Sold Out';
  const chips = [p.season && `📅 ${p.season}`, p.taste && `👅 ${p.taste}`]
    .filter(Boolean)
    .map((chip) => `<span class="modal-chip">${escapeHtml(chip)}</span>`)
    .join('');

  const badges = (p.badges || []).map((badge) => {
    let cls = '';
    if (/gi|iso/i.test(badge)) cls = 'blue';
    else if (/free|diabetic|health/i.test(badge)) cls = 'green';
    else if (/limited|seasonal/i.test(badge)) cls = 'red';
    return `<span class="modal-badge ${cls}">${escapeHtml(badge)}</span>`;
  }).join('');

  let actionHtml = '';
  if (isSoon) {
    actionHtml = `<button class="modal-notify-btn" onclick="notifyMe('${escapeHtml(p.id)}','${escapeHtml(p.name)}')">🔔 Notify Me</button>`;
  } else if (isAvail) {
    actionHtml = `<div class="modal-qty-row"><div class="modal-qty-ctrl"><button class="modal-qty-btn" onclick="modalChangeQty(-1)">−</button><span class="modal-qty-num" id="modalQtyNum">1</span><button class="modal-qty-btn" onclick="modalChangeQty(1)">+</button></div><span style="font-size:13px;color:var(--text-light)">box</span><button class="modal-add-btn" id="modalAddBtn" onclick="modalAddToCart()">Add to Cart</button></div>`;
  } else {
    actionHtml = `<button class="modal-add-btn" style="background:#ccc;cursor:not-allowed" disabled>Currently Sold Out</button>`;
  }

  const info = document.getElementById('modalInfo');
  if (info) {
    info.innerHTML = `
      <div class="modal-origin">${escapeHtml(p.origin)}</div>
      <div class="modal-name">${escapeHtml(p.name)}</div>
      ${p.localName ? `<div class="modal-local">${escapeHtml(p.localName)}</div>` : ''}
      <div class="modal-status ${statusCls}">${statusText}</div>
      <div class="modal-desc">${escapeHtml(p.description)}</div>
      ${chips ? `<div class="modal-chips">${chips}</div>` : ''}
      ${badges ? `<div class="modal-badges">${badges}</div>` : ''}
      ${p.details ? `<div class="modal-note">ℹ️ ${escapeHtml(p.details)}</div>` : ''}
      ${p.bestFor ? `<div class="modal-best">🍽 <strong>Best for:</strong> ${escapeHtml(p.bestFor)}</div>` : ''}
      <div class="modal-price-row"><div><div class="modal-price">${escapeHtml(p.price)}</div><div class="modal-unit">${escapeHtml(p.unit)}</div></div></div>
      ${actionHtml}`;
  }

  document.getElementById('productModal')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function switchModalImg(src, thumb) {
  const main = document.getElementById('modalMainImg');
  if (main) main.src = src;
  document.querySelectorAll('.modal-thumb').forEach((t) => t.classList.remove('active'));
  thumb.classList.add('active');
}

function closeModal() {
  document.getElementById('productModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('productModal')) closeModal();
}

function modalChangeQty(delta) {
  modalQty = Math.max(1, Math.min(20, modalQty + delta));
  const el = document.getElementById('modalQtyNum');
  if (el) el.textContent = modalQty;
}

function modalAddToCart() {
  if (!modalProductId) return;
  addToCart(modalProductId, modalQty);
  const btn = document.getElementById('modalAddBtn');
  if (!btn) return;
  btn.textContent = '✓ Added!';
  btn.classList.add('added');
  setTimeout(() => {
    btn.textContent = 'Add to Cart';
    btn.classList.remove('added');
  }, 1800);
}

async function notifyMe(productId, productName) {
  notifyTarget = { productId, productName };
  const title = document.getElementById('notifyModalTitle');
  const text = document.getElementById('notifyModalText');
  const email = document.getElementById('notifyEmail');
  const msg = document.getElementById('notifyMessage');
  const modal = document.getElementById('notifyModal');

  if (title) title.textContent = 'Get Notified';
  if (text) text.textContent = `Enter your email and we’ll let you know when "${productName}" is available.`;
  if (email) email.value = '';
  if (msg) {
    msg.className = 'notify-message';
    msg.textContent = '';
  }
  if (modal) modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNotifyModal() {
  const modal = document.getElementById('notifyModal');
  const msg = document.getElementById('notifyMessage');
  if (modal) modal.classList.remove('open');
  if (msg) {
    msg.className = 'notify-message';
    msg.textContent = '';
  }
  const productModalOpen = document.getElementById('productModal')?.classList.contains('open');
  const cartOpen = document.getElementById('cartDrawer')?.classList.contains('open');
  document.body.style.overflow = productModalOpen || cartOpen ? 'hidden' : '';
}

function handleNotifyOverlayClick(event) {
  if (event.target?.id === 'notifyModal') closeNotifyModal();
}

function setNotifyMessage(type, message) {
  const el = document.getElementById('notifyMessage');
  if (!el) return;
  el.className = `notify-message ${type}`;
  el.textContent = message;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

async function submitNotifyRequest(event) {
  event.preventDefault();

  const emailInput = document.getElementById('notifyEmail');
  const submitButton = document.getElementById('notifySubmitButton');
  if (!emailInput || !submitButton || !notifyTarget) return;

  const email = normalizeEmail(emailInput.value);
  if (!isValidEmail(email)) {
    setNotifyMessage('error', 'Please enter a valid email address.');
    emailInput.focus();
    return;
  }

  submitButton.disabled = true;
  setNotifyMessage('info', 'Saving your notification request...');

  try {
    const docId = `${notifyTarget.productId}__${email.replace(/[^a-z0-9@._-]/gi, '_')}`;
    const requestRef = doc(db, 'notify_requests', docId);
    const existing = await getDoc(requestRef);

    if (existing.exists()) {
      setNotifyMessage('info', 'This email is already subscribed for this product.');
      return;
    }

    await setDoc(requestRef, {
      email,
      productId: notifyTarget.productId,
      productName: notifyTarget.productName,
      subscriptionType: 'product',
      subscriptionLabel: notifyTarget.productName,
      status: 'subscribed',
      marketingConsent: true,
      consentText: 'Subscriber agreed to receive product availability notifications and related promotional emails from Shrish via the shop notify form.',
      source: 'shop_notify_modal',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    setNotifyMessage('success', `Thanks. We’ll notify you when "${notifyTarget.productName}" is available.`);
    emailInput.value = '';
    showToast(`Saved notification for ${notifyTarget.productName}`);
    window.setTimeout(() => {
      closeNotifyModal();
    }, 1200);
  } catch (error) {
    console.error(error);
    setNotifyMessage('error', 'Could not save request right now. Please try again in a minute.');
  } finally {
    submitButton.disabled = false;
  }
}

function tagClass(tag) {
  if (!tag) return '';
  const t = tag.toLowerCase();
  if (t.includes('coming')) return 't-coming';
  if (t.includes('rare') || t.includes('seasonal')) return 't-rare';
  if (t.includes('diabetic') || t.includes('free')) return 't-diabetic';
  if (t.includes('requested')) return 't-requested';
  return 't-default';
}

function renderCard(p) {
  const isAvail = p.available && !p.displayOnly;
  const isSoon = p.displayOnly;
  const stripCls = isSoon ? 'soon' : isAvail ? 'avail' : 'sold';
  const stripText = isSoon ? '🔔 Coming Soon' : isAvail ? '✓ Available' : '✗ Sold Out';
  const imgSrc = p.image || null;
  const imgHtml = imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
  const emojiStyle = imgSrc ? 'style="display:none"' : '';
  const shortDesc = (p.description || '').length > 90 ? `${p.description.slice(0, 90)}…` : (p.description || '');

  let actionHtml = '';
  if (isSoon) {
    actionHtml = `<button class="pc-notify-btn" onclick="notifyMe('${escapeHtml(p.id)}','${escapeHtml(p.name)}')">🔔 Notify Me</button>`;
  } else if (isAvail) {
    actionHtml = `<div class="pc-card-actions" id="card-actions-${escapeHtml(p.id)}"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button><button class="pc-add-btn" onclick="quickAdd('${escapeHtml(p.id)}')">+ Add to Cart</button></div>`;
  } else {
    actionHtml = `<div class="pc-card-actions"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button><button class="pc-add-btn" disabled>Sold Out</button></div>`;
  }

  return `<div class="pc ${isSoon ? 'display-only' : ''} ${!isAvail && !isSoon ? 'sold-out' : ''}">
      ${p.tag ? `<div class="pc-tag ${tagClass(p.tag)}">${escapeHtml(p.tag)}</div>` : ''}
      <div class="pc-img" onclick="openModal('${escapeHtml(p.id)}')">
        ${imgHtml}
        <div class="pc-img-emoji" ${emojiStyle}>🥭</div>
        <div class="pc-status-strip ${stripCls}">${stripText}</div>
        <div class="pc-view-hint">🔍 View Details</div>
      </div>
      <div class="pc-body">
        <div class="pc-origin-lbl">${escapeHtml(p.origin)}</div>
        <div class="pc-name" onclick="openModal('${escapeHtml(p.id)}')">${escapeHtml(p.name)}</div>
        ${p.localName ? `<div class="pc-local">${escapeHtml(p.localName)}</div>` : ''}
        <div class="pc-short-desc">${escapeHtml(shortDesc)}</div>
        <div class="pc-footer"><div class="pc-price-wrap"><div class="pc-price">${escapeHtml(p.price)}</div><div class="pc-unit">${escapeHtml(p.unit)}</div></div></div>
        ${actionHtml}
      </div>
    </div>`;
}

function quickAdd(productId) {
  addToCart(productId, 1);
  renderCardQty(productId);
}

function renderCardQty(productId) {
  const wrap = document.getElementById(`card-actions-${productId}`);
  if (!wrap) return;
  const item = cart.find((x) => x.id === productId);
  const qty = item ? item.qty : 0;
  if (qty === 0) {
    wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><button class="pc-add-btn" onclick="quickAdd('${escapeHtml(productId)}')">+ Add to Cart</button>`;
    return;
  }
  wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><div class="card-qty-wrap"><button class="card-qty-btn remove-btn" onclick="cardQtyChange('${escapeHtml(productId)}',-1)" title="Remove one">−</button><div class="card-qty-mid"><span class="cqn">${qty}</span><span style="font-size:11px;opacity:.85">box${qty !== 1 ? 'es' : ''}</span></div><button class="card-qty-btn" onclick="cardQtyChange('${escapeHtml(productId)}',1)" title="Add one">+</button></div>`;
}

function cardQtyChange(productId, delta) {
  const item = cart.find((x) => x.id === productId);
  if (!item) return;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) {
    cart = cart.filter((x) => x.id !== productId);
    showToast('Removed from cart');
  } else {
    showToast(delta > 0 ? '✓ Added one more box!' : 'Removed one box');
  }
  saveCart();
  updateCartUI();
  renderCardQty(productId);
}

function buildFilters() {
  const bar = document.getElementById('filterBar');
  if (!bar) return;
  bar.innerHTML = '';
  window.SHRISH_DATA.categories.forEach((cat) => {
    const count = cat.id === 'all' ? window.SHRISH_DATA.products.length : window.SHRISH_DATA.products.filter((p) => p.category === cat.id).length;
    const btn = document.createElement('button');
    btn.className = `filter-btn${cat.id === activeFilter ? ' active' : ''}`;
    btn.innerHTML = `${escapeHtml(cat.label)} <span class="filter-count">${count}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = cat.id;
      renderShop();
    };
    bar.appendChild(btn);
  });
}

function renderShop() {
  const container = document.getElementById('shopContent');
  if (!container) return;
  container.innerHTML = '';

  const sort = (arr) => [
    ...arr.filter((p) => p.available && !p.displayOnly),
    ...arr.filter((p) => !p.available && !p.displayOnly),
    ...arr.filter((p) => p.displayOnly)
  ];

  const catMeta = {
    mangoes: { title: '🥭 Indian Mango', em: 'Varieties', sub: 'Click any product to view full details. Available varieties shown first.', banner: false },
    putharekulu: { title: '🍬 Authentic', em: 'Putharekulu', sub: 'Hand-crafted in Atreyapuram, Andhra Pradesh. Coming soon to Shrish LLC!', banner: true },
    jellysnacks: { title: '🍡 Mango & Palm', em: 'Jelly Snacks', sub: 'Traditional Mamidi Thandra & Thati Thandra from Atreyapuram. Coming soon.', banner: false }
  };

  const cats = activeFilter === 'all' ? ['mangoes', 'putharekulu', 'jellysnacks'] : [activeFilter];
  cats.forEach((catId) => {
    const items = sort(window.SHRISH_DATA.products.filter((p) => p.category === catId));
    if (!items.length) return;
    const m = catMeta[catId] || { title: catId, em: '', sub: '', banner: false };
    const hasLiveItems = items.some((product) => product.available && !product.displayOnly);
    let sectionSub = m.sub;
    if (catId === 'putharekulu' && hasLiveItems) {
      sectionSub = 'Hand-crafted in Atreyapuram, Andhra Pradesh. Available items are shown first.';
    }
    if (catId === 'jellysnacks' && hasLiveItems) {
      sectionSub = 'Traditional Mamidi Thandra & Thati Thandra from Atreyapuram. Available items are shown first.';
    }
    let html = `<div class="shop-section"><div class="shop-section-title">${m.title} <em>${m.em}</em></div><div class="section-divider"></div><p style="color:var(--text-light);font-size:14px;margin-bottom:24px">${sectionSub}</p>`;
    if (m.banner && !hasLiveItems) {
      html += `<div class="coming-banner"><div class="cb-icon">🍬</div><div><h3>Coming Soon to Shrish!</h3><p>Authentic GI-tagged Putharekulu from Atreyapuram. Hit "Notify Me" to be first in line when we launch.</p></div></div>`;
    }
    html += `<div class="products-grid-v2">${items.map(renderCard).join('')}</div></div>`;
    container.innerHTML += html;
  });

  window.SHRISH_DATA.products.forEach((product) => renderCardQty(product.id));
}

function subscribeCatalog() {
  onSnapshot(collection(db, 'products'), (snapshot) => {
    const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    mergeProducts(docs);
    buildFilters();
    renderShop();
    updateCartUI();
  }, (error) => {
    console.error('Catalog sync failed', error);
    showToast('Using website catalog. Live sync failed.');
    buildFilters();
    renderShop();
    updateCartUI();
  });
}

function bindNotifyForm() {
  const form = document.getElementById('notifyForm');
  if (!form) return;
  form.addEventListener('submit', submitNotifyRequest);
}

function init() {
  if (!window.SHRISH_DATA?.products) {
    const shopContent = document.getElementById('shopContent');
    if (shopContent) {
      shopContent.innerHTML = '<div class="no-results"><div class="nr-icon">⚠️</div><p>Could not load products. Please refresh.</p></div>';
    }
    return;
  }

  bindNotifyForm();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeCart(); closeNotifyModal(); } });
  subscribeCatalog();
}

window.openCart = openCart;
window.closeCart = closeCart;
window.openModal = openModal;
window.closeModal = closeModal;
window.handleModalOverlayClick = handleModalOverlayClick;
window.switchModalImg = switchModalImg;
window.modalChangeQty = modalChangeQty;
window.modalAddToCart = modalAddToCart;
window.quickAdd = quickAdd;
window.cardQtyChange = cardQtyChange;
window.renderCardQty = renderCardQty;
window.cartQty = cartQty;
window.cartRemove = cartRemove;
window.notifyMe = notifyMe;
window.closeNotifyModal = closeNotifyModal;
window.handleNotifyOverlayClick = handleNotifyOverlayClick;
window.goCheckout = goCheckout;

init();

