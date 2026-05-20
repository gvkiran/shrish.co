# Security and Billing Guardrails

These are the first low-maintenance guardrails for Shrish before online payment traffic grows.

## Billing Alerts

Set this in Google Cloud Console, because Firebase projects use Google Cloud Billing behind the scenes.

Recommended starting budget:
- Project: `shrish-website`
- Budget amount: `$10/month`
- Alert thresholds: `50%`, `90%`, `100%`, and `100% forecasted spend`
- Email recipients: the billing account admins, including `contact@shrish.co`

Console path:
1. Open Google Cloud Console.
2. Go to Billing.
3. Open Budgets & alerts.
4. Create a monthly budget scoped to `shrish-website`.
5. Add the threshold alerts above.

Review monthly until the payment flow is stable. Raise the budget later only when real sales volume supports it.

## App Check Rollout

App Check blocks automated abuse against browser calls to Firebase and Cloud Functions. The code is ready, but enforcement must be turned on in stages.

Current code behavior:
- `assets/js/firebase-app.js` initializes App Check only when `window.SHRISH_APP_CONFIG.appCheckSiteKey` is filled.
- Callable Firebase Functions include an enforcement switch controlled by `SHRISH_ENFORCE_APP_CHECK=true`.
- Leaving the site key blank and the env flag unset keeps today's behavior unchanged.

Safe rollout:
1. Firebase Console > App Check > Register the web app for `shrish.co`.
2. Use reCAPTCHA Enterprise and add allowed domains:
   - `shrish.co`
   - `www.shrish.co`
   - Vercel development preview domains used for testing
3. Copy the site key into `assets/js/firebase-config.js` as `appCheckSiteKey`.
4. Deploy to `developement` and test:
   - checkout
   - Stripe checkout start
   - account login
   - pending order edit/cancel
   - feedback submit
   - admin reminders
5. Only after successful testing, set the Cloud Functions environment variable:
   - `SHRISH_ENFORCE_APP_CHECK=true`
6. Redeploy callable functions and test again.

Do not enable enforcement before step 4 passes, or customer checkout/account actions can fail with App Check errors.

## Firebase Functions Runtime

Firebase Functions are configured for Node.js 22 in `functions/package.json`.

When promoting this change:
1. Deploy to `developement`/preview branch first.
2. Smoke-test callable functions:
   - Stripe checkout start
   - account login/order claim
   - pending order edit/cancel
   - feedback submit
   - admin customer delete
   - admin reminder email
3. Deploy Firebase functions to production only during a planned release window.

This avoids the Node.js 20 runtime decommission date of October 30, 2026.
