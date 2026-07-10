/**
 * Google Merchant Center feed generator for Shrish.
 * Reads assets/js/data.js and writes merchant-feed.xml (RSS 2.0 + g: namespace).
 * Only products with shippingNote === 'Shipping eligible' are included.
 * Run: node scripts/generate-merchant-feed.js
 * NOTE: Items will be disapproved by Google until real product photos replace
 * the logo fallback in data.js (image field). Regenerate after adding photos.
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

function buildItems(products) {
  const items = [];
  for (const product of products) {
    const category = normalizeCategory(product.category);
    const pageUrl = `${SITE_URL}/shop/products/${category}/${product.id}/`;
    const candidates = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])]
      .map((entry) => String(entry || '').replace(/\\/g, '/').trim())
      .filter((entry) => entry && !entry.includes('logo'));
    const image = candidates.find((entry) => fs.existsSync(path.join(ROOT, entry)));
    const imageUrl = image ? `${SITE_URL}/${image}` : null;
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
  return items;
}

function itemXml(item) {
  const fields = [
    ['g:id', item.id],
    item.item_group_id ? ['g:item_group_id', item.item_group_id] : null,
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
  const shippable = (data.products || []).filter((p) =>
    p && p.id && p.category && p.shippingNote === 'Shipping eligible' && !p.displayOnly);
  const items = buildItems(shippable);
  const missingImages = items.filter((i) => !i.image_link).length;
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
  console.log(`merchant-feed.xml: ${items.length} items from ${shippable.length} shippable products.`);
  if (missingImages) {
    console.warn(`WARNING: ${missingImages} items have no real product image yet (logo fallback skipped). Google will disapprove items without image_link — add photos to data.js and regenerate before uploading.`);
  }
}

main();
