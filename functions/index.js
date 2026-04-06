const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { Resend } = require("resend");

admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const SHRISH_FROM_EMAIL = "Shrish Orders <contact@shrish.co>";
const SHRISH_ADMIN_EMAIL = "contact@shrish.co";
const SHRISH_SUPPORT_PHONE = "+1 (765) 325-5577";
const SHRISH_INSTAGRAM_URL = "https://www.instagram.com/richmond_mangos/";
const SHRISH_WHATSAPP_URL = "https://wa.me/17653255577";
const SHRISH_LOGO_URL = "https://gvkiran.github.io/shrish.co/logo.png";
const ORDER_COUNTER_START = 671499;

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
              Thanks for ordering with Shrish. We received your request and will contact you soon with pickup details.
            </div>
          </div>

          <div style="padding:24px;">
            <p style="margin:0 0 18px; font-size:15px; line-height:1.6;">Hi ${firstName},</p>

            <p style="margin:0 0 22px; font-size:15px; line-height:1.7;">
              We have your order <strong>${orderNumber}</strong> for pickup in <strong>${pickupLocation}</strong>.
              Payment is collected at pickup.
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
                We will review your order and contact you with exact pickup timing and address details.
                If you need to change the order, reply to this email or reach us on WhatsApp.
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
    if (!order || !order.email) return;

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
  }
);