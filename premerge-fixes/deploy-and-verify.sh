#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy-and-verify.sh  —  guided go-live for the hardened checkout
#
# Runs the automatable bits and PAUSES for the steps only you can do
# (Firebase login, Stripe keys/webhook, live test). Nothing goes to prod or
# enables live payments without you typing "yes" at the gate.
#
# Run from repo root:  bash ./premerge-fixes/deploy-and-verify.sh
# Prereqs: firebase-tools installed & logged in (firebase login), on the
# Firebase project for shrish.co.
# ---------------------------------------------------------------------------
set -euo pipefail
[ -d .git ] || { echo "Run from the repo root."; exit 1; }
gate(){ read -r -p ">> $1  (type 'yes' to continue) " a; [ "$a" = "yes" ] || { echo "Stopped."; exit 1; }; }

echo "STEP 1 — commit the functions/.gitignore safety edit and push to developement"
if ! git diff --quiet -- functions/.gitignore 2>/dev/null; then
  git add functions/.gitignore
  git commit -m "Ignore functions/.env so secrets are never committed"
fi
# You are on premerge-hardening == developement; push both.
git push origin premerge-hardening 2>/dev/null || true
git push origin premerge-hardening:developement 2>/dev/null || true
echo

cat <<'TXT'
STEP 2 — set Firebase secrets (one-time). Run these yourself, then re-run this script from STEP 3:
    firebase functions:secrets:set STRIPE_SECRET_KEY        # sk_test_... first, sk_live_... at go-live
    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET     # value comes from STEP 4
    firebase functions:secrets:set RESEND_API_KEY            # existing
    firebase functions:secrets:set POSTHOG_PERSONAL_API_KEY  # existing

STEP 2b — create functions/.env (auto-loaded; now gitignored):
    STRIPE_PAYMENTS_ENABLED=false        # keep false until the live test below passes
    SHRISH_GOOGLE_MAPS_API_KEY=<your restricted browser key>
    SHRISH_VA_SALES_TAX_RATE=0.01        # confirm with your CPA
    SHRISH_STANDARD_SHIPPING_AMOUNT=8.99
    SHRISH_FREE_SHIPPING_THRESHOLD=75
    POSTHOG_API_KEY=<existing>
    POSTHOG_HOST=https://us.i.posthog.com
TXT
gate "Secrets + functions/.env are set"

echo "STEP 3 — deploy functions + Firestore rules (Stripe still OFF)"
gate "Deploy now"
firebase deploy --only functions,firestore:rules

cat <<'TXT'

STEP 4 — register the Stripe webhook (manual, in Stripe Dashboard):
  1. Copy the deployed stripeWebhook URL (Firebase console -> Functions, or deploy output).
  2. Stripe -> Developers -> Webhooks -> Add endpoint -> paste URL.
  3. Events: checkout.session.completed  AND  checkout.session.expired
  4. Copy the signing secret -> firebase functions:secrets:set STRIPE_WEBHOOK_SECRET -> redeploy functions.

STEP 5 — enable online pay in TEST mode and verify on dev:
  - Set STRIPE_PAYMENTS_ENABLED=true in functions/.env, redeploy functions (test keys).
  - On dev.shrish.co, a non-mango cart -> Ship to me -> Stripe. Check the Stripe page shows the
    correct product prices + VA tax + shipping.
  - PRICE-TAMPERING LIVE TEST: change an order doc's item price in Firestore, start checkout,
    confirm Stripe still charges the real catalog price. (Claude can drive this test for you.)
  - Complete a test payment -> order flips to paid -> confirmation email says "Payment completed online."
  - Confirm login / password reset / order history still work; hard-reload for fresh assets.
TXT
gate "All STEP 5 checks passed with TEST keys"

cat <<'TXT'

STEP 6 — GO LIVE:
  - Swap to LIVE Stripe secret + LIVE webhook signing secret; STRIPE_PAYMENTS_ENABLED=true; redeploy functions.
  - Merge developement -> main, deploy prod static (Hostinger/Vercel), hard-reload.
  - Run ONE small real order end-to-end to confirm production.
TXT
gate "Ready to merge developement -> main"
echo "Do the prod-static deploy your usual way after this merge."
# Note: developement is worktree-locked locally; merge on the remote or in your dev worktree:
#   git push origin premerge-hardening:main    # if fast-forward and you intend main==this
echo "Done. Run the real end-to-end order, then you're live."
