// Thin wrapper around window.gtag so callers never touch window directly and
// SSR never crashes. Every function is a no-op (silent return) when gtag isn't
// loaded — they must never throw.
//
// ── IN GTM MODE THE EVENTS GO QUIET, AND THAT IS THE WHOLE GUARANTEE ────────
// With NEXT_PUBLIC_GTM_ID set, the Google tag is loaded BY GTM, and it would
// process every `gtag('event', …)` this code queues — on top of the GA4 and
// Ads tags GTM fires from the dataLayer contract. Two counts per event. So in
// that mode gtagEvent sends nothing: the conversion helpers push the contract
// (src/lib/analytics/dataLayer.js) and GTM alone decides what Google hears.
//
// The one exception is an event with no contract twin — postcode_lookup_miss —
// which is forwarded to the dataLayer as-is so GTM can still see it.
//
// `gtag('consent', …)` is NOT an event and is unaffected: GTM honours consent
// commands queued through gtag in both modes.
import { GTM_ENABLED } from '@/lib/analytics/config';
import { EVENTS, pushEvent } from '@/lib/analytics/dataLayer';

const GTM_PASSTHROUGH = new Set([EVENTS.postcodeLookupMiss]);

export function gtagEvent(action, params = {}) {
  if (typeof window === 'undefined') return;
  if (GTM_ENABLED) {
    if (GTM_PASSTHROUGH.has(action)) pushEvent(action, params);
    return;
  }
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', action, params);
}

export function gtagPageView(url) {
  if (typeof window === 'undefined') return;
  const params = {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  };
  // GTM mode: the contract's page_view, which GTM's GA4 page_view tag fires on.
  // The Google tag there is configured with send_page_view=false, so this is
  // still the single source of page views.
  if (GTM_ENABLED) {
    pushEvent(EVENTS.pageView, params);
    return;
  }
  if (typeof window.gtag !== 'function') return;
  // GA4 page_view on SPA route change
  window.gtag('event', 'page_view', params);
}

// Consent update helper (used later if a consent banner is added)
export function gtagConsentUpdate(consent) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', consent);
}
