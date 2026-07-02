const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://shrish.co';
const ROOT_PREFIX = '../../../../';

const CATEGORY_LABELS = {
  mangoes: 'Mangoes',
  putharekulu: 'Putharekulu',
  jellysnacks: 'Jelly Snacks',
  snacks: 'Snacks',
  picklespodi: 'Pickles & Podi'
};

const SHOP_FILTER_BY_CATEGORY = {
  mangoes: 'mangoes',
  putharekulu: 'sweets',
  jellysnacks: 'sweets',
  snacks: 'snacks',
  picklespodi: 'picklespodi'
};

function readData() {
  const code = fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8') + '\n;globalThis.__SHRISH_DATA = SHRISH_DATA;';
  const context = { console };
  context.window = context;
  vm.runInNewContext(code, context, { filename: 'assets/js/data.js' });
  return context.__SHRISH_DATA;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeCategory(category) {
  return category === 'Mango Jelly' ? 'jellysnacks' : category;
}

function productPagePath(product) {
  const category = normalizeCategory(product.category);
  return `shop/products/${category}/${product.id}/`;
}

function productPageUrl(product) {
  return `${SITE_URL}/${productPagePath(product)}`;
}

function shopProductUrl(product) {
  const category = normalizeCategory(product.category);
  const filter = SHOP_FILTER_BY_CATEGORY[category] || category || 'all';
  return `${ROOT_PREFIX}shop.html?category=${encodeURIComponent(filter)}&product=${encodeURIComponent(product.id)}`;
}

function productImage(product) {
  const image = String(product.image || '').replace(/\\/g, '/');
  if (image && fs.existsSync(path.join(ROOT, image))) {
    return {
      local: `${ROOT_PREFIX}${image}`,
      absolute: `${SITE_URL}/${image}`
    };
  }
  return {
    local: `${ROOT_PREFIX}images/brand/logo-small.png`,
    absolute: `${SITE_URL}/images/brand/logo-small.png`
  };
}

function parsePrice(value) {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

function statusText(product) {
  if (product.preorderOnly) return 'Preorder Only';
  if (product.displayOnly) return 'Coming Soon';
  return product.available ? 'Available Now' : 'Currently Not Available';
}

function statusClass(product) {
  if (product.preorderOnly || product.displayOnly) return 'soon';
  return product.available ? 'available' : 'sold';
}

function productTags(product) {
  return Array.from(new Set([
    product.tag,
    product.filterGroup,
    product.season,
    product.taste,
    ...(product.badges || []),
    ...(product.recommendationTags || []).slice(0, 8)
  ].filter(Boolean)));
}

function variantsHtml(product) {
  const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => variant.label) : [];
  if (!variants.length) {
    return `<div class="product-price">${escapeHtml(product.price || '')}<span>${escapeHtml(product.unit || '')}</span></div>`;
  }
  return `
    <div class="variant-list">
      ${variants.map((variant) => `
        <div class="variant-row">
          <span>${escapeHtml(variant.label)}</span>
          <strong>${escapeHtml(variant.price || product.price || '')}</strong>
        </div>
      `).join('')}
    </div>`;
}

function detailRows(product) {
  return [
    ['Origin', product.origin],
    ['Local name', product.localName],
    ['Season', product.season],
    ['Taste', product.taste],
    ['Best for', product.bestFor],
    ['Ingredients', product.ingredientsText],
    ['Shelf life', product.shelfLifeDisplay],
    ['Storage', product.storageNote],
    ['Shipping', product.shippingNote],
    ['Best Before', product.foodSafetyNote],
    ['Details', product.details]
  ].filter(([, value]) => value);
}

function jsonLd(product, image) {
  const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => variant.label) : [];
  const offers = variants.length
    ? variants.map((variant) => ({
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: parsePrice(variant.price || product.price),
        availability: product.available && !product.displayOnly ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: productPageUrl(product)
      }))
    : [{
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: parsePrice(product.price),
        availability: product.available && !product.displayOnly ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: productPageUrl(product)
      }];

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: image.absolute,
    description: stripHtml(product.description),
    brand: {
      '@type': 'Brand',
      name: 'Shrish'
    },
    category: CATEGORY_LABELS[normalizeCategory(product.category)] || product.category,
    offers
  }, null, 2).replace(/</g, '\\u003c');
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function productAnalyticsProps(product) {
  return {
    product_id: product.id || '',
    product_title: product.name || '',
    category: normalizeCategory(product.category || ''),
    filter_group: product.filterGroup || '',
    preorder: Boolean(product.preorderOnly),
    available: Boolean(product.available && !product.displayOnly),
    source: 'seo_product_page'
  };
}

function cleanGeneratedHtml(html) {
  return html.split('\n').map((line) => line.replace(/\s+$/g, '')).join('\n');
}

function renderProductPage(product) {
  const category = normalizeCategory(product.category);
  const categoryLabel = CATEGORY_LABELS[category] || category;
  const image = productImage(product);
  const description = stripHtml(product.description);
  const title = `${product.name} | Shrish`;
  const canonical = productPageUrl(product);
  const tags = productTags(product);
  const rows = detailRows(product);

  return cleanGeneratedHtml(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description.slice(0, 155))}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(product.name)}">
  <meta property="og:description" content="${escapeHtml(description.slice(0, 180))}">
  <meta property="og:image" content="${image.absolute}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="Shrish">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#C8791A">
  <script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="icon" href="${ROOT_PREFIX}images/brand/logo-small.png" type="image/png">
  <link rel="stylesheet" href="${ROOT_PREFIX}assets/css/styles.css">
  <style>
    .product-page { background: var(--cream); min-height: 100vh; }
    .product-nav { border-bottom: 1px solid rgba(200,121,26,.14); background: rgba(253,246,236,.96); }
    .product-nav-inner { max-width: 1240px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 22px; }
    .product-nav-logo img { width: 86px; height: 86px; object-fit: contain; }
    .product-nav-links { display: flex; align-items: center; gap: 24px; font-weight: 700; color: var(--mid); }
    .product-nav-links a:hover { color: var(--saffron); }
    .product-wrap { max-width: 1240px; margin: 0 auto; padding: 54px 24px 72px; }
    .product-breadcrumb { display: flex; gap: 8px; flex-wrap: wrap; color: var(--text-light); font-size: 13px; margin-bottom: 22px; }
    .product-breadcrumb a { color: var(--saffron); font-weight: 700; }
    .product-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 520px); gap: 42px; align-items: start; }
    .product-media { background: var(--white); border: 1px solid rgba(200,121,26,.12); border-radius: 18px; min-height: 520px; display: flex; align-items: center; justify-content: center; padding: 36px; box-shadow: var(--shadow); }
    .product-media img { max-height: 460px; width: 100%; object-fit: contain; }
    .product-content { padding-top: 8px; }
    .product-kicker { color: var(--saffron); font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; margin-bottom: 10px; }
    .product-title { font-family: var(--font-display); color: var(--dark); font-size: clamp(2.4rem, 5vw, 4.2rem); line-height: .98; margin-bottom: 10px; }
    .product-local { color: var(--text-light); font-style: italic; font-size: 18px; margin-bottom: 18px; }
    .product-status { display: inline-flex; padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; margin-bottom: 20px; }
    .product-status.available { background: #E8F5E9; color: #2E7D32; }
    .product-status.sold { background: #FFEBEE; color: #C62828; }
    .product-status.soon { background: rgba(26,18,8,.08); color: var(--dark); }
    .product-desc { color: var(--text); font-size: 17px; line-height: 1.8; margin-bottom: 22px; }
    .product-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .product-tags span { background: var(--cream-d); border-radius: 999px; color: var(--text-light); padding: 7px 12px; font-size: 12px; font-weight: 700; }
    .product-price { color: var(--saffron); font-family: var(--font-display); font-size: 30px; font-weight: 700; margin-bottom: 24px; }
    .product-price span { display: block; color: var(--text-light); font-family: var(--font-body); font-size: 13px; font-weight: 500; margin-top: 4px; }
    .variant-list { border: 1px solid rgba(200,121,26,.16); border-radius: 14px; overflow: hidden; margin-bottom: 24px; background: var(--white); }
    .variant-row { display: flex; justify-content: space-between; gap: 16px; padding: 13px 15px; border-bottom: 1px solid rgba(200,121,26,.1); }
    .variant-row:last-child { border-bottom: 0; }
    .variant-row strong { color: var(--saffron); }
    .product-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; }
    .product-detail-list { background: rgba(255,255,255,.6); border: 1px solid rgba(200,121,26,.12); border-radius: 16px; overflow: hidden; }
    .product-detail-row { display: grid; grid-template-columns: 130px 1fr; gap: 16px; padding: 13px 16px; border-bottom: 1px solid rgba(200,121,26,.1); }
    .product-detail-row:last-child { border-bottom: 0; }
    .product-detail-row span { color: var(--text-light); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .product-detail-row strong { color: var(--text); font-weight: 500; }
    .product-footer { max-width: 1240px; margin: 0 auto; padding: 24px; border-top: 1px solid rgba(200,121,26,.12); color: var(--text-light); font-size: 13px; }
    @media (max-width: 820px) {
      .product-nav-inner { align-items: flex-start; }
      .product-nav-links { gap: 14px; flex-wrap: wrap; justify-content: flex-end; font-size: 14px; }
      .product-layout { grid-template-columns: 1fr; gap: 26px; }
      .product-media { min-height: 320px; padding: 24px; }
      .product-detail-row { grid-template-columns: 1fr; gap: 4px; }
    }
  </style>
  <script type="application/ld+json">${jsonLd(product, image)}</script>
</head>
<body class="product-page">
  <header class="product-nav">
    <div class="product-nav-inner">
      <a class="product-nav-logo" href="${ROOT_PREFIX}index.html" aria-label="Shrish home"><img src="${ROOT_PREFIX}images/brand/logo-small.png" alt="Shrish"></a>
      <nav class="product-nav-links" aria-label="Product page navigation">
        <a href="${ROOT_PREFIX}index.html">Home</a>
        <a href="${ROOT_PREFIX}about.html">About</a>
        <a href="${ROOT_PREFIX}shop.html">Shop</a>
        <a href="${ROOT_PREFIX}recipes.html">Recipes</a>
        <a href="${ROOT_PREFIX}contact.html">Contact</a>
      </nav>
    </div>
  </header>
  <main class="product-wrap">
    <div class="product-breadcrumb">
      <a href="${ROOT_PREFIX}shop.html">Shop</a><span>/</span>
      <a href="${ROOT_PREFIX}shop.html?category=${encodeURIComponent(SHOP_FILTER_BY_CATEGORY[category] || category)}">${escapeHtml(categoryLabel)}</a><span>/</span>
      <span>${escapeHtml(product.name)}</span>
    </div>
    <section class="product-layout">
      <div class="product-media">
        <img src="${image.local}" alt="${escapeHtml(product.name)}" loading="eager">
      </div>
      <article class="product-content">
        <div class="product-kicker">${escapeHtml(categoryLabel)}</div>
        <h1 class="product-title">${escapeHtml(product.name)}</h1>
        ${product.localName ? `<div class="product-local">${escapeHtml(product.localName)}</div>` : ''}
        <div class="product-status ${statusClass(product)}">${statusText(product)}</div>
        <p class="product-desc">${escapeHtml(product.description || '')}</p>
        ${tags.length ? `<div class="product-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        ${variantsHtml(product)}
        <div class="product-actions">
          <a class="btn-primary" href="${shopProductUrl(product)}" data-product-action="order_from_shop">Order from shop</a>
          <a class="btn-secondary" href="${ROOT_PREFIX}shop.html" data-product-action="back_to_shop">Back to shop</a>
        </div>
        ${rows.length ? `<div class="product-detail-list">${rows.map(([label, value]) => `<div class="product-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>` : ''}
      </article>
    </section>
  </main>
  <footer class="product-footer">Product photos and details are for reference. Availability, batch, pickup timing, and final package details may vary.</footer>
  <script src="${ROOT_PREFIX}assets/js/analytics.js?v=product-pages-1"></script>
  <script>
  (function () {
    var props = ${jsonScript(productAnalyticsProps(product))};
    function track(eventName, extra) {
      window.SHRISH_ANALYTICS?.track(eventName, Object.assign({}, props, extra || {}));
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { track('product_page_viewed'); }, { once: true });
    } else {
      track('product_page_viewed');
    }
    document.querySelectorAll('[data-product-action]').forEach(function (link) {
      link.addEventListener('click', function () {
        track('product_page_action_clicked', { action: link.getAttribute('data-product-action') || 'unknown' });
      });
    });
  })();
  </script>
</body>
</html>
`);
}

function renderProductsIndex(products) {
  const grouped = products.reduce((acc, product) => {
    const category = normalizeCategory(product.category);
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {});
  return cleanGeneratedHtml(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shrish Product Pages</title>
  <meta name="description" content="Browse Shrish product pages by category.">
  <link rel="canonical" href="${SITE_URL}/shop/products/">
  <script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
  <link rel="icon" href="../../images/brand/logo-small.png" type="image/png">
  <link rel="stylesheet" href="../../assets/css/styles.css">
  <style>
    .directory { max-width: 1120px; margin: 0 auto; padding: 56px 24px; }
    .directory h1 { font-family: var(--font-display); color: var(--dark); font-size: clamp(2.4rem,5vw,4rem); }
    .directory-section { margin-top: 34px; }
    .directory-section h2 { font-family: var(--font-display); color: var(--dark); font-size: 30px; margin-bottom: 14px; }
    .directory-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
    .directory-grid a { background: #fff; border: 1px solid rgba(200,121,26,.14); border-radius: 10px; padding: 13px 15px; color: var(--text); font-weight: 700; }
    .directory-grid a:hover { color: var(--saffron); }
  </style>
</head>
<body>
  <main class="directory">
    <a href="../../shop.html" class="btn-secondary">Back to shop</a>
    <h1>Shrish Product Pages</h1>
    ${Object.entries(grouped).map(([category, items]) => `
      <section class="directory-section">
        <h2>${escapeHtml(CATEGORY_LABELS[category] || category)}</h2>
        <div class="directory-grid">${items.map((product) => `<a href="${category}/${product.id}/">${escapeHtml(product.name)}</a>`).join('')}</div>
      </section>
    `).join('')}
  </main>
  <script src="../../assets/js/analytics.js?v=product-pages-1"></script>
  <script>
  window.SHRISH_ANALYTICS?.track('product_directory_viewed');
  </script>
</body>
</html>
`);
}

function writeProductPages() {
  const data = readData();
  const products = (data.products || [])
    .filter((product) => product && product.id && product.category)
    .map((product) => ({ ...product, category: normalizeCategory(product.category) }));

  const productsRoot = path.join(ROOT, 'shop', 'products');
  fs.rmSync(productsRoot, { recursive: true, force: true });
  fs.mkdirSync(productsRoot, { recursive: true });

  for (const product of products) {
    const dir = path.join(productsRoot, product.category, product.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderProductPage(product));
  }

  fs.writeFileSync(path.join(productsRoot, 'index.html'), renderProductsIndex(products));

  const today = new Date().toISOString().slice(0, 10);
  const staticUrls = ['', 'shop.html', 'about.html', 'recipes.html', 'contact.html'];
  const productUrls = products.map(productPagePath);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, 'shop/products/', ...productUrls].map((urlPath) => `  <url>
    <loc>${SITE_URL}/${urlPath}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

  console.log(`Generated ${products.length} product pages and sitemap.xml`);
}

writeProductPages();
