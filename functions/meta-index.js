const existingFunctions = require("./index.js");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { FieldValue } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

const admin = { firestore: { FieldValue } };
const META_CONVERSIONS_API_TOKEN = defineSecret("META_CONVERSIONS_API_TOKEN");
const META_DATASET_ID = "1576599090538377";
const META_GRAPH_API_VERSION = String(process.env.META_GRAPH_API_VERSION || "v25.0").trim();
const SHRISH_SITE_URL = "https://shrish.co";

function sha256(value) {
  const normalized = String(value || "").trim();
  return normalized
    ? crypto.createHash("sha256").update(normalized, "utf8").digest("hex")
    : "";
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hashedArray(value) {
  const hashed = sha256(value);
  return hashed ? [hashed] : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null || item === "") return false;
      if (Array.isArray(item) && item.length === 0) return false;
      return true;
    })
  );
}

function metaUserData(order = {}, orderId = "") {
  const shippingAddress = order.shippingAddress || {};
  const email = normalizedEmail(order.email || order.customerEmail);
  const phone = normalizedPhone(order.phoneDigits || order.phone);
  const firstName = normalizedText(order.firstName);
  const lastName = normalizedText(order.lastName);
  const city = normalizedText(shippingAddress.city || order.city);
  const state = normalizedText(shippingAddress.state || order.state);
  const zip = normalizedText(shippingAddress.zip || order.zip);
  const country = normalizedText(shippingAddress.country || order.country || "us");
  const externalId = normalizedText(order.customerUid || email || phone || orderId);

  return compactObject({
    em: hashedArray(email),
    ph: hashedArray(phone),
    fn: hashedArray(firstName),
    ln: hashedArray(lastName),
    ct: hashedArray(city),
    st: hashedArray(state),
    zp: hashedArray(zip),
    country: hashedArray(country),
    external_id: hashedArray(externalId),
  });
}

function orderContents(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.map((item) => {
    const quantity = Math.max(1, Number(item.qty || item.quantity || 1));
    const explicitLineTotal = Number(item.lineTotal || 0);
    const explicitUnitPrice = Number(item.unitPrice || item.itemPrice || 0);
    const parsedPrice = Number.parseFloat(String(item.price || "").replace(/[^0-9.-]/g, ""));
    const itemPrice = explicitUnitPrice > 0
      ? explicitUnitPrice
      : (explicitLineTotal > 0 ? explicitLineTotal / quantity : parsedPrice);

    return compactObject({
      id: String(item.productId || item.id || item.name || "item").split("__")[0].slice(0, 100),
      quantity,
      item_price: Number.isFinite(itemPrice) && itemPrice > 0
        ? Math.round((itemPrice + Number.EPSILON) * 100) / 100
        : undefined,
    });
  });
}

function metaPurchasePayload(order = {}, orderId, eventTimeSeconds) {
  const contents = orderContents(order);
  const contentIds = contents.map((item) => item.id).filter(Boolean);
  const numItems = contents.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const value = Number(order.totalPrice || 0);
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error("Paid order is missing a valid totalPrice.");
  }
  const eventId = `stripe_${orderId}`;

  return {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTimeSeconds,
        event_id: eventId,
        action_source: "website",
        event_source_url: `${SHRISH_SITE_URL}/order.html`,
        user_data: metaUserData(order, orderId),
        custom_data: compactObject({
          currency: "USD",
          value: Math.round((value + Number.EPSILON) * 100) / 100,
          order_id: String(order.orderNumber || orderId),
          content_type: contentIds.length ? "product" : undefined,
          content_ids: contentIds.length ? contentIds : undefined,
          contents: contents.length ? contents : undefined,
          num_items: numItems > 0 ? numItems : undefined,
        }),
      },
    ],
  };
}

async function sendMetaPurchase(order, orderId, eventTimeSeconds) {
  const token = String(META_CONVERSIONS_API_TOKEN.value() || "").trim();
  if (!token) throw new Error("META_CONVERSIONS_API_TOKEN is empty.");

  const endpoint = `https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(META_DATASET_ID)}/events`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(metaPurchasePayload(order, orderId, eventTimeSeconds)),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || Number(payload.events_received || 0) < 1) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(`Meta Conversions API rejected Purchase: ${detail}`);
  }

  return payload;
}

const metaPurchaseOnPaid = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
    secrets: [META_CONVERSIONS_API_TOKEN],
    retry: true,
  },
  async (event) => {
    const beforeSnapshot = event.data?.before;
    const snapshot = event.data?.after;
    if (!snapshot?.exists) return;

    const previousOrder = beforeSnapshot?.exists ? (beforeSnapshot.data() || {}) : {};
    const order = snapshot.data() || {};
    const orderId = String(event.params?.orderId || snapshot.id || "").trim();
    const wasPaid = String(previousOrder.paymentStatus || previousOrder.payment || "").toLowerCase() === "paid";
    const isPaid = String(order.paymentStatus || order.payment || "").toLowerCase() === "paid";
    if (!orderId || !isPaid || wasPaid || order.metaPurchaseStatus === "sent") return;

    const paidAtMillis = typeof order.paidAt?.toMillis === "function"
      ? order.paidAt.toMillis()
      : new Date(order.paidAt || event.time || Date.now()).getTime();
    const eventTimeSeconds = Number.isFinite(paidAtMillis) && paidAtMillis > 0
      ? Math.floor(paidAtMillis / 1000)
      : Math.floor(Date.now() / 1000);

    try {
      const result = await sendMetaPurchase(order, orderId, eventTimeSeconds);
      await snapshot.ref.set({
        metaPurchaseStatus: "sent",
        metaPurchaseEventId: `stripe_${orderId}`,
        metaPurchaseEventsReceived: Number(result.events_received || 0),
        metaPurchaseTraceId: String(result.fbtrace_id || ""),
        metaPurchaseSentAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log("Meta Purchase sent", {
        orderId,
        orderNumber: order.orderNumber || "",
        eventsReceived: Number(result.events_received || 0),
      });
    } catch (error) {
      const message = String(error?.message || error).slice(0, 500);
      await snapshot.ref.set({
        metaPurchaseStatus: "failed",
        metaPurchaseLastError: message,
        metaPurchaseLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => null);

      console.error("Meta Purchase failed", { orderId, message });
      throw error;
    }
  }
);

module.exports = {
  ...existingFunctions,
  metaPurchaseOnPaid,
};
