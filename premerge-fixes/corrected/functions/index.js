const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const { PostHog } = require("posthog-node");
const Stripe = require("stripe");

admin.initializeApp();

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
const SHRISH_SITE_URL = "https://shrish.co";
const ORDER_COUNTER_START = 671499;
const MAX_REMINDER_EMAILS_PER_SEND = 50;
const MAX_PRODUCT_NOTIFY_EMAILS_PER_SEND = 250;
const STRIPE_PAYMENTS_ENABLED = process.env.STRIPE_PAYMENTS_ENABLED === "true";
const DEFAULT_VIRGINIA_SALES_TAX_RATE = 0.01;
const DEFAULT_STANDARD_SHIPPING_AMOUNT = 8.99;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 75;

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

function orderSalesTaxAmount(order = {}, subtotalOverride) {
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
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in as admin before sending reminders.");
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
      const origin = allowedCheckoutOrigin(request.data?.origin);
      const orderNumber = await assignSequentialOrderNumber(orderRef, order.orderNumber);
      order.orderNumber = orderNumber;

      // Server-authoritative pricing (see buildServerPricedCheckout): never trust
      // client-submitted item prices when charging the card.
      const { lineItems, itemSubtotal } = await buildServerPricedCheckout(db, order);
      const salesTaxAmount = orderSalesTaxAmount(order, itemSubtotal);
      const shippingAmount = orderShippingAmount(order, itemSubtotal);
      const totalPrice = roundCurrency(itemSubtotal + salesTaxAmount + shippingAmount);

      const metadata = {
        orderId,
        orderNumber,
        customerUid: order.customerUid || request.auth?.uid || "",
        source: "shrish_checkout",
        salesTaxAmount: String(salesTaxAmount),
        shippingAmount: String(shippingAmount),
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

      session = await stripe.checkout.sessions.create(sessionConfig);
      await orderRef.set({
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: stripeCustomerId || "",
        saveCardRequested: saveCard,
        itemSubtotal,
        salesTaxAmount,
        shippingAmount,
        shippingFreeThreshold: configuredFreeShippingThreshold(),
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
      const [eventCounts, topPages, clickedProducts, addedProducts] = await Promise.all([
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
      };
    } catch (error) {
      console.error("Owner analytics query failed", error);
      throw new HttpsError("unavailable", error.message || "PostHog analytics could not be loaded.");
    }
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
    if (order?.source === "admin_manual" || order?.skipCustomerEmail) return;
    if (!order || !order.email) return;

    await sendOrderConfirmationEmails(orderRef, order, "order_created");
  }
);
