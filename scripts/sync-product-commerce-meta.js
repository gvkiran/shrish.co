'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://www.shrish.co';

function readData() {
  const code = fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8') + '\n;globalThis.__SHRISH_DATA = SHRISH_DATA;';
  const context = { console };
  context.window = context;
  vm.runInNewContext(code, context, { filename: 'assets/js/data.js' });
  return context.__SHRISH_DATA;
}

function normalizeCategory(category) {
  return category === 'Mango Jelly' ? 'jellysnacks' : category;
}

function parsePrice(value) {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : '';
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function productImage(product) {
  const candidates = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])]
    .map((entry) => String(entry || '').replace(/\\/g, '/').trim());
  const image = candidates.find((entry) => entry && fs.existsSync(path.join(ROOT, entry)));
  return `${SITE_URL}/${image || 'images/brand/logo-small.png'}`;
}

function productPageUrl(product) {
  return `${SITE_URL}/shop/products/${normalizeCategory(product.category)}/${product.id}/`;
}

function commerceData(product) {
  const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => variant.label) : [];
  const primaryVariant = variants[0] || null;
  const sku = primaryVariant && (primaryVariant.sku || primaryVariant.id);
  const price = parsePrice(primaryVariant ? (primaryVariant.price || product.price) : product.price);
  if (!price) throw new Error(`Missing positive product price: ${product.id}`);
  const available = Boolean(product.available && !product.displayOnly);
  const offer = {
    '@type': 'Offer',
    priceCurrency: 'USD',
    price,
    availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    url: productPageUrl(product)
  };
  if (sku) offer.sku = sku;
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: productImage(product),
    description: stripHtml(product.description),
    brand: { '@type': 'Brand', name: 'Shrish' },
    ...(sku ? { sku } : {}),
    category: normalizeCategory(product.category),
    offers: offer
  };
  return { price, availability: available ? 'in stock' : 'out of stock', structured };
}

function syncPage(product) {
  const pagePath = path.join(ROOT, 'shop', 'products', normalizeCategory(product.category), product.id, 'index.html');
  if (!fs.existsSync(pagePath)) throw new Error(`Missing product page: ${path.relative(ROOT, pagePath)}`);
  const data = commerceData(product);
  let html = fs.readFileSync(pagePath, 'utf8');
  const meta = `  <meta property="product:price:amount" content="${data.price}">\n  <meta property="product:price:currency" content="USD">\n  <meta property="product:availability" content="${data.availability}">`;
  const metaPattern = /\s*<meta property="product:price:amount"[^>]*>\s*<meta property="product:price:currency"[^>]*>\s*<meta property="product:availability"[^>]*>/;
  if (metaPattern.test(html)) {
    html = html.replace(metaPattern, `\n${meta}`);
  } else {
    html = html.replace('  <meta property="og:site_name" content="Shrish">', `  <meta property="og:site_name" content="Shrish">\n${meta}`);
  }
  const structured = JSON.stringify(data.structured, null, 2).replace(/</g, '\\u003c');
  const productLdPattern = /<script type="application\/ld\+json">\s*\{[\s\S]*?"@type"\s*:\s*"Product"[\s\S]*?<\/script>/;
  if (!productLdPattern.test(html)) throw new Error(`Product JSON-LD not found: ${path.relative(ROOT, pagePath)}`);
  html = html.replace(productLdPattern, `<script type="application/ld+json">${structured}</script>`);
  fs.writeFileSync(pagePath, html);
}

function updateProductLastModified(products) {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  for (const product of products) {
    const url = productPageUrl(product).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(<loc>${url}<\\/loc>\\s*<lastmod>)[^<]+`);
    if (!pattern.test(sitemap)) throw new Error(`Product URL not found in sitemap: ${product.id}`);
    sitemap = sitemap.replace(pattern, `$1${today}`);
  }
  fs.writeFileSync(sitemapPath, sitemap);
}

const products = (readData().products || []).filter((product) => product && product.id && product.category);
products.forEach(syncPage);
updateProductLastModified(products);
console.log(`Synced commerce metadata for ${products.length} product pages.`);
