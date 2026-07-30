"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const EXCLUDED_DIRECTORIES = new Set([".git", "archive", "node_modules", "outputs", "qa-output"]);
const IGNORED_HTML_FILES = new Set(["google7983544080e9fb70.html"]);
const VIRTUAL_PATH_PREFIXES = ["/_vercel/", "/api/"];
const VERCEL_CONFIG_FILE = path.join(ROOT, "vercel.json");
let vercelConfig = null;
try {
  vercelConfig = JSON.parse(fs.readFileSync(VERCEL_CONFIG_FILE, "utf8"));
} catch {
  // Reported with a clearer message in validateVercelConfig().
}
const CONFIGURED_ROUTES = new Set(
  [...(vercelConfig?.redirects || []), ...(vercelConfig?.rewrites || [])]
    .map((rule) => String(rule.source || ""))
    .filter((source) => source && !source.includes("("))
);
const REQUIRED_SECURITY_HEADERS = new Map([
  ["strict-transport-security", "max-age="],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "deny"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=()"],
  ["cross-origin-opener-policy", "same-origin-allow-popups"],
]);

const errors = [];
const warnings = [];
const checkedResources = new Set();

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function addError(file, message) {
  errors.push(`${file}: ${message}`);
}

function stripQueryAndHash(value) {
  return String(value || "").split("#", 1)[0].split("?", 1)[0];
}

function isRemoteOrSpecial(value) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(value);
}

function resolveLocalReference(htmlFile, rawValue) {
  const value = stripQueryAndHash(rawValue);
  if (!value || value === "/" || isRemoteOrSpecial(value)) return null;
  if (VIRTUAL_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))) return null;
  if (CONFIGURED_ROUTES.has(value)) return null;
  if (value.includes("${") || value.includes("{{")) return null;
  return value.startsWith("/")
    ? path.join(ROOT, value.slice(1))
    : path.resolve(path.dirname(htmlFile), value);
}

function validateHtmlFile(filePath) {
  const file = relative(filePath);
  if (IGNORED_HTML_FILES.has(file)) return;
  const html = fs.readFileSync(filePath, "utf8");
  const isNoIndex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);

  if (!/<html\s+[^>]*lang=["'][^"']+["']/i.test(html)) addError(file, "missing html lang attribute");
  if (!/<meta\s+[^>]*charset=/i.test(html)) addError(file, "missing charset metadata");
  if (!/<meta\s+name=["']viewport["']/i.test(html)) addError(file, "missing viewport metadata");
  if (!/<title>[\s\S]*?<\/title>/i.test(html)) addError(file, "missing title");
  if (!isNoIndex && !/<meta\s+name=["']description["']/i.test(html)) addError(file, "missing meta description");

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) addError(file, `duplicate IDs: ${duplicateIds.join(", ")}`);

  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attributes = match[1];
    if (!/\balt\s*=/i.test(attributes)) addError(file, "image without alt attribute");
  }

  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      addError(file, `invalid JSON-LD (${error.message})`);
    }
  }

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const rawValue = match[1];
    const target = resolveLocalReference(filePath, rawValue);
    if (!target) continue;
    checkedResources.add(relative(target));
    if (!fs.existsSync(target)) addError(file, `missing local resource ${stripQueryAndHash(rawValue)}`);
  }
}

function validateCatalogImages() {
  const dataFile = path.join(ROOT, "assets", "js", "data.js");
  const context = { console, window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(dataFile, "utf8"), context, { filename: relative(dataFile) });

  const products = context.window.SHRISH_DATA?.products;
  if (!Array.isArray(products)) {
    addError(relative(dataFile), "window.SHRISH_DATA.products is unavailable");
    return 0;
  }

  const productIds = new Set();
  products.forEach((product) => {
    if (!product?.id) {
      addError(relative(dataFile), "product without an ID");
      return;
    }
    if (productIds.has(product.id)) addError(relative(dataFile), `duplicate product ID ${product.id}`);
    productIds.add(product.id);

    const imagePaths = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(Boolean);
    imagePaths.forEach((imagePath) => {
      if (/^(?:https?:|data:)/i.test(imagePath)) return;
      const target = path.join(ROOT, imagePath);
      if (!fs.existsSync(target)) addError(relative(dataFile), `${product.id} references missing image ${imagePath}`);
    });
  });

  return products.length;
}

function validateSitemap() {
  const sitemapFile = path.join(ROOT, "sitemap.xml");
  const sitemap = fs.readFileSync(sitemapFile, "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  locations.forEach((location) => {
    let pathname;
    try {
      pathname = new URL(location).pathname;
    } catch {
      addError("sitemap.xml", `invalid URL ${location}`);
      return;
    }
    let localPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (localPath.endsWith("/")) localPath += "index.html";
    const target = path.join(ROOT, localPath);
    if (!fs.existsSync(target)) addError("sitemap.xml", `${location} has no local page`);
  });

  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
  if (!/Sitemap:\s*https:\/\/www\.shrish\.co\/sitemap\.xml/i.test(robots)) {
    addError("robots.txt", "canonical sitemap declaration is missing");
  }
  return locations.length;
}

function validateVercelConfig() {
  if (!vercelConfig) {
    addError("vercel.json", "invalid JSON");
    return;
  }

  const globalHeaderRule = (vercelConfig.headers || []).find((rule) => rule.source === "/(.*)");
  const headers = new Map(
    (globalHeaderRule?.headers || []).map((header) => [
      String(header.key || "").toLowerCase(),
      String(header.value || "").toLowerCase(),
    ])
  );
  REQUIRED_SECURITY_HEADERS.forEach((expected, key) => {
    if (!headers.get(key)?.includes(expected)) addError("vercel.json", `missing or weak ${key} header`);
  });
}

const htmlFiles = walk(ROOT).filter((file) => file.endsWith(".html"));
htmlFiles.forEach(validateHtmlFile);
const productCount = validateCatalogImages();
const sitemapCount = validateSitemap();
validateVercelConfig();

if (warnings.length) {
  warnings.forEach((warning) => console.warn(`WARN ${warning}`));
}

if (errors.length) {
  console.error(`Site audit failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `Site audit passed: ${htmlFiles.length - IGNORED_HTML_FILES.size} HTML pages, ` +
    `${productCount} products, ${sitemapCount} sitemap URLs, ${checkedResources.size} local references.`
  );
}
