import { db, collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp, escapeHtml } from './firebase-catalog.js';

'use strict';

let cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
let activeFilter = 'all';
let baseProducts = JSON.parse(JSON.stringify(window.SHRISH_DATA?.products || []));
let modalQty = 1;
let modalProductId = null;
let modalVariantId = null;
let modalOpenedAt = 0;
let modalOpenProps = null;
let cardVariantSelections = {};
let notifyTarget = null;
let picklePodiFilter = 'all';
let initialProductOpened = false;
let productSearchQuery = '';
let shopViewedTracked = false;
let searchTrackTimer = null;
let lastTrackedSearch = '';
let catalogSyncReady = false;
let catalogSyncFailed = false;

function afterFirstPaint(callback, timeout = 1600) {
  window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 800 });
      return;
    }
    callback();
  }, timeout);
}

const SHOP_ALLERGEN_NOTICE = window.SHRISH_MAJOR_ALLERGEN_NOTICE || 'Allergen notice: Please review ingredients and contact us before ordering if you have allergies or dietary restrictions.';
const SHOP_SPICE_NOTICE = window.SHRISH_SPICE_NOTICE || 'Spice caution: Many items may be spicy or very spicy.';
const SHOP_IMAGE_DISCLAIMER = window.SHRISH_PRODUCT_IMAGE_DISCLAIMER || 'Product images are for illustration only and may vary by batch.';
const CARD_SAFETY_NOTE = 'Allergy/spice caution: may contain peanut oil and other allergens; ingredients may vary by batch.';

function productFilterId(product) {
  if (!product) return 'all';
  if (product.category === 'putharekulu' || product.category === 'jellysnacks' || product.category === 'sweets') return 'sweets';
  if (product.category === 'picklespodi') return product.filterGroup === 'Podi' ? 'podi' : 'pickles';
  return SHOP_CATEGORY_IDS.has(product.category) ? product.category : 'all';
}

function updateModalProductUrl(product, mode = 'push') {
  if (!product || !window.history?.[`${mode}State`]) return;
  try {
    const filterId = activeFilter || productFilterId(product);
    const nextUrl = shopUrlForFilter(filterId, { productId: product.id });
    window.history[`${mode}State`]({ shrishProductModal: product.id }, '', nextUrl);
  } catch (error) {
    console.warn('Unable to update product URL', error);
  }
}

function clearModalProductUrl(mode = 'push') {
  if (!window.history?.[`${mode}State`]) return;
  try {
    const nextUrl = shopUrlForFilter(activeFilter, { clearProduct: true });
    window.history[`${mode}State`]({ shrishProductModal: null }, '', nextUrl);
  } catch (error) {
    console.warn('Unable to clear product URL', error);
  }
}

function trackShopEvent(eventName, props = {}) {
  window.SHRISH_ANALYTICS?.track(eventName, props);
}

function productEventProps(product, variant = null) {
  return {
    product_id: product?.id || '',
    product_title: product?.name || '',
    category: product?.category || '',
    filter_group: product?.filterGroup || '',
    variant_id: variant?.id || '',
    variant_label: variant?.label || '',
    preorder: Boolean(product?.preorderOnly),
    available: Boolean(product?.available && !product?.displayOnly)
  };
}

function normalizeProductCategory(category) {
  return category === 'Mango Jelly' ? 'jellysnacks' : category;
}

const PRODUCT_IMAGES = {
  alphonso: ['images/products/mangoes/img_alphonso.jpeg'],
  kesar: ['images/products/mangoes/img_kesar.jpeg'],
  banganapalli: ['images/products/mangoes/img_banganapalli.jpg'],
  langra: ['images/products/mangoes/img_langra.jpg'],
  rasalu: ['images/products/mangoes/img_rasalu.jpeg'],
  himayat: ['images/products/mangoes/img_himayath_real.jpg'],
  payari: ['images/products/mangoes/img_payari.jpg'],
  dasheri: ['images/products/mangoes/img_dasheri.jpg', 'images/products/mangoes/img_dasheri1.jpg'],
  malgova: ['images/products/mangoes/img_malgova.jpg', 'images/products/mangoes/img_malgova1.jpg'],
  neelam: ['images/products/mangoes/img_neelam.jpg', 'images/products/mangoes/img_neelam1.jpg'],
  rajapuri: ['images/products/mangoes/img_banganapalli.jpg'],
  puth_plain: ['images/products/putharekulu/img_puth_sugar_kaju.jpg'],
  puth_plain_sugar: ['images/products/putharekulu/img_puth_sugar_kaju.jpg'],
  puth_plain_jaggery: ['images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg'],
  puth_sugar_kaju: ['images/products/putharekulu/img_puth_sugar_kaju.jpg'],
  puth_sugar_kaju_pista: [
    'images/products/putharekulu/puth-sugar-kaju-badam-pista-2026-1.jpg',
    'images/products/putharekulu/puth-sugar-kaju-badam-pista-2026-2.jpg'
  ],
  puth_samosa_jaggery_dryfruit: [
    'images/products/putharekulu/puth-samosa-jaggery-dryfruit-2026-1.jpg',
    'images/products/putharekulu/puth-samosa-jaggery-dryfruit-2026-2.jpg'
  ],
  puth_jaggery_kaju: ['images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg'],
  puth_jaggery_kaju_badam: ['images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg'],
  puth_jaggery_kaju_pista: ['images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg'],
  puth_sugarfree: ['images/products/putharekulu/img_puth_sugarfree.jpg'],
  puth_dates_kaju_badam_pista: ['images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg'],
  puth_organic_palm_kaju_badam_pista: ['images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg'],
  sonpari: ['images/products/snacks/img_sonpari.jpg'],
  sonpari_ghee: ['images/products/snacks/img_sonpari1.jpg'],
  mango_jelly_sugar: ['images/products/jellysnacks/img_mango_jelly.webp'],
  mango_jelly_jaggery: ['images/products/jellysnacks/img_mango_jelly.webp'],
  palm_jelly: ['images/products/jellysnacks/img_palm_jelly.webp', 'images/products/jellysnacks/img_palm_jelly_2.webp']
};

const LOGO_PRODUCT_IMAGE = 'images/brand/logo-small.png';
const LOGO_ONLY_PRODUCT_IDS = [
  'picklespodi-brinjal-amla-pickle',
  'picklespodi-carrot-pickle',
  'picklespodi-chintakaya-pachadi-tamarind-pickle',
  'picklespodi-garlic-pickle',
  'picklespodi-karivepaku-pachadi-curry-leaf-pickle',
  'picklespodi-mango-avakai-pickle',
  'picklespodi-mango-thokku-magai-pickle',
  'picklespodi-pandu-mirchi-pickle',
  'picklespodi-gongura-chicken-pickle',
  'picklespodi-gongura-mutton-pickle',
  'picklespodi-gongura-prawn-pickle',
  'picklespodi-natu-kodi-country-chicken-pickle',
  'picklespodi-dhaniyalu-podi-coriander-spice-powder',
  'picklespodi-kandi-podi',
  'picklespodi-karapu-podi-with-garlic',
  'picklespodi-mango-ginger-pickle'
];

const PRODUCT_GALLERY_OVERRIDES = {
  banganapalli: [
    'images/products/mangoes/img_banganapalli_2026_display.jpg',
    'images/products/mangoes/img_banganapalli_2026_1.jpg',
    'images/products/mangoes/img_banganapalli_2026_2.jpg',
    'images/products/mangoes/img_banganapalli.jpg'
  ]
};

LOGO_ONLY_PRODUCT_IDS.forEach((productId) => {
  PRODUCT_GALLERY_OVERRIDES[productId] = [LOGO_PRODUCT_IMAGE];
});

const LEGACY_PRODUCT_IMAGE_PATHS = Object.fromEntries(
  Object.values(PRODUCT_IMAGES)
    .flat()
    .map((path) => [path.split('/').pop(), path])
);

function normalizeCatalogImagePath(value = '', productId = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw) return '';
  if (raw === 'logo.png') return 'images/brand/logo.png';
  if (raw === 'logo-small.png') return 'images/brand/logo-small.png';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('images/')) return raw;
  const fileName = raw.split('/').pop();
  const mapped = LEGACY_PRODUCT_IMAGE_PATHS[fileName] || PRODUCT_IMAGES[productId]?.[0];
  if (mapped) return mapped;
  return raw || 'images/brand/logo-small.png';
}

function normalizeCatalogProduct(product = {}) {
  const next = {
    ...product,
    category: normalizeProductCategory(product.category)
  };
  next.image = normalizeCatalogImagePath(next.image, next.id);
  if (Array.isArray(next.gallery)) {
    next.gallery = next.gallery.map((image) => normalizeCatalogImagePath(image, next.id)).filter(Boolean);
  }
  return next;
}

const SHOP_CATEGORY_IDS = new Set(['mangoes', 'putharekulu', 'jellysnacks', 'sweets', 'snacks', 'picklespodi']);
const SHOP_FILTERS = [
  { id: 'all', label: 'All Products', categories: ['picklespodi', 'putharekulu', 'jellysnacks', 'sweets', 'snacks', 'mangoes'] },
  { id: 'sweets', label: 'Sweets', categories: ['putharekulu', 'jellysnacks', 'sweets'] },
  { id: 'pickles', label: 'Pickles', categories: ['picklespodi'] },
  { id: 'podi', label: 'Podi', categories: ['picklespodi'] },
  { id: 'snacks', label: 'Snacks', categories: ['snacks'] },
  { id: 'mangoes', label: 'Mangoes', categories: ['mangoes'] }
];

const SHOP_FILTER_PATHS = {
  all: '/shop/all-products/',
  mangoes: '/shop/mangoes/',
  sweets: '/shop/sweets/',
  snacks: '/shop/snacks/',
  pickles: '/shop/pickles-podi/',
  podi: '/shop/pickles-podi/'
};

const SHOP_FILTERS_BY_PATH = {
  '/shop/all-products/': 'all',
  '/shop/mangoes/': 'mangoes',
  '/shop/sweets/': 'sweets',
  '/shop/snacks/': 'snacks',
  '/shop/pickles-podi/': 'pickles'
};

function normalizeShopPath(pathname = window.location.pathname) {
  const path = pathname.replace(/\/index\.html$/i, '/');
  return path.endsWith('/') ? path : `${path}/`;
}

function filterFromShopPath(pathname = window.location.pathname) {
  return SHOP_FILTERS_BY_PATH[normalizeShopPath(pathname)] || null;
}

function filterFromCurrentLocation() {
  const params = new URLSearchParams(window.location.search);
  const pathFilter = filterFromShopPath();
  if (pathFilter === 'pickles' && params.get('type') === 'podi') return 'podi';
  if (pathFilter) return pathFilter;
  const queryFilter = params.get('category') || params.get('filter');
  if (queryFilter === 'picklespodi') return params.get('type') === 'podi' ? 'podi' : 'pickles';
  if (queryFilter && SHOP_FILTERS.some((filter) => filter.id === queryFilter)) return queryFilter;
  if (window.location.pathname.endsWith('/shop.html')) return 'all';
  return null;
}

function shopUrlForFilter(filterId = activeFilter, overrides = {}) {
  const safeFilterId = SHOP_FILTERS.some((filter) => filter.id === filterId) ? filterId : 'all';
  const params = new URLSearchParams(window.location.search);
  params.delete('category');
  params.delete('filter');
  if (safeFilterId === 'podi') params.set('type', 'podi');
  else if (safeFilterId !== 'pickles' || overrides.clearPickleType) params.delete('type');
  if (overrides.clearSearch) {
    params.delete('search');
    params.delete('q');
  }
  if (overrides.searchQuery !== undefined) {
    params.delete('q');
    const nextSearch = String(overrides.searchQuery || '').trim();
    if (nextSearch) params.set('search', nextSearch);
    else params.delete('search');
  }
  if (overrides.productId !== undefined) {
    const nextProductId = String(overrides.productId || '').trim();
    if (nextProductId) params.set('product', nextProductId);
    else params.delete('product');
  } else if (overrides.clearProduct) {
    params.delete('product');
  }
  const query = params.toString();
  return `${SHOP_FILTER_PATHS[safeFilterId]}${query ? `?${query}` : ''}`;
}

function updateShopCategoryUrl(filterId, mode = 'push') {
  if (!window.history?.[`${mode}State`]) return;
  try {
    window.history[`${mode}State`]({ shrishShopCategory: filterId }, '', shopUrlForFilter(filterId, { clearProduct: true }));
  } catch (error) {
    console.warn('Unable to update shop category URL', error);
  }
}

function applyInitialShopFiltersFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const category = filterFromCurrentLocation();
    const pickleType = params.get('type');
    const productId = params.get('product');
    productSearchQuery = (params.get('search') || params.get('q') || '').trim();
    const product = productId ? window.SHRISH_DATA?.products?.find((entry) => entry.id === productId) : null;
    if (category && SHOP_FILTERS.some((filter) => filter.id === category)) {
      activeFilter = category;
    } else if (product) {
      activeFilter = productFilterId(product);
    }
    if (activeFilter === 'pickles' && ['all', 'veg', 'nonveg'].includes(pickleType)) {
      picklePodiFilter = pickleType;
    }
  } catch (error) {
    console.warn('Unable to read shop filters from URL', error);
  }
}

function cartAnalyticsSummary() {
  const totalItems = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const estimatedTotal = cart.reduce((sum, item) => {
    const price = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));
    return sum + (Number.isNaN(price) ? 0 : price * (item.qty || 1));
  }, 0);
  const productIds = [];
  const productTitles = [];
  const categories = new Set();
  cart.forEach((item) => {
    const productId = item.productId || String(item.id || '').split('__')[0] || '';
    const product = productId ? window.SHRISH_DATA.products.find((entry) => entry.id === productId) : null;
    if (productId) productIds.push(productId);
    if (item.name) productTitles.push(item.name);
    if (product?.category) categories.add(product.category);
  });
  return {
    cart_total_items: totalItems,
    cart_distinct_items: cart.length,
    cart_estimated_total: Number(estimatedTotal.toFixed(2)),
    cart_product_ids: productIds,
    cart_product_titles: productTitles,
    cart_categories: [...categories],
    cart_primary_category: [...categories][0] || '',
    cart_distinct_products: new Set(productIds).size
  };
}

function trackShopViewedOnce() {
  if (shopViewedTracked) return;
  shopViewedTracked = true;
  trackShopEvent('shop_viewed', {
    active_filter: activeFilter,
    search_present: Boolean(productSearchQuery),
    ...cartAnalyticsSummary()
  });
}

applyInitialShopFiltersFromUrl();

const FORCE_BASE_PRODUCT_OVERRIDES = {};
const FORCE_CATALOG_FIELD_OVERRIDE_IDS = new Set([
  'picklespodi-drumstick-leaf-podi-munagaku-podi'
]);
const SWEET_CATALOG_OVERRIDE_CATEGORIES = new Set(['putharekulu', 'jellysnacks']);
const CATALOG_FIELD_OVERRIDES = window.SHRISH_CATALOG_FIELD_OVERRIDES || {};
const VERIFIED_PRODUCT_IMAGE_OVERRIDES = window.SHRISH_VERIFIED_PRODUCT_IMAGE_OVERRIDES || {};

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

function applyVerifiedProductImageOverride(product = {}) {
  const override = VERIFIED_PRODUCT_IMAGE_OVERRIDES[product.id];
  if (!override) return product;
  return {
    ...product,
    image: override.image || '',
    gallery: Array.isArray(override.gallery) ? [...override.gallery] : []
  };
}

const LEGACY_VARIANT_FALLBACKS = {
  puth_plain: {
    name: 'Putharekulu - Classic Plain (Sugar)',
    price: '$7.49',
    unit: '5 count or 10 count',
    variants: [
      { id: 'opt1', label: '5 count', price: '$7.49', sku: 'POPJKP5' },
      { id: 'opt2', label: '10 count', price: '$13.99', sku: 'POPJKP10' }
    ]
  },
  puth_sugar_kaju: {
    name: 'Putharekulu - Sugar - Kaju',
    price: '$7.99',
    unit: '5 count or 10 count',
    variants: [
      { id: 'opt1', label: '5 count', price: '$7.99', sku: 'PSK5' },
      { id: 'opt2', label: '10 count', price: '$14.99', sku: 'PSK10' }
    ]
  }
};

function getLegacyVariantFallback(product = {}) {
  if (product?.id && LEGACY_VARIANT_FALLBACKS[product.id]) {
    return LEGACY_VARIANT_FALLBACKS[product.id];
  }

  const normalizedName = String(product?.name || '')
    .toLowerCase()
    .replace(/—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalizedName === 'putharekulu - classic plain (sugar)') {
    return LEGACY_VARIANT_FALLBACKS.puth_plain;
  }

  if (normalizedName === 'putharekulu - sugar, kaju' || normalizedName === 'putharekulu - sugar - kaju') {
    return LEGACY_VARIANT_FALLBACKS.puth_sugar_kaju;
  }

  return null;
}

const CATEGORY_DISPLAY_RANK = { picklespodi: 0, putharekulu: 1, jellysnacks: 2, sweets: 3, snacks: 4, mangoes: 5 };

function sortCatalogProducts(products = []) {
  return [...products].sort((a, b) => {
    const aCat = CATEGORY_DISPLAY_RANK[a?.category] ?? 9;
    const bCat = CATEGORY_DISPLAY_RANK[b?.category] ?? 9;
    if (aCat !== bCat) return aCat - bCat;
    const aOrder = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

function saveCart() {
  sessionStorage.setItem('shrish_cart', JSON.stringify(cart));
}

function mergeProducts(docs) {
  const normalizedBaseProducts = baseProducts.map(normalizeCatalogProduct);
  const normalizedDocs = docs.map(normalizeCatalogProduct);
  const byId = new Map(normalizedDocs.map((item) => [item.id, item]));
  const mergedBase = normalizedBaseProducts.map((product) => {
    const liveProduct = byId.get(product.id);
    const merged = normalizeCatalogProduct({ ...product, ...(liveProduct || {}) });
    if (!liveProduct) {
      merged.available = false;
      merged.preorderOnly = false;
    }
    const forcedFields = FORCE_BASE_PRODUCT_OVERRIDES[product.id] || [];
    forcedFields.forEach((field) => {
      merged[field] = product[field];
    });
    if ((!Array.isArray(merged.variants) || !merged.variants.length) && Array.isArray(product.variants) && product.variants.length) {
      merged.variants = product.variants;
      merged.unit = product.unit;
      merged.price = product.price;
    }
    const namedFallback = getLegacyVariantFallback(merged);
    if ((!Array.isArray(merged.variants) || !merged.variants.length) && namedFallback) {
      merged.variants = namedFallback.variants;
      merged.unit = namedFallback.unit;
      merged.price = namedFallback.price;
    }
    return normalizeCatalogProduct(applyVerifiedProductImageOverride(applyCatalogFieldOverrides(merged)));
  });
  const extraProducts = normalizedDocs
    .filter((item) => !normalizedBaseProducts.some((product) => product.id === item.id))
    .map((item) => {
      const fallback = getLegacyVariantFallback(item);
      if (!fallback) return applyVerifiedProductImageOverride(applyCatalogFieldOverrides({ ...item }));
      const hasVariants = Array.isArray(item.variants) && item.variants.length;
      return hasVariants
        ? applyVerifiedProductImageOverride(applyCatalogFieldOverrides({ ...item }))
        : applyVerifiedProductImageOverride(applyCatalogFieldOverrides({ ...item, ...fallback }));
    });
  window.SHRISH_DATA.products = sortCatalogProducts(
    [...mergedBase, ...extraProducts]
      .filter((product) => !product.hidden && SHOP_CATEGORY_IDS.has(normalizeProductCategory(product.category)))
  );
}

function getProductVariants(product) {
  if (Array.isArray(product?.variants) && product.variants.length) {
    return product.variants
      .filter((variant) => variant?.label)
      .map((variant, index) => ({
        id: variant.id || `opt${index + 1}`,
        label: variant.label,
        price: variant.price || product.price || '',
        unit: variant.label
      }));
  }

  return [{
    id: 'default',
    label: product?.unit || 'Default',
    price: product?.price || '',
    unit: product?.unit || ''
  }];
}

function hasVariantChoices(product) {
  return getProductVariants(product).length > 1;
}

function usesVariantUI(product) {
  return Array.isArray(product?.variants) && product.variants.length > 0;
}

function usesDirectVariantButtons(product) {
  return ['picklespodi', 'putharekulu', 'jellysnacks', 'sweets'].includes(normalizeProductCategory(product?.category))
    && usesVariantUI(product);
}

function buildCartItemId(productId, variantId = 'default') {
  return variantId === 'default' ? productId : `${productId}__${variantId}`;
}

function getSelectedVariant(product, variantId = null) {
  const variants = getProductVariants(product);
  return variants.find((variant) => variant.id === variantId) || variants[0];
}

function getCardSelectedVariant(product) {
  return getSelectedVariant(product, cardVariantSelections[product.id]);
}

function productImages(productId, product) {
  if (PRODUCT_GALLERY_OVERRIDES[productId]?.length) {
    return PRODUCT_GALLERY_OVERRIDES[productId].map((image) => normalizeCatalogImagePath(image, productId)).filter(Boolean);
  }
  if (Array.isArray(product?.gallery) && product.gallery.length) {
    return product.gallery.map((image) => normalizeCatalogImagePath(image, productId)).filter(Boolean);
  }
  if (PRODUCT_IMAGES[productId]) return PRODUCT_IMAGES[productId];
  const image = normalizeCatalogImagePath(product?.image, productId);
  return image ? [image] : [];
}

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const cartFabCount = document.getElementById('cartFabCount');
  if (cartFabCount) cartFabCount.textContent = total;
  const navBadge = document.getElementById('navCartBadge');
  if (navBadge) navBadge.textContent = total;
  const navCartLink = document.getElementById('navCartLink');
  if (navCartLink) navCartLink.href = total > 0 ? 'order.html' : 'shop.html';
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
      <div class="ce-icon">Cart</div>
      <p style="font-size:16px;font-weight:600;color:var(--dark);margin-bottom:8px">Your cart is empty</p>
      <p style="font-size:14px;color:var(--text-light);margin-bottom:20px">Browse our pickles, podi and Andhra sweets — shipped anywhere in the USA!</p>
      <a href="shop.html" onclick="closeCart()" style="display:inline-flex;align-items:center;gap:8px;background:var(--saffron);color:white;padding:12px 24px;border-radius:50px;font-family:var(--font-body);font-size:14px;font-weight:700;text-decoration:none;transition:all .3s">Shop</a>
    </div>`;
    foot.style.display = 'none';
    return;
  }

  foot.style.display = 'block';
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  totalEl.textContent = `${totalQty} box${totalQty !== 1 ? 'es' : ''}`;
  const subEl = document.getElementById('cartSubtotal');
  const hintEl = document.getElementById('cartShipHint');
  if (subEl) {
    const subtotal = cart.reduce((s, item) => s + ((parseFloat(String(item.price || '0').replace(/[^0-9.]/g, '')) || 0) * (item.qty || 0)), 0);
    subEl.textContent = '$' + subtotal.toFixed(2);
    if (hintEl) {
      if (subtotal > 0 && subtotal < 75) {
        hintEl.textContent = 'You\u2019re $' + (75 - subtotal).toFixed(2) + ' away from FREE US shipping';
        hintEl.style.display = 'block';
      } else if (subtotal >= 75) {
        hintEl.textContent = '\uD83C\uDF89 Free US shipping unlocked';
        hintEl.style.display = 'block';
      } else {
        hintEl.style.display = 'none';
      }
    }
  }
  list.innerHTML = cart.map((item) => {
    const imgHtml = `<img src="${escapeHtml(item.image || SHRISH_LOGO_PRODUCT_IMAGE)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/brand/logo-small.png'">`;
    return `<div class="cart-item">
      <div class="ci-img">${imgHtml}</div>
      <div class="ci-info">
        <div class="ci-name">${escapeHtml(item.name)}</div>
        <div class="ci-price">${escapeHtml(item.price)} - ${escapeHtml(item.unit)}</div>
        <div class="ci-qty-row">
          <button class="ci-qty-btn" onclick="cartQty('${escapeHtml(item.id)}',-1)">-</button>
          <span class="ci-qty-num">${item.qty}</span>
          <button class="ci-qty-btn" onclick="cartQty('${escapeHtml(item.id)}',1)">+</button>
          <span style="font-size:11px;color:var(--text-light);margin-left:4px">box${item.qty > 1 ? 'es' : ''}</span>
        </div>
      </div>
      <button class="ci-remove" onclick="cartRemove('${escapeHtml(item.id)}')">x</button>
    </div>`;
  }).join('') + renderCartUpsell();
}

function renderCartUpsell() {
  const inCart = new Set(cart.map((item) => item.productId || String(item.id).split('__')[0]));
  const cartCategories = new Set();
  inCart.forEach((id) => {
    const product = window.SHRISH_DATA.products.find((entry) => entry.id === id);
    if (product) cartCategories.add(product.category);
  });
  const pool = window.SHRISH_DATA.products.filter((p) => !p.hidden && productInStock(p) && !p.preorderOnly && !inCart.has(p.id));
  const preferred = pool.filter((p) => cartCategories.has(p.category));
  const rest = pool.filter((p) => !cartCategories.has(p.category));
  const picks = [...preferred, ...rest].slice(0, 3);
  if (!picks.length) return '';
  const rows = picks.map((p) => {
    const img = productImages(p.id, p)[0] || p.image || SHRISH_LOGO_PRODUCT_IMAGE;
    const price = usesVariantUI(p)
      ? (getVariantPriceRange(getProductVariants(p)) || p.price || '')
      : (p.price || '');
    const button = usesVariantUI(p)
      ? `<button type="button" class="cu-add" onclick="openModal('${escapeHtml(p.id)}')">Choose Size</button>`
      : `<button type="button" class="cu-add" onclick="cartUpsellAdd('${escapeHtml(p.id)}')">Add To Cart</button>`;
    const imgHtml = img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/brand/logo-small.png'">` : '';
    return `<div class="cu-item"><div class="cu-img">${imgHtml}</div><div class="cu-info"><div class="cu-name">${escapeHtml(p.name)}</div><div class="cu-price">${escapeHtml(price)}</div></div>${button}</div>`;
  }).join('');
  return `<div class="cart-upsell"><div class="cu-head">You May Also Like</div>${rows}</div>`;
}

function cartUpsellAdd(productId) {
  const added = addToCart(productId, 1);
  if (added) trackShopEvent('cart_upsell_added', { product_id: productId, ...cartAnalyticsSummary() });
}

function cartQty(id, delta) {
  const item = cart.find((x) => x.id === id);
  if (!item) return;
  const previousQty = item.qty || 0;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) cart = cart.filter((x) => x.id !== id);
  saveCart();
  updateCartUI();
  renderCardQty(item.productId || id);
  trackShopEvent('cart_quantity_changed', {
    product_id: item.productId || id,
    variant_id: item.variantId || '',
    quantity_delta: delta,
    previous_quantity: previousQty,
    next_quantity: Math.max(0, item.qty || 0),
    ...cartAnalyticsSummary()
  });
}

function cartRemove(id) {
  const item = cart.find((x) => x.id === id);
  cart = cart.filter((x) => x.id !== id);
  saveCart();
  updateCartUI();
  renderCardQty(item?.productId || id);
  trackShopEvent('cart_item_removed', {
    product_id: item?.productId || id,
    variant_id: item?.variantId || '',
    ...cartAnalyticsSummary()
  });
}

function addToCart(productId, qty, variantId = null) {
  if (!catalogSyncReady || catalogSyncFailed) {
    showToast(catalogSyncFailed ? 'Live availability is unavailable. Please refresh before ordering.' : 'Checking live availability. Please wait a moment.');
    return false;
  }
  const p = window.SHRISH_DATA.products.find((x) => x.id === productId);
  if (!p || !p.available || p.displayOnly) return false;
  const selectedVariant = getSelectedVariant(p, variantId);
  const cartItemId = buildCartItemId(productId, selectedVariant.id);
  const existing = cart.find((x) => x.id === cartItemId);
  if (existing) existing.qty += qty;
  else cart.push({
    id: cartItemId,
    productId: p.id,
    variantId: selectedVariant.id,
    category: p.category || '',
    name: selectedVariant.id === 'default' ? p.name : `${p.name} (${selectedVariant.label})`,
    price: selectedVariant.price || p.price,
    unit: selectedVariant.unit || p.unit,
    image: productImages(productId, p)[0] || p.image || SHRISH_LOGO_PRODUCT_IMAGE,
    qty
  });
  saveCart();
  updateCartUI();
  showToast(`${selectedVariant.id === 'default' ? p.name : `${p.name} (${selectedVariant.label})`} added!`);
  renderCardQty(productId);
  trackShopEvent('product_added_to_cart', {
    ...productEventProps(p, selectedVariant),
    quantity: qty,
    ...cartAnalyticsSummary()
  });
  return true;
}

function openCart() {
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  trackShopEvent('cart_opened', {
    ...cartAnalyticsSummary()
  });
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
  trackShopEvent('checkout_started', {
    ...cartAnalyticsSummary()
  });
  window.location.href = 'order.html';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function openModal(productId, options = {}) {
  trackModalDuration('replaced');
  const p = window.SHRISH_DATA.products.find((x) => x.id === productId);
  if (!p) return;
  modalProductId = productId;
  modalQty = 1;
  modalVariantId = getSelectedVariant(p, modalVariantId).id;

  const liveReady = catalogSyncReady && !catalogSyncFailed;
  const isPreorder = liveReady && Boolean(p.preorderOnly);
  const isAvail = liveReady && p.available && !p.displayOnly;
  const isSoon = liveReady && p.displayOnly;
  const imgs = productImages(productId, p);
  const selectedVariant = getSelectedVariant(p, modalVariantId);
  modalOpenedAt = Date.now();
  modalOpenProps = productEventProps(p, selectedVariant);
  trackShopEvent('product_details_opened', modalOpenProps);

  const mainWrap = document.getElementById('modalMainImgWrap');
  if (mainWrap) {
    mainWrap.innerHTML = imgs.length
      ? `<img class="modal-main-img" id="modalMainImg" src="${escapeHtml(imgs[0])}" alt="${escapeHtml(p.name)}" loading="eager" decoding="async" onerror="this.onerror=null;this.src='images/brand/logo-small.png'">`
      : `<div class="modal-img-placeholder">No Image</div>`;
  }

  const thumbs = document.getElementById('modalThumbs');
  if (thumbs) {
    if (imgs.length) {
      thumbs.innerHTML = imgs.map((src, i) => `<img class="modal-thumb ${i === 0 ? 'active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(p.name)} ${i + 1}" loading="eager" decoding="async" onclick="switchModalImg('${escapeHtml(src)}',this)" onerror="this.onerror=null;this.src='images/brand/logo-small.png'">`).join('');
      thumbs.style.display = 'flex';
    } else {
      thumbs.innerHTML = '';
      thumbs.style.display = 'none';
    }
  }

  const statusCls = !liveReady ? 'soon' : isPreorder ? 'soon' : isSoon ? 'soon' : isAvail ? 'avail' : 'sold';
  const statusText = !liveReady ? (catalogSyncFailed ? 'Refresh Required' : 'Checking Availability') : isPreorder ? 'Preorder Only' : isSoon ? 'Coming Soon' : isAvail ? 'Available Now' : 'Currently Not Available';
  const recommendationChips = (p.recommendationTags || []).slice(0, 8).map((tag) => `Tag: ${tag}`);
  const chips = [p.season && `Season: ${p.season}`, p.taste && `Taste: ${p.taste}`, ...recommendationChips]
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
  if (!liveReady) {
    actionHtml = `<button class="modal-add-btn" style="background:#ccc;cursor:not-allowed" disabled>${catalogSyncFailed ? 'Refresh Required' : 'Checking Availability'}</button>`;
  } else if (isSoon) {
    actionHtml = `<button class="modal-notify-btn" onclick="notifyMe('${escapeHtml(p.id)}','${escapeHtml(p.name)}')">Notify when available</button>`;
  } else if (isAvail) {
    const variants = getProductVariants(p);
    const variantSelect = usesVariantUI(p)
      ? `<div class="modal-variant-group"><div class="modal-variant-title">${p.category === 'putharekulu' ? 'Choose count' : 'Choose size'}</div><div class="modal-variant-buttons">${variants.map((variant) => `<button type="button" class="modal-variant-btn${variant.id === modalVariantId ? ' active' : ''}" aria-pressed="${variant.id === modalVariantId}" onclick="modalSelectVariant('${escapeHtml(p.id)}', '${escapeHtml(variant.id)}')"><span>${escapeHtml(variant.label)}</span><strong>${escapeHtml(variant.price)}</strong></button>`).join('')}</div></div>`
      : '';
    actionHtml = `${variantSelect}<div class="modal-qty-row"><div class="modal-qty-ctrl"><button class="modal-qty-btn" onclick="modalChangeQty(-1)">-</button><span class="modal-qty-num" id="modalQtyNum">1</span><button class="modal-qty-btn" onclick="modalChangeQty(1)">+</button></div><button class="modal-add-btn" id="modalAddBtn" onclick="modalAddToCart()">${isPreorder ? 'Preorder' : 'Add to Cart'}</button></div>`;
  } else {
    actionHtml = `<button class="modal-notify-btn" onclick="notifyMe('${escapeHtml(p.id)}','${escapeHtml(p.name)}')">Notify when available</button>`;
  }

  const info = document.getElementById('modalInfo');
  if (info) {
    const isPicklesPodi = p.category === 'picklespodi';
    const picklesPodiFacts = isPicklesPodi
      ? [
        p.ingredientsText && ['Ingredients', p.ingredientsText],
        p.shelfLifeDisplay && ['Shelf life', p.shelfLifeDisplay],
        p.storageNote && ['Storage', p.storageNote],
        p.shippingNote && ['Shipping', p.shippingNote],
        p.foodSafetyNote && ['Best Before', p.foodSafetyNote]
      ].filter(Boolean)
      : [];
    const picklesPodiDetails = picklesPodiFacts.length
      ? `<div class="modal-detail-list">${picklesPodiFacts.map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join('')}</div>`
      : '';
    const productSafetyNotes = [
      ['Allergen notice', p.allergenNote || SHOP_ALLERGEN_NOTICE],
      ['Spice caution', p.spiceNotice || SHOP_SPICE_NOTICE],
      ['Image disclaimer', p.imageDisclaimer || SHOP_IMAGE_DISCLAIMER]
    ];
    const productSafetyHtml = `<div class="modal-safety-note">${productSafetyNotes.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}</div>`;

    // Buy-first: keep name/desc/price/qty/add-to-cart visible; tuck tags,
    // ingredients, storage, and allergen notes into one collapsible section so
    // the primary action isn't buried under a wall of text.
    const priceRowHtml = `<div class="modal-price-row"><div><div class="modal-price">${escapeHtml(selectedVariant.price || p.price)}</div><div class="modal-unit">${escapeHtml(selectedVariant.unit || p.unit)}</div></div></div>`;
    const buyBoxHtml = `<div class="modal-buybox">${priceRowHtml}${actionHtml}</div>`;

    // Details in tabs so content swaps in place — no accordion that grows the
    // modal and leaves an empty gap beside the image.
    const detailsInner = [
      chips ? `<div class="modal-chips">${chips}</div>` : '',
      badges ? `<div class="modal-badges">${badges}</div>` : '',
      (p.details && !isPicklesPodi) ? `<div class="modal-note">Info: ${escapeHtml(p.details)}</div>` : '',
      picklesPodiDetails,
      p.bestFor ? `<div class="modal-best"><strong>Best for:</strong> ${escapeHtml(p.bestFor)}</div>` : ''
    ].filter(Boolean).join('');
    const tabDefs = [
      ['details', 'Product details', detailsInner],
      ['safety', 'Allergens & safety', productSafetyHtml]
    ].filter((tab) => tab[2]);
    let detailsTabs = '';
    if (tabDefs.length) {
      const controls = tabDefs.map((tab, i) => `<input class="mtab-radio" type="radio" name="mtabs" id="mtab-${tab[0]}"${i === 0 ? ' checked' : ''}><label class="mtab-label" for="mtab-${tab[0]}">${escapeHtml(tab[1])}</label>`).join('');
      const panels = tabDefs.map((tab) => `<div class="mtab-body mtab-body-${tab[0]}">${tab[2]}</div>`).join('');
      detailsTabs = `<div class="modal-tabs">${controls}${panels}</div>`;
    }

    info.innerHTML = `
      <div class="modal-origin">${escapeHtml(p.origin)}</div>
      <div class="modal-name">${escapeHtml(p.name)}</div>
      ${p.localName ? `<div class="modal-local">${escapeHtml(p.localName)}</div>` : ''}
      <div class="modal-status ${statusCls}">${statusText}</div>
      <div class="modal-desc">${escapeHtml(p.description)}</div>
      ${buyBoxHtml}
      ${detailsTabs}`;
  }

  document.getElementById('productModal')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (options.updateUrl !== false) {
    updateModalProductUrl(p, options.historyMode || 'push');
  }
}

function trackModalDuration(closeReason = 'closed') {
  if (!modalOpenedAt || !modalOpenProps) return;
  const durationSeconds = Math.max(0, Number(((Date.now() - modalOpenedAt) / 1000).toFixed(2)));
  trackShopEvent('product_detail_time_spent', {
    ...modalOpenProps,
    duration_seconds: durationSeconds,
    close_reason: closeReason,
    added_to_cart_during_view: cart.some((item) => (item.productId || String(item.id || '').split('__')[0]) === modalOpenProps.product_id)
  });
  modalOpenedAt = 0;
  modalOpenProps = null;
}

function switchModalImg(src, thumb) {
  const main = document.getElementById('modalMainImg');
  if (main) main.src = src;
  document.querySelectorAll('.modal-thumb').forEach((t) => t.classList.remove('active'));
  thumb.classList.add('active');
}

function closeModal(options = {}) {
  const modal = document.getElementById('productModal');
  const wasOpen = Boolean(modal?.classList.contains('open'));
  if (wasOpen) trackModalDuration(options.reason || 'closed');
  modal?.classList.remove('open');
  document.body.style.overflow = '';
  modalProductId = null;
  if (wasOpen && options.updateUrl !== false) {
    clearModalProductUrl(options.historyMode || 'push');
  }
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
  const product = window.SHRISH_DATA.products.find((entry) => entry.id === modalProductId);
  const addedLabel = product?.preorderOnly ? 'Preorder Added' : 'Added!';
  const resetLabel = product?.preorderOnly ? 'Preorder' : 'Add to Cart';
  const added = addToCart(modalProductId, modalQty, modalVariantId);
  if (!added) return;
  const btn = document.getElementById('modalAddBtn');
  if (!btn) return;
  btn.textContent = addedLabel;
  btn.classList.add('added');
  setTimeout(() => {
    btn.textContent = resetLabel;
    btn.classList.remove('added');
  }, 1800);
}

function modalSelectVariant(productId, variantId) {
  modalVariantId = variantId;
  openModal(productId, { historyMode: 'replace' });
}

async function notifyMe(productId, productName) {
  notifyTarget = { productId, productName };
  const product = window.SHRISH_DATA.products.find((entry) => entry.id === productId);
  trackShopEvent('product_notify_opened', productEventProps(product || { id: productId, name: productName }));
  const title = document.getElementById('notifyModalTitle');
  const text = document.getElementById('notifyModalText');
  const email = document.getElementById('notifyEmail');
  const msg = document.getElementById('notifyMessage');
  const modal = document.getElementById('notifyModal');

  if (title) title.textContent = 'Notify when available';
  if (text) text.textContent = `Enter your email and we'll let you know when "${productName}" is available.`;
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

    setNotifyMessage('success', `Thanks. We'll notify you when "${notifyTarget.productName}" is available.`);
    trackShopEvent('product_notify_subscribed', {
      product_id: notifyTarget.productId,
      product_title: notifyTarget.productName
    });
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
  if (t.includes('preorder')) return 't-coming';
  if (t.includes('rare') || t.includes('seasonal')) return 't-rare';
  if (t.includes('diabetic') || t.includes('free')) return 't-diabetic';
  if (t.includes('requested')) return 't-requested';
  return 't-default';
}

function renderCard(p) {
  const liveReady = catalogSyncReady && !catalogSyncFailed;
  const isPreorder = liveReady && Boolean(p.preorderOnly);
  const isAvail = liveReady && p.available && !p.displayOnly;
  const isSoon = liveReady && p.displayOnly;
  const stripCls = !liveReady ? 'soon' : isPreorder ? 'soon' : isSoon ? 'soon' : isAvail ? 'avail' : 'sold';
  const stripText = !liveReady ? (catalogSyncFailed ? 'Refresh Required' : 'Checking') : isPreorder ? 'Preorder Only' : isSoon ? 'Coming Soon' : isAvail ? 'Available' : 'Not Available';
  const imgSrc = productImages(p.id, p)[0] || p.image || SHRISH_LOGO_PRODUCT_IMAGE;
  const imgHtml = imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/brand/logo-small.png'">` : '';
  const emojiStyle = imgSrc ? 'style="display:none"' : '';
  const shortDesc = (p.description || '').length > 90 ? `${p.description.slice(0, 90)}...` : (p.description || '');
  const recommendationTagHtml = (p.recommendationTags || [])
    .slice(0, 4)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join('');
  const variants = getProductVariants(p);
  const hasChoices = usesVariantUI(p);
  const selectedCardVariant = getCardSelectedVariant(p);
  const cardPriceText = hasChoices
    ? (getVariantPriceRange(variants) || selectedCardVariant.price || p.price)
    : (selectedCardVariant.price || p.price);

  let actionHtml = '';
  if (!liveReady) {
    actionHtml = `<div class="pc-card-actions" id="card-actions-${escapeHtml(p.id)}"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button><button class="pc-add-btn" disabled>${catalogSyncFailed ? 'Refresh Required' : 'Checking...'}</button></div>`;
  } else if (isSoon) {
    actionHtml = `<button class="pc-notify-btn" onclick="notifyMe('${escapeHtml(p.id)}','${escapeHtml(p.name)}')">Notify when available</button>`;
  } else if (isAvail && hasChoices && usesDirectVariantButtons(p)) {
    actionHtml = `<div class="pc-card-actions pc-card-actions-variant pc-card-actions-direct" id="card-actions-${escapeHtml(p.id)}"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button>${renderDirectVariantButtons(p, variants)}</div>`;
  } else if (isAvail && hasChoices) {
    actionHtml = `<div class="pc-card-actions pc-card-actions-variant pc-card-actions-direct" id="card-actions-${escapeHtml(p.id)}"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button><div class="pc-variant-list">${renderCardVariantChoices(p, variants, selectedCardVariant)}<button class="pc-add-btn" onclick="quickAddSelectedVariant('${escapeHtml(p.id)}')">${isPreorder ? '+ Preorder' : '+ Add to Cart'}</button></div></div>`;
  } else if (isAvail) {
    actionHtml = `<div class="pc-card-actions" id="card-actions-${escapeHtml(p.id)}"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button><button class="pc-add-btn" onclick="quickAdd('${escapeHtml(p.id)}')">${isPreorder ? '+ Preorder' : '+ Add to Cart'}</button></div>`;
  } else {
    actionHtml = `<div class="pc-card-actions"><button class="pc-details-btn" onclick="openModal('${escapeHtml(p.id)}')">Details</button><button class="pc-notify-btn" onclick="notifyMe('${escapeHtml(p.id)}','${escapeHtml(p.name)}')">Notify when available</button></div>`;
  }

  return `<div class="pc ${isSoon ? 'display-only' : ''} ${liveReady && !isAvail && !isSoon ? 'sold-out' : ''}">
      ${p.tag ? `<div class="pc-tag ${tagClass(p.tag)}">${escapeHtml(p.tag)}</div>` : ''}
      <div class="pc-img" onclick="openModal('${escapeHtml(p.id)}')">
        ${imgHtml}
        <div class="pc-img-emoji" ${emojiStyle}>No Image</div>
        <div class="pc-status-strip ${stripCls}">${stripText}</div>
        <div class="pc-view-hint">View Details</div>
      </div>
      <div class="pc-body">
        <div class="pc-origin-lbl">${escapeHtml(p.origin)}</div>
        <div class="pc-name" onclick="openModal('${escapeHtml(p.id)}')">${escapeHtml(p.name)}</div>
        ${p.localName ? `<div class="pc-local">${escapeHtml(p.localName)}</div>` : ''}
        <div class="pc-short-desc">${escapeHtml(shortDesc)}</div>
        ${recommendationTagHtml ? `<div class="pc-rec-tags">${recommendationTagHtml}</div>` : ''}
        <div class="pc-footer"><div class="pc-price-wrap"><div class="pc-price" id="card-price-${escapeHtml(p.id)}">${escapeHtml(cardPriceText)}</div></div></div>
        ${actionHtml}
      </div>
    </div>`;
}

function quickAdd(productId) {
  addToCart(productId, 1);
  renderCardQty(productId);
}

function quickAddVariant(productId, variantId) {
  addToCart(productId, 1, variantId);
  renderCardQty(productId);
}

function quickAddSelectedVariant(productId) {
  const product = window.SHRISH_DATA.products.find((entry) => entry.id === productId);
  if (!product) return;
  const selectedVariant = getCardSelectedVariant(product);
  addToCart(productId, 1, selectedVariant.id);
  renderCardQty(productId);
}

function cardVariantChanged(productId, variantId) {
  cardVariantSelections[productId] = variantId;
  renderCardQty(productId);
}

function updateCardDisplayedPrice(productId, price) {
  const priceEl = document.getElementById(`card-price-${productId}`);
  if (priceEl) priceEl.textContent = price || '';
}

function getVariantPriceRange(variants) {
  const prices = variants.map((variant) => variant.price).filter(Boolean);
  const uniquePrices = [...new Set(prices)];
  if (uniquePrices.length <= 1) return uniquePrices[0] || '';
  return `${uniquePrices[0]} - ${uniquePrices[uniquePrices.length - 1]}`;
}

function getCartVariantQty(productId, variantId) {
  const cartItemId = buildCartItemId(productId, variantId);
  const item = cart.find((entry) => entry.id === cartItemId);
  return item ? item.qty : 0;
}

function renderCardVariantChoices(product, variants, selectedVariant) {
  const safeProductId = escapeHtml(product.id);
  const selectedId = selectedVariant && selectedVariant.id;
  return `<div class="pc-direct-variants pc-choice-variants">${variants.map((variant) => {
    const selected = variant.id === selectedId;
    return `<button type="button" class="pc-size-add-btn pc-choice-btn ${selected ? 'selected' : ''}" onclick="cardVariantChanged('${safeProductId}','${escapeHtml(variant.id)}')" aria-pressed="${selected ? 'true' : 'false'}"><span>${escapeHtml(variant.label)}</span><strong>${escapeHtml(variant.price || product.price || '')}</strong></button>`;
  }).join('')}</div>`;
}

function renderDirectVariantButtons(product, variants) {
  return `<div class="pc-direct-variants">${variants.map((variant) => {
    const qty = getCartVariantQty(product.id, variant.id);
    const safeProductId = escapeHtml(product.id);
    const safeVariantId = escapeHtml(variant.id);
    const safeLabel = escapeHtml(variant.label);
    const safePrice = escapeHtml(variant.price || product.price || '');
    if (qty > 0) {
      return `<div class="pc-size-qty"><button type="button" class="pc-size-qty-btn remove-btn" onclick="cardVariantQtyChange('${safeProductId}','${safeVariantId}',-1)" title="Remove one">-</button><div class="pc-size-qty-mid"><span class="pc-size-label">${safeLabel}</span><span class="pc-size-count">${qty}</span><span class="pc-size-price">${safePrice}</span></div><button type="button" class="pc-size-qty-btn" onclick="cardVariantQtyChange('${safeProductId}','${safeVariantId}',1)" title="Add one">+</button></div>`;
    }
    return `<button type="button" class="pc-size-add-btn" onclick="quickAddVariant('${safeProductId}','${safeVariantId}')"><span>${safeLabel}</span><strong>${safePrice}</strong></button>`;
  }).join('')}</div>`;
}

function renderCardQty(productId) {
  const wrap = document.getElementById(`card-actions-${productId}`);
  if (!wrap) return;
  const product = window.SHRISH_DATA.products.find((entry) => entry.id === productId);
  if (!product) return;
  const liveReady = catalogSyncReady && !catalogSyncFailed;
  if (!liveReady) {
    wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><button class="pc-add-btn" disabled>${catalogSyncFailed ? 'Refresh Required' : 'Checking...'}</button>`;
    return;
  }
  const addLabel = product.preorderOnly ? '+ Preorder' : '+ Add to Cart';
  if (usesVariantUI(product)) {
    const variants = getProductVariants(product);
    if (usesDirectVariantButtons(product)) {
      updateCardDisplayedPrice(product.id, getVariantPriceRange(variants) || product.price);
      wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button>${renderDirectVariantButtons(product, variants)}`;
      return;
    }
    const selectedVariant = getCardSelectedVariant(product);
    updateCardDisplayedPrice(product.id, getVariantPriceRange(variants) || selectedVariant.price || product.price);
    const cartItemId = buildCartItemId(product.id, selectedVariant.id);
    const item = cart.find((x) => x.id === cartItemId);
    const qty = item ? item.qty : 0;

    if (qty === 0) {
      wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><div class="pc-variant-list">${renderCardVariantChoices(product, variants, selectedVariant)}<button class="pc-add-btn" onclick="quickAddSelectedVariant('${escapeHtml(product.id)}')">${addLabel}</button></div>`;
      return;
    }

    wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><div class="pc-variant-list">${renderCardVariantChoices(product, variants, selectedVariant)}<div class="card-qty-wrap"><button class="card-qty-btn remove-btn" onclick="cardVariantQtyChange('${escapeHtml(product.id)}','${escapeHtml(selectedVariant.id)}',-1)" title="Remove one">-</button><div class="card-qty-mid"><span class="cqn">${qty}</span><span style="font-size:11px;opacity:.85">${escapeHtml(selectedVariant.label)}</span></div><button class="card-qty-btn" onclick="cardVariantQtyChange('${escapeHtml(product.id)}','${escapeHtml(selectedVariant.id)}',1)" title="Add one">+</button></div></div>`;
    return;
  }
  updateCardDisplayedPrice(product.id, product.price);
  const item = cart.find((x) => x.id === productId);
  const qty = item ? item.qty : 0;
  if (qty === 0) {
    wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><button class="pc-add-btn" onclick="quickAdd('${escapeHtml(productId)}')">${addLabel}</button>`;
    return;
  }
  wrap.innerHTML = `<button class="pc-details-btn" onclick="openModal('${escapeHtml(productId)}')">Details</button><div class="card-qty-wrap"><button class="card-qty-btn remove-btn" onclick="cardQtyChange('${escapeHtml(productId)}',-1)" title="Remove one">-</button><div class="card-qty-mid"><span class="cqn">${qty}</span><span style="font-size:11px;opacity:.85">box${qty !== 1 ? 'es' : ''}</span></div><button class="card-qty-btn" onclick="cardQtyChange('${escapeHtml(productId)}',1)" title="Add one">+</button></div>`;
}

function cardQtyChange(productId, delta) {
  const item = cart.find((x) => x.id === productId);
  if (!item) return;
  const previousQty = item.qty || 0;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) {
    cart = cart.filter((x) => x.id !== productId);
    showToast('Removed from cart');
  } else {
    showToast(delta > 0 ? 'Added one more box!' : 'Removed one box');
  }
  saveCart();
  updateCartUI();
  renderCardQty(productId);
  trackShopEvent('cart_quantity_changed', {
    product_id: productId,
    quantity_delta: delta,
    previous_quantity: previousQty,
    next_quantity: Math.max(0, item.qty || 0),
    ...cartAnalyticsSummary()
  });
}

function cardVariantQtyChange(productId, variantId, delta) {
  const itemId = buildCartItemId(productId, variantId);
  const item = cart.find((x) => x.id === itemId);
  if (!item) return;
  const previousQty = item.qty || 0;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) {
    cart = cart.filter((x) => x.id !== itemId);
    showToast('Removed from cart');
  } else {
    showToast(delta > 0 ? 'Added one more!' : 'Removed one');
  }
  saveCart();
  updateCartUI();
  renderCardQty(productId);
  trackShopEvent('cart_quantity_changed', {
    product_id: productId,
    variant_id: variantId,
    quantity_delta: delta,
    previous_quantity: previousQty,
    next_quantity: Math.max(0, item.qty || 0),
    ...cartAnalyticsSummary()
  });
}

// -- Shop refinements: availability / price / sort ------------
let shopAvailability = 'all';
let shopSort = 'featured';
let shopPriceMin = null;
let shopPriceMax = null;

function parsePriceNumber(value) {
  const n = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function productMinPrice(product) {
  const prices = getProductVariants(product)
    .map((variant) => parsePriceNumber(variant.price))
    .filter((n) => n !== null);
  if (prices.length) return Math.min(...prices);
  return parsePriceNumber(product.price);
}

function productInStock(product) {
  return Boolean(product.available && !product.displayOnly);
}

function shopRefinementsActive() {
  return shopAvailability !== 'all' || shopPriceMin !== null || shopPriceMax !== null;
}

function applyShopRefinements(items) {
  let out = items;
  if (shopAvailability === 'in') out = out.filter(productInStock);
  else if (shopAvailability === 'out') out = out.filter((p) => !productInStock(p));
  if (shopPriceMin !== null || shopPriceMax !== null) {
    out = out.filter((p) => {
      const price = productMinPrice(p);
      if (price === null) return false;
      if (shopPriceMin !== null && price < shopPriceMin) return false;
      if (shopPriceMax !== null && price > shopPriceMax) return false;
      return true;
    });
  }
  if (shopSort !== 'featured') {
    const rank = (p) => (p.displayOnly ? 2 : productInStock(p) ? 0 : 1);
    out = [...out].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (shopSort === 'price-asc') return (productMinPrice(a) ?? Infinity) - (productMinPrice(b) ?? Infinity);
      if (shopSort === 'price-desc') return (productMinPrice(b) ?? -Infinity) - (productMinPrice(a) ?? -Infinity);
      if (shopSort === 'name-asc') return String(a.name || '').localeCompare(String(b.name || ''));
      return 0;
    });
  }
  return out;
}

function activeFilterProducts() {
  const config = SHOP_FILTERS.find((filter) => filter.id === activeFilter) || SHOP_FILTERS[0];
  return window.SHRISH_DATA.products.filter((p) => !p.hidden
    && filterIncludesProduct(config, p)
    && productMatchesSearch(p));
}

function filterIncludesProduct(filter, product) {
  const category = normalizeProductCategory(product.category);
  if (!filter.categories.includes(category)) return false;
  if (filter.id === 'pickles') return product.filterGroup !== 'Podi';
  if (filter.id === 'podi') return product.filterGroup === 'Podi';
  return true;
}

function updateShopToolbarCounts() {
  const wrap = document.getElementById('shopToolbar');
  if (!wrap) return;
  wrap.hidden = false;
  const pool = activeFilterProducts();
  const inCount = pool.filter(productInStock).length;
  const counts = { all: pool.length, in: inCount, out: pool.length - inCount };
  wrap.querySelectorAll('.st-avail-btn').forEach((btn) => {
    const key = btn.dataset.avail;
    const span = btn.querySelector('.filter-count');
    if (span) span.textContent = counts[key] ?? 0;
    btn.classList.toggle('active', key === shopAvailability);
  });
  const clearBtn = document.getElementById('stPriceClear');
  if (clearBtn) clearBtn.hidden = shopPriceMin === null && shopPriceMax === null;
}

function applyShopPriceFilter() {
  shopPriceMin = parsePriceNumber(document.getElementById('stPriceMin')?.value);
  shopPriceMax = parsePriceNumber(document.getElementById('stPriceMax')?.value);
  trackShopEvent('shop_price_filter_applied', { price_min: shopPriceMin, price_max: shopPriceMax });
  renderShop();
}

function clearShopRefinements() {
  shopAvailability = 'all';
  shopSort = 'featured';
  shopPriceMin = null;
  shopPriceMax = null;
  const minEl = document.getElementById('stPriceMin');
  if (minEl) minEl.value = '';
  const maxEl = document.getElementById('stPriceMax');
  if (maxEl) maxEl.value = '';
  const sortEl = document.getElementById('stSort');
  if (sortEl) sortEl.value = 'featured';
  renderShop();
}

function initShopToolbar() {
  const wrap = document.getElementById('shopToolbar');
  if (!wrap) return;
  wrap.querySelectorAll('.st-avail-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      shopAvailability = btn.dataset.avail || 'all';
      trackShopEvent('shop_availability_filter_clicked', { availability: shopAvailability });
      renderShop();
    });
  });
  const sortEl = document.getElementById('stSort');
  if (sortEl) {
    sortEl.addEventListener('change', () => {
      shopSort = sortEl.value;
      trackShopEvent('shop_sort_changed', { sort: shopSort });
      renderShop();
    });
  }
  const applyBtn = document.getElementById('stPriceApply');
  if (applyBtn) applyBtn.addEventListener('click', applyShopPriceFilter);
  ['stPriceMin', 'stPriceMax'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyShopPriceFilter(); });
  });
  const clearBtn = document.getElementById('stPriceClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const minEl = document.getElementById('stPriceMin');
      if (minEl) minEl.value = '';
      const maxEl = document.getElementById('stPriceMax');
      if (maxEl) maxEl.value = '';
      shopPriceMin = null;
      shopPriceMax = null;
      renderShop();
    });
  }
}

function buildFilters() {
  const bar = document.getElementById('filterBar');
  if (!bar) return;
  const pickleSub = document.getElementById('sbPickleSub');
  if (pickleSub?.parentElement === bar) bar.parentElement.appendChild(pickleSub);
  bar.innerHTML = '';
  SHOP_FILTERS.forEach((cat) => {
    const normalizedCatId = cat.id;
    const count = normalizedCatId === 'all'
      ? window.SHRISH_DATA.products.filter((p) => !p.hidden).length
      : window.SHRISH_DATA.products.filter((p) => !p.hidden && filterIncludesProduct(cat, p)).length;
    const btn = document.createElement('button');
    btn.className = `filter-btn filter-btn-${normalizedCatId}${normalizedCatId === activeFilter ? ' active' : ''}`;
    btn.innerHTML = `${escapeHtml(cat.label)} <span class="filter-count">${count}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = normalizedCatId;
      if (normalizedCatId !== 'pickles') picklePodiFilter = 'all';
      updateShopCategoryUrl(normalizedCatId);
      trackShopEvent('shop_category_filter_clicked', {
        filter_id: normalizedCatId,
        filter_label: cat.label
      });
      renderShop();
    };
    bar.appendChild(btn);
    if (normalizedCatId === 'pickles' && pickleSub) bar.appendChild(pickleSub);
  });
}

function picklesPodiMatches(product) {
  if (picklePodiFilter === 'veg') return product.filterGroup === 'Veg Pickles';
  if (picklePodiFilter === 'nonveg') return product.filterGroup === 'Non-Veg Pickles';
  return product.filterGroup !== 'Podi';
}

function renderPicklesPodiFilters(items) {
  const filters = [
    { id: 'all', label: 'All Pickles' },
    { id: 'veg', label: 'Veg' },
    { id: 'nonveg', label: 'Non-Veg' }
  ];
  const countFor = (filterId) => items.filter((product) => {
    if (filterId === 'veg') return product.filterGroup === 'Veg Pickles';
    if (filterId === 'nonveg') return product.filterGroup === 'Non-Veg Pickles';
    return product.filterGroup !== 'Podi';
  }).length;

  return `<div class="pickle-subfilters" aria-label="Pickle type filters">${filters.map((filter) => `
    <button type="button" class="pickle-type-btn${picklePodiFilter === filter.id ? ' active' : ''}" onclick="setPicklesPodiFilter('${filter.id}')">
      ${escapeHtml(filter.label)} <span>${countFor(filter.id)}</span>
    </button>
  `).join('')}</div>`;
}

function setPicklesPodiFilter(filterId) {
  picklePodiFilter = filterId;
  if (activeFilter !== 'pickles') {
    activeFilter = 'pickles';
    document.querySelectorAll('.filter-btn').forEach((b) => {
      b.classList.toggle('active', b.classList.contains('filter-btn-pickles'));
    });
  }
  const url = new URL(shopUrlForFilter('pickles', { clearProduct: true }), window.location.origin);
  if (filterId === 'all') url.searchParams.delete('type');
  else url.searchParams.set('type', filterId);
  window.history.replaceState({ shrishPicklesPodiFilter: filterId }, '', `${url.pathname}${url.search}`);
  trackShopEvent('pickles_podi_filter_clicked', {
    filter_id: filterId
  });
  renderShop();
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function productMatchesSearch(product, query = productSearchQuery) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const terms = normalizedQuery.split(' ').filter((term) => term.length > 1);
  const haystack = normalizeSearchText([
    product.name,
    product.localName,
    product.origin,
    product.category,
    product.filterGroup,
    product.tag,
    product.taste,
    product.bestFor,
    product.description,
    product.ingredientsText,
    ...(product.badges || []),
    ...(product.recommendationTags || [])
  ].filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
}

function updateProductSearch(query, { updateUrl = true } = {}) {
  productSearchQuery = String(query || '').trim();
  document.querySelectorAll('.nav-product-search input, .mobile-product-search input').forEach((input) => {
    if (input.value !== productSearchQuery) input.value = productSearchQuery;
  });
  if (updateUrl) {
    window.history.replaceState({}, '', shopUrlForFilter(activeFilter, {
      clearProduct: true,
      searchQuery: productSearchQuery
    }));
  }
  renderShop();
  window.clearTimeout(searchTrackTimer);
  const normalizedLength = normalizeSearchText(productSearchQuery).length;
  if (normalizedLength >= 2 && productSearchQuery !== lastTrackedSearch) {
    searchTrackTimer = window.setTimeout(() => {
      const visibleCount = window.SHRISH_DATA.products.filter((product) => !product.hidden && productMatchesSearch(product)).length;
      lastTrackedSearch = productSearchQuery;
      trackShopEvent('product_search_performed', {
        search_length: productSearchQuery.length,
        results_count: visibleCount,
        active_filter: activeFilter
      });
    }, 700);
  }
}

function updatePickleSidebarFilters(items) {
  const wrap = document.getElementById('sbPickleSub');
  const list = document.getElementById('sbPickleSubList');
  if (!wrap || !list) return;
  list.innerHTML = renderPicklesPodiFilters(items);
  wrap.hidden = false;
}

function renderShop() {
  const container = document.getElementById('shopContent');
  if (!container) return;
  container.innerHTML = '';
  updateShopToolbarCounts();
  const sbPickle = document.getElementById('sbPickleSub');
  if (sbPickle) sbPickle.hidden = true;
  const escapedSearchQuery = escapeHtml(productSearchQuery);

  const sortWithinAvailability = (arr) => [
    ...arr.filter((p) => p.available && !p.displayOnly),
    ...arr.filter((p) => !p.available && !p.displayOnly),
    ...arr.filter((p) => p.displayOnly)
  ];

  const catMeta = {
    mangoes: { title: 'Fruits', em: 'Mangoes', sub: 'Click any product to view full details. Available varieties shown first.', banner: false },
    putharekulu: { title: 'Sweets', em: 'Putharekulu', sub: 'Hand-crafted in Atreyapuram, Andhra Pradesh. Check current batch availability and order online.', banner: true },
    jellysnacks: { title: 'Sweets', em: 'Jelly', sub: 'Traditional Mamidi Thandra & Thati Thandra from Atreyapuram. Check current availability before checkout.', banner: false },
    sweets: { title: 'Sweets', em: '& Laddus', sub: 'Traditional Godavari-style sweets, kaja, and laddus. Freshly sourced batches. Check current availability before checkout.', banner: false },
    snacks: {
      title: 'Snacks',
      em: '',
      sub: 'More snacks will be added soon.',
      banner: true,
      bannerTitle: 'Snacks Coming Soon!',
      bannerText: 'We are getting select snacks directly from India. Stay tuned for fresh arrivals and limited batches.'
    },
    picklespodi: {
      title: 'Pickles',
      em: '& Podi',
      sub: 'Traditional Andhra-style pickles and podi. Non-veg pickles are preorder only. Use package Best Before date as final.',
      banner: true,
      bannerTitle: 'More Pickles & Podi Coming Soon!',
      bannerText: 'More regional pickle and podi varieties are being planned. Watch this section for limited batches and preorder updates.'
    }
  };

  const activeFilterConfig = SHOP_FILTERS.find((filter) => filter.id === activeFilter) || SHOP_FILTERS[0];
  const cats = activeFilterConfig.categories;
  let renderedSections = 0;
  cats.forEach((catId) => {
    const allCatItems = sortWithinAvailability(window.SHRISH_DATA.products.filter((p) => !p.hidden && p.category === catId));
    const searchedItems = allCatItems.filter((product) => productMatchesSearch(product));
    let baseItems = searchedItems;
    if (catId === 'picklespodi' && activeFilter !== 'all') {
      baseItems = baseItems.filter((product) => filterIncludesProduct(activeFilterConfig, product));
    }
    if (catId === 'picklespodi' && activeFilter === 'pickles') {
      baseItems = baseItems.filter(picklesPodiMatches);
    }
    const items = applyShopRefinements(baseItems);
    let m = catMeta[catId] || { title: catId, em: '', sub: '', banner: false };
    if (catId === 'picklespodi' && activeFilter === 'pickles') {
      m = { title: 'Pickles', em: '', sub: 'Traditional Andhra-style pickles. Non-veg pickles are preorder only and depend on supplier batch and pickup timing.', banner: false };
    } else if (catId === 'picklespodi' && activeFilter === 'podi') {
      m = { title: 'Podi', em: '', sub: 'Traditional South Indian podi and powders, prepared in small batches.', banner: false };
    }
    const showEmptyCategory = activeFilter === catId && ['snacks'].includes(catId);
    if (!allCatItems.length && !showEmptyCategory) return;
    if (productSearchQuery && !items.length) return;
    if (shopRefinementsActive() && !items.length) return;
    const hasLiveItems = allCatItems.some((product) => product.available && !product.displayOnly);
    let sectionSub = m.sub;
    if (catId === 'putharekulu' && hasLiveItems) {
      sectionSub = 'Hand-crafted in Atreyapuram, Andhra Pradesh. Available items are shown first.';
    }
    if (catId === 'jellysnacks' && hasLiveItems) {
      sectionSub = 'Traditional Mamidi Thandra & Thati Thandra from Atreyapuram. Available items are shown first.';
    }
    if (catId === 'picklespodi' && activeFilter === 'all') {
      sectionSub = 'Traditional Andhra-style pickles and podi. Non-veg pickles are preorder only and depend on supplier batch and pickup timing.';
    }
    if (catId === 'picklespodi' && activeFilter === 'pickles') updatePickleSidebarFilters(allCatItems.filter((product) => product.filterGroup !== 'Podi'));
    const searchNote = productSearchQuery ? `<div class="shop-search-note">Showing matches for <strong>${escapedSearchQuery}</strong>. <a href="${escapeHtml(shopUrlForFilter(activeFilter, { clearSearch: true, clearProduct: true }))}">Clear search</a></div>` : '';
    const safetyNotice = `<details class="shop-safety-notice"><summary>⚠ Food allergy &amp; spice notice — tap to read</summary><p>${escapeHtml(SHOP_ALLERGEN_NOTICE)} ${escapeHtml(SHOP_SPICE_NOTICE)}</p></details>`;
    let html = `<div class="shop-section"><div class="shop-section-head"><div><div class="shop-section-title">${m.title} <em>${m.em}</em></div><div class="section-divider"></div></div></div>${searchNote}<p style="color:var(--text-light);font-size:14px;margin-bottom:14px">${sectionSub}</p>${safetyNotice}`;
    const showBanner = m.banner && (!hasLiveItems || activeFilter === catId);
    if (showBanner) {
      const bannerTitle = m.bannerTitle || 'Coming Soon to Shrish!';
      const bannerText = m.bannerText || 'Authentic GI-tagged Putharekulu from Atreyapuram. Hit "Notify Me" to be first in line when we launch.';
      html += `<div class="coming-banner"><div class="cb-icon">New</div><div><h3>${escapeHtml(bannerTitle)}</h3><p>${escapeHtml(bannerText)}</p></div></div>`;
    }
    html += `<div class="products-grid-v2">${items.map(renderCard).join('')}</div></div>`;
    container.innerHTML += html;
    renderedSections += 1;
  });

  if (catalogSyncReady) container.classList.add('lx-settled');

  if (!renderedSections && shopRefinementsActive()) {
    container.innerHTML = '<div class="no-results"><div class="nr-icon">!</div><p>No products match your current filters.</p><button class="btn-primary" onclick="clearShopRefinements()" style="border:none;cursor:pointer">Clear filters</button></div>';
  } else if (!renderedSections) {
    container.innerHTML = productSearchQuery
      ? `<div class="no-results"><div class="nr-icon">!</div><p>No products matched "${escapedSearchQuery}". Try sweet, spicy, tangy, podi, avakai, putharekulu, or mango.</p><a class="btn-primary" href="shop.html">Clear search</a></div>`
      : '<div class="no-results"><div class="nr-icon">!</div><p>No products in this category yet.</p></div>';
  }

  window.SHRISH_DATA.products.forEach((product) => renderCardQty(product.id));
}

function openInitialProductFromUrl() {
  if (initialProductOpened) return;
  try {
    const productId = new URLSearchParams(window.location.search).get('product');
    if (!productId) return;
    const product = window.SHRISH_DATA.products.find((entry) => entry.id === productId);
    if (!product) return;
    initialProductOpened = true;
    window.setTimeout(() => openModal(product.id, { updateUrl: false }), 150);
  } catch (error) {
    console.warn('Unable to open product from URL', error);
  }
}

function handleShopHistoryChange() {
  try {
    const pathFilter = filterFromCurrentLocation();
    if (pathFilter && pathFilter !== activeFilter) {
      activeFilter = pathFilter;
      if (pathFilter !== 'pickles') picklePodiFilter = 'all';
      buildFilters();
      renderShop();
    }
    const productId = new URLSearchParams(window.location.search).get('product');
    if (productId) {
      const product = window.SHRISH_DATA.products.find((entry) => entry.id === productId);
      if (product) {
        openModal(product.id, { updateUrl: false });
        return;
      }
    }
    closeModal({ updateUrl: false });
  } catch (error) {
    console.warn('Unable to sync product modal with URL', error);
  }
}

function applyCachedCatalog() {
  try {
    const raw = localStorage.getItem('shrishCatalogCache');
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.docs) || !cached.docs.length) return false;
    if (Date.now() - (cached.t || 0) > 7 * 24 * 60 * 60 * 1000) return false;
    mergeProducts(cached.docs);
    return true;
  } catch (e) {
    return false;
  }
}

function subscribeCatalog() {
  onSnapshot(collection(db, 'products'), (snapshot) => {
    if (!snapshot.docs.length) {
      catalogSyncReady = false;
      catalogSyncFailed = true;
      showToast('Live catalog unavailable. Please refresh before ordering.');
      buildFilters();
      renderShop();
      updateCartUI();
      trackShopViewedOnce();
      return;
    }
    catalogSyncReady = true;
    catalogSyncFailed = false;
    const docs = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    try { localStorage.setItem('shrishCatalogCache', JSON.stringify({ t: Date.now(), docs })); } catch (e) {}
    mergeProducts(docs);
    buildFilters();
    renderShop();
    openInitialProductFromUrl();
    updateCartUI();
    trackShopViewedOnce();
  }, (error) => {
    console.error('Catalog sync failed', error);
    catalogSyncReady = false;
    catalogSyncFailed = true;
    showToast('Live catalog unavailable. Please refresh before ordering.');
    buildFilters();
    renderShop();
    openInitialProductFromUrl();
    updateCartUI();
    trackShopViewedOnce();
  });
}

function bindNotifyForm() {
  const form = document.getElementById('notifyForm');
  if (!form) return;
  form.addEventListener('submit', submitNotifyRequest);
}

function bindLiveSearchEvents() {
  window.addEventListener('shrish:product-search', (event) => {
    updateProductSearch(event.detail?.query || '');
  });
}

function init() {
  if (!window.SHRISH_DATA?.products) {
    const shopContent = document.getElementById('shopContent');
    if (shopContent) {
      shopContent.innerHTML = '<div class="no-results"><div class="nr-icon">!</div><p>Could not load products. Please refresh.</p></div>';
    }
    return;
  }

  bindNotifyForm();
  bindLiveSearchEvents();
  window.addEventListener('popstate', handleShopHistoryChange);
  window.addEventListener('pagehide', () => trackModalDuration('pagehide'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeCart(); closeNotifyModal(); } });
  applyCachedCatalog();
  buildFilters();
  initShopToolbar();
  renderShop();
  updateCartUI();
  trackShopViewedOnce();
  afterFirstPaint(subscribeCatalog);
}

window.openCart = openCart;
window.closeCart = closeCart;
window.openModal = openModal;
window.closeModal = closeModal;
window.handleModalOverlayClick = handleModalOverlayClick;
window.switchModalImg = switchModalImg;
window.modalChangeQty = modalChangeQty;
window.modalAddToCart = modalAddToCart;
window.modalSelectVariant = modalSelectVariant;
window.quickAdd = quickAdd;
window.quickAddVariant = quickAddVariant;
window.quickAddSelectedVariant = quickAddSelectedVariant;
window.cardVariantChanged = cardVariantChanged;
window.setPicklesPodiFilter = setPicklesPodiFilter;
window.cardQtyChange = cardQtyChange;
window.cardVariantQtyChange = cardVariantQtyChange;
window.renderCardQty = renderCardQty;
window.cartQty = cartQty;
window.cartRemove = cartRemove;
window.notifyMe = notifyMe;
window.closeNotifyModal = closeNotifyModal;
window.handleNotifyOverlayClick = handleNotifyOverlayClick;
window.goCheckout = goCheckout;
window.cartUpsellAdd = cartUpsellAdd;
window.clearShopRefinements = clearShopRefinements;

init();
