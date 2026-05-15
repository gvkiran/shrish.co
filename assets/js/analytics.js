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
    if (!eventName || !enabled || !window.posthog?.capture) return;
    window.posthog.capture(eventName, cleanProps({
      page_path: safePath(),
      page_type: pageType(),
      ...cartSummary(),
      ...props
    }));
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

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: POSTHOG_DEFAULTS,
    autocapture: false,
    capture_pageview: true,
    disable_session_recording: true,
    person_profiles: 'identified_only'
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      trackPageViewed();
      bindScrollDepthTracking();
    }, { once: true });
  } else {
    trackPageViewed();
    bindScrollDepthTracking();
  }
})();
