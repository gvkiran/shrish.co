// ===========================================================================
// admin-ads.js  —  Meta Ads tab for the Shrish admin dashboard
// ---------------------------------------------------------------------------
// Reads pre-synced daily ad metrics from Firestore collection `ad_metrics_meta`
// (written once a day by the Meta -> Firestore sync job; see tools/meta-sync/).
// Renders KPI cards + a daily table with a 24h / 7d / 30d / 90d filter, in the
// same visual language as the Growth Dashboard.
//
// This file is ADDITIVE and self-contained. It does not modify or import any
// existing admin logic; it only exposes window.loadMetaAds() for switchTab().
// ===========================================================================

import {
  db, collection, getDocs, escapeHtml, formatCurrency, cloudFunctions, httpsCallable
} from './firebase-app.js';

const META_COLLECTION = 'ad_metrics_meta';
const getOwnerAnalyticsCallable = httpsCallable(cloudFunctions, 'getOwnerAnalytics');

// --- small helpers -------------------------------------------------------
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function fmtInt(v) { return num(v).toLocaleString('en-US'); }
function fmtPct(v) { return `${num(v).toFixed(2)}%`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1)); // inclusive window of n days
  return d.toISOString().slice(0, 10);
}
function el(id) { return document.getElementById(id); }

// --- state ---------------------------------------------------------------
let cachedRows = null;      // all daily docs, sorted ascending by date
let cacheLoadedAt = 0;

async function fetchAllDaily() {
  // Small collection (one doc per day). Read all, filter client-side.
  const snap = await getDocs(collection(db, META_COLLECTION));
  const rows = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const date = d.date || docSnap.id;
    if (!date) return;
    rows.push({
      date,
      spend: num(d.spend),
      impressions: num(d.impressions),
      reach: num(d.reach),
      clicks: num(d.clicks),
      link_clicks: num(d.link_clicks),
      landing_page_views: num(d.landing_page_views),
      purchases: num(d.purchases),
      purchase_value: num(d.purchase_value)
    });
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

function aggregate(rows) {
  const t = {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    link_clicks: 0, landing_page_views: 0, purchases: 0, purchase_value: 0
  };
  rows.forEach((r) => {
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.reach += r.reach; // note: daily reach summed = approximation, labelled as such
    t.clicks += r.clicks;
    t.link_clicks += r.link_clicks;
    t.landing_page_views += r.landing_page_views;
    t.purchases += r.purchases;
    t.purchase_value += r.purchase_value;
  });
  t.ctr = t.impressions ? (t.link_clicks / t.impressions) * 100 : 0;
  t.cpc = t.link_clicks ? t.spend / t.link_clicks : 0;
  t.costPerPurchase = t.purchases ? t.spend / t.purchases : 0;
  t.clickToLpv = t.link_clicks ? (t.landing_page_views / t.link_clicks) * 100 : 0;
  return t;
}

function kpiCard(label, value, sub) {
  return `<div class="growth-kpi">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(String(value))}</strong>
    ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
  </div>`;
}

function renderKpis(t, rangeDays) {
  const box = el('metaAdsKpis');
  if (!box) return;
  box.innerHTML = [
    kpiCard('Amount Spent', formatCurrency(t.spend), `Last ${rangeDays === 1 ? '24 hours' : rangeDays + ' days'}`),
    kpiCard('Impressions', fmtInt(t.impressions), 'Times shown'),
    kpiCard('Reach (daily sum)', fmtInt(t.reach), 'Approx — people reached/day'),
    kpiCard('Link Clicks', fmtInt(t.link_clicks), 'Clicks to your site'),
    kpiCard('Link CTR', fmtPct(t.ctr), 'Clicks ÷ impressions'),
    kpiCard('Cost / Link Click', formatCurrency(t.cpc), 'CPC'),
    kpiCard('Landing Page Views', fmtInt(t.landing_page_views), 'Pages actually loaded'),
    kpiCard('Meta-Attributed Purchases', fmtInt(t.purchases),
      t.purchases ? `${formatCurrency(t.costPerPurchase)} each · verify vs real orders` : 'Meta’s claim — verify vs real orders')
  ].join('');
}

function renderDailyTable(rows) {
  const box = el('metaAdsDaily');
  if (!box) return;
  if (!rows.length) { box.innerHTML = '<p class="orders-help">No days in this range yet.</p>'; return; }
  const desc = [...rows].reverse();
  const head = `<tr>
    <th>Date</th><th>Spend</th><th>Impr.</th><th>Link clicks</th>
    <th>CTR</th><th>LP views</th><th>Purch. (Meta)</th></tr>`;
  const body = desc.map((r) => {
    const ctr = r.impressions ? (r.link_clicks / r.impressions) * 100 : 0;
    return `<tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${formatCurrency(r.spend)}</td>
      <td>${fmtInt(r.impressions)}</td>
      <td>${fmtInt(r.link_clicks)}</td>
      <td>${fmtPct(ctr)}</td>
      <td>${fmtInt(r.landing_page_views)}</td>
      <td>${fmtInt(r.purchases)}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `<table class="orders-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function setStatus(msg, isError) {
  const s = el('metaAdsStatus');
  if (!s) return;
  s.textContent = msg;
  s.style.color = isError ? 'var(--danger, #c0392b)' : '';
}

// --- main entry (called by switchTab and the filter/refresh controls) ----
async function loadMetaAds(force) {
  const rangeSel = el('metaAdsRange');
  const rangeDays = rangeSel ? num(rangeSel.value) || 30 : 30;
  loadAdFunnel(rangeDays);
  try {
    setStatus('Loading Meta ad metrics…', false);
    if (force || !cachedRows || (Date.now() - cacheLoadedAt) > 5 * 60 * 1000) {
      cachedRows = await fetchAllDaily();
      cacheLoadedAt = Date.now();
    }
    if (!cachedRows.length) {
      setStatus('No data yet. Once the daily Meta sync runs, numbers will appear here. '
        + '(See tools/meta-sync/README for setup.)', false);
      renderKpis(aggregate([]), rangeDays);
      renderDailyTable([]);
      return;
    }
    const cutoff = daysAgoISO(rangeDays);
    const inRange = cachedRows.filter((r) => r.date >= cutoff && r.date <= todayISO());
    renderKpis(aggregate(inRange), rangeDays);
    renderDailyTable(inRange);
    const last = cachedRows[cachedRows.length - 1]?.date || '—';
    setStatus(`Showing last ${rangeDays === 1 ? '24 hours' : rangeDays + ' days'} · `
      + `${inRange.length} day(s) with data · latest sync date: ${last}`, false);
  } catch (err) {
    console.error('[meta-ads] load failed', err);
    setStatus('Could not load Meta metrics: ' + (err?.message || err)
      + ' — check that the ad_metrics_meta collection is readable by admins.', true);
  }
}

function refreshMetaAds() { loadMetaAds(true); }

// --- Ad funnel (PostHog, filtered to visitors who arrived from the ad) --------
function funnelStage(label, count, prevCount, sub) {
  const pct = prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
  const arrow = pct !== null
    ? `<div style="font-size:11px;color:var(--text-light);padding:3px 0 3px 2px">↓ ${pct}% continued</div>`
    : '';
  return `${arrow}<div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid rgba(200,121,26,0.14)">
    <span>${escapeHtml(label)}${sub ? ` <span style="font-size:11px;color:var(--text-light)">${escapeHtml(sub)}</span>` : ''}</span>
    <strong style="font-size:20px;color:var(--gold-200,#e0b64a)">${fmtInt(count)}</strong>
  </div>`;
}

async function loadAdFunnel(rangeDays) {
  const box = el('metaAdsFunnel');
  if (!box) return;
  box.innerHTML = '<p class="orders-help">Loading funnel from PostHog…</p>';
  try {
    const days = Math.max(7, rangeDays || 30); // getOwnerAnalytics supports 7–90 days
    const res = await getOwnerAnalyticsCallable({ days });
    const data = (res && res.data) || {};
    if (!data.connected) {
      box.innerHTML = '<p class="orders-help">Funnel needs PostHog connected (same key as the Growth Dashboard). Once it is, this fills in automatically.</p>';
      return;
    }
    const f = data.adFunnel || {};
    const visitors = num(f.visitors), clicks = num(f.productClicks), carts = num(f.cartAdds),
      checkout = num(f.reachedCheckout), orders = num(f.orders);
    if (!visitors && !clicks && !carts && !orders) {
      box.innerHTML = `<p class="orders-help">No ad-attributed visitors in the last ${days} days yet. When your Meta ad drives clicks (they carry an fbclid), this funnel populates.</p>`;
      return;
    }
    box.innerHTML =
      funnelStage('Visitors from ad', visitors, 0, 'arrived via Meta') +
      funnelStage('Clicked a product', clicks, visitors) +
      funnelStage('Added to cart', carts, clicks) +
      funnelStage('Reached checkout', checkout, carts) +
      funnelStage('Completed order', orders, checkout);
  } catch (e) {
    box.innerHTML = `<p class="orders-help">Could not load funnel: ${escapeHtml(e && e.message ? e.message : String(e))}</p>`;
  }
}

// expose for onclick / switchTab (matches the admin-firebase.js window pattern)
window.loadMetaAds = loadMetaAds;
window.refreshMetaAds = refreshMetaAds;
