import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';

initializeApp();
const db = getFirestore();
const resendApiKey = defineSecret('RESEND_API_KEY');

const FROM_EMAIL = process.env.SHRISH_FROM_EMAIL || 'Shrish Orders <contact@shrish.co>';
const ADMIN_EMAIL = process.env.SHRISH_ADMIN_EMAIL || 'contact@shrish.co';
const BUSINESS_PHONE = process.env.SHRISH_SUPPORT_PHONE || '+1 (765) 325-5577';
const INSTAGRAM_URL = process.env.SHRISH_INSTAGRAM_URL || 'https://www.instagram.com/richmond_mangos/';
const WHATSAPP_URL = process.env.SHRISH_WHATSAPP_URL || 'https://wa.me/17653255577';

function formatCurrency(value = 0) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function itemRows(items = []) {
  return items.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(item.price)}</td>
    </tr>`).join('');
}

function customerEmailHtml(order) {
  return `
  <div style="font-family:Arial,sans-serif;background:#f7f3ec;padding:32px;color:#1a1208;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eadfcf;">
      <div style="background:linear-gradient(135deg,#c8791a,#8d5a10);padding:28px 32px;color:#fff;">
        <div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.9;">Shrish LLC</div>
        <h1 style="margin:10px 0 6px;font-size:28px;line-height:1.2;">Your order is confirmed</h1>
        <p style="margin:0;font-size:15px;opacity:0.95;">Thanks for ordering with Shrish. We received your request and will contact you soon with pickup details.</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 18px;font-size:15px;">Hi ${escapeHtml(order.firstName)},</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">We have your order <strong>${escapeHtml(order.orderNumber)}</strong> for pickup in <strong>${escapeHtml(order.locationLabel)}</strong>. Payment is collected at pickup.</p>
        <table style="width:100%;border-collapse:collapse;margin:22px 0 16px;">
          <thead>
            <tr>
              <th style="padding:10px 12px;text-align:left;background:#faf5ec;border-bottom:1px solid #eee;">Item</th>
              <th style="padding:10px 12px;text-align:center;background:#faf5ec;border-bottom:1px solid #eee;">Qty</th>
              <th style="padding:10px 12px;text-align:right;background:#faf5ec;border-bottom:1px solid #eee;">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows(order.items)}</tbody>
        </table>
        <div style="display:flex;justify-content:space-between;gap:16px;margin:10px 0 22px;font-size:15px;">
          <div><strong>Total boxes:</strong> ${order.totalBoxes}</div>
          <div><strong>Estimated total:</strong> ${formatCurrency(order.totalPrice)}</div>
        </div>
        <div style="background:#faf5ec;border-radius:14px;padding:18px 20px;margin:20px 0;">
          <div style="font-weight:700;margin-bottom:8px;">What happens next</div>
          <div style="font-size:14px;line-height:1.7;">We will review your order and contact you with exact pickup timing and address details. If you need to change the order, reply to this email or reach us on WhatsApp.</div>
        </div>
        <div style="font-size:14px;line-height:1.8;">
          <div><strong>Phone:</strong> ${escapeHtml(BUSINESS_PHONE)}</div>
          <div><strong>WhatsApp:</strong> <a href="${WHATSAPP_URL}">${WHATSAPP_URL}</a></div>
          <div><strong>Instagram:</strong> <a href="${INSTAGRAM_URL}">${INSTAGRAM_URL}</a></div>
        </div>
      </div>
    </div>
  </div>`;
}

function adminEmailHtml(order) {
  return `
  <div style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1a1208;">
    <h2 style="margin:0 0 12px;">New Shrish order: ${escapeHtml(order.orderNumber)}</h2>
    <p style="margin:0 0 16px;">${escapeHtml(order.fullName)} placed an order for ${order.totalBoxes} boxes.</p>
    <ul style="line-height:1.8;">
      <li><strong>Phone:</strong> ${escapeHtml(order.phone)}</li>
      <li><strong>Email:</strong> ${escapeHtml(order.email)}</li>
      <li><strong>Pickup:</strong> ${escapeHtml(order.locationLabel)}</li>
      <li><strong>Total:</strong> ${formatCurrency(order.totalPrice)}</li>
      <li><strong>Referral:</strong> ${escapeHtml(order.referral || 'Not specified')}</li>
      <li><strong>Notes:</strong> ${escapeHtml(order.notes || 'None')}</li>
    </ul>
    <h3>Items</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${itemRows(order.items)}</tbody>
    </table>
  </div>`;
}

export const sendOrderEmails = onDocumentCreated(
  {
    document: 'orders/{orderId}',
    region: 'us-central1',
    secrets: [resendApiKey]
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const order = snapshot.data();
    if (!order?.email || !order?.orderNumber) return;

    const resend = new Resend(resendApiKey.value());

    const customerResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [order.email],
      subject: `Shrish order confirmation — ${order.orderNumber}`,
      html: customerEmailHtml(order),
      replyTo: ADMIN_EMAIL
    });

    const adminResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `New Shrish order — ${order.orderNumber}`,
      html: adminEmailHtml(order),
      replyTo: order.email
    });

    await db.collection('orders').doc(snapshot.id).set({
      emailStatus: 'sent',
      customerEmailId: customerResponse.data?.id || null,
      adminEmailId: adminResponse.data?.id || null,
      emailedAt: new Date().toISOString()
    }, { merge: true });
  }
);
