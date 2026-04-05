import { db, collection, onSnapshot, escapeHtml } from './firebase-app.js';

function renderHomeProducts(products) {
  const productsGrid = document.getElementById('productsGrid');
  if (!productsGrid) return;

  const mangoes = products.filter((p) => p.category === 'mangoes');
  const available = mangoes.filter((p) => p.available);
  const toShow = (available.length ? available : mangoes).slice(0, 3);

  productsGrid.innerHTML = '';

  toShow.forEach((p) => {
    const imgHtml = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}"
             style="width:100%;height:100%;object-fit:cover"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const fallbackStyle = p.image ? 'style="display:none"' : '';

    productsGrid.innerHTML += `
      <div class="product-card ${p.available ? '' : 'product-card-unavailable'}">
        ${p.tag ? `<div class="product-card-badge">${escapeHtml(p.tag)}</div>` : ''}
        <div class="product-card-img" style="padding:0;overflow:hidden;${p.image ? '' : 'display:flex;align-items:center;justify-content:center'}">
          ${imgHtml}
          <span ${fallbackStyle} style="font-size:56px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">🥭</span>
        </div>
        <div class="product-card-body">
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml((p.description || '').slice(0, 80))}${(p.description || '').length > 80 ? '…' : ''}</p>
          <div class="product-card-footer">
            <div>
              <div class="product-price">${escapeHtml(p.price)}</div>
              <div class="product-unit">${escapeHtml(p.unit)}</div>
            </div>
            <span class="product-status-badge ${p.available ? 'available' : 'unavailable'}">
              ${p.available ? '✓ Available' : 'Sold Out'}
            </span>
          </div>
        </div>
      </div>`;
  });
}

function mergeProducts(baseProducts, docs) {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return baseProducts.map((product) => ({ ...product, ...(byId.get(product.id) || {}) }));
}

function init() {
  if (!window.SHRISH_DATA?.products) return;
  const baseProducts = JSON.parse(JSON.stringify(window.SHRISH_DATA.products));

  onSnapshot(collection(db, 'products'), (snapshot) => {
    const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    window.SHRISH_DATA.products = mergeProducts(baseProducts, docs);
    renderHomeProducts(window.SHRISH_DATA.products);
  }, (error) => {
    console.error('Homepage catalog sync failed', error);
  });
}

init();
