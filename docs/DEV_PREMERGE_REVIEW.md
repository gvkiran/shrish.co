# Pre-Merge Review — `developement` → `main`

**Date:** 2026-07-01
**Scope reviewed:** 20 commits on `origin/developement` ahead of `origin/main` (Jun 15 – Jul 1, 2026)
**Reviewer:** Claude (Cowork)

---

## What this branch does

Reintroduces **online payment + shipping** as a *hybrid* model (prior state was pickup-only with Stripe hidden), plus a static admin Growth Dashboard, updated legal/FAQ copy, and SEO cleanup.

Cart classification rule (implemented in both client `order-firebase.js` and server `functions/index.js`):

| Cart contents | Payment | Shipping |
|---|---|---|
| Mango only | Pay at pickup | No |
| Mango + non-mango (mixed) | Pay at pickup | No |
| Non-mango only (pickles, podi, sweets, snacks) | **Must pay online (Stripe)** | Eligible |

Supporting changes: Virginia sales tax line (default **1%**, env-configurable), standard shipping **$8.99** / free over **$75**, Google Maps/Places key moved to a runtime endpoint, `dev.shrish.co` allowed as a checkout origin.

---

## 🔴 Blocker — fix before enabling Stripe in production

**1. Server trusts client-submitted prices (price-tampering).**

- Orders are created by a **direct client-side Firestore write** (`assets/js/order-firebase.js` ~line 1887: `doc(collection(db, 'orders'))` → `setDoc`). There is no server-side create function.
- The Firestore `orders` create rule (`newOrderCustomerIsValid()` in `firestore.rules`) validates **only** that `customerUid` matches the signed-in user — it does **not** validate item prices, quantities, or totals.
- `createStripeCheckoutSession` builds Stripe line items from the stored order's prices via `customerOrderUnitPrice(item)` (client-supplied), floored at `Math.max(50, …)` = $0.50 per line.

**Impact:** a customer can create an order document with tampered prices and pay far less than the real amount (down to $0.50/line). Dormant until now because `STRIPE_PAYMENTS_ENABLED` was hardcoded `false`; this branch flips it to an env flag, making the path live.

**Fix:** in `createStripeCheckoutSession`, recompute each unit price **server-side** from the `products` collection instead of trusting `customerOrderUnitPrice(item)`. The pattern already exists in this file — `classifyOrderPaymentItems()` re-fetches category from `products`, and `buildCustomerOrderItemFromProduct()` validates price server-side. Reuse that to rebuild line items and the subtotal.

---

## 🟠 Should-fix before merge

**2. Cache-busting misses (Hostinger serves stale files).**
`data.js` (order confirmation message changed) and `main.js` (Geet chatbot ordering copy changed) were edited, but their `?v=` query strings are **identical** between prod and dev on every page → the browser/Hostinger will serve the old files.

- Bump `data.js?v=…` and `main.js?v=…` site-wide.
- Correctly bumped already: `checkout-luxe.css` (`dark-checkout-20260701`), `checkout-luxe.js` (`cart-remove-modal-20260630`), `order-firebase.js` (`places-new-20260701`). ✓

**3. Deployment dependencies — will silently fail on a static host.**
The new features need a Node/serverless backend, not flat-file Hostinger:

- `/api/public-config` is a Node handler (Vercel-style). On static hosting it won't execute → Places autocomplete key never loads → shipping address autocomplete degrades.
- Stripe needs: `STRIPE_PAYMENTS_ENABLED=true`, the Stripe secret key, and the `stripeWebhook` Cloud Function deployed **and** its URL registered in the Stripe dashboard (otherwise orders never flip to `paid`).
- Env vars to set: `SHRISH_GOOGLE_MAPS_API_KEY`, and optionally `SHRISH_VA_SALES_TAX_RATE`, `SHRISH_STANDARD_SHIPPING_AMOUNT`, `SHRISH_FREE_SHIPPING_THRESHOLD`.
- `vercel.json` + `functions/` are present — confirm the deploy target for `/api/*` and Firebase Functions before flipping payments on.

**4. Virginia sales tax = 1% default — confirm rate & applicability.**
`DEFAULT_VIRGINIA_SALES_TAX_RATE = 0.01`. Confirm (a) the correct rate, and (b) that pickles/sweets/podi qualify for VA's reduced grocery rate — prepared/specialty foods often don't. Also note tax is computed for **pickup** orders too; decide whether pickup customers should be shown/charged VA tax (currently collected manually via cash/Zelle).

---

## 🟡 Pre-existing issue (not introduced here, but now more relevant)

**5. `refund_requests` writes are denied.**
Client calls `addDoc(collection(db, 'refund_requests'), …)` but `firestore.rules` has **no** matching rule block → denied by default. Known gap from prior sessions, still unfixed. If refunds are part of the online-payment experience, add a rule.

---

## 🟢 Low / informational

- **Admin Growth Dashboard is a static hardcoded snapshot** ("Updated June 15, 2026") — no live data calls (`getOwnerAnalytics`/`fetch`/`onSnapshot` not present). Numbers won't refresh. Fine if intended as a mockup. No secrets embedded. ✓
- **Critical auth paths untouched.** `account-firebase.js` and `firebase-app.js` unchanged; `account.html` got only `canonical` + `noindex,nofollow` meta. Login / password reset / order history carry low regression risk. ✓
- **`analytics.js` version inconsistency:** product pages use `?v=product-pages-1`, main pages use `?v=perf2-20260624`. Harmless, but inconsistent.
- **Working-tree / branch hygiene.** The connected folder is on `main` with 274 files showing as "modified" — this is pure CRLF↔LF line-ending noise (equal insert/delete counts; vanishes with `--ignore-all-space`). Recommend adding `.gitattributes` (`* text=auto eol=lf`) and renormalizing. Also: local `main` is 3 behind `origin/main`; local `developement` is 228 behind `origin/developement`. Do git work against the up-to-date remote refs / the `codex/align-development-with-production` worktree.

---

## Merge checklist

1. [ ] **Fix price validation server-side** in `createStripeCheckoutSession` (Blocker #1).
2. [ ] Bump `?v=` on `data.js` and `main.js` site-wide (#2).
3. [ ] Confirm deploy target for `/api/*` + Firebase Functions; set all env vars; register Stripe webhook (#3).
4. [ ] Confirm VA sales-tax rate + category applicability (#4).
5. [ ] Decide on `refund_requests` rule (#5).
6. [ ] Merge `origin/main` into `developement` first (dev is behind on the 3 latest prod commits) and resolve any conflicts.
7. [ ] Test in dev: mango-only (pickup), mixed (pickup), non-mango-only (Stripe redirect + webhook → `paid`), shipping address autocomplete, tax/shipping totals.
8. [ ] Verify login, password reset, and order history still work after merge.
9. [ ] Hard reload (`Ctrl+Shift+R`) to confirm no stale cached assets.
