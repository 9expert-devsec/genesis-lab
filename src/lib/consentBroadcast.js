// src/lib/consentBroadcast.js
//
// One event, published the moment a consent decision is made, so a listener
// that is NOT the banner can react to it in the same tick.
//
// ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
// Until the Meta pixel arrived, every consumer of a consent decision could
// read the cookie: gtag is told directly by handleDecision, and the bootstrap
// in consentMode.js reads document.cookie at parse time. Both are one-shot.
//
// The pixel is not one-shot. It must appear the moment marketing is granted,
// WITHIN the page view where the user pressed the button, and it must be told
// when marketing is withdrawn. A component that only reads the cookie on mount
// learns neither — it would sit inert until the next full page load, which is
// the difference between "consent works" and "consent works if you refresh".
//
// ── WHY A WINDOW EVENT AND NOT A REACT CONTEXT ──────────────────────────────
// A context would have to wrap the tree, which means the provider is a client
// component sitting above everything in src/app/layout.jsx. That layout is a
// SERVER component today and every page under it is prerendered; introducing a
// client provider at the root is the same class of regression as calling
// cookies() there (see the long note in src/lib/analytics/consentMode.js).
//
// A window event costs nothing structurally: the publisher and the subscriber
// never meet, neither has to be an ancestor of the other, and a subscriber that
// does not exist is not an error. The trade is that this is untyped and
// untracked by React — acceptable for one event carrying one small object.
//
// ── IT IS A NOTIFICATION, NOT THE SOURCE OF TRUTH ───────────────────────────
// The cookie remains the record. This says only "a decision was just made, and
// here it is"; anything mounting later still reads the cookie for itself. So a
// missed event can only ever cost a subscriber the CURRENT page view, never
// the stored state — which is why nothing here retains or replays.

/**
 * Event name. Namespaced with the same `9e` prefix the consent cookie uses, so
 * it is obvious in devtools which events are ours.
 */
export const CONSENT_DECISION_EVENT = '9e:consent-decision';

/**
 * Announce a decision. `categories` is the SAME object shape the cookie stores
 * and parseConsent returns — `{analytics, functional, marketing}` — so a
 * subscriber applies one rule to both sources rather than two.
 *
 * Silent no-op without a window (SSR) and silent on a failed dispatch: this is
 * called from the banner's decision handler, AFTER the gtag update and the
 * cookie write, and it must never be the reason a decision fails to land.
 */
export function publishConsentDecision(categories) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(
      new window.CustomEvent(CONSENT_DECISION_EVENT, { detail: categories }),
    );
  } catch {
    /* A browser without CustomEvent cannot be told; the cookie still holds. */
  }
}

/**
 * Subscribe. Returns an unsubscribe function, so a React effect can return it
 * directly.
 *
 * The handler receives the categories object. It is passed straight through
 * from `detail` WITHOUT validation, deliberately: the only publisher is
 * handleDecision in the banner, which passes the object it just persisted.
 * Anything else dispatching this event is already running script on the page
 * and has no need of a consent event to do harm. Subscribers still read the
 * value defensively (`detail?.marketing === true`), which is the same strict
 * boolean test parseConsent applies.
 */
export function subscribeConsentDecision(handler) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const listener = (event) => handler(event?.detail ?? null);
  window.addEventListener(CONSENT_DECISION_EVENT, listener);
  return () => window.removeEventListener(CONSENT_DECISION_EVENT, listener);
}
