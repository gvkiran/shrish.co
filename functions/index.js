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

const SHRISH_FROM_EMAIL = "Shrish Orders <contact@shrish.co>";
const SHRISH_ADMIN_EMAIL = "contact@shrish.co";
const SHRISH_SUPPORT_PHONE = "+1 (765) 325-5577";
const SHRISH_INSTAGRAM_URL = "https://www.instagram.com/shrish_llc/";
const SHRISH_WHATSAPP_URL = "https://wa.me/17653255577";
const SHRISH_LOGO_URL = "https://gvkiran.github.io/shrish.co/images/brand/logo-small.png";
const SHRISH_SITE_URL = "https://shrish.co";
const ORDER_COUNTER_START = 671499;
const MAX_REMINDER_EMAILS_PER_SEND = 50;

function isAdminRequest(request) {
  return String(request.auth?.token?.email || "").trim().toLowerCase() === SHRISH_ADMIN_EMAIL;
}

function normalizedSecret(secret) {
  return String(secret.value() || "").trim().replace(/[\r\n]+/g, "");
}

function stripeClient() {
  return new Stripe(normalizedSecret(STRIPE_SECRET_KEY));
}

function allowedCheckoutOrigin(value = "") {
  const fallback = SHRISH_SITE_URL;
  try {
    const url = new URL(String(value || fallback));
    const hostname = url.hostname.toLowerCase();
    const isAllowed =
      hostname === "shrish.co" ||
      hostname === "www.shrish.co" ||
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
  const pickupLocation = escapeHtml(
    order.locationLabel || order.pickupLocation || "Chesterfield, VA"
  );
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
              Thank you for ordering from Shrish. Your request has been received. Please follow our WhatsApp group for pickup location, pickup day, and timing updates.
            </div>
          </div>

          <div style="padding:24px;">
            <p style="margin:0 0 18px; font-size:15px; line-height:1.6;">Hi ${firstName},</p>

            <p style="margin:0 0 22px; font-size:15px; line-height:1.7;">
              We have your order <strong>${orderNumber}</strong> for pickup in <strong>${pickupLocation}</strong>.
              ${paymentMessage}
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
  {
    region: "us-central1",
    secrets: [RESEND_API_KEY],
  },
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

exports.createStripeCheckoutSession = onCall(
  {
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
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

    let session;
    let stripeCustomerId = "";
    const saveCard = Boolean(request.data?.saveCard && request.auth?.uid);
    const customerEmail = String(order.email || request.auth?.token?.email || "").trim().toLowerCase();
    try {
      const stripe = stripeClient();
      const origin = allowedCheckoutOrigin(request.data?.origin);
      const metadata = {
        orderId,
        orderNumber: order.orderNumber || "",
        customerUid: order.customerUid || request.auth?.uid || "",
        source: "shrish_checkout",
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

      const lineItems = order.items.map((item) => {
        const qty = normalizeQty(item);
        const unitAmount = Math.max(50, toStripeAmount(customerOrderUnitPrice(item)));
        return {
          quantity: qty,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: String(item.name || "Shrish item").slice(0, 180),
            },
          },
        };
      });

      const sessionConfig = {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        success_url: `${origin}/order.html?payment=success&orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
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

function normalizeOrderPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("1") ? digits.slice(1, 11) : digits.slice(0, 10);
}

exports.updateCustomerPendingOrder = onCall(
  {
    region: "us-central1",
  },
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
      requestedItems.forEach((item) => {
        const index = Number(item?.index);
        if (Number.isInteger(index) && index >= 0 && index < existingItems.length) {
          qtyByIndex.set(index, cleanCustomerQty(item?.qty));
        }
      });

      if (!qtyByIndex.size) {
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
  {
    region: "us-central1",
  },
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
  {
    region: "us-central1",
  },
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
  {
    region: "us-central1",
  },
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
  {
    region: "us-central1",
    secrets: [RESEND_API_KEY],
  },
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

exports.stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY],
  },
  async (request, response) => {
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
