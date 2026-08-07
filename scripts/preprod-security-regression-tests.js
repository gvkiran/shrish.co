"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const guards = require("../functions/security-guards.js");
check(
  guards.authenticatedEmailIsVerified?.({ token: { email: "owner@example.com", email_verified: true } }) === true
    && guards.authenticatedEmailIsVerified?.({ token: { email: "owner@example.com", email_verified: false } }) === false,
  "Historical-order claiming must distinguish verified from unverified authenticated emails."
);
check(
  guards.contactSuppressionReason?.({}, { status: "active" }, { tags: [] }) === ""
    && guards.contactSuppressionReason?.({}, { status: "deletion_requested" }, { tags: [] }) === "deletion_requested"
    && guards.contactSuppressionReason?.({}, {}, { tags: ["Do not contact"] }) === "do_not_contact",
  "Recovery outreach must honor deletion requests and CRM do-not-contact tags."
);
check(
  guards.checkoutSessionMatchesOrder?.({ stripeCheckoutSessionId: "cs_current" }, { id: "cs_current" }) === true
    && guards.checkoutSessionMatchesOrder?.({ stripeCheckoutSessionId: "cs_current" }, { id: "cs_stale" }) === false,
  "Stripe webhooks must accept only the order's current Checkout Session."
);

const crmSafety = require("../crm/safety.js");
check(
  crmSafety.normalizeUsPhone("(804) 555-0100") === "8045550100"
    && crmSafety.normalizeUsPhone("1-804-555-0100") === "8045550100"
    && crmSafety.normalizeUsPhone("44 20 7946 0958") === "",
  "CRM phone actions must produce one valid ten-digit US number without duplicating country code 1."
);
check(
  crmSafety.csvCell("Normal customer") === '"Normal customer"'
    && crmSafety.csvCell("=HYPERLINK(\"https://attacker.example\")").startsWith('"\'='),
  "CRM CSV serialization must preserve normal text and neutralize spreadsheet formulas."
);
check(
  crmSafety.isCompletePostalAddress("123 Main St, Chesterfield, VA 23832") === true
    && crmSafety.isCompletePostalAddress("Chesterfield, VA, USA") === false,
  "Campaign HTML must require a complete postal address including street and ZIP code."
);
check(
  crmSafety.contactSuppressionReason({ tags: ["VIP"] }, { status: "active" }) === ""
    && crmSafety.contactSuppressionReason({ tags: ["Do not contact"] }, {}) === "do_not_contact"
    && crmSafety.contactSuppressionReason({}, { status: "deletion_requested" }) === "deletion_requested",
  "Campaign exports must exclude CRM and profile suppression states."
);

const functionsSource = read("functions/index.js");
check(
  functionsSource.split("authenticatedEmailIsVerified(request.auth)").length - 1 >= 2
    && functionsSource.includes('.where("phoneDigits", "==", phone).limit(500)'),
  "Both order-claim paths must require verified email, and bulk claiming must cap Firestore reads."
);
check(
  functionsSource.includes("expireOpenCheckoutSession(stripe, priorSessionId)")
    && functionsSource.includes("checkoutSessionMatchesOrder(order, session)"),
  "Payment recovery must expire the prior session and webhooks must reject stale sessions."
);
check(
  functionsSource.includes("contactSuppressionReason(order, profile, overlay)"),
  "Payment recovery must enforce server-side contact suppression."
);
check(
  functionsSource.includes('idempotencyKey: `shipment-${event.id}`')
    && functionsSource.includes('idempotencyKey: `payment-retry-${orderId}`')
    && functionsSource.includes('idempotencyKey: `order-confirmation-customer-${orderRef.id}`')
    && functionsSource.includes('idempotencyKey: `order-confirmation-admin-${orderRef.id}`'),
  "Transactional email retries must use stable provider idempotency keys."
);

const accountSource = read("assets/js/account-firebase.js");
const firebaseAppSource = read("assets/js/firebase-app.js");
check(
  firebaseAppSource.includes("sendEmailVerification")
    && accountSource.includes("ensureVerificationEmail")
    && accountSource.includes("if (!user.emailVerified)"),
  "Customer accounts must receive verification email and avoid order claiming until verified."
);

const crmSource = read("crm/app.js");
check(
  crmSource.includes("csvCell")
    && !crmSource.includes('const cell = (v) => `"${String(v ?? \'\').replace(/"/g, \'""\')}"`'),
  "All CRM exports must use the shared formula-safe CSV serializer."
);
check(
  crmSource.includes("contactSuppressionReason(overlay, profile)")
    && crmSource.includes("normalizeUsPhone(order.phoneDigits || order.phone)"),
  "CRM campaigns/recovery UI must apply suppression and normalized phone actions."
);

const boothSource = read("crm/booth.js");
check(
  boothSource.includes("status: paid ? 'fulfilled' : 'pending'"),
  "Unpaid booth orders must not be marked fulfilled."
);

const adminSource = read("assets/js/admin-firebase.js");
check(
  adminSource.includes("applyOrderStatus(entry.id, 'fulfilled', true, {")
    && !adminSource.includes("await applyOrderStatus(entry.id, 'fulfilled', true);\n      const hasTracking"),
  "Shipping status and tracking fields must be written to the order atomically."
);

const crmHtml = read("crm/index.html");
check(
  crmHtml.includes('id="crmCampPostalAddress"')
    && crmHtml.includes('/assets/vendor/chart.umd-4.4.1.js')
    && !crmHtml.includes("cdnjs.cloudflare.com/ajax/libs/Chart.js"),
  "CRM must require a campaign postal address and self-host Chart.js."
);

if (failures.length) {
  console.error(`Pre-production regression checks failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Pre-production security and CRM regression checks passed.");
