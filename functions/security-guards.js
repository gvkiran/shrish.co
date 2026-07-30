"use strict";

const crypto = require("node:crypto");

const WEBSITE_ORDER_ID_PATTERN = /^[A-Za-z0-9]{20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\d{10,11}$/;
const VALID_PICKUP_LOCATIONS = new Set(["shortpump", "chesterfield", "mechanicsville"]);
const MAX_ORDER_ITEMS = 40;
const MAX_TOTAL_QUANTITY = 100;

class SecurityGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SecurityGuardError";
    this.code = code;
  }
}

function normalizedPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function requestClientAddress(request = {}) {
  const forwarded = String(
    request.rawRequest?.headers?.["x-forwarded-for"]
      || request.rawRequest?.headers?.get?.("x-forwarded-for")
      || ""
  ).split(",")[0].trim();
  return (
    forwarded
    || String(request.rawRequest?.ip || "").trim()
    || String(request.rawRequest?.socket?.remoteAddress || "").trim()
    || "unknown"
  ).slice(0, 120);
}

function hashIdentifier(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function requestRateLimitSubject(request = {}) {
  const uid = String(request.auth?.uid || "").trim();
  return uid ? `uid:${uid}` : `ip:${requestClientAddress(request)}`;
}

function rateLimitDocumentId(scope, subject, windowMs, nowMs = Date.now()) {
  const safeWindowMs = Math.max(1_000, Number(windowMs) || 60_000);
  const windowStart = Math.floor(Number(nowMs) / safeWindowMs) * safeWindowMs;
  return {
    id: hashIdentifier(`${scope}:${subject}:${windowStart}`).slice(0, 48),
    windowStart,
    windowEnd: windowStart + safeWindowMs,
  };
}

function validateWebsiteOrder(order = {}, authUid = "") {
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    throw new SecurityGuardError("invalid-argument", "Order data is required.");
  }

  const firstName = String(order.firstName || "").trim();
  const lastName = String(order.lastName || "").trim();
  const email = String(order.email || "").trim().toLowerCase();
  const phoneDigits = normalizedPhoneDigits(order.phoneDigits || order.phone);
  const source = String(order.source || "").trim();
  const finalizationState = String(order.websiteFinalizationState || "").trim();
  const fulfillmentType = String(order.fulfillmentType || "pickup").trim();
  const paymentMethod = String(order.paymentMethod || "").trim();
  const status = String(order.status || "").trim();
  const items = Array.isArray(order.items) ? order.items : [];

  if (source !== "website" || !["unverified", "failed"].includes(finalizationState)) {
    throw new SecurityGuardError("failed-precondition", "This order is not awaiting website validation.");
  }
  if (
    firstName.length < 1
    || firstName.length > 80
    || lastName.length > 80
    || (lastName.length > 0 && lastName.length < 2)
  ) {
    throw new SecurityGuardError("invalid-argument", "A valid customer name is required.");
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SecurityGuardError("invalid-argument", "A valid email address is required.");
  }
  if (!PHONE_PATTERN.test(phoneDigits)) {
    throw new SecurityGuardError("invalid-argument", "A valid US phone number is required.");
  }
  if (!["pickup", "shipping"].includes(fulfillmentType)) {
    throw new SecurityGuardError("invalid-argument", "Fulfillment type is invalid.");
  }
  if (!["stripe", "pay_at_pickup"].includes(paymentMethod)) {
    throw new SecurityGuardError("invalid-argument", "Payment method is invalid.");
  }
  if (paymentMethod === "stripe" && status !== "awaiting_payment") {
    throw new SecurityGuardError("failed-precondition", "Online-payment order status is invalid.");
  }
  if (paymentMethod === "pay_at_pickup" && status !== "pending") {
    throw new SecurityGuardError("failed-precondition", "Pickup-payment order status is invalid.");
  }

  const suppliedCustomerUid = String(order.customerUid || "").trim();
  const authenticatedUid = String(authUid || "").trim();
  if (suppliedCustomerUid && suppliedCustomerUid !== authenticatedUid) {
    throw new SecurityGuardError("permission-denied", "The order account does not match the signed-in customer.");
  }
  if (
    String(order.orderNumber || "").trim()
    || order.websiteValidatedAt
    || order.websiteFinalizedAt
    || order.stripeCheckoutSessionId
    || order.promoRedeemed
  ) {
    throw new SecurityGuardError("invalid-argument", "Order contains server-managed fields.");
  }

  if (!items.length || items.length > MAX_ORDER_ITEMS) {
    throw new SecurityGuardError("invalid-argument", "Order must contain between 1 and 40 items.");
  }

  let totalQuantity = 0;
  items.forEach((item) => {
    const productId = String(item?.productId || item?.id || "").trim();
    const quantity = Number(item?.qty ?? item?.quantity ?? 0);
    if (!productId || productId.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new SecurityGuardError("invalid-argument", "Order contains an invalid product or quantity.");
    }
    totalQuantity += quantity;
  });
  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    throw new SecurityGuardError("invalid-argument", "Order quantity is too large.");
  }

  if (fulfillmentType === "pickup") {
    const pickupLocation = String(order.pickupLocation || order.location || "").trim();
    if (!VALID_PICKUP_LOCATIONS.has(pickupLocation)) {
      throw new SecurityGuardError("invalid-argument", "Pickup location is invalid.");
    }
  } else {
    const address = order.shippingAddress || {};
    if (
      String(address.addressLine1 || "").trim().length < 5
      || String(address.city || "").trim().length < 2
      || !/^[A-Z]{2}$/i.test(String(address.state || "").trim())
      || !/^\d{5}(?:-\d{4})?$/.test(String(address.zip || "").trim())
    ) {
      throw new SecurityGuardError("invalid-argument", "A valid shipping address is required.");
    }
  }

  return {
    email,
    phoneDigits,
    fulfillmentType,
    paymentMethod,
    totalQuantity,
  };
}

module.exports = {
  MAX_ORDER_ITEMS,
  SecurityGuardError,
  hashIdentifier,
  normalizedPhoneDigits,
  rateLimitDocumentId,
  requestClientAddress,
  requestRateLimitSubject,
  validateWebsiteOrder,
};
