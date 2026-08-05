# Shipping notification email — Plan (v0.2, approved scope)

Status: **PLAN ONLY — nothing implemented.** No code, no rules, no commits.
Branch: `dev` only. `main` untouched.

## 0. Decisions locked in

| Question | Answer | Consequence |
|---|---|---|
| Carriers | **USPS + UPS** | Two tracking URL formats, two delivery-estimate rules. FedEx omitted; `other` kept as a no-link fallback. |
| Sequencing | **Shipping email before CRM Phase 1** | This ships first. CRM Phase 1 follows. |
| Delivery estimate | **Shown as a date range** | e.g. "Expected Aug 8–11". Range absorbs carrier slippage without reading as a broken promise. |
| Status model | **No new `shipped` status** | Keep `fulfilled`. Parallel shipment fields only. Zero impact on revenue and stats. |
| Build depth now | **Phase 1 only, then review** | Fields and admin dialog. No customer email until Phase 1 is checked. |

---

## 1. What exists today

| Piece | State | File |
|---|---|---|
| Email provider | **Resend**, wired and working. `RESEND_API_KEY` secret, `SHRISH_FROM_EMAIL`, `SHRISH_LOGO_URL` | `functions/index.js:8,40,45` |
| Order confirmation email | Sends on create / on website finalize | `sendOrderEmails`, `sendFinalizedWebsiteOrderEmails` |
| Existing templates | `buildCustomerEmail`, `buildAdminEmail`, `buildReminderEmail`, `buildProductAvailableEmail`, `buildPasswordResetEmail`, shared `buildItemsRows` | `functions/index.js` |
| Shipping sheet in admin | Exists — packing slips, address labels, bulk select | `admin.html`, `assets/js/admin-firebase.js:2214+` |
| "Mark Selected Shipped" button | **Exists but misleading** | `admin.html:99` |
| Tracking number, carrier, ship date | **Do not exist anywhere** | — |
| Shipping notification email | **Does not exist** | — |

### The actual gap

```javascript
// assets/js/admin-firebase.js:4549
async function markSelectedShippingFulfilled() {
  ...
  for (const order of targets) {
    await applyOrderStatus(order.id, 'fulfilled', true);   // ← that's all it does
  }
}
```

The button records a state change for *your* benefit and tells the customer nothing. There is no tracking number to tell them anyway, because there's nowhere to put one.

**Customer experience today:** order confirmation email → silence → a box arrives. Every "where is my order?" message you get is caused by this gap.

---

## 2. Design decisions

### 2.1 Status model — do NOT add a `shipped` status (recommended)

Tempting, but expensive. `SAFE_ORDER_STATUSES` is `['pending','awaiting_payment','payment_expired','fulfilled','cancelled','no_show']`, and `fulfilled` is load-bearing for revenue and stats in at least six places (`admin-firebase.js:296-299, 454, 470, 1203, 1459, 2511`). Introducing `shipped` silently drops shipped orders out of the "Fulfilled" card, box counts, and revenue totals until all six are updated.

**Recommendation:** keep `status: 'fulfilled'` exactly as-is. Add *parallel* fields that describe the shipment:

| Field | Type | Source |
|---|---|---|
| `shippedAt` | timestamp | Set when you mark shipped |
| `carrier` | string | `usps` · `ups` · `fedex` · `other` |
| `trackingNumber` | string | Pasted from carrier receipt |
| `trackingUrl` | string | Derived from carrier + number |
| `estimatedDeliveryFrom` | string (`YYYY-MM-DD`) | Auto-computed, editable |
| `estimatedDeliveryTo` | string (`YYYY-MM-DD`) | Auto-computed, editable |
| `shipmentEmailSentAt` | timestamp | Idempotency guard |

Zero impact on existing stats. A true `shipped` status can come later as its own change if you want it.

### 2.2 No Firestore rules change needed

`match /orders/{orderId}` already allows `update` if `isAdmin()`, unrestricted. Unlike the CRM booth-entry work, this feature requires **no rules modification at all.**

### 2.3 Email trigger — mirror the existing pattern

New Cloud Function `sendShipmentEmail`, an `onDocumentUpdated` trigger on `orders/{orderId}`. Fires only when **all** of:

- `after.fulfillmentType === 'shipping'` (pickup orders never get this)
- `before.trackingNumber` empty **and** `after.trackingNumber` non-empty
- `!after.shipmentEmailSentAt` (idempotency)
- `after.email` present

Then writes `shipmentEmailSentAt` on success. This is the identical guard pattern `sendFinalizedWebsiteOrderEmails` already uses with `confirmationEmailSentAt` — consistent, and safe against double-sends on retry.

### 2.4 Tracking URLs — manual entry, not a carrier API

Real carrier integrations (USPS Web Tools, EasyPost, Shippo) mean accounts, credentials, per-call cost, and ongoing maintenance. At your volume that's not worth it. You already receive a tracking number when you buy postage — you paste it, we build the link.

Carriers in scope: **USPS and UPS**, plus `other` (tracking number shown as plain text, no link). Both tracking URL formats to be **verified against the carriers' current live formats at build time** rather than assumed from memory — URL patterns change and a dead tracking link is worse than none.

### 2.5 Estimated delivery — computed range, editable

Shown to the customer as a **range**, e.g. "Expected Aug 8–11". A range absorbs normal carrier slippage; a single date turns every ordinary delay into a broken promise and a support email.

Computed as ship date + carrier business-day window, skipping Sundays, pre-filled in the mark-shipped dialog so it can be overridden before sending. Consistent with the CRM principle: derive what can be derived, keep typing to a minimum.

Field storage: `estimatedDeliveryFrom` and `estimatedDeliveryTo` (both `YYYY-MM-DD`) rather than a single date.

### 2.6 Not in scope

Delivered-confirmation emails (needs carrier webhooks), return labels, multi-package shipments, automatic label purchase, SMS notifications.

---

## 3. Build phases

| Phase | Deliverable | Risk |
|---|---|---|
| **1** | Mark-shipped dialog in admin: carrier dropdown, tracking field, auto-filled delivery estimate. Writes the fields. **No email yet.** | None — additive fields only |
| **2** | `buildShipmentEmail` template + `sendShipmentEmail` trigger. Test against a real order to your own address before any customer sees it. | Low — guarded, idempotent |
| **3** | Bulk path: extend `markSelectedShippingFulfilled` to collect tracking numbers for several orders at once | Low |
| **4** | Surface `trackingNumber` and `estimatedDeliveryDate` on `account.html` order history so signed-in customers can self-serve | Low |

Phase 2 is where the customer-visible behaviour changes, so it gets a live test to your own inbox first.

---

## 4. Email content

Subject: `Your Shrish order is on its way — <orderNumber>`

Body, reusing the existing branded shell and `buildItemsRows`:

1. Shipped confirmation line with order number
2. Carrier, tracking number, prominent "Track your package" button
3. Estimated delivery date
4. Shipping address (so mistakes get caught while there's still time)
5. Item list
6. Storage and shelf-life note — pickles and sweets genuinely benefit from this, and it reduces "is this still good?" mail
7. Support contact

**Optional refactor, flagged not scheduled:** five templates currently repeat the same header/footer HTML. Extracting a shared `emailShell(bodyHtml)` would make this the last time that duplication is copied. Worth doing, but it touches working emails — better as its own commit than bundled here.

---

## 5. How this relates to the CRM

Independent — no shared code, no dependency in either direction. But two useful side effects:

- `shippedAt` and `estimatedDeliveryDate` give the CRM a real fulfillment timeline instead of just order dates.
- The reorder clock is arguably better anchored to **delivery** than to order date. For shipping orders that's a 3–5 day correction; on a 60-day window it's minor but free once these fields exist.

**Sequencing view:** this is arguably more urgent than CRM Phase 1. The CRM makes you money you're currently missing; the shipping email stops you from losing customers who are already annoyed. It's also smaller.

---

## 6. Immediate next step

**Phase 1 only**, as one commit on `dev`:

- Mark-shipped dialog in `admin.html` + `assets/js/admin-firebase.js`
- Carrier dropdown (USPS / UPS / other), tracking number field
- Auto-computed, editable delivery range
- Writes `shippedAt`, `carrier`, `trackingNumber`, `trackingUrl`, `estimatedDeliveryFrom`, `estimatedDeliveryTo`
- Existing `status: 'fulfilled'` behaviour unchanged
- **No email sent** — that is Phase 2, after this is reviewed

Open minor question, not blocking: whether "Mark Selected Shipped" should be renamed once it starts emailing customers in Phase 2.
