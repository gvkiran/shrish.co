'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function shouldSendMetaPurchase(before, after) {
  const wasPaid = String(before.paymentStatus || before.payment || '').toLowerCase() === 'paid';
  const isPaid = String(after.paymentStatus || after.payment || '').toLowerCase() === 'paid';
  return Boolean(isPaid && !wasPaid && after.metaPurchaseStatus !== 'sent');
}

check(
  shouldSendMetaPurchase({ paymentStatus: 'awaiting_payment' }, { paymentStatus: 'paid' }),
  'Meta Purchase should send on the first transition to paid.'
);
check(
  !shouldSendMetaPurchase({ paymentStatus: 'paid' }, { paymentStatus: 'paid', metaPurchaseStatus: 'failed' }),
  'Meta Purchase must not recursively resend after its own failure-status write.'
);
check(
  !shouldSendMetaPurchase({ paymentStatus: 'paid' }, { paymentStatus: 'paid', metaPurchaseStatus: 'sent' }),
  'Meta Purchase must not resend after success.'
);

const metaSource = read('functions/meta-index.js');
check(metaSource.includes('const wasPaid ='), 'Meta trigger must inspect the previous order state.');
check(
  metaSource.includes('!isPaid || wasPaid || order.metaPurchaseStatus === "sent"'),
  'Meta trigger must require a transition to paid.'
);

const checkoutSource = read('assets/js/checkout-luxe.js');
check(
  checkoutSource.indexOf('var paymentPolicy = cartPaymentPolicy(cart.items);') <
    checkoutSource.indexOf('if (sig === lastSig) return;'),
  'Checkout payment policy must be calculated before the signature early return.'
);
check(
  checkoutSource.includes('paymentPolicy.requiresStripe ? 1 : 0') &&
    checkoutSource.includes('paymentPolicy.isMixed ? 1 : 0') &&
    checkoutSource.includes('onlineOnly ? 1 : 0'),
  'Checkout signature must change when the payment policy changes.'
);
check(
  checkoutSource.includes("stripeOption.classList.contains('selected')") &&
    checkoutSource.includes('!stripeOption.hidden'),
  'Checkout summary must follow the visible selected Stripe option.'
);
check(
  checkoutSource.includes("attributeFilter: ['class', 'hidden']"),
  'Checkout summary must react immediately when asynchronous payment-option state changes.'
);

const homeSource = read('assets/js/home-firebase.js');
const shopSource = read('assets/js/shop-firebase.js');
const catalogSource = read('assets/js/data.js');
const indexSource = read('index.html');
const verifiedProductImageIdsSource = catalogSource.slice(
  catalogSource.indexOf('const SHRISH_VERIFIED_PRODUCT_IMAGE_IDS'),
  catalogSource.indexOf('const SHRISH_VERIFIED_PRODUCT_IMAGE_OVERRIDES')
);
const catalogFieldOverridesSource = catalogSource.slice(
  catalogSource.indexOf('const SHRISH_CATALOG_FIELD_OVERRIDES'),
  catalogSource.indexOf('const SHRISH_VERIFIED_PRODUCT_IMAGE_IDS')
);
const forcedCatalogOverridesSource = shopSource.slice(
  shopSource.indexOf('const FORCE_CATALOG_FIELD_OVERRIDE_IDS'),
  shopSource.indexOf('const SWEET_CATALOG_OVERRIDE_CATEGORIES')
);
const approximateCountProductIds = [
  'sweets-flaxseed-laddu',
  'sweets-kajji-kayalu',
  'sweets-madatha-kaja',
  'sweets-ragi-laddu',
  'sweets-rava-laddu',
  'sweets-sunnundalu',
  'sweets-tokkudu-laddu'
];
check(
  shopSource.includes("let activeFilter = 'sweets';") &&
    shopSource.includes("window.location.pathname.endsWith('/shop.html')") &&
    shopSource.includes("params.get('search') || params.get('q')"),
  'The bare shop page must start with Sweets while product searches continue across all categories.'
);
check(
  shopSource.includes("puth_plain_sugar: ['images/products/putharekulu/putharekulu-plain-sugar-2026-1.jpg']") &&
    verifiedProductImageIdsSource.includes('"puth_plain_sugar"'),
  'Classic Plain Sugar Putharekulu must use its verified product image in the live shop.'
);
check(
  indexSource.includes('id="heroImg" src="images/products/sweets/kajji-kayalu-2026.webp"') &&
    indexSource.includes("word: 'KAJJI'") &&
    indexSource.includes('product=sweets-kajji-kayalu'),
  'The homepage must start with the Kajji Kayalu feature and link to its product.'
);
check(
  catalogFieldOverridesSource.includes('tag: product.tag') &&
    catalogFieldOverridesSource.includes('badges: [...(product.badges || [])]') &&
    catalogFieldOverridesSource.includes('recommendationTags: [...(product.recommendationTags || [])]'),
  'Putharekulu catalog overrides must preserve their source-controlled tags and badges.'
);
check(
  shopSource.includes("puth_plain: 'puth_plain_sugar'") &&
    shopSource.includes('PRODUCT_CATALOG_OVERRIDE_ALIASES[product.id] || product.id'),
  'The legacy plain-sugar Putharekulu record must inherit current tags and catalog fields.'
);
approximateCountProductIds.forEach((productId) => {
  const productStart = catalogSource.indexOf(`id: "${productId}"`);
  const productEnd = catalogSource.indexOf('\n    {', productStart + 1);
  const productSource = catalogSource.slice(productStart, productEnd === -1 ? undefined : productEnd);
  check(
    productStart !== -1 &&
      productSource.includes('unit: "250g (~5 count) or 500g (~10 count)"') &&
      productSource.includes('label: "250g (~5 count)"') &&
      productSource.includes('label: "500g (~10 count)"') &&
      forcedCatalogOverridesSource.includes(`'${productId}'`),
    `${productId} must display and enforce approximate counts for both weight options.`
  );
});
check(
  homeSource.includes("doc(collection(db, 'email_subscribers'))") &&
    !homeSource.includes("doc(db, 'email_subscribers', email)"),
  'General subscriber records must use random Firestore IDs.'
);
check(
  shopSource.includes("doc(collection(db, 'notify_requests'))") &&
    !shopSource.includes("email.replace(/[^a-z0-9@._-]/gi"),
  'Product notification records must use random Firestore IDs.'
);

const rulesSource = read('firestore.rules');
check(
  rulesSource.includes("allow get, list: if isAdmin();") &&
    rulesSource.includes("allow create: if emailId.matches('^[A-Za-z0-9]{20}$');"),
  'Subscriber reads must be admin-only and creates must use random IDs.'
);
check(
  rulesSource.includes("allow create: if orderId.matches('^[A-Za-z0-9]{20}$')"),
  'Anonymous order creates must use Firebase auto IDs.'
);
check(
  rulesSource.includes("allow create: if docId.matches('^[A-Za-z0-9]{20}$')") &&
    rulesSource.includes("request.resource.data.status == 'pending'"),
  'Anonymous refund creates must use Firebase auto IDs with pending status.'
);
check(
  rulesSource.includes("request.resource.data.websiteFinalizationState == 'unverified'") &&
    rulesSource.includes("request.resource.data.orderNumber == ''") &&
    rulesSource.includes("allow update, delete: if isAdmin();"),
  'Public order creation must be unverified and all later mutation must remain server/admin-only.'
);
check(
  rulesSource.includes('request.resource.data.keys().hasOnly(['),
  'Public order creates must reject unrecognized server-managed fields.'
);
['promo_codes', 'promo_redemptions', 'order_locks', '_security_rate_limits'].forEach((collectionName) => {
  const match = rulesSource.match(
    new RegExp(`match /${collectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]+\\{([\\s\\S]*?)\\n\\s*\\}`)
  );
  check(
    Boolean(match) && match[1].includes('if isAdmin()'),
    `${collectionName} must not expose customer or rate-limit metadata publicly.`
  );
});

const {
  rateLimitDocumentId,
  validateWebsiteOrder
} = require('../functions/security-guards.js');
const legitimatePickupOrder = {
  orderNumber: '',
  firstName: 'Kiran',
  lastName: '',
  email: 'customer@example.com',
  phoneDigits: '8045550100',
  source: 'website',
  websiteFinalizationState: 'unverified',
  fulfillmentType: 'pickup',
  pickupLocation: 'shortpump',
  paymentMethod: 'pay_at_pickup',
  status: 'pending',
  items: [{ productId: 'mango-pickle', qty: 2 }]
};
check(
  validateWebsiteOrder(legitimatePickupOrder).totalQuantity === 2,
  'Legitimate guest pickup orders, including an optional last name, must remain valid.'
);
check(
  validateWebsiteOrder({
    ...legitimatePickupOrder,
    customerUid: 'customer-1'
  }, 'customer-1').totalQuantity === 2,
  'Legitimate signed-in pickup orders must remain valid.'
);
check(
  validateWebsiteOrder({
    ...legitimatePickupOrder,
    fulfillmentType: 'shipping',
    paymentMethod: 'stripe',
    status: 'awaiting_payment',
    shippingAddress: {
      addressLine1: '123 Main Street',
      city: 'Richmond',
      state: 'VA',
      zip: '23220'
    }
  }).fulfillmentType === 'shipping',
  'Legitimate guest shipping orders must remain valid.'
);
[
  { ...legitimatePickupOrder, source: 'admin_manual' },
  { ...legitimatePickupOrder, customerUid: 'other-customer' },
  { ...legitimatePickupOrder, orderNumber: 'SHR-999999' },
  { ...legitimatePickupOrder, stripeCheckoutSessionId: 'cs_test_attacker' },
  { ...legitimatePickupOrder, items: Array.from({ length: 41 }, (_, index) => ({ productId: `p-${index}`, qty: 1 })) },
  { ...legitimatePickupOrder, items: [{ productId: 'mango-pickle', qty: 51 }] }
].forEach((candidate, index) => {
  let rejected = false;
  try {
    validateWebsiteOrder(candidate);
  } catch (error) {
    rejected = true;
  }
  check(rejected, `Malicious website-order variant ${index + 1} must be rejected.`);
});
const firstRateBucket = rateLimitDocumentId('checkout', 'ip:127.0.0.1', 60_000, 120_000);
check(
  firstRateBucket.id === rateLimitDocumentId('checkout', 'ip:127.0.0.1', 60_000, 120_001).id,
  'Rate-limit bucket IDs must be deterministic inside one window.'
);
check(
  firstRateBucket.id !== rateLimitDocumentId('checkout', 'ip:127.0.0.2', 60_000, 120_000).id &&
    firstRateBucket.id !== rateLimitDocumentId('checkout', 'ip:127.0.0.1', 60_000, 180_000).id,
  'Rate-limit buckets must separate callers and windows.'
);

const functionsSource = read('functions/index.js');
const orderSource = read('assets/js/order-firebase.js');
check(
  functionsSource.includes('exports.finalizeWebsiteOrder = onCall(') &&
    functionsSource.includes('order.websiteFinalizationState !== "complete" || !order.websiteValidatedAt'),
  'Stripe checkout must require a server-finalized website order.'
);
const publicPromoCallableSource = functionsSource.slice(
  functionsSource.indexOf('exports.validatePromoCode = onCall('),
  functionsSource.indexOf('// Atomically record one redemption per order')
);
check(
  !publicPromoCallableSource.includes('promo_redemptions') &&
    !publicPromoCallableSource.includes('phoneDigits'),
  'Public promo validation must not expose phone-based redemption history.'
);
check(
  functionsSource.includes('idempotencyKey: `shrish_checkout_${orderId}`') &&
    functionsSource.includes('scope: "stripe-checkout-order"'),
  'Stripe session creation must be idempotent and rate-limited per order.'
);
check(
  functionsSource.includes('if (order?.source === "website"') &&
    functionsSource.includes('exports.sendFinalizedWebsiteOrderEmails = onDocumentUpdated(') &&
    functionsSource.includes('after.websiteFinalizationState !== "complete"'),
  'Raw website document creates must not email until a server-finalization transition succeeds.'
);
check(
  orderSource.includes("websiteFinalizationState: 'unverified'") &&
    orderSource.includes('await finalizeWebsiteOrder({ orderId: orderRef.id })') &&
    !orderSource.includes("collection(db, 'order_locks'") &&
    !orderSource.includes("collection(db, 'promo_codes'"),
  'Checkout must use the callable security boundary instead of public metadata reads.'
);

const geetHandler = require('../api/geet-chat.js');
const geetCatalog = geetHandler._test.loadCatalog();
check(
  Array.isArray(geetCatalog.products) && geetCatalog.products.length > 0,
  'Geet must load the real catalog from assets/js/data.js.'
);
geetHandler._test.resetRateLimits();
const geetRequest = {
  headers: {
    host: 'shrish.co',
    origin: 'https://shrish.co',
    'x-forwarded-for': '203.0.113.10'
  }
};
let geetAllowed = true;
for (let index = 0; index < 11; index += 1) {
  geetAllowed = geetHandler._test.consumeRateLimit(geetRequest, 120_000).allowed;
}
check(!geetAllowed, 'Geet must reject requests above the per-instance abuse limit.');
check(
  geetHandler._test.requestOriginIsAllowed(geetRequest) &&
    !geetHandler._test.requestOriginIsAllowed({
      headers: { host: 'shrish.co', origin: 'https://attacker.example' }
    }),
  'Geet must allow same-origin requests and reject cross-origin requests.'
);

const recipeSource = read('assets/js/luxe-recipes.js');
check(
  recipeSource.includes('id="rxTimerBtn" aria-label="Recipe timer"'),
  'Recipe timer control must have an accessible name before it becomes visible.'
);

const adminSource = read('assets/js/admin-firebase.js');
const helperMatch = adminSource.match(/function inlineJsArg\(value\) \{[\s\S]*?\n\}/);
check(Boolean(helperMatch), 'Admin dashboard must define inlineJsArg.');
if (helperMatch) {
  const sandbox = {
    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };
  vm.runInNewContext(`${helperMatch[0]}; this.inlineJsArg = inlineJsArg;`, sandbox);
  const payload = "x');globalThis.__shrishPwned=true;//";
  const encoded = sandbox.inlineJsArg(payload);
  const decoded = encoded
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
  let captured = '';
  globalThis.__shrishPwned = false;
  Function('setStatus', `setStatus(${decoded}, 'pending');`)((value) => { captured = value; });
  check(captured === payload, 'Admin inline action must preserve the complete document ID as data.');
  check(globalThis.__shrishPwned === false, 'Admin inline action payload must remain inert.');
  delete globalThis.__shrishPwned;
}
check(
  adminSource.includes('const status = safeOrderStatus(order.status);') &&
    adminSource.includes('const status = safeRefundStatus(r.status);'),
  'Admin order and refund status values must be allow-listed before HTML rendering.'
);

const userFacingScripts = [
  'assets/js/admin-firebase.js',
  'assets/js/firebase-app.js',
  'assets/js/main.js',
  'assets/js/order-firebase.js',
  'functions/index.js'
];
const mojibakePattern = /(?:â€|âœ|â|Ã.|Â.|ð.)/;
userFacingScripts.forEach((relativePath) => {
  check(
    !mojibakePattern.test(read(relativePath)),
    `${relativePath} must not contain common UTF-8 mojibake sequences.`
  );
});

const productImageRoot = path.join(root, 'images', 'products');
const oversizedProductImages = [];
function collectOversizedProductImages(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectOversizedProductImages(fullPath);
      return;
    }
    if (entry.isFile() && fs.statSync(fullPath).size > 1024 * 1024) {
      oversizedProductImages.push(path.relative(root, fullPath).replaceAll('\\', '/'));
    }
  });
}
collectOversizedProductImages(productImageRoot);
check(
  oversizedProductImages.length === 0,
  `Product images must stay below 1 MiB: ${oversizedProductImages.join(', ')}`
);

if (failures.length) {
  console.error(`Audit regression checks failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  'Audit regression checks passed ' +
  '(Meta, checkout finalization, Firestore privacy, Geet abuse controls, admin XSS, accessibility, encoding, product images).'
);
