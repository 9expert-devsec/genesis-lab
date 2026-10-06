/**
 * Report one consent decision to the aggregate counters (round CB-C §4).
 *
 * FIRE AND FORGET. Called by the banner mount AFTER the decision has been
 * applied to gtag, stored and broadcast. It is never awaited, it swallows every
 * failure, and `keepalive` lets the request finish even if the decision was
 * followed by a navigation — so a slow or failed POST can never hold the banner
 * open or lose the decision itself.
 *
 * The body is exactly what /api/consent-stats accepts, nothing else: no id, no
 * page URL, no timestamp. The browser adds Origin, which the route checks.
 */
export const CONSENT_STATS_ENDPOINT = '/api/consent-stats';

export function reportConsentChoice({ choice, analytics, marketing, layer }) {
  if (typeof fetch !== 'function') return;
  try {
    fetch(CONSENT_STATS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ choice, analytics: analytics === true, marketing: marketing === true, layer }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
  } catch {
    /* no fetch, a blocked request — the decision already landed */
  }
}
