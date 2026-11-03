/**
 * The browser half of registration attribution: where the touches live between
 * the visit that brought someone and the form they submit.
 *
 * ── localStorage, BEFORE CONSENT, AND WHY THAT IS ALLOWED ─────────────────
 * The record is first-party, never sent to a third party, and leaves the
 * browser only inside a registration the visitor submits themselves. It holds
 * link parameters and a referrer host — see the no-PII note in attribution.js.
 * It is listed under "จำเป็น" on /cookie-policy for that reason (plan D3).
 *
 * localStorage rather than a cookie: a cookie would ride on every request to
 * the site for 90 days to be read by nothing on the server.
 *
 * ── STORAGE CAN BE ABSENT ─────────────────────────────────────────────────
 * Private windows, blocked site data. Every access is wrapped, and a module
 * copy of the state is kept as well, so a visitor with no storage still gets
 * attribution for a form submitted in the same document.
 */
import { mergeTouch, readTouch } from '@/lib/attribution/attribution';

export const ATTRIBUTION_STORAGE_KEY = '9e_attribution';
const SCHEMA_VERSION = 1;

let memory = null;
let documentRead = false;

function load() {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.v === SCHEMA_VERSION) return { first: parsed.first, last: parsed.last };
    }
  } catch {
    /* unreadable or blocked — fall through to the in-document copy */
  }
  return memory ?? {};
}

function save(state) {
  memory = state;
  try {
    window.localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ v: SCHEMA_VERSION, first: state.first, last: state.last }),
    );
  } catch {
    /* the in-document copy above still serves this page */
  }
}

/**
 * Record the touch for the page the visitor is on.
 *
 * The FIRST call in a document reads `document.referrer`; later calls (soft
 * navigations) do not, because the referrer belongs to the document load and
 * would otherwise be re-recorded on every route change.
 */
export function captureAttribution() {
  if (typeof window === 'undefined') return;
  const referrer = documentRead ? '' : document.referrer;
  documentRead = true;
  const touch = readTouch({
    href: window.location.href,
    referrer,
    ownHost: window.location.hostname,
  });
  const prev = load();
  const next = mergeTouch(prev, touch);
  if (next !== prev) save(next);
}

/**
 * What a form sends: `{ first, last }`, or undefined when nothing was ever
 * captured. The server re-validates and classifies (buildAttribution); nothing
 * here is trusted.
 */
export function attributionForSubmit() {
  if (typeof window === 'undefined') return undefined;
  const { first, last } = load();
  return first || last ? { first, last } : undefined;
}

/** Spread into a request body: `{ attribution }` or nothing. */
export function withAttribution(body) {
  const attribution = attributionForSubmit();
  return attribution ? { ...body, attribution } : body;
}
