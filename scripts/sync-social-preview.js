"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const SOCIAL_IMAGE_URL = "https://www.shrish.co/images/site/share-putharekulu-gottam-kaja-2026.jpg";
const SOCIAL_IMAGE_ALT = "Putharekulu and Gottam Kaja Andhra sweets from Shrish";

const MANAGED_META_KEYS = [
  ["property", "og:image"],
  ["property", "og:image:secure_url"],
  ["property", "og:image:type"],
  ["property", "og:image:width"],
  ["property", "og:image:height"],
  ["property", "og:image:alt"],
  ["name", "twitter:card"],
  ["name", "twitter:image"],
  ["name", "twitter:image:alt"],
];

const SOCIAL_META_BLOCK = `  <!-- Shared social preview: Putharekulu and Gottam Kaja -->
  <meta property="og:image" content="${SOCIAL_IMAGE_URL}">
  <meta property="og:image:secure_url" content="${SOCIAL_IMAGE_URL}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${SOCIAL_IMAGE_ALT}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${SOCIAL_IMAGE_URL}">
  <meta name="twitter:image:alt" content="${SOCIAL_IMAGE_ALT}">`;

function sitemapFiles() {
  const sitemap = fs.readFileSync(SITEMAP_PATH, "utf8");
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    const pathname = new URL(match[1]).pathname;
    let localPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (localPath.endsWith("/")) localPath += "index.html";
    return path.join(ROOT, localPath);
  });
}

function removeManagedMeta(html) {
  let updated = html.replace(/\s*<!-- Shared social preview: Putharekulu and Gottam Kaja -->\s*/g, "\n");
  for (const [attribute, key] of MANAGED_META_KEYS) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\s*<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`, "gi");
    updated = updated.replace(pattern, "");
  }
  return updated;
}

function syncFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Sitemap page is missing: ${path.relative(ROOT, filePath)}`);
  const original = fs.readFileSync(filePath, "utf8");
  let html = removeManagedMeta(original);
  const canonical = /(<link\s+rel=["']canonical["'][^>]*>)/i;
  if (canonical.test(html)) {
    html = html.replace(canonical, `$1\n${SOCIAL_META_BLOCK}`);
  } else if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${SOCIAL_META_BLOCK}\n</head>`);
  } else {
    throw new Error(`Page has no </head>: ${path.relative(ROOT, filePath)}`);
  }
  if (html !== original) fs.writeFileSync(filePath, html);
}

function syncSocialPreviews() {
  const files = sitemapFiles();
  files.forEach(syncFile);
  console.log(`Synchronized the shared social preview across ${files.length} sitemap pages.`);
  return files.length;
}

if (require.main === module) syncSocialPreviews();

module.exports = { SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_URL, syncSocialPreviews };
