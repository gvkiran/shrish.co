// ===========================================================================
// sync-meta-insights.mjs
// ---------------------------------------------------------------------------
// Pulls DAILY Meta (Facebook/Instagram) ad insights for the Shrish ad account
// and writes one document per day into the Firestore collection
// `ad_metrics_meta` (doc id = YYYY-MM-DD). The admin "Meta Ads" tab reads it.
//
// Runs on a schedule via .github/workflows/meta-ads-sync.yml (or `node` locally).
// Requires Node 18+ (uses built-in fetch).
//
// Environment variables (set as GitHub Actions secrets):
//   META_ACCESS_TOKEN      - Meta System User token with `ads_read`
//   FIREBASE_SERVICE_ACCOUNT - full service-account JSON (as a string)
//   META_AD_ACCOUNT_ID     - optional, defaults to act_1053287494061502
//   SYNC_DAYS              - optional, how many days back to (re)sync, default 90
// ===========================================================================

import admin from 'firebase-admin';

const GRAPH_VERSION = 'v22.0';
const ACCOUNT_ID = (process.env.META_AD_ACCOUNT_ID || 'act_1053287494061502').trim();
const ACCOUNT = ACCOUNT_ID.startsWith('act_') ? ACCOUNT_ID : `act_${ACCOUNT_ID}`;
const TOKEN = process.env.META_ACCESS_TOKEN;
const SYNC_DAYS = Number(process.env.SYNC_DAYS || 90);
const COLLECTION = 'ad_metrics_meta';

function die(msg) { console.error('ERROR:', msg); process.exit(1); }
if (!TOKEN) die('META_ACCESS_TOKEN is not set.');
if (!process.env.FIREBASE_SERVICE_ACCOUNT) die('FIREBASE_SERVICE_ACCOUNT is not set.');

// --- Firebase Admin -------------------------------------------------------
let serviceAccount;
try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
catch (e) { die('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + e.message); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// --- helpers --------------------------------------------------------------
function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function sumActions(list, matcher) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((acc, a) => acc + (matcher(a.action_type) ? Number(a.value || 0) : 0), 0);
}
const isPurchase = (t) => /purchase/i.test(t || '');           // omni_purchase, fb_pixel_purchase, etc.
const isLPV = (t) => t === 'landing_page_view';

// --- fetch insights (handles pagination) ----------------------------------
async function fetchInsights() {
  const since = isoDaysAgo(SYNC_DAYS);
  const until = isoDaysAgo(0);
  const fields = [
    'date_start', 'spend', 'impressions', 'reach', 'clicks',
    'inline_link_clicks', 'ctr', 'cpc', 'actions', 'action_values'
  ].join(',');
  const base = `https://graph.facebook.com/${GRAPH_VERSION}/${ACCOUNT}/insights`;
  const params = new URLSearchParams({
    level: 'account',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields,
    limit: '500',
    access_token: TOKEN
  });
  let url = `${base}?${params.toString()}`;
  const rows = [];
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) die('Meta API: ' + JSON.stringify(json.error));
    (json.data || []).forEach((r) => rows.push(r));
    url = json.paging && json.paging.next ? json.paging.next : null;
  }
  return rows;
}

function normalize(r) {
  return {
    date: r.date_start,
    account_id: ACCOUNT,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    reach: Number(r.reach || 0),
    clicks: Number(r.clicks || 0),
    link_clicks: Number(r.inline_link_clicks || 0),
    ctr: Number(r.ctr || 0),
    cpc: Number(r.cpc || 0),
    landing_page_views: sumActions(r.actions, isLPV),
    purchases: sumActions(r.actions, isPurchase),
    purchase_value: sumActions(r.action_values, isPurchase),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
}

// --- main -----------------------------------------------------------------
(async () => {
  console.log(`Syncing ${ACCOUNT} · last ${SYNC_DAYS} days -> ${COLLECTION}`);
  const raw = await fetchInsights();
  console.log(`Meta returned ${raw.length} daily row(s).`);
  let written = 0;
  const batch = db.batch();
  for (const r of raw) {
    const row = normalize(r);
    if (!row.date) continue;
    batch.set(db.collection(COLLECTION).doc(row.date), row, { merge: true });
    written++;
  }
  if (written) await batch.commit();
  console.log(`Wrote ${written} day(s) to Firestore. Done.`);
  process.exit(0);
})().catch((e) => die(e.stack || e.message || String(e)));
