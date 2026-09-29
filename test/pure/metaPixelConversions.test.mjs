import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  trackPurchase,
  trackFormSubmitLead,
  trackDownload,
  trackLandingView,
} from '@/lib/analytics/conversions';
import { initMetaPixel } from '@/lib/analytics/metaPixel';

/**
 * WHAT EACH CONVERSION HELPER SENDS TO META, AND WHAT IT SENDS WITHOUT ONE.
 *
 * ── WHY THIS IS A CALL-CAPTURE AND NOT A SOURCE SCAN ───────────────────────
 * The mapping is the product here — which Meta event name, which parameters,
 * which id goes in `eventID`. A scan asserting that the file "contains
 * Purchase" would stay green through a swapped currency, a value passed as a
 * string, an eventID attached to the wrong argument, and an event sent to
 * Meta from a helper that was never meant to. So the real helpers are driven
 * and the calls are read off a fake fbq.
 *
 * ── THE SHARED WINDOW, AND WHY IT IS TORN DOWN EVERY TEST ──────────────────
 * The runner is one process with `concurrency: true`, so a `globalThis.window`
 * left behind here would be visible to every other file's module evaluation —
 * the measured cost of doing that is written up in
 * test/canvasFrameAttach.case.mjs (a suite going from 5 failures to 34).
 *
 * This window is SAFE to install in-process where that one was not, and the
 * difference is the reason given there: this one is synchronous and never
 * yields. No `act`, no promise, no timer — install, call, assert, remove,
 * inside one test body that never awaits.
 *
 * ── AND WHY THERE IS NO beforeEach/afterEach ──────────────────────────────
 * Measured, not stylistic. The runner drives node:test with
 * `isolation: "none"`, so every file is loaded into the SAME root test
 * context; a top-level `beforeEach` there is registered on the ROOT suite, not
 * on this file. The first attempt at this file used hooks and 9 of 13 tests
 * failed, each one reading the PREVIOUS test's captured call. No other file in
 * this suite uses those hooks, which is the same finding arrived at earlier.
 *
 * So setup and teardown are a `withPixel` wrapper instead — explicit, scoped to
 * one test body, and restoring the global in a `finally` so a failing
 * assertion cannot leak a window into whatever runs next.
 */

/**
 * Run `body` against a fake fbq, and hand it the captured calls.
 *
 * `initMetaPixel` is called inside, and its module state is once-per-document
 * by design (see metaPixel.js) — so the first call initialises and later ones
 * re-grant. Either way the pixel is READY, which is the precondition every
 * mapping test below needs. The one test that wants the opposite says so by
 * removing fbq from the window, rather than by trying to un-initialise a
 * module that is not meant to support it.
 */
function withPixel(body) {
  const calls = [];
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previous = globalThis.window;
  const fbq = (...args) => { calls.push(args); };
  fbq.queue = [];
  globalThis.window = { fbq };
  try {
    initMetaPixel('TEST-PIXEL');
    calls.length = 0; // drop init + consent grant; the MAPPING is under test
    body(calls);
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

// ── PURCHASE ────────────────────────────────────────────────────────────────

test('trackPurchase sends Purchase with value, THB, and the txn id as eventID', () => {
  withPixel((calls) => {
    trackPurchase({
      method: 'credit_card',
      value: 2900,
      transactionId: 'MC-000123',
      items: [],
    });
    assert.deepEqual(calls, [[
      'track',
      'Purchase',
      { value: 2900, currency: 'THB' },
      { eventID: 'MC-000123' },
    ]]);
  });
});

test('the Purchase eventID IS the id the Google Ads conversion uses', () => {
  // Dedupe against a future Conversions API works by both sides naming the
  // same event. An eventID invented here — a uuid, a timestamp — would be
  // unmatched by anything, and worse than none because it looks deduplicated.
  withPixel((calls) => {
    trackPurchase({ method: 'promptpay', value: 1, transactionId: 'MC-999', items: [] });
    assert.equal(calls[0][3].eventID, 'MC-999');
  });
});

test('the payment method does NOT leak into the Meta payload', () => {
  // Meta's Purchase has no field for it; a custom property would make the two
  // platforms' purchase counts differ by a dimension only one of them has.
  withPixel((calls) => {
    trackPurchase({ method: 'promptpay', value: 500, transactionId: 'T', items: [] });
    assert.deepEqual(Object.keys(calls[0][2]).sort(), ['currency', 'value']);
  });
});

// ── LEAD ────────────────────────────────────────────────────────────────────

test('trackFormSubmitLead sends Lead with value + currency when there is one', () => {
  withPixel((calls) => {
    trackFormSubmitLead({ value: 2900, transactionId: 'REG-77' });
    assert.deepEqual(calls, [[
      'track',
      'Lead',
      { value: 2900, currency: 'THB' },
      { eventID: 'REG-77' },
    ]]);
  });
});

test('a Lead with NO value omits value and currency entirely', () => {
  // Not `value: null`, not `value: 0`. A lead worth nothing and a lead of
  // unknown worth are different facts, and Ads Manager averages the first into
  // the campaign while ignoring the second.
  withPixel((calls) => {
    trackFormSubmitLead({ transactionId: 'REG-78' });
    assert.deepEqual(calls[0][2], {});
    assert.deepEqual(calls[0][3], { eventID: 'REG-78' });
  });
});

test('a Lead with no transaction id sends NO options argument at all', () => {
  // `fbq('track', name, params, {})` is a different call to the library's
  // argument inspection than `fbq('track', name, params)`.
  withPixel((calls) => {
    trackFormSubmitLead({ value: 100 });
    assert.equal(calls[0].length, 3, 'an empty options object was passed');
  });
});

// ── THE OTHER TWO ───────────────────────────────────────────────────────────

test('trackLandingView sends a bare ViewContent', () => {
  withPixel((calls) => {
    trackLandingView();
    assert.deepEqual(calls, [['track', 'ViewContent']]);
  });
});

test('trackDownload sends trackCustom OutlineDownload, not a standard event', () => {
  // A standard event bent to fit would land in the same bucket as a real one
  // and quietly corrupt whichever campaign optimises for it.
  withPixel((calls) => {
    trackDownload({ fileName: 'power-bi-outline.pdf' });
    assert.deepEqual(calls, [['trackCustom', 'OutlineDownload']]);
  });
});

test('the download filename is NOT sent to Meta', () => {
  withPixel((calls) => {
    trackDownload({ fileName: 'secret-internal-name.pdf' });
    assert.equal(
      JSON.stringify(calls).includes('secret-internal-name'), false,
      'a user-facing file name reached Meta on a custom event nothing optimises for',
    );
  });
});

// ── NO PIXEL ────────────────────────────────────────────────────────────────

test('EVERY helper is silent when the pixel is not loaded', () => {
  // The common case, not the edge one: fbevents.js is absent for every visitor
  // who did not grant marketing consent, and these helpers run on pages those
  // visitors reach. They must not throw and must not queue.
  withPixel((calls) => {
    delete globalThis.window.fbq;
    assert.doesNotThrow(() => {
      trackPurchase({ method: 'credit_card', value: 1, transactionId: 'X', items: [] });
      trackFormSubmitLead({ value: 1, transactionId: 'Y' });
      trackLandingView();
      trackDownload({ fileName: 'z.pdf' });
    });
    assert.deepEqual(calls, []);
  });
});

test('every helper is silent with no window at all (SSR)', () => {
  // Not the same case as the one above: there the pixel is absent, here the
  // BROWSER is. These helpers are imported by modules that render on the
  // server, so `typeof window === 'undefined'` is a path they really take.
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previous = globalThis.window;
  if (had) delete globalThis.window;
  try {
    assert.doesNotThrow(() => {
      trackPurchase({ method: 'promptpay', value: 1, transactionId: 'X', items: [] });
      trackFormSubmitLead();
      trackLandingView();
      trackDownload();
    });
  } finally {
    if (had) globalThis.window = previous;
  }
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the capture would SEE a call — the silence tests are not vacuous', () => {
  // Without this, `assert.deepEqual(calls, [])` is equally satisfied by a
  // recorder that never records, and the no-pixel test above passes forever.
  withPixel((calls) => {
    trackLandingView();
    assert.equal(
      calls.length, 1,
      'the fake fbq records nothing — every silence assertion here is vacuous',
    );
  });
});

test('CONTROL: a wrong currency would fail the Purchase assertion', () => {
  // Proves the deepEqual above compares the PARAMETERS and not just the event
  // name — the assertion most likely to rot into a shape check.
  assert.notDeepEqual(
    { value: 2900, currency: 'USD' },
    { value: 2900, currency: 'THB' },
  );
});
