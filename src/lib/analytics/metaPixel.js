// src/lib/analytics/metaPixel.js
//
// The Meta Pixel's whole browser surface: the stub, the init, the consent
// commands, and the thin call wrappers. No React here — the component in
// src/components/analytics/MetaPixel.jsx is a shell that decides WHEN to call
// initMetaPixel, and nothing else.
//
// ══ THE PIXEL IS NOT REQUESTED UNTIL MARKETING CONSENT EXISTS ══════════════
//
// This is the opposite of what Analytics.jsx does with gtag.js, and the
// difference is deliberate rather than an inconsistency. The full reasoning
// sits beside Google's, in the advanced-mode docblock at the top of
// src/lib/analytics/consentMode.js. The short version:
//
//   Google's tag is kept loaded-but-denied because a denied tag still earns
//   something — cookieless pings feed behavioural modelling, and withholding
//   the script forfeits that permanently. Meta has NO equivalent. There is no
//   modelling that a denied-but-loaded pixel contributes to. So loading
//   fbevents.js for a visitor who declined would hand Meta that visitor's IP
//   address and user agent — the unavoidable content of any HTTP request to
//   connect.facebook.net — in exchange for nothing at all.
//
// Hence: no stub, no init, no script element, no request, until marketing is
// true. `fbq('consent','revoke')` is the fallback for the other direction, not
// the primary control; see setMetaPixelConsent.

import { META_PIXEL_ID } from '@/lib/analytics/config';

/** The library URL. Also the string the CSP allows and the tests look for. */
export const FBEVENTS_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

/**
 * Module state. One pixel per document, so one flag per module instance.
 *
 * `initialised` is NOT derived from `window.fbq` being present. They answer
 * different questions: fbq exists the moment the stub is installed, whereas
 * `initialised` means "init has been queued", and a track command sent between
 * those two points would reach the library ahead of its own init.
 */
let initialised = false;
let granted = false;
const readyListeners = new Set();

function hasFbq() {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

/**
 * Meta's official base-code stub, MINUS the script injection.
 *
 * The published snippet ends by building a <script> element and inserting it
 * before the first existing one. That half is removed here because next/script
 * renders the element instead — see MetaPixel.jsx for why the framework's
 * loader is preferred to a hand-rolled insert.
 *
 * Everything else is byte-for-byte the behaviour fbevents.js expects to find
 * when it arrives: it looks for `fbq.callMethod` to install, drains
 * `fbq.queue`, and reads `fbq.version`. A simplified stub that merely pushed
 * into an array would be drained by nothing and every queued command would be
 * lost in silence.
 */
function installStub() {
  if (hasFbq()) return;
  const f = window;
  const n = function () {
    // eslint-disable-next-line prefer-rest-params -- the real library reads
    // `arguments` off the queue; an array of rest params is a different shape.
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  f.fbq = n;
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
}

/**
 * Install the stub and queue `init` + `consent grant`.
 *
 * ── NO `fbq('track','PageView')` HERE, AND THAT IS THE POINT ────────────────
 * Meta's copy-paste base code ends with one. Keeping it would mean the first
 * page of a session is counted by this function AND by the route tracker,
 * whose effect fires on its first pathname like any other — two PageViews for
 * one load, on every visitor. The tracker is the single emitter instead; see
 * onMetaPixelReady for how it learns it may start.
 *
 * Idempotent: a second call does not re-install anything. React effects can run
 * twice in StrictMode and the component re-renders on every consent change.
 *
 * A call AFTER a withdrawal is not ignored, though — it is a re-grant. The
 * script is already on the page and cannot be unloaded, so the only thing
 * "load it again" can mean is "tell it consent is back", and silently doing
 * nothing would leave a consenting visitor with a permanently muted pixel.
 */
export function initMetaPixel(pixelId = META_PIXEL_ID) {
  if (typeof window === 'undefined') return;
  if (initialised) {
    setMetaPixelConsent(true);
    return;
  }
  installStub();
  window.fbq('init', pixelId);
  window.fbq('consent', 'grant');
  initialised = true;
  granted = true;
  for (const listener of readyListeners) {
    try {
      listener();
    } catch {
      /* One bad subscriber must not stop the others being told. */
    }
  }
}

/**
 * Grant or withdraw consent on an ALREADY-LOADED pixel.
 *
 * ── THE SCRIPT CANNOT BE UNLOADED ───────────────────────────────────────────
 * Once fbevents.js has been fetched and executed there is no way to take it
 * back: removing the <script> element does not undo the code that ran, and the
 * library's own globals, listeners and timers stay. `fbq('consent','revoke')`
 * is what Meta offers instead — it holds subsequent events rather than sending
 * them. So a visitor who grants and then withdraws is NOT returned to the state
 * of one who never granted, and no amount of care here can make them so. What
 * the load gate above buys is that a visitor who never granted is never put in
 * that position in the first place.
 *
 * Silent no-op before init, because there is nothing to tell: a revoke for a
 * pixel that was never loaded is already true.
 */
export function setMetaPixelConsent(on) {
  granted = on === true;
  if (!initialised || !hasFbq()) return;
  window.fbq('consent', granted ? 'grant' : 'revoke');
}

/** Has init been queued, and is fbq still there to receive commands? */
export function isMetaPixelReady() {
  return initialised && granted && hasFbq();
}

/**
 * Be told when the pixel becomes usable. Returns an unsubscribe function.
 *
 * ── WHY A SIGNAL AND NOT JUST `typeof window.fbq` ───────────────────────────
 * The route tracker and the loader are siblings in the React tree, and their
 * effects run in an order that is a property of where they happen to be
 * mounted. If the tracker's effect runs first it finds no pixel, no-ops, and —
 * keyed on pathname alone — would not run again until the visitor navigated.
 * The first page view of every session would be missing, intermittently,
 * depending on tree shape.
 *
 * This removes the ordering question rather than answering it: whichever runs
 * first, the tracker fires exactly once for the page it is on.
 */
export function onMetaPixelReady(listener) {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/**
 * The call wrappers. Every one is a silent no-op when the pixel is not ready —
 * the same contract as gtagEvent in src/lib/analytics/gtag.js, and for the same
 * reason: these are called from conversion helpers on pages that a
 * non-consenting visitor reaches too, and they must never throw.
 *
 * `options` (Meta's third argument) is only passed when there is something to
 * put in it. `fbq('track', name, params, {})` is not the same call as
 * `fbq('track', name, params)` to the library's argument inspection.
 */
function fbqSend(command, event, params, options) {
  if (!isMetaPixelReady()) return;
  if (options) window.fbq(command, event, params ?? {}, options);
  else if (params) window.fbq(command, event, params);
  else window.fbq(command, event);
}

export function metaPixelTrack(event, params, options) {
  fbqSend('track', event, params, options);
}

export function metaPixelTrackCustom(event, params, options) {
  fbqSend('trackCustom', event, params, options);
}

/** The route tracker's one call. Separate so the name says what it is for. */
export function metaPixelPageView() {
  fbqSend('track', 'PageView');
}

/**
 * Build the `options` argument for a deduplicable event, or undefined.
 *
 * ── WHY eventID IS SENT WITH NO CONVERSIONS API BEHIND IT ───────────────────
 * There is no server-side CAPI in this codebase and none is planned in this
 * round. `eventID` is nonetheless attached to Purchase and Lead because it
 * costs one property today and cannot be retrofitted later: dedupe works by
 * the browser and the server sending the SAME id for the same event, so a CAPI
 * added in six months would be unable to match anything already in flight, and
 * every conversion in the switchover window would be double counted.
 *
 * The id is the transaction id the Google Ads conversion already uses, so the
 * two platforms agree on what one purchase is.
 */
function eventOptions(transactionId) {
  return transactionId ? { eventID: transactionId } : undefined;
}

export { eventOptions as metaEventOptions };
