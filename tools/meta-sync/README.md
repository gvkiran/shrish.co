# Meta Ads → Firestore sync

Pulls **daily** Meta (Facebook/Instagram) ad metrics into the Firestore
collection **`ad_metrics_meta`**. The admin dashboard's **Meta Ads** tab reads
that collection and shows spend, impressions, reach, link clicks, CTR, CPC,
landing-page views and Meta-attributed purchases, with a 24h / 7d / 30d / 90d
filter.

Nothing runs in the browser — the token lives only in GitHub secrets.

---

## One-time setup (about 15 minutes)

### 1. Meta access token (read-only)
1. Go to **business.facebook.com → Business settings → Users → System users**.
2. Create (or pick) a system user → **Add assets** → assign your ad account
   **Shrish LLC – US Eastern (act_1053287494061502)** with **View performance**.
3. **Generate new token** → select your app → scope **`ads_read`** →
   set expiration to **Never** → copy the token.

### 2. Firebase service account (write access)
1. Firebase console → **Project settings → Service accounts**
   (project **shrish-website**).
2. **Generate new private key** → download the JSON file.

### 3. Add the secrets to GitHub
In the repo **Settings → Secrets and variables → Actions**:

| Type       | Name                        | Value                                  |
|------------|-----------------------------|----------------------------------------|
| **Secret** | `META_ACCESS_TOKEN`         | the token from step 1                  |
| **Secret** | `FIREBASE_SERVICE_ACCOUNT`  | paste the **entire** JSON from step 2  |
| Variable*  | `META_AD_ACCOUNT_ID`        | `act_1053287494061502` (optional)      |

\* optional — the script already defaults to this account.

### 4. Firestore read rule (so the admin page can read it)
The sync writes via the Admin SDK (bypasses rules). The **admin page** reads it,
so add a rule that matches how you already gate admins. Example:

```
match /ad_metrics_meta/{doc} {
  allow read:  if request.auth != null && request.auth.token.email == "contact@shrish.co";
  allow write: if false;   // only the server sync writes
}
```

Deploy rules the way you normally do (Firebase console → Firestore → Rules, or
`firebase deploy --only firestore:rules`).

### 5. Run it once to backfill
GitHub → **Actions → "Meta Ads -> Firestore sync" → Run workflow**.
It backfills the last 90 days, then runs automatically every day at 09:00 UTC.
Open the admin **Meta Ads** tab and the numbers appear.

---

## Run locally (optional)
```bash
cd tools/meta-sync
npm install
META_ACCESS_TOKEN="…" \
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
node sync-meta-insights.mjs
```

## Notes
- **Purchases are Meta's attribution**, not your real orders. Compare them
  against your Firebase orders; a mismatch usually means the Meta Pixel is
  firing "Purchase" on the wrong action.
- `SYNC_DAYS` (default 90) controls how far back each run re-pulls, so late
  attribution corrections get picked up.
- Reach is summed per day for the range total, so the multi-day "Reach" figure
  is an approximation (labelled as such in the UI).
