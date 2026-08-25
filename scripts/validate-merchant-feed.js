'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const xml = fs.readFileSync(path.join(ROOT, 'merchant-feed.xml'), 'utf8');
const failures = [];
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
const value = (item, tag) => (item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || '';
const ids = new Set();

if (!items.length) failures.push('Merchant feed contains no items.');

for (const item of items) {
  const id = value(item, 'g:id');
  const required = ['g:id', 'g:title', 'g:description', 'g:link', 'g:image_link', 'g:availability', 'g:price'];
  for (const tag of required) {
    if (!value(item, tag).trim()) failures.push(`${id || 'Unknown item'} is missing ${tag}.`);
  }
  if (ids.has(id)) failures.push(`Duplicate Merchant item ID: ${id}`);
  ids.add(id);
  if (value(item, 'g:item_group_id') && !value(item, 'g:size')) failures.push(`${id} has an item group but no g:size variant attribute.`);

  const price = value(item, 'g:price');
  if (!/^\d+\.\d{2} USD$/.test(price)) failures.push(`${id} has invalid price: ${price}`);
  const availability = value(item, 'g:availability');
  if (!['in_stock', 'out_of_stock'].includes(availability)) failures.push(`${id} has invalid availability: ${availability}`);

  for (const tag of ['g:link', 'g:image_link']) {
    const absolute = value(item, tag).replace(/&amp;/g, '&');
    if (!absolute.startsWith('https://www.shrish.co/')) failures.push(`${id} has a non-canonical ${tag}: ${absolute}`);
    const relative = decodeURIComponent(absolute.replace('https://www.shrish.co/', '')).split(/[?#]/)[0];
    if (!relative || !fs.existsSync(path.join(ROOT, relative))) failures.push(`${id} ${tag} does not resolve locally: ${absolute}`);
  }
}

for (const expected of [
  'SW-KAJJIK-250',
  'SW-KAJJIK-500',
  'podi-drumstick-leaf-100g',
  'podi-drumstick-leaf-200g',
  'podi-sambar-100g',
  'podi-sambar-200g'
]) {
  if (!ids.has(expected)) failures.push(`Expected complete product is absent from the feed: ${expected}`);
}

if (failures.length) {
  console.error(`Merchant feed validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Merchant feed validation passed: ${items.length} complete, uniquely identified items.`);
