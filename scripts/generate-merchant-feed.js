/**
 * Google Merchant Center feed generator for Shrish.
 * Reads assets/js/data.js and writes merchant-feed.xml (RSS 2.0 + g: namespace).
 * Includes non-mango products that the checkout can ship, while honoring
 * explicit pickup-only catalog flags. Products without a real local image are
 * skipped so the generated source never sends an invalid image-less listing.
 * Run: node scripts/generate-merchant-feed.js
 * Regenerate after adding catalog photos so newly complete products are added.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://www.shrish.co';

const GOOGLE_CATEGORY = {
  picklespodi: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces',
  putharekulu: 'Food, Beverages & Tobacco > Food Items > Bakery > Bakery Assortments',
  sweets: 'Food, Beverages & Tobacco > Food Items > Candy & Chocolate',
  jellysnacks: 'Food, Beverages & Tobacco > Food Items > Candy & Chocolate',
  snacks: 'Food, Beverages & Tobacco > Food Items > Snack Foods',
  mangoes: 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Frozen Fruits'
};

function readData() {
  const code = fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8') + '\n;globalThis.__SHRISH_DATA = SHRISH_DATA;';
  const context = { console };
  context.window = context;
  vm.runInNewContext(code, context, { filename: 'assets/js/data.js' });
  return context.__SHRISH_DATA;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtml(v) {
  return String(v ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function parsePrice(v) {
  const n = Number(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} USD` : null;
}

function normalizeCategory(c) {
  return c === 'Mango Jelly' ? 'jellysnacks' : c;
}

function isShippingEligible(product) {
  if (!product || !product.id || !product.category || product.displayOnly) return false;
  const category = normalizeCategory(product.category);
  if (category === 'mangoes') return false;
  if (String(product.shippingNote || '').trim().toLowerCase() === 'pickup only') return false;
  if (category === 'picklespodi') return product.shippingNote === 'Shipping eligible';
  return ['putharekulu', 'jellysnacks', 'sweets', 'snacks'].includes(category);
}

function buildItems(products) {
  const items = [];
  const skippedWithoutImage = [];
  for (const product of products) {
    const category = normalizeCategory(product.category);
    const pageUrl = `${SITE_URL}/shop/products/${category}/${product.id}/`;
    const candidates = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])]
      .map((entry) => String(entry || '').replace(/\\/g, '/').trim())
      .filter((entry) => entry && !entry.includes('logo'));
    const image = candidates.find((entry) => fs.existsSync(path.join(ROOT, entry)));
    const imageUrl = image ? `${SITE_URL}/${image}` : null;
    if (!imageUrl) {
      skippedWithoutImage.push(product.id);
      continue;
    }
    const description = stripHtml(product.description) || product.name;
    const availability = product.available && !product.displayOnly ? 'in_stock' : 'out_of_stock';
    const variants = Array.isArray(product.variants) ? product.variants.filter((v) => v.label && (v.sku || v.id)) : [];
    const entries = variants.length ? variants : [null];
    for (const variant of entries) {
      const price = parsePrice(variant ? (variant.price || product.price) : product.price);
      if (!price) continue;
      items.push({
        id: variant ? (variant.sku || variant.id) : product.id,
        item_group_id: variants.length ? product.id : null,
        size: variant ? variant.label : null,
        title: variant ? `${product.name} — ${variant.label}` : product.name,
        description,
        link: pageUrl,
        image_link: imageUrl,
        availability,
        price,
        google_product_category: GOOGLE_CATEGORY[category] || 'Food, Beverages & Tobacco > Food Items',
        brand: 'Shrish'
      });
    }
  }
  return { items, skippedWithoutImage };
}

function itemXml(item) {
  const fields = [
    ['g:id', item.id],
    item.item_group_id ? ['g:item_group_id', item.item_group_id] : null,
    item.size ? ['g:size', item.size] : null,
    ['g:title', item.title],
    ['g:description', item.description],
    ['g:link', item.link],
    item.image_link ? ['g:image_link', item.image_link] : null,
    ['g:availability', item.availability],
    ['g:price', item.price],
    ['g:google_product_category', item.google_product_category],
    ['g:brand', item.brand],
    ['g:condition', 'new'],
    ['g:identifier_exists', 'no']
  ].filter(Boolean);
  return `    <item>\n${fields.map(([k, v]) => `      <${k}>${esc(v)}</${k}>`).join('\n')}\n    </item>`;
}

function main() {
  const data = readData();
  const shippable = (data.products || []).filter(isShippingEligible);
  const { items, skippedWithoutImage } = buildItems(shippable);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Shrish Pickles, Podi &amp; Sweets</title>
    <link>${SITE_URL}</link>
    <description>Handcrafted Andhra-style pickles, podi and sweets made in Richmond, VA. Ships within the USA.</description>
${items.map(itemXml).join('\n')}
  </channel>
</rss>
`;
  fs.writeFileSync(path.join(ROOT, 'merchant-feed.xml'), xml);
  console.log(`merchant-feed.xml: ${items.length} complete items from ${shippable.length} shipping-eligible products.`);
  if (skippedWithoutImage.length) {
    console.warn(`Skipped ${skippedWithoutImage.length} shipping-eligible products without a real local image: ${skippedWithoutImage.join(', ')}`);
  }
}

main();
