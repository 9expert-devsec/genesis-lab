// src/lib/cookieConsentStore.js
//
// Where the visitor's cookie choice is written, and what shape it has.
//
// ── A FIRST-PARTY COOKIE, NOT localStorage, AND THE REASON IS THE NEXT ROUND ─
// Both would satisfy "the banner does not come back after a refresh". They are
// not interchangeable for what comes AFTER that, and picking on convenience now
// would have to be undone later:
//
//   THE SERVER HAS TO READ IT. Consent Mode only works if the `consent`
//   `default` command runs BEFORE the Google tag loads. The tag is injected by
//   src/components/analytics/Analytics.jsx from the ROOT LAYOUT, which is a
//   server component — so the correct defaults have to be in the SSR HTML, in a
//   <script> above the tag. A server component can read a cookie
//   (`next/headers` → cookies()); it cannot read localStorage, which does not
//   exist until the browser has parsed and run script. With localStorage the
//   only options would be to ship `denied` defaults and correct them on the
//   client one tick later — a real window in which the tag is live under the
//   wrong state — or to block rendering on a client round trip. A cookie makes
//   the whole problem disappear: the value is already in the request.
//
//   EXPIRY IS PART OF THE RECORD. Consent is not permanent; regulators expect
//   it to be re-asked periodically, and a cookie expresses that natively via
//   Max-Age, enforced by the browser. localStorage never expires, so the same
//   rule would have to be re-implemented as a timestamp comparison that every
//   reader must remember to perform — and the one that forgets silently honours
//   a three-year-old choice.
//
// The costs are accepted knowingly: the value travels on every request to this
// origin (it is ~90 bytes), and it is not HttpOnly because the banner has to
// read it client-side too. Neither matters for a non-secret preference.
//
// ── STILL NOT WIRED ─────────────────────────────────────────────────────────
// Writing this cookie changes NOTHING about tracking today. No gtag call, no
// Consent Mode default change. It records what the user asked for so the wiring
// round has something to honour, and the banner's preview notice says exactly
// that in Thai. Storing the choice and acting on it are two different commits
// on purpose: this one can be reviewed for correctness of the RECORD without
// also having to be right about the tag.

/**
 * Cookie name. Prefixed like the rest of this origin's first-party cookies so
 * it is obvious in devtools which are ours.
 */
export const CONSENT_COOKIE = '9e_cookie_consent';

/**
 * Schema version. BUMP THIS whenever the meaning or the shape of `categories`
 * changes — including adding or removing a category.
 *
 * It is not the only guard, and it is the weaker of the two: a version number
 * only helps people who remember to change it. `parseConsent` below ALSO
 * checks that the stored key set matches the current category list exactly, so
 * a forgotten bump still cannot resurrect a stale record — a record naming
 * categories we no longer have, or missing one we have added, is rejected as
 * unreadable and the banner asks again. That is the safe direction: asking a
 * user twice is a minor annoyance, silently inferring consent for a category
 * they were never shown is not.
 */
export const CONSENT_SCHEMA_VERSION = 1;

/**
 * Six months. Long enough not to nag, short enough that a choice made under a
 * previous version of the policy does not stand indefinitely — the window
 * commonly used for PDPA/GDPR re-consent.
 */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * Serialise a decision.
 *
 * `categories` holds ONLY the optional ones. "คุกกี้ที่จำเป็น" is deliberately
 * absent: it is not a choice, it is always on, and writing `necessary: true`
 * into the record would invite a future reader to treat it as revocable — or,
 * worse, to find `necessary: false` in a hand-edited cookie and honour it.
 *
 * `ts` is an ISO timestamp of when consent was given. Not used for expiry (the
 * cookie's Max-Age does that), but a consent record that cannot say WHEN it was
 * collected is not much of a record, and the wiring round may need to show it.
 */
export function serialiseConsent(categories, nowIso) {
  return JSON.stringify({
    v: CONSENT_SCHEMA_VERSION,
    categories,
    ts: nowIso,
  });
}

/**
 * Parse a stored value back into a categories object, or null if it cannot be
 * trusted for ANY reason.
 *
 * `expectedKeys` is passed in rather than imported so this stays pure and so a
 * test can prove the key-set check actually rejects a drifted record.
 *
 * Every rejection path returns null — the same as "no record" — because there
 * is exactly one safe response to an unreadable consent record and that is to
 * ask again. Nothing here throws: a malformed cookie is an ordinary thing to
 * receive (hand-edited, truncated, written by an older build) and must not be
 * able to break rendering.
 */
export function parseConsent(raw, expectedKeys) {
  if (typeof raw !== 'string' || raw === '') return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.v !== CONSENT_SCHEMA_VERSION) return null;

  const { categories } = parsed;
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return null;

  // The key set must match EXACTLY — not a subset, not a superset. A stored
  // record from before a category existed would otherwise leave that category
  // undefined, which reads as "not granted" and looks fine, while a record from
  // after a category was removed would carry a key nothing consumes. Both are
  // silent; both mean the user never actually answered the question we are now
  // asking.
  const storedKeys = Object.keys(categories).sort();
  const wantKeys = [...expectedKeys].sort();
  if (storedKeys.length !== wantKeys.length) return null;
  if (storedKeys.some((k, i) => k !== wantKeys[i])) return null;

  // Values must be real booleans. `"false"` is a string and is truthy, which is
  // the classic way a "denied" record turns into a granted one.
  if (Object.values(categories).some((v) => typeof v !== 'boolean')) return null;

  return { ...categories };
}

// ── Browser I/O ─────────────────────────────────────────────────────────────
// Split from the pure functions above so the parsing rules can be tested
// without a DOM. These two are the only places that touch document.cookie.

/** Read the raw cookie value, or '' when absent / unavailable. */
export function readConsentCookie() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + CONSENT_COOKIE + '=([^;]*)'),
  );
  try {
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    // A value that is not valid percent-encoding cannot have come from us.
    return '';
  }
}

/**
 * Write the decision.
 *
 * SameSite=Lax — the value is only ever needed on top-level navigations to this
 * origin, and Lax is what stops it riding along on third-party requests.
 * Secure is set only on https, because on a plaintext localhost dev server a
 * Secure cookie is silently dropped and the feature would appear broken in
 * exactly the environment it is developed in.
 */
export function writeConsentCookie(categories, nowIso) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(serialiseConsent(categories, nowIso));
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
    ? '; Secure'
    : '';
  document.cookie =
    `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
