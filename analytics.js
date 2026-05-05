// SHRISH privacy-safe PostHog analytics.
// Tracks business events only; does not identify customers or send contact details.
(function () {
  'use strict';

  const POSTHOG_KEY = 'phc_nahtjps6yPwpAmYfd7gh6P5BnR82NosPSg6zCEGvJXDM';
  const POSTHOG_HOST = 'https://us.i.posthog.com';
  const POSTHOG_DEFAULTS = '2026-01-30';
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname);
  const enabled = Boolean(POSTHOG_KEY) && !isLocal;

  function safePath() {
    return window.location.pathname || '/';
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
      ...props
    }));
  }

  window.SHRISH_ANALYTICS = {
    enabled,
    track
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
})();
