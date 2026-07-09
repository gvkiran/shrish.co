# Shrish — Online Payment Go-Live & Deployment Guide

This covers deploying the hardened `developement` line (hybrid pickup + online Stripe payment + shipping) to production. Work top to bottom; **do not flip Stripe on until dev testing passes.**

Backend target (your choice): **Firebase Functions**. The static site stays on **Hostinger** (confirmed — `firebase.json` has no hosting block). Because the site isn't on Firebase Hosting, the Maps key is now served by a **Firebase callable** (`getPublicConfig`) instead of a relative `/api/public-config` request, so it works cross-origin from Hostinger.

---

## 0. Apply the code fixes

From the repo root `D:\GitRepo\GitHub\shrish.co`:

```powershell
powershell -ExecutionPolicy Bypass -File .\premerge-fixes\apply-premerge-fixes.ps1
```

Review the staged diff, then commit (the script prints the exact command). What it changes:

- **`functions/index.js`** — Stripe checkout now rebuilds line items + subtotal from the **products collection** (server-authoritative), so a tampered order can't set its own price. Adds `getPublicConfig` callable.
- **`assets/js/order-firebase.js`** — Maps key via `getPublicConfig` callable, falling back to `/api/public-config`; degrades to manual address entry if unavailable.
- **`firestore.rules`** — adds a `refund_requests` rule (create allowed, admin-managed) so refund submissions stop failing.
- **`.gitattributes`** — stops the phantom CRLF diffs.
- **cache-bust** — bumps `data.js` / `main.js` `?v=` site-wide.

---

## 1. Set Firebase secrets (one-time)

Secrets are read via `defineSecret` in `functions/index.js`:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY        # sk_live_... (use sk_test_... in dev first)
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET     # from step 4
firebase functions:secrets:set RESEND_API_KEY            # existing
firebase functions:secrets:set POSTHOG_PERSONAL_API_KEY  # existing
```

## 2. Set non-secret config in `functions/.env`

Firebase Functions v2 auto-loads `functions/.env`. Create/append:

```
STRIPE_PAYMENTS_ENABLED=false        # keep false until dev testing passes (step 6)
SHRISH_GOOGLE_MAPS_API_KEY=your-restricted-google-maps-browser-key
SHRISH_VA_SALES_TAX_RATE=0.01        # 1% default — CONFIRM with your CPA / VA Dept of Taxation
SHRISH_STANDARD_SHIPPING_AMOUNT=8.99
SHRISH_FREE_SHIPPING_THRESHOLD=75
POSTHOG_API_KEY=...                  # existing
POSTHOG_HOST=https://us.i.posthog.com # existing
# SHRISH_ENFORCE_APP_CHECK=false     # leave off until App Check is set up
```

> **Required safety step:** `functions/.gitignore` currently ignores only `node_modules/`. Add `.env` to it so config never gets committed:
> ```
> node_modules/
> .env
> ```

The Google Maps key is a **public browser key** — restrict it in Google Cloud Console by HTTP referrer (`shrish.co`, `www.shrish.co`, `dev.shrish.co`) and to the **Places API** only.

## 3. Deploy functions + Firestore rules

```bash
firebase deploy --only functions,firestore:rules
```

## 4. Register the Stripe webhook

1. Copy the deployed `stripeWebhook` URL (Firebase console → Functions, or the deploy output).
2. Stripe Dashboard → Developers → Webhooks → **Add endpoint** → paste the URL.
3. Events: **`checkout.session.completed`** and **`checkout.session.expired`**.
4. Copy the endpoint's **Signing secret** → `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` → redeploy functions.

Without this, paid orders never flip to `paid`.

## 5. Deploy the dev site & TEST (Stripe still OFF, then ON)

Deploy the static files to your dev URL (`dev.shrish.co` — already an allowed checkout origin — or the GitHub Pages preview). Then, using **Stripe test keys**, flip `STRIPE_PAYMENTS_ENABLED=true`, redeploy functions, and run the checklist below.

### Test checklist (do every item)

- [ ] **Mango-only cart** → shows *pay at pickup*, no Stripe.
- [ ] **Mixed** (mango + non-mango) → *pay at pickup*.
- [ ] **Non-mango-only** (pickle/podi/sweet) → redirects to Stripe.
- [ ] Stripe page shows the **correct product prices + Virginia tax + shipping**.
- [ ] **Price-tampering check:** in dev, edit the order doc (or cart) to a bogus low price, start checkout → Stripe still charges the **real product price** (this is the core fix).
- [ ] Complete a **test payment** → webhook marks the order `paid` → confirmation email says "Payment was completed online."
- [ ] **Shipping**: address autocomplete loads (Maps key working) *or* cleanly allows manual entry; free shipping over $75, else $8.99.
- [ ] **Critical paths unaffected:** customer login, password reset, order history all work.
- [ ] **Hard reload** (`Ctrl+Shift+R`) confirms the new `data.js` / `main.js` are served (cache-bust).

## 6. Go live

1. Confirm all checklist items pass with **live** Stripe keys still off.
2. Merge `developement` → `main`. (Your local `developement` is in a leftover Codex worktree; merge there or via GitHub, then delete stale worktrees with `git worktree prune` / `git worktree remove`.)
3. Deploy prod static files to **Hostinger**; hard reload to clear cache.
4. Set **live** `STRIPE_SECRET_KEY` + live `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYMENTS_ENABLED=true`, redeploy functions.
5. Run one real (small) end-to-end order to confirm production.

---

## Still your call (not code)

- **VA sales tax rate/applicability** — 1% is a default placeholder; confirm the correct rate and whether pickles/sweets/podi qualify for VA's reduced grocery rate (prepared/specialty foods often don't).
- **Admin Growth Dashboard** is a static snapshot (not live data) — fine as-is, just know the numbers don't update.
