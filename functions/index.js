const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { Resend } = require("resend");
const { PostHog } = require("posthog-node");
const Stripe = require("stripe");
const {
  SecurityGuardError,
  hashIdentifier,
  rateLimitDocumentId,
  requestRateLimitSubject,
  validateWebsiteOrder,
} = require("./security-guards");

initializeApp();

// Keep the existing call sites concise while using Firebase Admin's supported
// modular entry points (legacy namespace imports were removed in Admin v14).
const admin = {
  auth: getAuth,
  firestore: Object.assign(getFirestore, { FieldValue, Timestamp }),
};

const posthog = new PostHog(process.env.POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
  enableExceptionAutocapture: true,
});

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const POSTHOG_PERSONAL_API_KEY = defineSecret("POSTHOG_PERSONAL_API_KEY");

const SHRISH_FROM_EMAIL = "Shrish Orders <contact@shrish.co>";
const SHRISH_ADMIN_EMAIL = "contact@shrish.co";
const SHRISH_SUPPORT_PHONE = "+1 (765) 325-5577";
const SHRISH_INSTAGRAM_URL = "https://www.instagram.com/shrish_llc/";
const SHRISH_WHATSAPP_URL = "https://wa.me/17653255577";
const SHRISH_LOGO_URL = "https://gvkiran.github.io/shrish.co/images/brand/logo-small.png";
const SHRISH_REVIEW_URL = "https://g.page/r/CS0iwi3C14P8EAE/review";
const SHRISH_REVIEW_QR_URL = "https://gvkiran.github.io/shrish.co/images/brand/google-review-qr.png";
const SHRISH_SITE_URL = "https://shrish.co";
const ORDER_COUNTER_START = 671499;
const MAX_REMINDER_EMAILS_PER_SEND = 50;
const MAX_PRODUCT_NOTIFY_EMAILS_PER_SEND = 250;
const STRIPE_PAYMENTS_ENABLED = process.env.STRIPE_PAYMENTS_ENABLED === "true";
const DEFAULT_VIRGINIA_SALES_TAX_RATE = 0.01;
const DEFAULT_STANDARD_SHIPPING_AMOUNT = 8.99;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 75;
const WEBSITE_ORDER_RATE_LIMIT = 8;
const WEBSITE_ORDER_RATE_WINDOW_MS = 60 * 60 * 1000;
const STRIPE_SESSION_RATE_LIMIT = 10;
const STRIPE_SESSION_RATE_WINDOW_MS = 10 * 60 * 1000;
const PROMO_CHECK_RATE_LIMIT = 30;
const PROMO_CHECK_RATE_WINDOW_MS = 10 * 60 * 1000;

function isAdminRequest(request) {
  return String(request.auth?.token?.email || "").trim().toLowerCase() === SHRISH_ADMIN_EMAIL;
}

function normalizedSecret(secret) {
  return String(secret.value() || "").trim().replace(/[\r\n]+/g, "");
}

function callableOptions(options = {}) {
  return {
    region: "us-central1",
    enforceAppCheck: process.env.SHRISH_ENFORCE_APP_CHECK === "true",
    ...options,
  };
}

function asHttpsError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof SecurityGuardError) {
    return new HttpsError(error.code || "invalid-argument", error.message);
  }
  return new HttpsError("internal", "The request could not be completed.");
}

async function enforceCallableRateLimit(db, request, options = {}) {
  const scope = String(options.scope || "callable").trim();
  const limit = Math.max(1, Number(options.limit) || 1);
  const windowMs = Math.max(1_000, Number(options.windowMs) || 60_000);
  const subject = String(options.subject || requestRateLimitSubject(request));
  const bucket = rateLimitDocumentId(scope, subject, windowMs);
  const ref = db.collection("_security_rate_limits").doc(bucket.id);

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const count = Number(snapshot.data()?.count || 0);
    if (count >= limit) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests. Please wait a few minutes and try again."
      );
    }
    tx.set(ref, {
      scope,
      subjectHash: hashIdentifier(subject),
      count: count + 1,
      windowStart: admin.firestore.Timestamp.fromMillis(bucket.windowStart),
      expiresAt: admin.firestore.Timestamp.fromMillis(bucket.windowEnd + 24 * 60 * 60 * 1000),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function stripeClient() {
  return new Stripe(normalizedSecret(STRIPE_SECRET_KEY));
}

function normalizedPostHogApiHost(value = "") {
  const fallback = "https://us.posthog.com";
  const raw = String(value || fallback).trim().replace(/\/+$/, "");
  if (!raw) return fallback;
  return raw.replace("://us.i.posthog.com", "://us.posthog.com");
}

function postHogProjectId() {
  return String(process.env.POSTHOG_PROJECT_ID || "409686").trim();
}

function postHogPersonalApiKey() {
  try {
    return normalizedSecret(POSTHOG_PERSONAL_API_KEY);
  } catch {
    return "";
  }
}

async function runPostHogHogql(query, name) {
  const apiKey = postHogPersonalApiKey();
  const projectId = postHogProjectId();
  const host = normalizedPostHogApiHost(process.env.POSTHOG_HOST);

  if (!apiKey || !projectId) {
    return { connected: false, rows: [], missing: !apiKey ? ["POSTHOG_PERSONAL_API_KEY"] : ["POSTHOG_PROJECT_ID"] };
  }

  const response = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
      },
      name,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(`PostHog query failed: ${detail}`);
  }

  return { connected: true, rows: Array.isArray(payload.results) ? payload.results : [] };
}

function rowsToObjects(rows, columns) {
  return rows.map((row) => columns.reduce((acc, column, index) => {
    acc[column] = row[index];
    return acc;
  }, {}));
}

function allowedCheckoutOrigin(value = "") {
  const fallback = SHRISH_SITE_URL;
  try {
    const url = new URL(String(value || fallback));
    const hostname = url.hostname.toLowerCase();
    const isAllowed =
      hostname === "shrish.co" ||
      hostname === "www.shrish.co" ||
      hostname === "dev.shrish.co" ||
      hostname.endsWith(".vercel.app") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";

    return isAllowed ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

function toStripeAmount(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function currency(value) {
  const num = Number(value || 0);
  return `$${num.toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseMoney(value) {
  const num = parseFloat(String(value ?? "0").replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
}

function normalizeQty(item) {
  const raw = Number(item?.qty ?? item?.quantity ?? item?.boxes ?? 0);
  if (raw > 0) return raw;

  // Defensive fallback: ordered items should never show 0 in the email.
  // If qty is missing/bad but the item exists, show 1 instead of 0.
  return 1;
}

function normalizeLineTotal(item) {
  const explicitLineTotal = Number(item?.lineTotal ?? 0);
  if (explicitLineTotal > 0) return explicitLineTotal;

  const qty = normalizeQty(item);
  const unitPrice = parseMoney(item?.price ?? item?.unitPrice ?? item?.itemPrice ?? 0);
  return unitPrice * qty;
}

function buildItemsRows(items = []) {
  return items
    .map((item) => {
      const name = escapeHtml(item?.name || "Item");
      const qty = normalizeQty(item);
      const lineTotal = normalizeLineTotal(item);

      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e7dfd3; font-size: 14px; color: #2b2218;">
            ${name}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e7dfd3; font-size: 14px; color: #2b2218; text-align: center;">
            ${qty}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e7dfd3; font-size: 14px; color: #2b2218; text-align: right;">
            ${currency(lineTotal)}
          </td>
        </tr>
      `;
    })
    .join("");
}

function getOrderTotals(order) {
  const items = Array.isArray(order?.items) ? order.items : [];

  const totalBoxesFromOrder = Number(order?.totalBoxes ?? 0);
  const totalPriceFromOrder = Number(order?.totalPrice ?? 0);

  const totalBoxesFromItems = items.reduce((sum, item) => sum + normalizeQty(item), 0);
  const totalPriceFromItems = items.reduce((sum, item) => sum + normalizeLineTotal(item), 0);

  return {
    totalBoxes: totalBoxesFromOrder > 0 ? totalBoxesFromOrder : totalBoxesFromItems,
    estimatedTotal: totalPriceFromOrder > 0 ? totalPriceFromOrder : totalPriceFromItems,
  };
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function configuredVirginiaSalesTaxRate() {
  const configured = Number(process.env.SHRISH_VA_SALES_TAX_RATE);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_VIRGINIA_SALES_TAX_RATE;
}

function normalizeProductCategory(value = "") {
  return String(value || "").trim().toLowerCase();
}

async function classifyOrderPaymentItems(db, order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = [...new Set(items.map(customerOrderProductId).filter(Boolean))];
  const categoryByProductId = new Map();

  await Promise.all(productIds.map(async (productId) => {
    const snap = await db.collection("products").doc(productId).get().catch(() => null);
    if (snap?.exists) {
      categoryByProductId.set(productId, normalizeProductCategory(snap.data()?.category));
    }
  }));

  let hasMango = false;
  let hasNonMango = false;

  items.forEach((item) => {
    const productId = customerOrderProductId(item);
    const category = normalizeProductCategory(
      categoryByProductId.get(productId) ||
      item.category ||
      item.productCategory
    );

    if (category === "mangoes") {
      hasMango = true;
    } else {
      hasNonMango = true;
    }
  });

  return {
    hasMango,
    hasNonMango,
    requiresStripe: hasNonMango && !hasMango,
    allowStripe: hasNonMango && !hasMango,
    allowPickup: !hasNonMango || hasMango,
  };
}

// Shrish only has VA sales-tax nexus. Pickup happens in VA (taxable); shipping
// is taxable only when the destination state is VA. Any non-VA or unknown
// destination must NOT be charged Virginia sales tax.
function orderShipsOutsideVirginia(order = {}) {
  const isShipping = String(order.fulfillmentType || "pickup").toLowerCase() === "shipping"
    || String(order.location || "").toLowerCase() === "shipping";
  if (!isShipping) return false;
  const state = String(order.shippingAddress?.state || order.shippingState || "").trim().toUpperCase();
  return state !== "VA";
}

function orderSalesTaxAmount(order = {}, subtotalOverride) {
  if (orderShipsOutsideVirginia(order)) return 0;
  if (Number.isFinite(subtotalOverride)) {
    return roundCurrency(Number(subtotalOverride) * configuredVirginiaSalesTaxRate());
  }
  const subtotalFromItems = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + normalizeLineTotal(item), 0)
    : 0;
  const subtotal = subtotalFromItems > 0 ? subtotalFromItems : Number(order.itemSubtotal ?? 0);

  return roundCurrency(subtotal * configuredVirginiaSalesTaxRate());
}

function configuredStandardShippingAmount() {
  const configured = Number(process.env.SHRISH_STANDARD_SHIPPING_AMOUNT);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_STANDARD_SHIPPING_AMOUNT;
}

function configuredFreeShippingThreshold() {
  const configured = Number(process.env.SHRISH_FREE_SHIPPING_THRESHOLD);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_FREE_SHIPPING_THRESHOLD;
}

function orderShippingAmount(order = {}, subtotalOverride) {
  if (String(order.fulfillmentType || "pickup") !== "shipping") return 0;

  const subtotalFromItems = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + normalizeLineTotal(item), 0)
    : 0;
  const subtotal = Number.isFinite(subtotalOverride)
    ? Number(subtotalOverride)
    : (subtotalFromItems > 0 ? subtotalFromItems : Number(order.itemSubtotal ?? 0));

  return roundCurrency(subtotal >= configuredFreeShippingThreshold() ? 0 : configuredStandardShippingAmount());
}

// Server-authoritative checkout pricing. Rebuilds Stripe line items and the
// item subtotal from the products collection so a tampered client-side order
// document cannot dictate what the customer is charged.
async function buildServerPricedCheckout(db, order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) {
    throw new HttpsError("failed-precondition", "This order has no items.");
  }

  const productIds = [...new Set(items.map(customerOrderProductId).filter(Boolean))];
  const productById = new Map();
  await Promise.all(productIds.map(async (productId) => {
    const snap = await db.collection("products").doc(productId).get().catch(() => null);
    if (snap?.exists) productById.set(productId, snap.data() || {});
  }));

  const lineItems = [];
  let itemSubtotal = 0;

  items.forEach((item) => {
    const productId = customerOrderProductId(item);
    const variantId = customerOrderVariantId(item);
    const qty = normalizeQty(item);

    const product = productById.get(productId);
    if (!product) {
      throw new HttpsError("failed-precondition", "A product in your cart is no longer available.");
    }
    if (product.available === false || product.displayOnly || product.hidden) {
      throw new HttpsError("failed-precondition", "A product in your cart is not available for purchase.");
    }

    const variants = customerProductVariants(product);
    const variant = variants.find((v) => v.id === variantId)
      || variants.find((v) => v.id === "default")
      || variants[0];
    if (!variant) {
      throw new HttpsError("failed-precondition", "A product option in your cart is not available.");
    }

    const unitPrice = parseMoney(variant.price || product.price);
    if (!(unitPrice > 0)) {
      throw new HttpsError("failed-precondition", "A product in your cart does not have a valid price.");
    }

    itemSubtotal += unitPrice * qty;
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: "usd",
        unit_amount: toStripeAmount(unitPrice),
        product_data: {
          name: String(item.name || product.name || "Shrish item").slice(0, 180),
        },
      },
    });
  });

  return { lineItems, itemSubtotal: roundCurrency(itemSubtotal) };
}

async function assignSequentialOrderNumber(orderRef, existingOrderNumber) {
  const alreadyValid =
    typeof existingOrderNumber === "string" &&
    /^SHR-\d+$/.test(existingOrderNumber);

  if (alreadyValid) return existingOrderNumber;

  const counterRef = admin.firestore().collection("meta").doc("orderCounter");

  const nextNumber = await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);

    let lastNumber = ORDER_COUNTER_START;
    if (snap.exists) {
      const data = snap.data() || {};
      lastNumber = Number(data.lastNumber || ORDER_COUNTER_START);
    }

    const newNumber = lastNumber + 1;

    tx.set(
      counterRef,
      {
        lastNumber: newNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.update(orderRef, {
      orderNumber: `SHR-${newNumber}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return newNumber;
  });

  return `SHR-${nextNumber}`;
}


function orderSummaryBreakdown(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(order.itemSubtotal ?? 0) > 0
    ? Number(order.itemSubtotal)
    : items.reduce((sum, item) => sum + normalizeLineTotal(item), 0);
  const tax = Number(order.salesTaxAmount ?? 0);
  const shipping = Number(order.shippingAmount ?? 0);
  const isShipping = String(order.fulfillmentType || "pickup") === "shipping";
  // Only add a breakdown when there is tax and/or shipping to explain the total.
  if (!(tax > 0) && !isShipping && !(shipping > 0)) return "";
  const c = 'style="padding-top:6px; text-align:right; font-size:13px; color:#5c4a30;"';
  const row = (label, val) => `<tr><td colspan="2" ${c}>${label}</td><td ${c}>${val}</td></tr>`;
  let rows = row("Subtotal", currency(subtotal));
  const promoDiscount = Number(order.promoDiscount ?? 0);
  if (promoDiscount > 0) rows += row("Promo " + escapeHtml(order.promoCode || ""), "-" + currency(promoDiscount));
  if (tax > 0) rows += row(escapeHtml(order.salesTaxLabel || "Virginia sales tax"), currency(tax));
  if (isShipping || shipping > 0) rows += row("Shipping", shipping > 0 ? currency(shipping) : "Free");
  return rows;
}

function buildCustomerEmail(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstName = escapeHtml(order.firstName || "Customer");
  const orderNumber = escapeHtml(order.orderNumber || "");
  const isShipping = String(order.fulfillmentType || "pickup") === "shipping";
  const shippingAddress = order.shippingAddress || {};
  const fulfillmentDestination = escapeHtml(isShipping
    ? `${shippingAddress.addressLine1 || ""}${shippingAddress.addressLine2 ? `, ${shippingAddress.addressLine2}` : ""}, ${shippingAddress.city || ""}, ${shippingAddress.state || ""} ${shippingAddress.zip || ""}`.replace(/\s+/g, " ").trim()
    : (order.pickupLocationLabel || order.locationLabel || order.pickupLocation || "Chesterfield, VA"));
  const fulfillmentIntro = isShipping
    ? "Thank you for ordering from Shrish. Your request has been received. We will prepare your order for shipping and share updates by email or phone if needed."
    : "Thank you for ordering from Shrish. Your request has been received. Please follow our WhatsApp group for pickup location, pickup day, and timing updates.";
  const fulfillmentLine = isShipping
    ? `We have your order <strong>${orderNumber}</strong> to ship to <strong>${fulfillmentDestination}</strong>.`
    : `We have your order <strong>${orderNumber}</strong> for pickup in <strong>${fulfillmentDestination}</strong>.`;
  const isPaidOnline = order.paymentMethod === "stripe" || order.paymentStatus === "paid";
  const paymentMessage = isPaidOnline ? "Payment was completed online." : "Payment is collected at pickup.";

  const { totalBoxes, estimatedTotal } = getOrderTotals(order);
  const itemRows = buildItemsRows(items);

  return `
  <!doctype html>
  <html>
    <body style="margin:0; padding:0; background:#ece7df; font-family: Arial, Helvetica, sans-serif; color:#2b2218;">
      <div style="padding:32px 12px;">
        <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <div style="background:#b87512; padding:28px 24px 24px; text-align:center;">
            <img
              src="${SHRISH_LOGO_URL}"
              alt="Shrish"
              style="display:block; width:120px; height:120px; object-fit:contain; margin:0 auto 16px auto;"
            />
            <div style="font-size:12px; letter-spacing:1.6px; font-weight:700; color:#f8ebd4; text-transform:uppercase;">
              SHRISH LLC
            </div>
            <div style="margin-top:10px; font-size:20px; line-height:1.3; font-weight:700; color:#ffffff;">
              Your order is confirmed
            </div>
            <div style="margin-top:10px; font-size:14px; line-height:1.6; color:#fff3df; max-width:520px; margin-left:auto; margin-right:auto;">
              ${fulfillmentIntro}
            </div>
          </div>

          <div style="padding:24px;">
            <p style="margin:0 0 18px; font-size:15px; line-height:1.6;">Hi ${firstName},</p>

            <p style="margin:0 0 22px; font-size:15px; line-height:1.7;">
              ${fulfillmentLine} ${paymentMessage}
            </p>

            <table style="width:100%; border-collapse:collapse; margin:0 0 24px;">
              <thead>
                <tr style="background:#efe8dd;">
                  <th style="text-align:left; padding:10px 12px; font-size:13px; color:#4d3c22;">Item</th>
                  <th style="text-align:center; padding:10px 12px; font-size:13px; color:#4d3c22;">Qty</th>
                  <th style="text-align:right; padding:10px 12px; font-size:13px; color:#4d3c22;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
              <tfoot>
                ${orderSummaryBreakdown(order)}
                <tr>
                  <td style="padding-top:16px; font-size:14px; font-weight:700; color:#2b2218;">
                    Total
                  </td>
                  <td style="padding-top:16px; text-align:center; font-size:14px; font-weight:700; color:#2b2218;">
                    ${totalBoxes}
                  </td>
                  <td style="padding-top:16px; text-align:right; font-size:14px; font-weight:700; color:#2b2218;">
                    ${currency(estimatedTotal)}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:4px; font-size:12px; color:#7a6853;">&nbsp;</td>
                  <td style="padding-top:4px; text-align:center; font-size:12px; color:#7a6853;">
                    Total boxes
                  </td>
                  <td style="padding-top:4px; text-align:right; font-size:12px; color:#7a6853;">
                    Estimated total
                  </td>
                </tr>
              </tfoot>
            </table>

            <div style="background:#f6f1e8; border-radius:14px; padding:16px 18px; margin-bottom:18px;">
              <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:#2b2218;">
                What happens next
              </div>
              <div style="font-size:14px; line-height:1.7; color:#3d3225;">
                We will review your order and share the exact pickup time and address details through our WhatsApp group.
                To make changes to your order, please reply to this email or contact us on WhatsApp.
              </div>
            </div>

            <div style="background:#fff8ec; border:1px solid #ecd9b6; border-radius:14px; padding:20px 18px; margin-bottom:18px; text-align:center;">
              <div style="font-size:15px; font-weight:700; color:#2b2218;">Enjoying Shrish? ⭐</div>
              <div style="font-size:13px; line-height:1.65; color:#6b5842; margin:7px auto 15px; max-width:440px;">
                Once your order arrives and you've had a taste, a quick Google review means the world to our small family kitchen — it takes about 30 seconds and helps other families find us.
              </div>
              <a href="${SHRISH_REVIEW_URL}" style="display:inline-block; background:#b87512; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:12px 28px; border-radius:50px;">
                ★ Leave a Google review
              </a>
              <div style="margin-top:16px; font-size:11px; color:#9c8a6b;">Reading on your computer? Scan with your phone camera:</div>
              <img src="${SHRISH_REVIEW_QR_URL}" width="108" height="108" alt="Scan to review Shrish on Google" style="display:block; width:108px; height:108px; margin:9px auto 0; border-radius:8px; background:#ffffff;" />
            </div>

            <div style="font-size:14px; line-height:1.8; color:#2b2218;">
              <div><strong>Phone:</strong> ${escapeHtml(SHRISH_SUPPORT_PHONE)}</div>
              <div>
                <strong>WhatsApp:</strong>
                <a href="${SHRISH_WHATSAPP_URL}" style="color:#1e63c6; text-decoration:none;">${SHRISH_WHATSAPP_URL}</a>
              </div>
              <div>
                <strong>Instagram:</strong>
                <a href="${SHRISH_INSTAGRAM_URL}" style="color:#1e63c6; text-decoration:none;">${SHRISH_INSTAGRAM_URL}</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

function buildAdminEmail(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const orderNumber = escapeHtml(order.orderNumber || "");
  const fullName = escapeHtml(`${order.firstName || ""} ${order.lastName || ""}`.trim());
  const email = escapeHtml(order.email || "");
  const phone = escapeHtml(order.phone || "");
  const pickupLocation = escapeHtml(
    order.locationLabel || order.pickupLocation || "Chesterfield, VA"
  );
  const paymentLabel = escapeHtml(
    order.paymentMethodLabel ||
    (order.paymentMethod === "stripe" || order.paymentStatus === "paid" ? "Paid online" : "Pay at pickup")
  );
  const notes = escapeHtml(order.notes || "");

  const { totalBoxes, estimatedTotal } = getOrderTotals(order);
  const itemRows = buildItemsRows(items);

  return `
  <!doctype html>
  <html>
    <body style="margin:0; padding:0; background:#ece7df; font-family: Arial, Helvetica, sans-serif; color:#2b2218;">
      <div style="padding:32px 12px;">
        <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <div style="background:#2f2a23; padding:24px; text-align:center;">
            <img
              src="${SHRISH_LOGO_URL}"
              alt="Shrish"
              style="display:block; width:110px; height:110px; object-fit:contain; margin:0 auto 14px auto;"
            />
            <div style="font-size:12px; letter-spacing:1.6px; font-weight:700; color:#d8c9b2; text-transform:uppercase;">
              New Shrish Order
            </div>
            <div style="margin-top:10px; font-size:20px; line-height:1.3; font-weight:700; color:#ffffff;">
              ${orderNumber}
            </div>
          </div>

          <div style="padding:24px;">
            <table style="width:100%; border-collapse:collapse; margin-bottom:22px;">
              <tr>
                <td style="padding:8px 0; font-size:14px;"><strong>Customer:</strong></td>
                <td style="padding:8px 0; font-size:14px;">${fullName}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px;"><strong>Email:</strong></td>
                <td style="padding:8px 0; font-size:14px;">${email}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px;"><strong>Phone:</strong></td>
                <td style="padding:8px 0; font-size:14px;">${phone}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px;"><strong>Pickup:</strong></td>
                <td style="padding:8px 0; font-size:14px;">${pickupLocation}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; font-size:14px;"><strong>Payment:</strong></td>
                <td style="padding:8px 0; font-size:14px;">${paymentLabel}</td>
              </tr>
            </table>

            <table style="width:100%; border-collapse:collapse; margin:0 0 20px;">
              <thead>
                <tr style="background:#efe8dd;">
                  <th style="text-align:left; padding:10px 12px; font-size:13px; color:#4d3c22;">Item</th>
                  <th style="text-align:center; padding:10px 12px; font-size:13px; color:#4d3c22;">Qty</th>
                  <th style="text-align:right; padding:10px 12px; font-size:13px; color:#4d3c22;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
              <tfoot>
                ${orderSummaryBreakdown(order)}
                <tr>
                  <td style="padding-top:16px; font-size:14px; font-weight:700; color:#2b2218;">
                    Total
                  </td>
                  <td style="padding-top:16px; text-align:center; font-size:14px; font-weight:700; color:#2b2218;">
                    ${totalBoxes}
                  </td>
                  <td style="padding-top:16px; text-align:right; font-size:14px; font-weight:700; color:#2b2218;">
                    ${currency(estimatedTotal)}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:4px; font-size:12px; color:#7a6853;">&nbsp;</td>
                  <td style="padding-top:4px; text-align:center; font-size:12px; color:#7a6853;">
                    Total boxes
                  </td>
                  <td style="padding-top:4px; text-align:right; font-size:12px; color:#7a6853;">
                    Estimated total
                  </td>
                </tr>
              </tfoot>
            </table>

            ${
              notes
                ? `
              <div style="background:#f6f1e8; border-radius:14px; padding:16px 18px;">
                <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:#2b2218;">Customer notes</div>
                <div style="font-size:14px; line-height:1.7; color:#3d3225;">${notes}</div>
              </div>
            `
                : ""
            }
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

async function sendOrderConfirmationEmails(orderRef, order, source = "order_created") {
  if (!order || !order.email || order.confirmationEmailSentAt) return;

  const finalOrderNumber = await assignSequentialOrderNumber(
    orderRef,
    order.orderNumber
  );

  const finalOrder = {
    ...order,
    orderNumber: finalOrderNumber,
  };

  const resend = new Resend(RESEND_API_KEY.value());

  const customerSubject = `Shrish order confirmation — ${finalOrder.orderNumber || "Order received"}`;
  const adminSubject = `New Shrish order — ${finalOrder.orderNumber || "Order received"}`;

  await resend.emails.send({
    from: SHRISH_FROM_EMAIL,
    to: [finalOrder.email],
    subject: customerSubject,
    html: buildCustomerEmail(finalOrder),
  });

  await resend.emails.send({
    from: SHRISH_FROM_EMAIL,
    to: [SHRISH_ADMIN_EMAIL],
    subject: adminSubject,
    html: buildAdminEmail(finalOrder),
  });

  await orderRef.set({
    confirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmationEmailSource: source,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const { totalBoxes, estimatedTotal } = getOrderTotals(finalOrder);
  posthog.identify({
    distinctId: finalOrder.email,
    properties: {
      $set: {
        name: `${finalOrder.firstName || ""} ${finalOrder.lastName || ""}`.trim() || undefined,
        email: finalOrder.email,
        phone: finalOrder.phone || undefined,
      },
    },
  });
  posthog.capture({
    distinctId: finalOrder.email,
    event: "order_confirmed",
    properties: {
      order_number: finalOrder.orderNumber,
      pickup_location: finalOrder.locationLabel || finalOrder.pickupLocation || "Chesterfield, VA",
      total_boxes: totalBoxes,
      estimated_total: estimatedTotal,
      item_count: Array.isArray(finalOrder.items) ? finalOrder.items.length : 0,
      payment_method: finalOrder.paymentMethod || finalOrder.payment || "pay_at_pickup",
      source,
    },
  });
  await posthog.flush();
}

function buildProductAvailableEmail(product) {
  const productId = String(product?.id || "").trim();
  const productName = escapeHtml(product?.name || "Your requested Shrish product");
  const productDescription = escapeHtml(product?.description || "");
  const shopUrl = `${SHRISH_SITE_URL}/shop.html?product=${encodeURIComponent(productId)}`;

  return `
  <!doctype html>
  <html>
    <body style="margin:0; padding:0; background:#ece7df; font-family: Arial, Helvetica, sans-serif; color:#2b2218;">
      <div style="padding:32px 12px;">
        <div style="max-width:620px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <div style="background:#b87512; padding:28px 24px 24px; text-align:center;">
            <img src="${SHRISH_LOGO_URL}" alt="Shrish" style="display:block; width:104px; height:104px; object-fit:contain; margin:0 auto 16px auto;" />
            <div style="font-size:12px; letter-spacing:1.6px; font-weight:700; color:#f8ebd4; text-transform:uppercase;">SHRISH LLC</div>
            <div style="margin-top:10px; font-size:22px; line-height:1.3; font-weight:700; color:#ffffff;">${productName} is available now</div>
          </div>
          <div style="padding:26px 24px;">
            <p style="margin:0 0 16px; font-size:15px; line-height:1.7;">You asked us to let you know when <strong>${productName}</strong> is available.</p>
            ${productDescription ? `<p style="margin:0 0 22px; font-size:15px; line-height:1.7; color:#3d3225;">${productDescription}</p>` : ""}
            <div style="text-align:center; margin:28px 0;">
              <a href="${shopUrl}" style="display:inline-block; background:#c8791a; color:#ffffff; text-decoration:none; padding:14px 24px; border-radius:999px; font-weight:700;">Shop now</a>
            </div>
            <div style="background:#f6f1e8; border-radius:14px; padding:14px 16px; font-size:13px; line-height:1.6; color:#3d3225;">
              Availability can be limited and pickup timing depends on the current batch. Payment is collected at pickup unless the website says otherwise.
            </div>
            <p style="margin:22px 0 0; font-size:12px; line-height:1.6; color:#7a6853;">You received this because you requested a product availability notification on shrish.co. To stop these updates, reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

exports.sendProductAvailabilityEmails = onCall(
  callableOptions({
    secrets: [RESEND_API_KEY],
  }),
  async (request) => {
    if (!isAdminRequest(request)) {
      throw new HttpsError("permission-denied", "Only the Shrish admin can send product availability emails.");
    }

    const productId = String(request.data?.productId || "").trim();
    if (!productId) {
      throw new HttpsError("invalid-argument", "Product id is required.");
    }

    const db = admin.firestore();
    const productRef = db.collection("products").doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      throw new HttpsError("not-found", "Product was not found.");
    }

    const product = { id: productId, ...productSnap.data() };
    if (!product.available || product.displayOnly || product.hidden) {
      throw new HttpsError("failed-precondition", "Product must be visible and available before notifying customers.");
    }

    const notifySnap = await db.collection("notify_requests")
      .where("productId", "==", productId)
      .get();

    const requestsByEmail = new Map();
    notifySnap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const email = String(data.email || "").trim().toLowerCase();
      const status = String(data.status || "subscribed").toLowerCase();
      if (!email || status !== "subscribed") return;
      if (!requestsByEmail.has(email)) requestsByEmail.set(email, { ref: docSnap.ref, data });
    });

    const requests = [...requestsByEmail.entries()].slice(0, MAX_PRODUCT_NOTIFY_EMAILS_PER_SEND);
    if (!requests.length) {
      return { sent: 0, skipped: 0, totalSubscribers: 0 };
    }

    const resend = new Resend(RESEND_API_KEY.value());
    const sentBy = request.auth.token?.email || request.auth.uid || "admin";
    const subject = `${product.name || "Shrish product"} is available now`;
    const html = buildProductAvailableEmail(product);
    const skipped = [];
    let sent = 0;

    for (const [email, entry] of requests) {
      try {
        await resend.emails.send({
          from: SHRISH_FROM_EMAIL,
          to: [email],
          subject,
          html,
        });

        await entry.ref.set({
          status: "notified",
          notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          notifiedBy: sentBy,
          lastNotificationSubject: subject,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        sent += 1;
      } catch (error) {
        console.error("Product availability email failed", {
          productId,
          email,
          error: error?.message || String(error),
        });
        skipped.push({ email, reason: "send_failed" });
      }
    }

    await productRef.set({
      availabilityNotificationLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      availabilityNotificationLastSentBy: sentBy,
      availabilityNotificationLastSentCount: sent,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    posthog.capture({
      distinctId: sentBy,
      event: "product_availability_emails_sent",
      properties: {
        product_id: productId,
        product_title: product.name || "",
        sent_count: sent,
        skipped_count: skipped.length,
        total_subscribers: requestsByEmail.size,
      },
    });
    await posthog.flush();

    if (!sent && skipped.length) {
      throw new HttpsError("failed-precondition", "No product availability emails were sent. Check Firebase Functions logs and Resend setup.");
    }

    return {
      sent,
      skipped: skipped.length,
      totalSubscribers: requestsByEmail.size,
      capped: requestsByEmail.size > MAX_PRODUCT_NOTIFY_EMAILS_PER_SEND,
    };
  }
);

function buildPasswordResetEmail(email, resetLink) {
  const safeEmail = escapeHtml(email);
  const safeResetLink = escapeHtml(resetLink);

  return `
  <!doctype html>
  <html>
    <body style="margin:0; padding:0; background:#ece7df; font-family: Arial, Helvetica, sans-serif; color:#2b2218;">
      <div style="padding:32px 12px;">
        <div style="max-width:620px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <div style="background:#b87512; padding:28px 24px 24px; text-align:center;">
            <img src="${SHRISH_LOGO_URL}" alt="Shrish" style="display:block; width:104px; height:104px; object-fit:contain; margin:0 auto 16px auto;" />
            <div style="font-size:12px; letter-spacing:1.6px; font-weight:700; color:#f8ebd4; text-transform:uppercase;">SHRISH LLC</div>
            <div style="margin-top:10px; font-size:20px; line-height:1.3; font-weight:700; color:#ffffff;">Reset your Shrish password</div>
          </div>
          <div style="padding:26px 24px;">
            <p style="margin:0 0 16px; font-size:15px; line-height:1.7;">We received a password reset request for <strong>${safeEmail}</strong>.</p>
            <p style="margin:0 0 22px; font-size:15px; line-height:1.7;">Click the button below to create a new password. If you did not request this, you can safely ignore this email.</p>
            <div style="text-align:center; margin:28px 0;">
              <a href="${safeResetLink}" style="display:inline-block; background:#c8791a; color:#ffffff; text-decoration:none; padding:14px 24px; border-radius:999px; font-weight:700;">Create new password</a>
            </div>
            <div style="background:#f6f1e8; border-radius:14px; padding:14px 16px; font-size:13px; line-height:1.6; color:#3d3225;">
              This secure link is generated by Firebase and may expire. If it expires, request another reset from the Shrish account page.
            </div>
            <p style="margin:22px 0 0; font-size:13px; line-height:1.6; color:#6b5b46;">Button not working? Copy this link:<br><a href="${safeResetLink}" style="color:#1e63c6;">${safeResetLink}</a></p>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

function reminderItemsText(items = []) {
  if (!Array.isArray(items) || !items.length) return "Order items are listed in your confirmation email.";
  return items
    .map((item) => {
      const name = item?.name || "Item";
      const qty = normalizeQty(item);
      return `- ${name} x ${qty}`;
    })
    .join("\n");
}

function reminderCustomerName(order = {}) {
  return (
    order.fullName ||
    `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
    "Customer"
  );
}

function reminderTemplateValues(order = {}) {
  const totals = getOrderTotals(order);
  const fullName = reminderCustomerName(order);
  return {
    firstName: order.firstName || fullName.split(" ")[0] || "Customer",
    fullName,
    orderNumber: order.orderNumber || order.id || "your order",
    pickupLocation: order.locationLabel || order.pickupLocation || order.location || "your selected pickup location",
    items: reminderItemsText(order.items || []),
    totalBoxes: String(totals.totalBoxes || 0),
    totalPrice: currency(totals.estimatedTotal || 0),
  };
}

function applyReminderTemplate(template = "", order = {}) {
  const values = reminderTemplateValues(order);
  return String(template || "").replace(/{{\s*([a-zA-Z]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}

function plainTextToEmailHtml(text = "") {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function splitReminderMessageSections(text = "") {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const before = [];
  const after = [];
  let target = before;
  let skippingSummary = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (target === before && /^order summary:?$/i.test(trimmed)) {
      target = after;
      skippingSummary = true;
      continue;
    }

    if (skippingSummary) {
      if (
        !trimmed ||
        trimmed.startsWith("- ") ||
        lower.startsWith("total boxes:") ||
        lower.startsWith("estimated total:")
      ) {
        continue;
      }

      skippingSummary = false;
    }

    target.push(line);
  }

  return {
    before: before.join("\n").trim(),
    after: after.join("\n").trim(),
  };
}

function buildReminderEmail(order, messageText) {
  const items = Array.isArray(order.items) ? order.items : [];
  const orderNumber = escapeHtml(order.orderNumber || order.id || "");
  const { totalBoxes, estimatedTotal } = getOrderTotals(order);
  const itemRows = buildItemsRows(items);
  const messageSections = splitReminderMessageSections(messageText);
  const beforeMessageHtml = plainTextToEmailHtml(messageSections.before);
  const afterMessageHtml = plainTextToEmailHtml(messageSections.after);

  return `
  <!doctype html>
  <html>
    <body style="margin:0; padding:0; background:#ece7df; font-family: Arial, Helvetica, sans-serif; color:#2b2218;">
      <div style="padding:32px 12px;">
        <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <div style="background:#b87512; padding:28px 24px 24px; text-align:center;">
            <img src="${SHRISH_LOGO_URL}" alt="Shrish" style="display:block; width:120px; height:120px; object-fit:contain; margin:0 auto 16px auto;" />
            <div style="font-size:12px; letter-spacing:1.6px; font-weight:700; color:#f8ebd4; text-transform:uppercase;">SHRISH LLC</div>
            <div style="margin-top:10px; font-size:20px; line-height:1.3; font-weight:700; color:#ffffff;">Pickup reminder</div>
            <div style="margin-top:10px; font-size:14px; line-height:1.6; color:#fff3df; max-width:520px; margin-left:auto; margin-right:auto;">
              Your order is ready for pickup.
            </div>
          </div>
          <div style="padding:24px;">
            ${
              beforeMessageHtml
                ? `<div style="font-size:15px; line-height:1.7; color:#2b2218; margin-bottom:22px;">${beforeMessageHtml}</div>`
                : ""
            }

            <table style="width:100%; border-collapse:collapse; margin:0 0 24px;">
              <thead>
                <tr style="background:#efe8dd;">
                  <th style="text-align:left; padding:10px 12px; font-size:13px; color:#4d3c22;">Item</th>
                  <th style="text-align:center; padding:10px 12px; font-size:13px; color:#4d3c22;">Qty</th>
                  <th style="text-align:right; padding:10px 12px; font-size:13px; color:#4d3c22;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
              <tfoot>
                ${orderSummaryBreakdown(order)}
                <tr>
                  <td style="padding-top:16px; font-size:14px; font-weight:700; color:#2b2218;">
                    Total
                  </td>
                  <td style="padding-top:16px; text-align:center; font-size:14px; font-weight:700; color:#2b2218;">
                    ${totalBoxes}
                  </td>
                  <td style="padding-top:16px; text-align:right; font-size:14px; font-weight:700; color:#2b2218;">
                    ${currency(estimatedTotal)}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:4px; font-size:12px; color:#7a6853;">&nbsp;</td>
                  <td style="padding-top:4px; text-align:center; font-size:12px; color:#7a6853;">
                    Total boxes
                  </td>
                  <td style="padding-top:4px; text-align:right; font-size:12px; color:#7a6853;">
                    Estimated total
                  </td>
                </tr>
              </tfoot>
            </table>

            ${
              afterMessageHtml
                ? `<div style="font-size:15px; line-height:1.7; color:#2b2218; margin-bottom:20px;">${afterMessageHtml}</div>`
                : ""
            }

            <div style="background:#f6f1e8; border-radius:14px; padding:16px 18px; margin-bottom:18px;">
              <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:#2b2218;">Order reference</div>
              <div style="font-size:14px; line-height:1.7; color:#3d3225;">${orderNumber}</div>
            </div>
            <div style="font-size:14px; line-height:1.8; color:#2b2218;">
              <div><strong>Phone:</strong> ${escapeHtml(SHRISH_SUPPORT_PHONE)}</div>
              <div><strong>WhatsApp:</strong> <a href="${SHRISH_WHATSAPP_URL}" style="color:#1e63c6; text-decoration:none;">${SHRISH_WHATSAPP_URL}</a></div>
              <div><strong>Instagram:</strong> <a href="${SHRISH_INSTAGRAM_URL}" style="color:#1e63c6; text-decoration:none;">${SHRISH_INSTAGRAM_URL}</a></div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

exports.sendOrderReminderEmails = onCall(
  callableOptions({
    secrets: [RESEND_API_KEY],
  }),
  async (request) => {
    if (!isAdminRequest(request)) {
      throw new HttpsError("permission-denied", "Admin access is required to send reminder emails.");
    }

    const rawOrderIds = Array.isArray(request.data?.orderIds) ? request.data.orderIds : [];
    const orderIds = [...new Set(rawOrderIds.map((id) => String(id || "").trim()).filter(Boolean))];
    const subjectTemplate = String(request.data?.subject || "").trim().slice(0, 160);
    const bodyTemplate = String(request.data?.body || "").trim().slice(0, 5000);

      if (!orderIds.length) {
      throw new HttpsError("invalid-argument", "Select at least one active order.");
    }
    if (orderIds.length > MAX_REMINDER_EMAILS_PER_SEND) {
      throw new HttpsError("invalid-argument", `Send ${MAX_REMINDER_EMAILS_PER_SEND} or fewer reminder emails at a time.`);
    }
    if (!subjectTemplate || !bodyTemplate) {
      throw new HttpsError("invalid-argument", "Subject and message are required.");
    }

    const resend = new Resend(RESEND_API_KEY.value());
    const db = admin.firestore();
    const sentBy = request.auth.token?.email || request.auth.uid || "admin";
    const skippedOrders = [];
    let sent = 0;

    for (const orderId of orderIds) {
      const orderRef = db.collection("orders").doc(orderId);
      const snapshot = await orderRef.get();
      if (!snapshot.exists) {
        skippedOrders.push({ orderId, reason: "missing" });
        continue;
      }

      const order = { id: orderId, ...snapshot.data() };
      if ((order.status || "pending") !== "pending") {
        skippedOrders.push({ orderId, reason: "not_active" });
        continue;
      }
      if (!order.email) {
        skippedOrders.push({ orderId, reason: "missing_email" });
        continue;
      }

      const subject = applyReminderTemplate(subjectTemplate, order).slice(0, 160);
      const messageText = applyReminderTemplate(bodyTemplate, order);

      try {
        await resend.emails.send({
          from: SHRISH_FROM_EMAIL,
          to: [order.email],
          subject,
          html: buildReminderEmail(order, messageText),
        });

        await orderRef.update({
          "reminders.email.lastSentAt": admin.firestore.FieldValue.serverTimestamp(),
          "reminders.email.lastSubject": subject,
          "reminders.email.sentBy": sentBy,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        sent += 1;
      } catch (error) {
        console.error("Reminder email send failed", {
          orderId,
          email: order.email,
          error: error?.message || String(error),
        });
        posthog.captureException(error, sentBy, {
          order_id: orderId,
          function: "sendOrderReminderEmails",
        });
        skippedOrders.push({ orderId, reason: "send_failed" });
      }
    }

    posthog.capture({
      distinctId: sentBy,
      event: "reminder_emails_sent",
      properties: {
        sent_count: sent,
        skipped_count: skippedOrders.length,
        total_attempted: orderIds.length,
      },
    });

    for (const skipped of skippedOrders) {
      posthog.capture({
        distinctId: sentBy,
        event: "reminder_email_skipped",
        properties: {
          order_id: skipped.orderId,
          reason: skipped.reason,
        },
      });
    }

    await posthog.flush();

    if (!sent && skippedOrders.length) {
      throw new HttpsError("failed-precondition", "No reminder emails were sent. Check Firebase Functions logs and Resend setup.");
    }

    return {
      sent,
      skipped: skippedOrders.length,
      skippedOrders,
    };
  }
);

exports.getPublicConfig = onCall(
  callableOptions(),
  async () => {
    return {
      googleMapsApiKey: String(
        process.env.SHRISH_GOOGLE_MAPS_API_KEY
          || process.env.GOOGLE_MAPS_API_KEY
          || ""
      ).trim(),
    };
  }
);

// Server-authoritative promo validation. Throws HttpsError if invalid;
// returns { code, type, discount, freeShipping } or null when no code.
async function validateAndApplyPromo(db, order, itemSubtotal) {
  const code = String(order.promoCode || "").trim().toUpperCase();
  if (!code) return null;
  const snap = await db.collection("promo_codes").doc(code).get().catch(() => null);
  if (!snap || !snap.exists) throw new HttpsError("failed-precondition", "That promo code is not valid.");
  const p = snap.data() || {};
  if (!p.active) throw new HttpsError("failed-precondition", "That promo code is no longer active.");
  if (p.expiresAt) {
    const exp = p.expiresAt.toDate ? p.expiresAt.toDate() : new Date(p.expiresAt);
    if (exp instanceof Date && !isNaN(exp) && exp < new Date()) throw new HttpsError("failed-precondition", "That promo code has expired.");
  }
  if (p.maxUses && Number(p.usedCount || 0) >= Number(p.maxUses)) throw new HttpsError("failed-precondition", "That promo code has reached its usage limit.");
  if (p.minSubtotal && itemSubtotal < Number(p.minSubtotal)) throw new HttpsError("failed-precondition", "Your order does not meet the minimum for that promo code.");
  if (p.perCustomerLimit) {
    const phone = String(order.phoneDigits || "").replace(/\D/g, "");
    if (phone) {
      const redSnap = await db.collection("promo_redemptions").doc(`${code}__${phone}`).get().catch(() => null);
      if (redSnap && redSnap.exists) throw new HttpsError("failed-precondition", "You have already used that promo code.");
    }
  }
  let discount = 0, freeShipping = false;
  if (p.type === "percent") discount = roundCurrency(itemSubtotal * (Number(p.value) || 0) / 100);
  else if (p.type === "fixed") discount = roundCurrency(Math.min(Number(p.value) || 0, itemSubtotal));
  else if (p.type === "free_shipping") freeShipping = true;
  return { code, type: p.type, discount: roundCurrency(discount), freeShipping };
}

exports.validatePromoCode = onCall(
  callableOptions(),
  async (request) => {
    const db = admin.firestore();
    await enforceCallableRateLimit(db, request, {
      scope: "promo-code-check",
      limit: PROMO_CHECK_RATE_LIMIT,
      windowMs: PROMO_CHECK_RATE_WINDOW_MS,
    });

    const code = String(request.data?.code || "").trim().toUpperCase();
    const itemSubtotal = roundCurrency(request.data?.itemSubtotal);
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
      throw new HttpsError("invalid-argument", "That promo code is not valid.");
    }
    if (!(itemSubtotal >= 0 && itemSubtotal <= 100_000)) {
      throw new HttpsError("invalid-argument", "Cart subtotal is invalid.");
    }

    const snapshot = await db.collection("promo_codes").doc(code).get();
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "That promo code is not valid.");
    }
    const promo = snapshot.data() || {};
    if (!promo.active) {
      throw new HttpsError("failed-precondition", "That promo code is no longer active.");
    }
    if (promo.expiresAt) {
      const expiresAt = promo.expiresAt.toDate ? promo.expiresAt.toDate() : new Date(promo.expiresAt);
      if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
        throw new HttpsError("failed-precondition", "That promo code has expired.");
      }
    }
    if (promo.maxUses && Number(promo.usedCount || 0) >= Number(promo.maxUses)) {
      throw new HttpsError("failed-precondition", "That promo code has reached its usage limit.");
    }
    if (promo.minSubtotal && itemSubtotal < Number(promo.minSubtotal)) {
      throw new HttpsError(
        "failed-precondition",
        `Spend ${currency(promo.minSubtotal)} or more to use this code.`
      );
    }
    return {
      code,
      type: String(promo.type || ""),
      value: Number(promo.value) || 0,
      minSubtotal: Number(promo.minSubtotal) || 0,
    };
  }
);

// Atomically record one redemption per order (bump usedCount + per-customer marker).
async function recordPromoRedemption(db, order, orderId) {
  const code = String(order.promoCode || "").trim().toUpperCase();
  if (!code || !orderId) return;
  const phone = String(order.phoneDigits || "").replace(/\D/g, "");
  const codeRef = db.collection("promo_codes").doc(code);
  const orderRef = db.collection("orders").doc(orderId);
  await db.runTransaction(async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists || oSnap.data()?.promoRedeemed) return; // idempotent per order
    tx.update(codeRef, {
      usedCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(orderRef, { promoRedeemed: true });
    if (phone) {
      tx.set(db.collection("promo_redemptions").doc(`${code}__${phone}`), {
        code, phoneDigits: phone, orderId,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }).catch((e) => console.error("recordPromoRedemption failed", { code, error: e?.message }));
}

function websiteOrderFinalizationResult(orderId, order, options = {}) {
  return {
    orderId,
    orderNumber: String(order.orderNumber || ""),
    itemSubtotal: roundCurrency(order.itemSubtotal),
    promoDiscount: roundCurrency(order.promoDiscount),
    salesTaxAmount: roundCurrency(order.salesTaxAmount),
    shippingAmount: roundCurrency(order.shippingAmount),
    totalPrice: roundCurrency(order.totalPrice),
    noShow: Boolean(options.noShow),
    alreadyFinalized: Boolean(options.alreadyFinalized),
  };
}

exports.finalizeWebsiteOrder = onCall(
  callableOptions({
    secrets: [RESEND_API_KEY],
  }),
  async (request) => {
    const orderId = String(request.data?.orderId || "").trim();
    if (!/^[A-Za-z0-9]{20}$/.test(orderId)) {
      throw new HttpsError("invalid-argument", "Order ID is invalid.");
    }

    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);
    const snapshot = await orderRef.get();
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const currentOrder = snapshot.data() || {};
    if (currentOrder.websiteFinalizationState === "complete") {
      return websiteOrderFinalizationResult(orderId, currentOrder, {
        alreadyFinalized: true,
      });
    }

    try {
      const validated = validateWebsiteOrder(currentOrder, request.auth?.uid || "");
      await enforceCallableRateLimit(db, request, {
        scope: "website-order-finalize",
        limit: WEBSITE_ORDER_RATE_LIMIT,
        windowMs: WEBSITE_ORDER_RATE_WINDOW_MS,
      });
      await enforceCallableRateLimit(db, request, {
        scope: "website-order-phone",
        limit: 4,
        windowMs: WEBSITE_ORDER_RATE_WINDOW_MS,
        subject: `phone:${validated.phoneDigits}`,
      });

      const claimedOrder = await db.runTransaction(async (tx) => {
        const freshSnapshot = await tx.get(orderRef);
        if (!freshSnapshot.exists) {
          throw new HttpsError("not-found", "Order not found.");
        }
        const freshOrder = freshSnapshot.data() || {};
        if (freshOrder.websiteFinalizationState === "complete") {
          return { alreadyFinalized: true, order: freshOrder };
        }
        if (freshOrder.websiteFinalizationState === "processing") {
          throw new HttpsError("already-exists", "This order is already being finalized.");
        }
        tx.update(orderRef, {
          websiteFinalizationState: "processing",
          websiteFinalizationStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { alreadyFinalized: false, order: freshOrder };
      });

      if (claimedOrder.alreadyFinalized) {
        return websiteOrderFinalizationResult(orderId, claimedOrder.order, {
          alreadyFinalized: true,
        });
      }

      const order = claimedOrder.order;
      const paymentPolicy = await classifyOrderPaymentItems(db, order);
      if (paymentPolicy.requiresStripe && validated.paymentMethod !== "stripe") {
        throw new HttpsError("failed-precondition", "Online payment is required for this cart.");
      }
      if (!paymentPolicy.requiresStripe && validated.paymentMethod === "stripe") {
        throw new HttpsError("failed-precondition", "This cart is not eligible for online-only checkout.");
      }
      if (validated.fulfillmentType === "shipping" && !paymentPolicy.requiresStripe) {
        throw new HttpsError("failed-precondition", "This cart is not eligible for shipping.");
      }

      const { itemSubtotal } = await buildServerPricedCheckout(db, order);
      const promo = await validateAndApplyPromo(db, order, itemSubtotal);
      const promoDiscount = promo?.discount || 0;
      const discountedSubtotal = roundCurrency(Math.max(0, itemSubtotal - promoDiscount));
      const salesTaxAmount = orderSalesTaxAmount(order, discountedSubtotal);
      let shippingAmount = orderShippingAmount(order, itemSubtotal);
      if (promo?.freeShipping && validated.fulfillmentType === "shipping") shippingAmount = 0;
      const totalPrice = roundCurrency(discountedSubtotal + salesTaxAmount + shippingAmount);
      const orderNumber = await assignSequentialOrderNumber(orderRef, order.orderNumber);

      const lockSnapshot = await db.collection("order_locks").doc(validated.phoneDigits).get();
      const noShow = lockSnapshot.exists && String(lockSnapshot.data()?.status || "") === "no_show";

      const finalizedOrder = {
        ...order,
        orderNumber,
        itemSubtotal,
        promoCode: promo?.code || "",
        promoDiscount,
        salesTaxAmount,
        shippingAmount,
        shippingFreeThreshold: configuredFreeShippingThreshold(),
        totalPrice,
      };

      await orderRef.set({
        orderNumber,
        customerUid: request.auth?.uid || admin.firestore.FieldValue.delete(),
        itemSubtotal,
        promoCode: promo?.code || "",
        promoDiscount,
        salesTaxAmount,
        shippingAmount,
        shippingFreeThreshold: configuredFreeShippingThreshold(),
        totalPrice,
        websiteValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (validated.paymentMethod === "pay_at_pickup") {
        if (finalizedOrder.promoCode) {
          await recordPromoRedemption(db, finalizedOrder, orderId);
        }
        await db.collection("order_locks").doc(validated.phoneDigits).set({
          phoneDigits: validated.phoneDigits,
          orderId,
          status: "pending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      await orderRef.set({
        websiteFinalizationState: "complete",
        websiteFinalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return websiteOrderFinalizationResult(orderId, finalizedOrder, { noShow });
    } catch (error) {
      if (error?.code !== "already-exists") {
        await orderRef.set({
          websiteFinalizationState: "failed",
          websiteFinalizationError: String(error?.code || "validation_failed").slice(0, 80),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }
      throw asHttpsError(error);
    }
  }
);

exports.createStripeCheckoutSession = onCall(
  callableOptions({
    secrets: [STRIPE_SECRET_KEY],
  }),
  async (request) => {
    if (!STRIPE_PAYMENTS_ENABLED) {
      throw new HttpsError("failed-precondition", "Online card payments are temporarily unavailable.");
    }

    const orderId = String(request.data?.orderId || "").trim();
    if (!orderId) {
      throw new HttpsError("invalid-argument", "Order ID is required.");
    }

    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const order = orderSnap.data() || {};
    if (order.websiteFinalizationState !== "complete" || !order.websiteValidatedAt) {
      throw new HttpsError("failed-precondition", "Order must be validated before payment can start.");
    }
    await enforceCallableRateLimit(db, request, {
      scope: "stripe-checkout-session",
      limit: STRIPE_SESSION_RATE_LIMIT,
      windowMs: STRIPE_SESSION_RATE_WINDOW_MS,
    });
    await enforceCallableRateLimit(db, request, {
      scope: "stripe-checkout-order",
      limit: 4,
      windowMs: STRIPE_SESSION_RATE_WINDOW_MS,
      subject: `order:${orderId}`,
    });
    if (order.customerUid && order.customerUid !== request.auth?.uid) {
      throw new HttpsError("permission-denied", "You can only pay for your own order.");
    }
    if (String(order.paymentMethod || "") !== "stripe") {
      throw new HttpsError("failed-precondition", "This order is not set for online payment.");
    }
    if (String(order.paymentStatus || "") === "paid") {
      throw new HttpsError("failed-precondition", "This order is already paid.");
    }
    if (!Array.isArray(order.items) || !order.items.length) {
      throw new HttpsError("failed-precondition", "This order has no items.");
    }
    const paymentPolicy = await classifyOrderPaymentItems(db, order);
    if (!paymentPolicy.requiresStripe) {
      throw new HttpsError("failed-precondition", "This cart is eligible for pickup payment and is not set for online-only checkout.");
    }
    if (String(order.fulfillmentType || "pickup") === "shipping") {
      const shippingAddress = order.shippingAddress || {};
      const hasShippingAddress =
        String(shippingAddress.addressLine1 || "").trim().length >= 5 &&
        String(shippingAddress.city || "").trim().length >= 2 &&
        /^[A-Z]{2}$/i.test(String(shippingAddress.state || "").trim()) &&
        /^\d{5}(-\d{4})?$/.test(String(shippingAddress.zip || "").trim());
      if (!hasShippingAddress) {
        throw new HttpsError("failed-precondition", "Shipping address is required before online payment.");
      }
    }

    let session;
    let stripeCustomerId = "";
    const saveCard = Boolean(request.data?.saveCard && request.auth?.uid);
    const customerEmail = String(order.email || request.auth?.token?.email || "").trim().toLowerCase();
    try {
      const stripe = stripeClient();
      const existingSessionId = String(order.stripeCheckoutSessionId || "").trim();
      if (existingSessionId) {
        const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId).catch(() => null);
        if (existingSession?.status === "open" && existingSession.url) {
          return {
            url: existingSession.url,
            sessionId: existingSession.id,
            orderNumber: order.orderNumber || "",
            reused: true,
          };
        }
      }
      const origin = allowedCheckoutOrigin(request.data?.origin);
      const orderNumber = await assignSequentialOrderNumber(orderRef, order.orderNumber);
      order.orderNumber = orderNumber;

      // Server-authoritative pricing (see buildServerPricedCheckout): never trust
      // client-submitted item prices when charging the card.
      const { lineItems, itemSubtotal } = await buildServerPricedCheckout(db, order);
      const promo = await validateAndApplyPromo(db, order, itemSubtotal);
      const promoDiscount = promo?.discount || 0;
      const discountedSubtotal = roundCurrency(Math.max(0, itemSubtotal - promoDiscount));
      const salesTaxAmount = orderSalesTaxAmount(order, discountedSubtotal);
      let shippingAmount = orderShippingAmount(order, itemSubtotal);
      if (promo?.freeShipping && String(order.fulfillmentType || "pickup") === "shipping") shippingAmount = 0;
      const totalPrice = roundCurrency(discountedSubtotal + salesTaxAmount + shippingAmount);

      const metadata = {
        orderId,
        orderNumber,
        customerUid: order.customerUid || request.auth?.uid || "",
        source: "shrish_checkout",
        salesTaxAmount: String(salesTaxAmount),
        shippingAmount: String(shippingAmount),
        promoCode: promo?.code || "",
        promoDiscount: String(promoDiscount),
      };

      if (request.auth?.uid && saveCard) {
        const profileRef = db.collection("user_profiles").doc(request.auth.uid);
        const profileSnap = await profileRef.get();
        const profile = profileSnap.exists ? profileSnap.data() || {} : {};
        stripeCustomerId = String(profile.stripeCustomerId || "").trim();
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: customerEmail || undefined,
            name: order.fullName || `${order.firstName || ""} ${order.lastName || ""}`.trim() || undefined,
            phone: order.phone || undefined,
            metadata: {
              customerUid: request.auth.uid,
              source: "shrish_account",
            },
          });
          stripeCustomerId = customer.id;
          await profileRef.set({
            stripeCustomerId,
            stripeCustomerCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }

      // Line items, subtotal, tax and shipping are computed above from server
      // prices; here we only append tax/shipping as their own Stripe line items.
      if (salesTaxAmount > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeAmount(salesTaxAmount),
            product_data: {
              name: String(order.salesTaxLabel || "Virginia sales tax").slice(0, 180),
            },
          },
        });
      }
      if (shippingAmount > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeAmount(shippingAmount),
            product_data: {
              name: String(order.shippingLabel || "Standard shipping").slice(0, 180),
            },
          },
        });
      }

      const sessionConfig = {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        success_url: `${origin}/order.html?payment=success&orderId=${encodeURIComponent(orderId)}&orderNumber=${encodeURIComponent(orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/order.html?payment=cancelled&orderId=${encodeURIComponent(orderId)}`,
        metadata,
        payment_intent_data: {
          metadata,
        },
      };

      if (stripeCustomerId) {
        sessionConfig.customer = stripeCustomerId;
        if (saveCard) sessionConfig.payment_intent_data.setup_future_usage = "off_session";
      } else if (customerEmail) {
        sessionConfig.customer_email = customerEmail;
      }

      if (promoDiscount > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: toStripeAmount(promoDiscount),
          currency: "usd",
          duration: "once",
          name: `Promo ${promo.code}`.slice(0, 40),
        });
        sessionConfig.discounts = [{ coupon: coupon.id }];
      }
      session = await stripe.checkout.sessions.create(
        sessionConfig,
        { idempotencyKey: `shrish_checkout_${orderId}` }
      );
      await orderRef.set({
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: stripeCustomerId || "",
        saveCardRequested: saveCard,
        itemSubtotal,
        salesTaxAmount,
        shippingAmount,
        shippingFreeThreshold: configuredFreeShippingThreshold(),
        promoCode: promo?.code || "",
        promoDiscount,
        totalPrice,
        paymentStatus: "checkout_started",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error("Stripe checkout session creation failed", {
        orderId,
        code: error?.code || "",
        type: error?.type || "",
        message: error?.message || String(error),
      });
      throw new HttpsError("internal", error?.message || "Could not start Stripe checkout.");
    }

    posthog.capture({
      distinctId: customerEmail || request.auth?.uid || orderId,
      event: "stripe_checkout_started",
      properties: {
        order_id: orderId,
        save_card_requested: saveCard,
        amount_total: session.amount_total || 0,
      },
    });
    await posthog.flush();

    return {
      url: session.url,
      sessionId: session.id,
      orderNumber: order.orderNumber || "",
    };
  }
);

function customerOrderUnitPrice(item = {}) {
  const qty = normalizeQty(item);
  const lineTotal = normalizeLineTotal(item);
  if (lineTotal > 0 && qty > 0) return lineTotal / qty;
  return parseMoney(item.price ?? item.unitPrice ?? item.itemPrice ?? 0);
}

function cleanCustomerQty(value) {
  const qty = Math.floor(Number(value || 0));
  if (!Number.isFinite(qty)) return 0;
  return Math.min(Math.max(qty, 0), 99);
}

function customerOrderProductId(item = {}) {
  return item.productId || String(item.id || "").split("__")[0] || "";
}

function customerOrderVariantId(item = {}) {
  if (item.variantId) return item.variantId;
  const id = String(item.id || "");
  return id.includes("__") ? id.split("__")[1] : "default";
}

function customerCartItemId(productId, variantId = "default") {
  return variantId === "default" ? productId : `${productId}__${variantId}`;
}

function customerProductVariants(product = {}) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants
      .filter((variant) => variant && variant.available !== false && !variant.displayOnly)
      .map((variant, index) => ({
        id: variant.id || `opt${index + 1}`,
        label: variant.label || product.unit || "Option",
        price: variant.price || product.price || "",
        unit: variant.unit || variant.label || product.unit || "",
      }));
  }

  return [{
    id: "default",
    label: product.unit || "Default",
    price: product.price || "",
    unit: product.unit || "",
  }];
}

function buildCustomerOrderItemFromProduct(product = {}, productId, variantId, qty) {
  if (!product || product.available === false || product.displayOnly || product.hidden) {
    throw new HttpsError("failed-precondition", "This product is not available.");
  }

  const variant = customerProductVariants(product).find((item) => item.id === variantId);
  if (!variant) {
    throw new HttpsError("failed-precondition", "This product option is not available.");
  }

  const unitPrice = parseMoney(variant.price || product.price);
  if (unitPrice <= 0) {
    throw new HttpsError("failed-precondition", "This product does not have a valid price.");
  }

  return {
    id: customerCartItemId(productId, variant.id),
    productId,
    variantId: variant.id,
    name: variant.id === "default" ? (product.name || "Item") : `${product.name || "Item"} (${variant.label})`,
    price: variant.price || product.price || currency(unitPrice),
    unit: variant.unit || product.unit || "",
    image: product.image || null,
    qty,
    lineTotal: Number((unitPrice * qty).toFixed(2)),
  };
}

function normalizeOrderPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("1") ? digits.slice(1, 11) : digits.slice(0, 10);
}

exports.updateCustomerPendingOrder = onCall(
  callableOptions(),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before editing your order.");
    }

    const uid = request.auth.uid;
    const orderId = String(request.data?.orderId || "").trim();
    const action = String(request.data?.action || "").trim();
    if (!orderId) {
      throw new HttpsError("invalid-argument", "Order ID is required.");
    }

    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);

    const result = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(orderRef);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }

      const order = snapshot.data() || {};
      if (order.customerUid !== uid) {
        throw new HttpsError("permission-denied", "You can only edit your own orders.");
      }
      if (String(order.status || "pending").toLowerCase() !== "pending") {
        throw new HttpsError("failed-precondition", "Only pending orders can be changed.");
      }
      if (order.paymentMethod === "stripe" || order.paymentStatus === "paid") {
        throw new HttpsError("failed-precondition", "Online paid orders cannot be edited online yet. Please contact Shrish for help.");
      }

      if (action === "cancel") {
        tx.update(orderRef, {
          status: "cancelled",
          customerCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          customerCancelReason: String(request.data?.reason || "").trim().slice(0, 280),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const phoneDigits = normalizeOrderPhone(order.phoneDigits || order.phone || "");
        if (phoneDigits) {
          tx.set(db.collection("order_locks").doc(phoneDigits), {
            phoneDigits,
            orderId,
            status: "cancelled",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        return { status: "cancelled" };
      }

      if (action !== "update_items") {
        throw new HttpsError("invalid-argument", "Unknown order update action.");
      }

      const existingItems = Array.isArray(order.items) ? order.items : [];
      if (!existingItems.length) {
        throw new HttpsError("failed-precondition", "This order has no editable items.");
      }

      const requestedItems = Array.isArray(request.data?.items) ? request.data.items : [];
      const qtyByIndex = new Map();
      const additionsByKey = new Map();
      requestedItems.forEach((item) => {
        const index = Number(item?.index);
        const productId = String(item?.productId || "").trim();
        const variantId = String(item?.variantId || "default").trim() || "default";
        const qty = cleanCustomerQty(item?.qty);
        if (productId && qty > 0) {
          const key = `${productId}__${variantId}`;
          const current = additionsByKey.get(key) || { productId, variantId, qty: 0 };
          current.qty = cleanCustomerQty(current.qty + qty);
          additionsByKey.set(key, current);
        } else if (Number.isInteger(index) && index >= 0 && index < existingItems.length) {
          qtyByIndex.set(index, cleanCustomerQty(item?.qty));
        }
      });

      if (!qtyByIndex.size && !additionsByKey.size) {
        throw new HttpsError("invalid-argument", "At least one quantity is required.");
      }

      const updatedItems = existingItems.map((item, index) => {
        const qty = qtyByIndex.has(index) ? qtyByIndex.get(index) : cleanCustomerQty(item.qty || 1);
        const unitPrice = customerOrderUnitPrice(item);
        return {
          ...item,
          qty,
          lineTotal: Number((unitPrice * qty).toFixed(2)),
        };
      }).filter((item) => item.qty > 0);

      for (const addition of additionsByKey.values()) {
        const productSnap = await tx.get(db.collection("products").doc(addition.productId));
        if (!productSnap.exists) {
          throw new HttpsError("not-found", "Product not found.");
        }

        const product = { id: productSnap.id, ...productSnap.data() };
        const newItem = buildCustomerOrderItemFromProduct(product, addition.productId, addition.variantId, addition.qty);
        const existingIndex = updatedItems.findIndex((item) =>
          customerOrderProductId(item) === newItem.productId &&
          customerOrderVariantId(item) === newItem.variantId
        );

        if (existingIndex >= 0) {
          const existing = updatedItems[existingIndex];
          const mergedQty = cleanCustomerQty(Number(existing.qty || 0) + addition.qty);
          const unitPrice = customerOrderUnitPrice(existing) || customerOrderUnitPrice(newItem);
          updatedItems[existingIndex] = {
            ...existing,
            qty: mergedQty,
            lineTotal: Number((unitPrice * mergedQty).toFixed(2)),
          };
        } else {
          updatedItems.push(newItem);
        }
      }

      if (!updatedItems.length) {
        throw new HttpsError("failed-precondition", "Use cancel order if removing every item.");
      }

      const totals = getOrderTotals({ ...order, items: updatedItems, totalBoxes: 0, totalPrice: 0 });
      tx.update(orderRef, {
        items: updatedItems,
        totalBoxes: totals.totalBoxes,
        totalPrice: Number(totals.estimatedTotal.toFixed(2)),
        customerLastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        status: "updated",
        totalBoxes: totals.totalBoxes,
        totalPrice: Number(totals.estimatedTotal.toFixed(2)),
      };
    });

    posthog.capture({
      distinctId: request.auth.token?.email || uid,
      event: action === "cancel" ? "customer_order_cancelled" : "customer_order_updated",
      properties: {
        order_id: orderId,
        action,
      },
    });
    await posthog.flush();

    return result;
  }
);

exports.claimCustomerOrder = onCall(
  callableOptions(),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to link this order.");
    }

    const uid = request.auth.uid;
    const authEmail = String(request.auth.token?.email || "").trim().toLowerCase();
    const orderId = String(request.data?.orderId || "").trim();
    const phoneDigits = normalizeOrderPhone(request.data?.phoneDigits || request.data?.phone || "");
    if (!orderId || !phoneDigits) {
      throw new HttpsError("invalid-argument", "Order ID and phone are required.");
    }

    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);

    const result = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(orderRef);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }

      const order = snapshot.data() || {};
      const orderEmail = String(order.email || order.customerEmail || "").trim().toLowerCase();
      const orderPhone = normalizeOrderPhone(order.phoneDigits || order.phone || "");
      if (!authEmail || authEmail !== orderEmail || phoneDigits !== orderPhone) {
        throw new HttpsError("permission-denied", "Use the same email and phone from checkout to link this order.");
      }

      if (order.customerUid && order.customerUid !== uid) {
        throw new HttpsError("already-exists", "This order is already linked to another account.");
      }

      if (order.customerUid === uid) {
        return { status: "already_linked" };
      }

      tx.update(orderRef, {
        customerUid: uid,
        customerEmail: authEmail,
        customerLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { status: "linked" };
    });

    posthog.capture({
      distinctId: authEmail || uid,
      event: "customer_order_linked",
      properties: {
        order_id: orderId,
        status: result.status,
      },
    });
    await posthog.flush();

    return result;
  }
);

function cleanFeedbackChoice(value, allowed = []) {
  const text = String(value || "").trim().slice(0, 80);
  return allowed.includes(text) ? text : "";
}

function cleanFeedbackRating(value) {
  const rating = Math.floor(Number(value || 0));
  if (!Number.isFinite(rating)) return 0;
  return Math.min(Math.max(rating, 1), 5);
}

// Links a signed-in customer to their own past orders that carry no
// customerUid — guest checkouts, and orders the owner entered by hand.
//
// Without this, those orders are invisible on account.html (the read rule
// requires customerUid to match) so customers cannot see their own tracking.
//
// Ownership proof is deliberately the same as the existing single-order
// claim: the order's email must match the authenticated email AND the phone
// must match. Email alone would let anyone who knows an address claim orders.
// Marketing campaigns are deliberately NOT sent from here. Resend's free tier
// caps at 100 emails a day on a single domain; pushing a few hundred marketing
// emails through the same account would exhaust that cap and stop order
// confirmations from going out. Campaigns are exported from the CRM and sent
// from a separate provider, which also isolates marketing reputation entirely.

exports.claimMyOrders = onCall(
  callableOptions(),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to link your orders.");
    }

    const uid = request.auth.uid;
    const authEmail = String(request.auth.token?.email || "").trim().toLowerCase();
    if (!authEmail) {
      throw new HttpsError("failed-precondition", "This account has no email address.");
    }

    const db = admin.firestore();
    const profileSnap = await db.collection("user_profiles").doc(uid).get();
    const phone = normalizeOrderPhone(
      request.data?.phone || profileSnap.data()?.phone || ""
    );
    if (!phone || phone.length < 10) {
      return { claimed: 0, reason: "no_phone" };
    }

    // Query on phoneDigits: it is stored normalised, whereas email casing
    // varies with however the customer typed it.
    const snapshot = await db.collection("orders").where("phoneDigits", "==", phone).get();

    const batch = db.batch();
    let claimed = 0;

    for (const docSnap of snapshot.docs) {
      const order = docSnap.data() || {};
      if (order.customerUid) continue;
      const orderEmail = String(order.email || order.customerEmail || "").trim().toLowerCase();
      if (!orderEmail || orderEmail !== authEmail) continue;

      batch.set(docSnap.ref, {
        customerUid: uid,
        customerEmail: authEmail,
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      claimed += 1;
      if (claimed >= 400) break;   // batch limit headroom
    }

    if (claimed) await batch.commit();
    return { claimed };
  }
);

exports.submitOrderFeedback = onCall(
  callableOptions(),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to submit order feedback.");
    }

    const uid = request.auth.uid;
    const authEmail = String(request.auth.token?.email || "").trim().toLowerCase();
    const orderId = String(request.data?.orderId || "").trim();
    const responses = request.data?.responses || {};
    if (!orderId) {
      throw new HttpsError("invalid-argument", "Order ID is required.");
    }

    const overallRating = cleanFeedbackRating(responses.overallRating);
    const pickupExperience = cleanFeedbackChoice(responses.pickupExperience, [
      "Very smooth",
      "Minor wait",
      "Hard to find",
      "Had issues",
    ]);
    const reorderIntent = cleanFeedbackChoice(responses.reorderIntent, [
      "Definitely",
      "Probably",
      "Not sure",
      "Unlikely",
    ]);
    const recommend = cleanFeedbackChoice(responses.recommend, [
      "Very likely",
      "Likely",
      "Neutral",
      "Unlikely",
    ]);
    const mangoSweetness = cleanFeedbackChoice(responses.mangoSweetness, [
      "Very sweet",
      "Sweet",
      "Mild",
      "Not sweet at all",
    ]);
    const mangoRipeness = cleanFeedbackChoice(responses.mangoRipeness, [
      "Perfectly ripe",
      "Slightly underripe",
      "A bit overripe",
      "Mixed",
    ]);
    const itemCondition = cleanFeedbackChoice(responses.itemCondition, [
      "Excellent",
      "Good",
      "Okay",
      "Had issues",
    ]);
    const comment = String(responses.comment || "").trim().slice(0, 500);

    if (!overallRating || !pickupExperience || !reorderIntent || !recommend) {
      throw new HttpsError("invalid-argument", "Please answer all required feedback questions.");
    }

    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);
    const feedbackRef = db.collection("order_feedback").doc(`${orderId}_${uid}`);

    const result = await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }

      const order = orderSnap.data() || {};
      if (order.customerUid !== uid) {
        throw new HttpsError("permission-denied", "You can only submit feedback for your own orders.");
      }

      const existingFeedback = await tx.get(feedbackRef);
      if (existingFeedback.exists) {
        throw new HttpsError("already-exists", "Feedback was already submitted for this order.");
      }

      const payload = {
        orderId,
        orderNumber: order.orderNumber || "",
        customerUid: uid,
        customerEmail: authEmail,
        location: order.location || "",
        locationLabel: order.locationLabel || "",
        items: Array.isArray(order.items)
          ? order.items.map((item) => ({
              id: item.id || "",
              name: item.name || "Item",
              qty: normalizeQty(item),
            }))
          : [],
        hasMangoItems: Boolean(request.data?.hasMangoItems),
        responses: {
          overallRating,
          pickupExperience,
          reorderIntent,
          recommend,
          mangoSweetness,
          mangoRipeness,
          itemCondition,
          comment,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      tx.set(feedbackRef, payload);
      tx.update(orderRef, {
        feedbackSubmitted: true,
        feedbackSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
        feedbackRating: overallRating,
        feedbackResponses: payload.responses,
        feedbackHasMangoItems: payload.hasMangoItems,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { status: "submitted" };
    });

    posthog.capture({
      distinctId: authEmail || uid,
      event: "customer_order_feedback_submitted",
      properties: {
        order_id: orderId,
        overall_rating: overallRating,
        recommend,
      },
    });
    await posthog.flush();

    return result;
  }
);

exports.deleteCustomerAccount = onCall(
  callableOptions(),
  async (request) => {
    if (!request.auth || !isAdminRequest(request)) {
      throw new HttpsError("permission-denied", "Admin access is required.");
    }

    const uid = String(request.data?.uid || "").trim();
    if (!uid) {
      throw new HttpsError("invalid-argument", "Customer UID is required.");
    }
    if (uid === request.auth.uid) {
      throw new HttpsError("failed-precondition", "Admin account cannot be deleted here.");
    }

    const db = admin.firestore();
    const profileRef = db.collection("user_profiles").doc(uid);
    const profileSnapshot = await profileRef.get();
    const profile = profileSnapshot.exists ? profileSnapshot.data() || {} : {};
    const email = String(profile.email || "").trim().toLowerCase();
    const phoneDigits = normalizeOrderPhone(profile.phoneDigits || profile.phone || "");

    if (email === SHRISH_ADMIN_EMAIL) {
      throw new HttpsError("failed-precondition", "Admin account cannot be deleted here.");
    }

    const orderChecks = [
      db.collection("orders").where("customerUid", "==", uid).limit(1).get(),
    ];
    if (email) {
      orderChecks.push(db.collection("orders").where("email", "==", email).limit(1).get());
      orderChecks.push(db.collection("orders").where("customerEmail", "==", email).limit(1).get());
    }
    if (phoneDigits) {
      orderChecks.push(db.collection("orders").where("phoneDigits", "==", phoneDigits).limit(1).get());
    }

    const orderSnapshots = await Promise.all(orderChecks);
    if (orderSnapshots.some((snapshot) => !snapshot.empty)) {
      throw new HttpsError("failed-precondition", "Customer has order history and cannot be deleted.");
    }

    await profileRef.delete().catch(() => null);
    await admin.auth().deleteUser(uid).catch((error) => {
      if (error?.code !== "auth/user-not-found") throw error;
    });

    posthog.capture({
      distinctId: request.auth.token.email,
      event: "admin_customer_account_deleted",
      properties: { customer_uid: uid },
    });
    await posthog.flush();

    return { status: "deleted" };
  }
);

// Personal data is purged this many days after a customer requests deletion.
// Sales/order records are anonymized (not deleted) and kept ~7 years for IRS.
const PII_PURGE_DAYS = 90;

// Customer-initiated account deletion. Requires the customer to be signed in and
// to type "Shrish" to confirm. Saved cards are removed and login is disabled
// immediately; personal data is purged after PII_PURGE_DAYS by a scheduled job.
exports.requestAccountDeletion = onCall(
  callableOptions({ secrets: [STRIPE_SECRET_KEY] }),
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in to delete your account.");
    }
    const confirmText = String(request.data?.confirm || "").trim();
    if (confirmText.toLowerCase() !== "shrish") {
      throw new HttpsError("failed-precondition", 'Type "Shrish" exactly to confirm account deletion.');
    }

    const db = admin.firestore();
    const profileRef = db.collection("user_profiles").doc(uid);
    const snapshot = await profileRef.get();
    const profile = snapshot.exists ? snapshot.data() || {} : {};

    if (String(profile.email || "").trim().toLowerCase() === SHRISH_ADMIN_EMAIL) {
      throw new HttpsError("failed-precondition", "This account cannot be deleted here.");
    }

    // 1) Remove saved cards / Stripe customer immediately.
    const stripeCustomerId = String(profile.stripeCustomerId || "").trim();
    if (stripeCustomerId) {
      try {
        await stripeClient().customers.del(stripeCustomerId);
      } catch (error) {
        console.warn("requestAccountDeletion: Stripe customer delete failed", { uid, message: error?.message });
      }
    }

    // 2) Flag the profile for a scheduled personal-data purge. Identity fields
    //    stay visible to admin until the purge; the Stripe reference is dropped now.
    const now = admin.firestore.Timestamp.now();
    const purgeAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + PII_PURGE_DAYS * 24 * 60 * 60 * 1000
    );
    await profileRef.set(
      {
        status: "deletion_requested",
        deletionRequestedAt: now,
        piiPurgeAt: purgeAt,
        stripeCustomerId: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );

    // 3) Disable login immediately so the account is effectively closed.
    try {
      await admin.auth().updateUser(uid, { disabled: true });
    } catch (error) {
      console.warn("requestAccountDeletion: auth disable failed", { uid, message: error?.message });
    }

    try {
      posthog.capture({
        distinctId: String(profile.email || uid),
        event: "customer_account_deletion_requested",
        properties: { customer_uid: uid, purge_at: purgeAt.toDate().toISOString() },
      });
      await posthog.flush();
    } catch (_) {}

    return {
      status: "deletion_requested",
      purgeAt: purgeAt.toDate().toISOString(),
      purgeDays: PII_PURGE_DAYS,
    };
  }
);

// Daily job: permanently remove personal data for accounts whose purge window
// has elapsed. Orders are ANONYMIZED (not deleted) so the sales/tax record
// survives ~7 years for IRS compliance.
exports.purgeDeletedAccounts = onSchedule(
  { schedule: "every day 03:15", timeZone: "America/New_York", region: "us-central1" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const due = await db
      .collection("user_profiles")
      .where("status", "==", "deletion_requested")
      .where("piiPurgeAt", "<=", now)
      .limit(200)
      .get();

    if (due.empty) {
      console.log("purgeDeletedAccounts: nothing due");
      return;
    }

    let purged = 0;
    for (const doc of due.docs) {
      const uid = doc.id;
      try {
        // Anonymize this customer's orders (retain financial record ~7 years).
        const orders = await db.collection("orders").where("customerUid", "==", uid).get();
        for (let i = 0; i < orders.docs.length; i += 400) {
          const batch = db.batch();
          orders.docs.slice(i, i + 400).forEach((orderDoc) => {
            batch.update(orderDoc.ref, {
              firstName: "[deleted]",
              lastName: "",
              fullName: "[deleted customer]",
              email: "",
              customerEmail: "",
              phone: "",
              phoneDigits: "",
              shippingAddress: admin.firestore.FieldValue.delete(),
              customerUid: admin.firestore.FieldValue.delete(),
              piiRedactedAt: now,
            });
          });
          await batch.commit();
        }

        // Remove the auth user and the profile document — personal data gone.
        await admin.auth().deleteUser(uid).catch((error) => {
          if (error?.code !== "auth/user-not-found") throw error;
        });
        await doc.ref.delete();
        purged += 1;
      } catch (error) {
        console.error("purgeDeletedAccounts: failed for", uid, error?.message);
      }
    }
    console.log(`purgeDeletedAccounts: purged ${purged}/${due.size}`);
  }
);

// Admin-only: issue a partial or full Stripe refund against an order's payment.
// Guardrails: admin auth, positive amount, and never refund more than the amount
// still refundable on the Stripe charge (prevents over-refunds and double-refunds).
exports.issueStripeRefund = onCall(
  callableOptions({ secrets: [STRIPE_SECRET_KEY] }),
  async (request) => {
    if (!request.auth || !isAdminRequest(request)) {
      throw new HttpsError("permission-denied", "Admin access is required.");
    }
    const paymentIntentId = String(request.data?.paymentIntentId || "").trim();
    const orderId = String(request.data?.orderId || "").trim();
    const orderNumber = String(request.data?.orderNumber || "").trim();
    const reason = String(request.data?.reason || "").trim().slice(0, 200);
    const amountDollars = Number(request.data?.amount);

    if (!paymentIntentId) {
      throw new HttpsError("invalid-argument", "This order has no online payment to refund.");
    }
    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      throw new HttpsError("invalid-argument", "Enter a valid refund amount.");
    }
    const amountCents = Math.round(amountDollars * 100);

    const stripe = stripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const captured = Number(charge?.amount ?? intent?.amount ?? 0);
    const refundedSoFar = Number(charge?.amount_refunded ?? 0);
    const remainingCents = captured - refundedSoFar;

    if (remainingCents <= 0) {
      throw new HttpsError("failed-precondition", "This payment has already been fully refunded.");
    }
    if (amountCents > remainingCents) {
      throw new HttpsError(
        "failed-precondition",
        `Only $${(remainingCents / 100).toFixed(2)} is left to refund on this payment.`
      );
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      metadata: { orderId, orderNumber, reason, issuedBy: request.auth.token?.email || "" },
    });

    // Record the refund on the order for the admin / accounting trail.
    if (orderId) {
      try {
        await admin.firestore().collection("orders").doc(orderId).set(
          {
            refundedAmount: admin.firestore.FieldValue.increment(amountCents / 100),
            lastRefundAt: admin.firestore.FieldValue.serverTimestamp(),
            refundHistory: admin.firestore.FieldValue.arrayUnion({
              amount: amountCents / 100,
              reason,
              stripeRefundId: refund.id,
              issuedBy: request.auth.token?.email || "",
              at: new Date().toISOString(),
            }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.warn("issueStripeRefund: order record update failed", { orderId, message: error?.message });
      }
    }

    try {
      posthog.capture({
        distinctId: request.auth.token?.email || "admin",
        event: "admin_stripe_refund_issued",
        properties: { order_id: orderId, amount: amountCents / 100, stripe_refund_id: refund.id },
      });
      await posthog.flush();
    } catch (_) {}

    return {
      status: refund.status,
      refundId: refund.id,
      amount: amountCents / 100,
      remaining: (remainingCents - amountCents) / 100,
    };
  }
);

exports.sendCustomerPasswordReset = onCall(
  callableOptions({
    secrets: [RESEND_API_KEY],
  }),
  async (request) => {
    const email = String(request.data?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    let resetLink = "";
    try {
      await admin.auth().getUserByEmail(email);
      const firebaseResetLink = await admin.auth().generatePasswordResetLink(email);
      const parsedLink = new URL(firebaseResetLink);
      const oobCode = parsedLink.searchParams.get("oobCode");
      resetLink = oobCode
        ? `https://shrish.co/account.html?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`
        : firebaseResetLink;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        console.error("Could not generate password reset link", error);
        throw new HttpsError("internal", "Could not send password reset right now.");
      }
    }

    if (resetLink) {
      const resend = new Resend(RESEND_API_KEY.value());
      await resend.emails.send({
        from: SHRISH_FROM_EMAIL,
        to: [email],
        subject: "Reset your Shrish password",
        html: buildPasswordResetEmail(email, resetLink),
      });

      posthog.capture({
        distinctId: email,
        event: "customer_password_reset_email_sent",
      });
      await posthog.flush();
    }

    return { status: "accepted" };
  }
);

exports.getOwnerAnalytics = onCall(
  callableOptions({
    secrets: [POSTHOG_PERSONAL_API_KEY],
    timeoutSeconds: 45,
    memory: "512MiB",
  }),
  async (request) => {
    if (!isAdminRequest(request)) {
      throw new HttpsError("permission-denied", "Only the Shrish admin can view owner analytics.");
    }

    const rawDays = Number(request.data?.days || 30);
    const days = Math.min(90, Math.max(7, Number.isFinite(rawDays) ? Math.round(rawDays) : 30));
    const sinceClause = `timestamp >= now() - INTERVAL ${days} DAY`;
    const trackedEvents = [
      "page_viewed",
      "home_viewed",
      "shop_viewed",
      "product_details_opened",
      "product_added_to_cart",
      "cart_opened",
      "checkout_started",
      "checkout_viewed",
      "order_submit_attempted",
      "pickup_location_selected",
      "checkout_payment_method_selected",
      "order_submitted",
      "order_item_submitted",
      "order_submit_failed",
      "order_confirmed",
      "stripe_checkout_started",
      "product_detail_time_spent",
    ];
    const eventList = trackedEvents.map((event) => `'${event}'`).join(", ");

    if (!postHogPersonalApiKey()) {
      return {
        connected: false,
        days,
        projectId: postHogProjectId(),
        posthogHost: normalizedPostHogApiHost(process.env.POSTHOG_HOST),
        missing: ["POSTHOG_PERSONAL_API_KEY"],
        setup: [
          "Create a PostHog personal API key with query:read access.",
          "Save it as the Firebase secret POSTHOG_PERSONAL_API_KEY.",
          "Optional: set POSTHOG_PROJECT_ID if the project changes from 409686.",
          "Redeploy Firebase Functions, then refresh this Growth tab.",
        ],
      };
    }

    try {
      const [eventCounts, topPages, clickedProducts, addedProducts, adFunnel] = await Promise.all([
        runPostHogHogql(`
          SELECT event, count() AS total_events, uniq(distinct_id) AS unique_people
          FROM events
          WHERE ${sinceClause}
            AND event IN (${eventList})
          GROUP BY event
          ORDER BY total_events DESC
        `, "owner dashboard event counts"),
        runPostHogHogql(`
          SELECT
            coalesce(
              nullIf(toString(properties.page_path), ''),
              nullIf(toString(properties.$pathname), ''),
              nullIf(toString(properties.$current_url), ''),
              'Unknown page'
            ) AS page,
            count() AS views,
            uniq(distinct_id) AS visitors
          FROM events
          WHERE ${sinceClause}
            AND event = 'page_viewed'
          GROUP BY page
          ORDER BY views DESC
          LIMIT 60
        `, "owner dashboard top pages"),
        runPostHogHogql(`
          SELECT
            coalesce(nullIf(toString(properties.product_title), ''), 'Unknown product') AS product_title,
            coalesce(nullIf(toString(properties.product_id), ''), '') AS product_id,
            coalesce(nullIf(toString(properties.category), ''), '') AS category,
            coalesce(nullIf(toString(properties.filter_group), ''), '') AS filter_group,
            count() AS clicks,
            uniq(distinct_id) AS people
          FROM events
          WHERE ${sinceClause}
            AND event = 'product_details_opened'
          GROUP BY product_title, product_id, category, filter_group
          ORDER BY clicks DESC
          LIMIT 60
        `, "owner dashboard clicked products"),
        runPostHogHogql(`
          SELECT
            coalesce(nullIf(toString(properties.product_title), ''), 'Unknown product') AS product_title,
            coalesce(nullIf(toString(properties.product_id), ''), '') AS product_id,
            coalesce(nullIf(toString(properties.category), ''), '') AS category,
            coalesce(nullIf(toString(properties.filter_group), ''), '') AS filter_group,
            count() AS adds,
            uniq(distinct_id) AS people
          FROM events
          WHERE ${sinceClause}
            AND event = 'product_added_to_cart'
          GROUP BY product_title, product_id, category, filter_group
          ORDER BY adds DESC
          LIMIT 12
        `, "owner dashboard added products"),
        runPostHogHogql(`
          WITH ad_people AS (
            SELECT DISTINCT distinct_id
            FROM events
            WHERE ${sinceClause}
              AND (
                ifNull(toString(properties.fbclid), '') != ''
                OR lower(ifNull(toString(properties.utm_source), '')) IN ('meta','facebook','fb','instagram','ig','an')
              )
          )
          SELECT
            uniqIf(distinct_id, event = 'page_viewed') AS visitors,
            uniqIf(distinct_id, event = 'product_details_opened') AS product_clicks,
            uniqIf(distinct_id, event = 'product_added_to_cart') AS cart_adds,
            uniqIf(distinct_id, event IN ('checkout_started','checkout_viewed')) AS reached_checkout,
            uniqIf(distinct_id, event IN ('order_submitted','order_confirmed')) AS orders
          FROM events
          WHERE ${sinceClause}
            AND distinct_id IN (SELECT distinct_id FROM ad_people)
        `, "owner dashboard ad funnel").catch((e) => { console.error("ad funnel query failed", e && e.message); return { rows: [] }; }),
      ]);

      return {
        connected: true,
        days,
        projectId: postHogProjectId(),
        posthogHost: normalizedPostHogApiHost(process.env.POSTHOG_HOST),
        updatedAt: new Date().toISOString(),
        eventCounts: rowsToObjects(eventCounts.rows, ["event", "totalEvents", "uniquePeople"]),
        topPages: rowsToObjects(topPages.rows, ["page", "views", "visitors"]),
        clickedProducts: rowsToObjects(clickedProducts.rows, ["productTitle", "productId", "category", "filterGroup", "clicks", "people"]),
        addedProducts: rowsToObjects(addedProducts.rows, ["productTitle", "productId", "category", "filterGroup", "adds", "people"]),
        adFunnel: rowsToObjects(adFunnel.rows, ["visitors", "productClicks", "cartAdds", "reachedCheckout", "orders"])[0] || {},
      };
    } catch (error) {
      console.error("Owner analytics query failed", error);
      throw new HttpsError("unavailable", error.message || "PostHog analytics could not be loaded.");
    }
  }
);

function formatDeliveryWindowLabel(from, to) {
  const pretty = (value) => {
    const parts = String(value || "").split("-").map((part) => parseInt(part, 10));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return "";
    return new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };
  const start = pretty(from);
  const end = pretty(to);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || "";
}

function buildShipmentEmail(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstName = escapeHtml(order.firstName || "there");
  const orderNumber = escapeHtml(order.orderNumber || "");
  const carrierLabel = escapeHtml(order.carrierLabel || order.carrier || "Carrier");
  const trackingNumber = escapeHtml(order.trackingNumber || "");
  const trackingUrl = String(order.trackingUrl || "").trim();
  const deliveryWindow = escapeHtml(formatDeliveryWindowLabel(order.estimatedDeliveryFrom, order.estimatedDeliveryTo));

  const address = order.shippingAddress || {};
  const addressLines = [
    order.fullName || `${order.firstName || ""} ${order.lastName || ""}`.trim(),
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.zip].filter(Boolean).join(", "),
  ].filter((line) => String(line || "").trim()).map((line) => escapeHtml(String(line).trim()));

  const { totalBoxes, estimatedTotal } = getOrderTotals(order);
  const itemRows = buildItemsRows(items);

  return `
  <html>
    <body style="margin:0; padding:0; background:#ece7df; font-family: Arial, Helvetica, sans-serif; color:#2b2218;">
      <div style="padding:32px 12px;">
        <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <div style="background:#b87512; padding:28px 24px 24px; text-align:center;">
            <img src="${SHRISH_LOGO_URL}" alt="Shrish" style="display:block; width:120px; height:120px; object-fit:contain; margin:0 auto 16px auto;" />
            <div style="font-size:12px; letter-spacing:1.6px; font-weight:700; color:#f8ebd4; text-transform:uppercase;">SHRISH LLC</div>
            <div style="margin-top:10px; font-size:20px; line-height:1.3; font-weight:700; color:#ffffff;">
              Your order is on its way
            </div>
            <div style="margin-top:10px; font-size:14px; line-height:1.6; color:#fff3df; max-width:520px; margin-left:auto; margin-right:auto;">
              Order ${orderNumber} has shipped${deliveryWindow ? ` and should reach you ${deliveryWindow}` : ""}.
            </div>
          </div>

          <div style="padding:24px;">
            <p style="margin:0 0 18px; font-size:15px; line-height:1.6;">Hi ${firstName},</p>
            <p style="margin:0 0 22px; font-size:15px; line-height:1.7;">
              Your Shrish order is packed and handed to ${carrierLabel}. You can follow it with the tracking number below.
            </p>

            <div style="background:#f6f1e8; border-radius:14px; padding:18px; margin-bottom:22px; text-align:center;">
              <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#7a6853;">${carrierLabel} tracking</div>
              <div style="font-size:18px; font-weight:700; margin:6px 0 4px; color:#2b2218; word-break:break-all;">${trackingNumber}</div>
              ${deliveryWindow ? `<div style="font-size:13px; color:#6b5842; margin-bottom:14px;">Expected ${deliveryWindow}</div>` : '<div style="margin-bottom:14px;"></div>'}
              ${trackingUrl ? `<a href="${trackingUrl}" style="display:inline-block; background:#b87512; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:12px 28px; border-radius:50px;">Track your package</a>` : ""}
            </div>

            ${addressLines.length ? `<div style="background:#ffffff; border:1px solid #ecd9b6; border-radius:14px; padding:16px 18px; margin-bottom:22px;">
              <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:#2b2218;">Shipping to</div>
              <div style="font-size:14px; line-height:1.7; color:#3d3225;">${addressLines.join("<br />")}</div>
              <div style="font-size:12px; color:#7a6853; margin-top:10px;">If anything here is wrong, reply to this email straight away.</div>
            </div>` : ""}

            <table style="width:100%; border-collapse:collapse; margin:0 0 24px;">
              <thead>
                <tr style="background:#efe8dd;">
                  <th style="text-align:left; padding:10px 12px; font-size:13px; color:#4d3c22;">Item</th>
                  <th style="text-align:center; padding:10px 12px; font-size:13px; color:#4d3c22;">Qty</th>
                  <th style="text-align:right; padding:10px 12px; font-size:13px; color:#4d3c22;">Price</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
              <tfoot>
                <tr>
                  <td style="padding-top:16px; font-size:14px; font-weight:700; color:#2b2218;">Total</td>
                  <td style="padding-top:16px; text-align:center; font-size:14px; font-weight:700; color:#2b2218;">${totalBoxes}</td>
                  <td style="padding-top:16px; text-align:right; font-size:14px; font-weight:700; color:#2b2218;">${currency(estimatedTotal)}</td>
                </tr>
              </tfoot>
            </table>

            <div style="background:#f6f1e8; border-radius:14px; padding:16px 18px; margin-bottom:18px;">
              <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:#2b2218;">When it arrives</div>
              <div style="font-size:14px; line-height:1.7; color:#3d3225;">
                Unpack your order soon after delivery. Pickles keep best in a cool, dry place and stay good for months —
                always use a clean, dry spoon. Sweets and snacks are freshest in the first couple of weeks; keep them in an
                airtight container. Anything you will not finish quickly can go in the fridge.
              </div>
            </div>

            <div style="font-size:14px; line-height:1.8; color:#2b2218;">
              <div><strong>Phone:</strong> ${escapeHtml(SHRISH_SUPPORT_PHONE)}</div>
              <div><strong>WhatsApp:</strong> <a href="${SHRISH_WHATSAPP_URL}" style="color:#1e63c6; text-decoration:none;">${SHRISH_WHATSAPP_URL}</a></div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

function buildPaymentRetryEmail(order, payUrl) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstName = escapeHtml(order.firstName || "there");
  const total = parseMoney(order.totalPrice) || getOrderTotals(order).estimatedTotal;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F7F1E6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#2B1B0E">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="text-align:center;padding-bottom:16px">
      <img src="${SHRISH_LOGO_URL}" alt="Shrish" width="72" style="display:block;margin:0 auto" />
    </div>
    <div style="background:#FFFFFF;border-radius:14px;padding:26px">
      <h1 style="margin:0 0 12px;font-size:21px;color:#8A5A12">Your Shrish cart is still waiting</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
        Hi ${firstName}, it looks like your order did not finish going through. Nothing has been charged.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        If you would still like it, you can complete the payment below. If you have changed your mind, no action is needed and you can ignore this email.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
        ${buildItemsRows(items)}
      </table>
      <p style="margin:6px 0 22px;font-size:16px;font-weight:700;text-align:right">
        Total: $${total.toFixed(2)}
      </p>

      <div style="text-align:center;margin:0 0 8px">
        <a href="${payUrl}" style="display:inline-block;background:#C8791A;color:#FFFFFF;text-decoration:none;padding:14px 30px;border-radius:10px;font-size:16px;font-weight:700">
          Complete your payment
        </a>
      </div>
      <p style="margin:14px 0 0;font-size:12px;color:#7A6A58;text-align:center">
        This payment link is valid for 24 hours.
      </p>
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#7A6A58;text-align:center;line-height:1.6">
      Questions? Reply to this email or call ${escapeHtml(SHRISH_SUPPORT_PHONE)}.<br />
      Shrish LLC
    </p>
  </div>
</body></html>`;
}

// Abandoned checkout recovery. Admin-only, manual, one email per order ever.
//
// Deliberately separate from createStripeCheckoutSession rather than refactoring
// it: that function is the live customer payment path and carries an ownership
// check (customerUid must match the caller) that an admin can never satisfy.
// The pricing helpers are shared, so prices stay server-authoritative here too.
exports.resendPaymentLink = onCall(
  callableOptions({
    secrets: [STRIPE_SECRET_KEY, RESEND_API_KEY],
  }),
  async (request) => {
    if (!isAdminRequest(request)) {
      throw new HttpsError("permission-denied", "Admin access is required.");
    }
    if (!STRIPE_PAYMENTS_ENABLED) {
      throw new HttpsError("failed-precondition", "Online card payments are currently disabled.");
    }

    const orderId = String(request.data?.orderId || "").trim();
    if (!orderId) throw new HttpsError("invalid-argument", "Order ID is required.");

    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");

    const order = orderSnap.data() || {};

    // Never touch an order that has been paid, refunded or closed out.
    if (String(order.paymentStatus || "") === "paid") {
      throw new HttpsError("failed-precondition", "This order is already paid.");
    }
    if (["fulfilled", "cancelled", "no_show"].includes(String(order.status || ""))) {
      throw new HttpsError("failed-precondition", "This order is already closed.");
    }
    if (String(order.paymentMethod || "") !== "stripe") {
      throw new HttpsError("failed-precondition", "This order was not set up for online payment.");
    }
    if (!Array.isArray(order.items) || !order.items.length) {
      throw new HttpsError("failed-precondition", "This order has no items.");
    }
    if (!String(order.email || "").trim()) {
      throw new HttpsError("failed-precondition", "This order has no email address. Call them instead.");
    }
    // One recovery email per order, ever. Enforced here, not by memory.
    if (order.paymentRetryEmailSentAt) {
      throw new HttpsError("already-exists", "A payment retry email was already sent for this order.");
    }

    let payUrl = "";
    try {
      const stripe = stripeClient();
      const origin = allowedCheckoutOrigin(request.data?.origin);
      const orderNumber = await assignSequentialOrderNumber(orderRef, order.orderNumber);
      order.orderNumber = orderNumber;

      const { lineItems, itemSubtotal } = await buildServerPricedCheckout(db, order);
      const promo = await validateAndApplyPromo(db, order, itemSubtotal);
      const promoDiscount = promo?.discount || 0;
      const discountedSubtotal = roundCurrency(Math.max(0, itemSubtotal - promoDiscount));
      const salesTaxAmount = orderSalesTaxAmount(order, discountedSubtotal);
      let shippingAmount = orderShippingAmount(order, itemSubtotal);
      if (promo?.freeShipping && String(order.fulfillmentType || "pickup") === "shipping") shippingAmount = 0;
      const totalPrice = roundCurrency(discountedSubtotal + salesTaxAmount + shippingAmount);

      if (salesTaxAmount > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeAmount(salesTaxAmount),
            product_data: { name: String(order.salesTaxLabel || "Virginia sales tax").slice(0, 180) },
          },
        });
      }
      if (shippingAmount > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeAmount(shippingAmount),
            product_data: { name: String(order.shippingLabel || "Standard shipping").slice(0, 180) },
          },
        });
      }

      const metadata = {
        orderId,
        orderNumber,
        customerUid: order.customerUid || "",
        source: "shrish_payment_retry",
        salesTaxAmount: String(salesTaxAmount),
        shippingAmount: String(shippingAmount),
        promoCode: promo?.code || "",
        promoDiscount: String(promoDiscount),
      };

      const sessionConfig = {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        // 24 hours, so the link in the email cannot outlive its own promise.
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        success_url: `${origin}/order.html?payment=success&orderId=${encodeURIComponent(orderId)}&orderNumber=${encodeURIComponent(orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/order.html?payment=cancelled&orderId=${encodeURIComponent(orderId)}`,
        customer_email: String(order.email).trim().toLowerCase(),
        metadata,
        payment_intent_data: { metadata },
      };

      if (promoDiscount > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: toStripeAmount(promoDiscount),
          currency: "usd",
          duration: "once",
          name: `Promo ${promo.code}`.slice(0, 40),
        });
        sessionConfig.discounts = [{ coupon: coupon.id }];
      }

      // Distinct idempotency key: the original checkout used shrish_checkout_<id>
      // with different parameters, and reusing it would make Stripe error.
      const session = await stripe.checkout.sessions.create(
        sessionConfig,
        { idempotencyKey: `shrish_retry_${orderId}` }
      );

      payUrl = session.url;
      order.totalPrice = totalPrice;

      await orderRef.set({
        stripeCheckoutSessionId: session.id,
        itemSubtotal,
        salesTaxAmount,
        shippingAmount,
        promoCode: promo?.code || "",
        promoDiscount,
        totalPrice,
        paymentStatus: "retry_link_sent",
        status: "awaiting_payment",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error("Payment retry link creation failed", { orderId, message: error?.message });
      throw asHttpsError(error);
    }

    try {
      const resend = new Resend(RESEND_API_KEY.value());
      await resend.emails.send({
        from: SHRISH_FROM_EMAIL,
        to: [String(order.email).trim()],
        subject: "Your Shrish cart is still waiting",
        html: buildPaymentRetryEmail(order, payUrl),
      });
    } catch (error) {
      console.error("Payment retry email send failed", { orderId, message: error?.message });
      throw new HttpsError("internal", "The payment link was created but the email could not be sent.");
    }

    // Stamped only after a successful send, so a failed send can be retried.
    await orderRef.set({
      paymentRetryEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentRetryEmailSentBy: request.auth?.token?.email || "admin",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, orderNumber: order.orderNumber || "", email: order.email };
  }
);

exports.stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY],
  },
  async (request, response) => {
    if (!STRIPE_PAYMENTS_ENABLED) {
      response.status(404).send("Stripe payments are disabled.");
      return;
    }

    const signature = request.headers["stripe-signature"];
    if (!signature) {
      response.status(400).send("Missing Stripe signature");
      return;
    }

    let event;
    try {
      event = stripeClient().webhooks.constructEvent(
        request.rawBody,
        signature,
        normalizedSecret(STRIPE_WEBHOOK_SECRET)
      );
    } catch (error) {
      console.error("Stripe webhook signature verification failed", error);
      response.status(400).send("Invalid Stripe signature");
      return;
    }

    const db = admin.firestore();

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const orderId = String(session.metadata?.orderId || "").trim();
        if (!orderId) {
          response.json({ received: true, skipped: "missing_order_id" });
          return;
        }

        const orderRef = db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          response.json({ received: true, skipped: "missing_order" });
          return;
        }

        const order = orderSnap.data() || {};
        await orderRef.set({
          payment: "paid",
          paymentMethod: "stripe",
          paymentMethodLabel: "Paid online",
          paymentStatus: "paid",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
          stripeCustomerId: typeof session.customer === "string" ? session.customer : (order.stripeCustomerId || ""),
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "pending",
          skipCustomerEmail: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        if (order.promoCode) {
          await recordPromoRedemption(db, order, orderId);
        }

        if (order.phoneDigits) {
          await db.collection("order_locks").doc(order.phoneDigits).set({
            phoneDigits: order.phoneDigits,
            orderId,
            status: "pending",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        await sendOrderConfirmationEmails(orderRef, {
          ...order,
          payment: "paid",
          paymentMethod: "stripe",
          paymentMethodLabel: "Paid online",
          paymentStatus: "paid",
        }, "stripe_paid");
      }

      if (event.type === "checkout.session.expired") {
        const session = event.data.object;
        const orderId = String(session.metadata?.orderId || "").trim();
        if (orderId) {
          await db.collection("orders").doc(orderId).set({
            paymentStatus: "expired",
            status: "payment_expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }

      response.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook handling failed", error);
      posthog.captureException(error, "stripe_webhook", {
        event_type: event.type,
      });
      await posthog.flush();
      response.status(500).send("Webhook handler failed");
    }
  }
);

exports.sendOrderEmails = onDocumentCreated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const orderRef = snapshot.ref;
    const order = snapshot.data();
    // Website orders are untrusted Firestore creates until finalizeWebsiteOrder
    // validates them, applies rate limits, and dispatches pickup confirmation.
    if (order?.source === "website" || order?.source === "admin_manual" || order?.skipCustomerEmail) return;
    if (!order || !order.email) return;

    // Pickup orders redeem the promo at order time; online orders redeem on payment (webhook).
    if (order.promoCode && order.paymentMethod !== "stripe") {
      await recordPromoRedemption(admin.firestore(), order, event.params?.orderId);
    }

    await sendOrderConfirmationEmails(orderRef, order, "order_created");
  }
);

// Emails the customer their tracking details.
//
// Fires when the tracking number CHANGES and no email has gone out yet, or when
// shipmentEmailSentAt is explicitly cleared (the admin "Resend" action).
//
// An earlier version also refused to fire whenever the order already had any
// tracking number. That was wrong: if the first save happened before this
// function was deployed, or the send failed, the order became permanently
// unemailable and re-saving the tracking number did nothing. shipmentEmailSentAt
// alone is sufficient to prevent duplicates.
exports.sendShipmentEmail = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const afterSnapshot = event.data?.after;
    const after = afterSnapshot?.data() || {};
    if (!afterSnapshot) return;

    const beforeTracking = String(before.trackingNumber || "").trim();
    const afterTracking = String(after.trackingNumber || "").trim();

    if (!afterTracking) return;              // nothing to announce
    if (after.shipmentEmailSentAt) return;   // already told them; the one real duplicate guard

    // Two ways to trigger: the tracking number changed, or the admin pressed
    // "send now" / "resend", which writes a new shipmentEmailRequestedAt.
    const trackingChanged = afterTracking !== beforeTracking;
    const resendRequested =
      String(after.shipmentEmailRequestedAt || "") !== String(before.shipmentEmailRequestedAt || "");
    if (!trackingChanged && !resendRequested) return;

    if (after.isTestOrder) return;           // never email a test order
    if (String(after.fulfillmentType || "pickup") !== "shipping") return;
    if (["cancelled", "no_show"].includes(String(after.status || ""))) return;
    if (String(after.paymentStatus || "") === "awaiting_payment") return;

    const email = String(after.email || "").trim();
    if (!email) return;

    try {
      const resend = new Resend(RESEND_API_KEY.value());
      await resend.emails.send({
        from: SHRISH_FROM_EMAIL,
        to: [email],
        subject: `Your Shrish order is on its way — ${after.orderNumber || "shipped"}`,
        html: buildShipmentEmail(after),
      });
    } catch (error) {
      console.error("Shipment email send failed", {
        orderId: event.params?.orderId,
        message: error?.message,
      });
      return; // leave unstamped so a corrected retry can still send
    }

    await afterSnapshot.ref.set({
      shipmentEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
);

exports.sendFinalizedWebsiteOrderEmails = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const afterSnapshot = event.data?.after;
    const after = afterSnapshot?.data() || {};
    if (!afterSnapshot) return;
    if (
      before.websiteFinalizationState === "complete"
      || after.websiteFinalizationState !== "complete"
      || after.source !== "website"
      || after.paymentMethod === "stripe"
      || after.skipCustomerEmail
      || after.confirmationEmailSentAt
    ) {
      return;
    }

    await sendOrderConfirmationEmails(afterSnapshot.ref, after, "website_finalize");
  }
);
