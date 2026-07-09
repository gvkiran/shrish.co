# SHRISH — Resume Checklist (after holiday)

_Last updated: 2026-07-02. Pick these up when you're back; Claude has the full context in memory._

## Where things stand (all green so far)
- **`developement` branch** = current source of truth (tip `3f5fa73`). Contains: hybrid pickup+online-Stripe checkout, **server-side price-tampering fix**, `refund_requests` rule, Firebase Maps-key fallback, dark-theme label fix, cache-bust, `.gitattributes`, `functions/.gitignore` for `.env`. All validated (syntax + price-tamper simulation passed).
- **dev.shrish.co** = fixed. It was pointing at `feature/pwa` (old base); now bound to **Preview → `developement`** in Vercel. Serving the correct build.
- **Places API (New)** enabled → shipping address autocomplete works.
- **Prod (`main`)** = untouched (still old checkout). Nothing risky is live.

## The prod gate — do these in order

### 1. Deploy the hardened Firebase functions (the price fix isn't live until this)
Run `premerge-fixes/deploy-and-verify.sh`, or manually:
- Set Firebase secrets: `STRIPE_SECRET_KEY` (test first), `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `POSTHOG_PERSONAL_API_KEY`.
- Create `functions/.env`: `STRIPE_PAYMENTS_ENABLED=false`, `SHRISH_GOOGLE_MAPS_API_KEY`, `SHRISH_VA_SALES_TAX_RATE=0.01`, `SHRISH_STANDARD_SHIPPING_AMOUNT=8.99`, `SHRISH_FREE_SHIPPING_THRESHOLD=75`, `POSTHOG_*`.
- `firebase deploy --only functions,firestore:rules`
- Register Stripe webhook (`checkout.session.completed`, `checkout.session.expired`) → set `STRIPE_WEBHOOK_SECRET` → redeploy.

### 2. QA pass (hand to your tester)
- Give them `premerge-fixes/SHRISH_Checkout_QA_Test_Plan.xlsx` (32 cases).
- Flip `STRIPE_PAYMENTS_ENABLED=true` with **test** keys, run the workbook on dev.
- Must be **GO** (all P0 pass) — especially **C1 (live price-tampering)** and **G1–G4 (login / reset / order history / pickup)**.
- Claude can drive the C-series + routing checks in the browser to speed this up.

### 3. Go live
- Swap to **LIVE** Stripe secret + live webhook secret; `STRIPE_PAYMENTS_ENABLED=true`; redeploy functions.
- Merge `developement` → `main`; deploy prod static; hard-reload.
- Place one small real order end-to-end to confirm.

## Still open (decisions/inputs from you)
- **VA sales tax rate**: confirm 1% (and whether pickles/sweets/podi qualify) with your CPA. It's env-configurable, no code change needed.
- **`feature/pwa` branch** is polluted (committed `node_modules`) and based on old `main` — plan to abandon it in favor of a clean re-fold (below).

## PWA (next workstream, after checkout is stable)
- **Fold PWA Phase 1 cleanly onto `developement`**: `manifest.json`, the no-cache `sw.js`, 4 icons (`icon-192/512/maskable-512`, `apple-touch-icon`), the PWA `<head>` tags (manifest link, theme-color `#C8791A`, apple-touch-icon, SW registration guarded to `*.shrish.co`), and the `generate-product-pages.js` template update — **without** the `node_modules` junk.
- Then test installability on dev, and include in the prod cutover.

## Nice-to-have / low priority
- Admin Growth Dashboard is a **static snapshot** (not live data) — decide if that matters.
- Optional: one-time `git add --renormalize .` commit now that `.gitattributes` exists, to clear CRLF noise for good.

## Reference files (in `premerge-fixes/`)
- `DEPLOYMENT.md` — full go-live steps.
- `deploy-and-verify.sh` — guided deploy runbook.
- `SHRISH_Checkout_QA_Test_Plan.xlsx` — QA workbook.
- `../docs/DEV_PREMERGE_REVIEW.md` — original code review.
