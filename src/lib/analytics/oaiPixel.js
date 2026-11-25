// src/lib/analytics/oaiPixel.js
//
// The OpenAI Ads pixel's whole browser surface: config, the stub, the init and
// the one conversion call. No React here — src/components/analytics/
// OaiPixelLoader.jsx decides WHEN to call initOaiPixel, and nothing else.
//
// ══ BESIDE GTM, NOT INSIDE IT, AND IT TOUCHES NOTHING OF GOOGLE'S ═══════════
//
// No dataLayer, no gtag, no consent-mode signal. It reads the same consent
// record (cookie + broadcast) the Meta Pixel reads, and that is the only thing
// the two share with the Google setup.
//
// ══ NOT REQUESTED UNTIL MARKETING CONSENT EXISTS ════════════════════════════
//
// The Meta rule, for the Meta reason (see the advanced-mode docblock in
// src/lib/analytics/consentMode.js): a denied-but-loaded ad pixel earns nothing
// and hands the vendor the visitor's IP and user agent. So: no stub, no init,
// no <script>, no request to bzrcdn.openai.com, until marketing is true.
//
// ── WITHDRAWAL ───────────────────────────────────────────────────────────────
// The SDK offers no documented consent command, and a script that ran cannot be
// unloaded. A visitor who grants and then withdraws in the same page view stops
// being SENT events (isOaiPixelReady goes false); whatever the library does on
// its own after load is outside this module's reach until the next page load,
// when the gate keeps it off the page entirely.

/** The library URL. Also the host the CSP allows and the tests look for. */
export const OAIQ_SRC = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';

/**
 * NEXT_PUBLIC_OAI_PIXEL_ID, inlined at build time. Unset → nothing loads, on any
 * deployment, so Vercel's per-environment variables are the on/off switch.
 * Validated, not trusted: anything that is not a plain id is treated as unset.
 */
const RAW_OAI_PIXEL_ID = String(process.env.NEXT_PUBLIC_OAI_PIXEL_ID ?? '').trim();
export const OAI_PIXEL_ID = /^[A-Za-z0-9_-]{8,64}$/.test(RAW_OAI_PIXEL_ID) ? RAW_OAI_PIXEL_ID : '';

/**
 * `debug` is on everywhere except a Vercel PRODUCTION deployment — the same
 * test src/lib/articles/viewCounter.js uses. Server-side only (VERCEL_ENV is not
 * a NEXT_PUBLIC_ variable); the server wrapper passes the answer down as a prop.
 */
export function oaiPixelDebug(env = process.env) {
  return env?.VERCEL_ENV !== 'production';
}

let initialised = false;
let granted = false;

/**
 * Install the vendor's stub and queue `init` — the supplied snippet, minus its
 * script insert (next/script renders the element instead, as for Meta). Same
 * idempotency as the snippet's `if (w.oaiq) return`, plus a module flag so a
 * re-render or a client-side navigation never queues a second `init`.
 *
 * A call after a withdrawal is a re-grant: the library is already on the page.
 */
export function initOaiPixel({ pixelId = OAI_PIXEL_ID, debug = true } = {}) {
  if (typeof window === 'undefined' || !pixelId) return;
  granted = true;
  if (initialised) return;
  if (!window.oaiq) {
    const q = function () {
      // eslint-disable-next-line prefer-rest-params -- the SDK drains `arguments` objects, as queued by its own snippet.
      q.q.push(arguments);
    };
    q.q = [];
    window.oaiq = q;
  }
  window.oaiq('init', { pixelId, debug: debug === true });
  initialised = true;
}

/** Marketing withdrawn (or granted again) in this page view. */
export function setOaiPixelConsent(on) {
  granted = on === true;
}

/** Initialised, consented, and the global still there to receive commands. */
export function isOaiPixelReady() {
  return initialised && granted && typeof window !== 'undefined' && typeof window.oaiq === 'function';
}
