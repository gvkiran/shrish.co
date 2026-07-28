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
  'assets/js/main.js'
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
  '(Meta, checkout, Firestore privacy, admin XSS, accessibility, encoding, product images).'
);
