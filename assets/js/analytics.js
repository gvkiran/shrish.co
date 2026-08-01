// First-touch attribution capture: records how a visitor arrived (Meta ad clicks
// carry utm_* params and/or fbclid) so real orders can be tagged with their source.
// Stored once (first touch) and read at checkout. Best-effort; never blocks anything.
(function captureShrishAttribution() {
  'use strict';
  try {
    const KEY = 'shrish_attribution';
    if (window.localStorage.getItem(KEY)) return; // keep the first touch only
    const p = new URLSearchParams(window.location.search || '');
    const val = (k) => (p.get(k) || '').slice(0, 120);
    const attribution = {
      utm_source: val('utm_source'),
      utm_medium: val('utm_medium'),
      utm_campaign: val('utm_campaign'),
      utm_content: val('utm_content'),
      fbclid: val('fbclid')
    };
    if (!Object.values(attribution).some(Boolean)) return; // only tagged/ad visits
    attribution.landing_page = String(window.location.pathname || '').slice(0, 120);
    attribution.referrer = String(document.referrer || '').slice(0, 200);
    attribution.captured_at = new Date().toISOString();
    window.localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch (e) { /* attribution is best-effort */ }
})();

// Meta Pixel tracking for Shrish website sales campaigns.
// Sends PageView on all live pages and Purchase only after a confirmed Stripe return.
(function () {
  'use strict';

  const META_PIXEL_ID = '1576599090538377';
  const PURCHASE_DEDUP_PREFIX = 'shrish_meta_purchase_v2:';
  const PURCHASE_WATCH_TIMEOUT_MS = 120000;
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname);

  if (!META_PIXEL_ID || isLocal || window.__SHRISH_META_PIXEL_INITIALIZED__) return;
  window.__SHRISH_META_PIXEL_INITIALIZED__ = true;

  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', META_PIXEL_ID);
  window.fbq('track', 'PageView');

  function purchaseDedupKey(orderId) {
    return `${PURCHASE_DEDUP_PREFIX}${orderId}`;
  }

  function purchaseWasTracked(orderId) {
    try {
      return window.localStorage.getItem(purchaseDedupKey(orderId)) === '1';
    } catch {
      return false;
    }
  }

  function markPurchaseTracked(orderId) {
    try {
      window.localStorage.setItem(purchaseDedupKey(orderId), '1');
    } catch {
      // Tracking still succeeds when storage is unavailable; deduplication is best effort.
    }
  }

  function parseCurrency(value) {
    const amount = Number.parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
  }

  function metaPixelLibraryIsReady() {
    return typeof window.fbq === 'function' && typeof window.fbq.callMethod === 'function';
  }

  function confirmedStripePurchase() {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('payment') !== 'success') return null;

    const orderId = String(params.get('orderId') || '').trim();
    if (!orderId || purchaseWasTracked(orderId)) return null;

    // Only count a Purchase if THIS browser actually placed the order.
    // Bots, link scanners, prefetchers and crawlers that hit the success URL
    // never set this proof key, so they can no longer fire ghost purchases.
    try {
      if (window.localStorage.getItem('shrish_meta_purchase_proof:' + orderId) !== '1') return null;
    } catch {
      return null;
    }

    const successScreen = document.getElementById('successScreen');
    if (!successScreen || window.getComputedStyle(successScreen).display === 'none') return null;

    const totalRow = [...document.querySelectorAll('#successSummary .ss-row')].find((row) => {
      const label = row.querySelector('span:first-child')?.textContent?.trim().toLowerCase();
      return label === 'total';
    });
    const value = parseCurrency(totalRow?.querySelector('span:last-child')?.textContent);
    if (!(value > 0)) return null;

    return { orderId, value };
  }

  function trackConfirmedStripePurchase() {
    const purchase = confirmedStripePurchase();
    if (!purchase || !metaPixelLibraryIsReady()) return false;

    window.fbq(
      'track',
      'Purchase',
      { value: purchase.value, currency: 'USD' },
      { eventID: `stripe_${purchase.orderId}` }
    );
    markPurchaseTracked(purchase.orderId);
    return true;
  }

  function watchForConfirmedStripePurchase() {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('payment') !== 'success' || !params.get('orderId')) return;

    let observer;
    let intervalId;
    let timeoutId;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    const check = () => {
      if (trackConfirmedStripePurchase()) cleanup();
    };

    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    intervalId = window.setInterval(check, 500);
    timeoutId = window.setTimeout(cleanup, PURCHASE_WATCH_TIMEOUT_MS);
    window.addEventListener('load', check, { once: true });
    check();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForConfirmedStripePurchase, { once: true });
  } else {
    watchForConfirmedStripePurchase();
  }
})();

// SHRISH privacy-safe PostHog analytics.
// Tracks business events only; does not identify customers or send contact details.
(function () {
  'use strict';

  const POSTHOG_KEY = 'phc_nahtjps6yPwpAmYfd7gh6P5BnR82NosPSg6zCEGvJXDM';
  const POSTHOG_HOST = 'https://us.i.posthog.com';
  const POSTHOG_DEFAULTS = '2026-01-30';
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname);
  const enabled = Boolean(POSTHOG_KEY) && !isLocal;
  const scrollDepthsTracked = new Set();
  const eventQueue = [];
  let analyticsBooted = false;

  function afterFirstPaint(callback, timeout = 7600) {
    window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout: 1000 });
        return;
      }
      callback();
    }, timeout);
  }

  function safePath() {
    return window.location.pathname || '/';
  }

  function safeSearchParams() {
    const params = new URLSearchParams(window.location.search || '');
    return {
      category: params.get('category') || params.get('filter') || '',
      product_id: params.get('product') || '',
      search_present: Boolean((params.get('search') || params.get('q') || '').trim()),
      source: params.get('utm_source') || '',
      campaign: params.get('utm_campaign') || '',
      medium: params.get('utm_medium') || ''
    };
  }

  function pageType() {
    const file = safePath().split('/').pop() || 'index.html';
    if (file === 'index.html' || file === '') return 'home';
    if (file === 'shop.html') return 'shop';
    if (file === 'order.html') return 'checkout';
    if (file === 'contact.html') return 'contact';
    if (file === 'recipes.html') return 'recipes';
    return file.replace(/\.html$/i, '') || 'other';
  }

  function cartSummary() {
    try {
      const cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
      return {
        cart_total_items: cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
        cart_distinct_items: cart.length
      };
    } catch (error) {
      return {
        cart_total_items: 0,
        cart_distinct_items: 0
      };
    }
  }

  function cleanProps(props = {}) {
    const blockedKeys = /email|phone|name|address|note|instruction|message|orderNumber|orderId|fullName/i;
    return Object.entries(props).reduce((safe, [key, value]) => {
      if (blockedKeys.test(key)) return safe;
      if (value === undefined || value === null || typeof value === 'function') return safe;
      if (typeof value === 'string') safe[key] = value.slice(0, 120);
      else if (typeof value === 'number' || typeof value === 'boolean') safe[key] = value;
      else if (Array.isArray(value)) safe[key] = value.slice(0, 20).map((item) => String(item).slice(0, 80));
      return safe;
    }, {});
  }

  function track(eventName, props = {}) {
    if (!eventName || !enabled) return;
    const safeProps = cleanProps({
      page_path: safePath(),
      page_type: pageType(),
      ...cartSummary(),
      ...props
    });
    if (window.posthog?.capture) {
      window.posthog.capture(eventName, safeProps);
      return;
    }
    if (eventQueue.length < 40) eventQueue.push([eventName, safeProps]);
  }

  function flushQueuedEvents() {
    if (!window.posthog?.capture) return;
    while (eventQueue.length) {
      const [eventName, props] = eventQueue.shift();
      window.posthog.capture(eventName, props);
    }
  }

  function trackPageViewed() {
    track('page_viewed', {
      page_title: document.title || '',
      referrer_domain: document.referrer ? new URL(document.referrer).hostname : '',
      ...safeSearchParams()
    });
  }

  function bindScrollDepthTracking() {
    window.addEventListener('scroll', () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const depth = Math.round((window.scrollY / scrollable) * 100);
      [25, 50, 75, 90].forEach((marker) => {
        if (depth >= marker && !scrollDepthsTracked.has(marker)) {
          scrollDepthsTracked.add(marker);
          track('page_scroll_depth_reached', { scroll_depth_percent: marker });
        }
      });
    }, { passive: true });
  }

  window.SHRISH_ANALYTICS = {
    enabled,
    track,
    pageType,
    cartSummary
  };

  if (!enabled) return;

  function bootAnalytics() {
    if (analyticsBooted) return;
    analyticsBooted = true;
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: POSTHOG_DEFAULTS,
      autocapture: false,
      // Keep the custom `page_viewed` event for SHRISH funnels, and also emit
      // PostHog's standard pageview so the built-in DAU/WAU/referrer cards work.
      capture_pageview: true,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_decide: true,
      person_profiles: 'identified_only',
      loaded: flushQueuedEvents
    });
    trackPageViewed();
    bindScrollDepthTracking();
  }

  afterFirstPaint(bootAnalytics);
})();
