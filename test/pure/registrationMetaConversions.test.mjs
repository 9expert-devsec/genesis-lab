import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  trackRegisterPublic,
  trackRegisterBundle,
  trackRegisterInhouse,
  trackRegisterCareerPath,
  trackPublicPurchase,
} from '@/lib/analytics/conversions';
import { initMetaPixel } from '@/lib/analytics/metaPixel';

/**
 * Meta Lead / Purchase for the registration flows that had none — and the
 * rule that each fires TOGETHER with its dataLayer event or not at all.
 *
 * Same harness rules as test/pure/metaPixelConversions.test.mjs, for the same
 * measured reasons written there: a synchronous fake window installed and torn
 * down inside each test body, no beforeEach/afterEach. Every test uses its own
 * registration / transaction id, because the dedupe keeps an in-memory set per
 * module that outlives one test's window by design.
 *
 * The suite runs with NEXT_PUBLIC_GTM_ID unset, i.e. gtag mode — the mode in
 * which the GA4 purchase for public registrations must be sent by the code.
 */
function withWindow(body, { storage = 'ok' } = {}) {
  const fbqCalls = [];
  const gtagCalls = [];
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previous = globalThis.window;
  const fbq = (...args) => { fbqCalls.push(args); };
  fbq.queue = [];
  const store = {};
  globalThis.window = {
    fbq,
    gtag: (...args) => { gtagCalls.push(args); },
    dataLayer: [],
    sessionStorage: storage === 'blocked'
      ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
      : { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  };
  try {
    initMetaPixel('TEST-PIXEL');
    fbqCalls.length = 0;
    body({ fbqCalls, gtagCalls, dataLayer: globalThis.window.dataLayer, store });
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

const leads = (calls) => calls.filter((c) => c[0] === 'track' && c[1] === 'Lead');
const purchases = (calls) => calls.filter((c) => c[0] === 'track' && c[1] === 'Purchase');
const events = (layer, name) => layer.filter((e) => e && e.event === name);

// ── Lead, per flow ─────────────────────────────────────────────────────────

test('public: one register_public and one Meta Lead, eventID = registration_id, value known', () => {
  withWindow(({ fbqCalls, dataLayer }) => {
    trackRegisterPublic({ formType: 'public', registrationId: 'REG-PUB-1', courseCode: 'PBI', attendeeCount: 2, value: 12900, leadChannel: 'Email' });
    const [ev] = events(dataLayer, 'register_public');
    assert.equal(ev.registration_id, 'REG-PUB-1');
    assert.equal(ev.form_type, 'public');
    assert.deepEqual(leads(fbqCalls), [['track', 'Lead', { value: 12900, currency: 'THB' }, { eventID: 'REG-PUB-1' }]]);
  });
});

test('public_paid: same pairing', () => {
  withWindow(({ fbqCalls, dataLayer }) => {
    trackRegisterPublic({ formType: 'public_paid', registrationId: 'REG-PAID-1', value: 5000 });
    assert.equal(events(dataLayer, 'register_public')[0].form_type, 'public_paid');
    assert.equal(leads(fbqCalls)[0][3].eventID, 'REG-PAID-1');
  });
});

test('in-house and career path: Lead WITHOUT value/currency — unknown worth is not ฿0', () => {
  withWindow(({ fbqCalls }) => {
    trackRegisterInhouse({ registrationId: 'REG-INH-1', courseCode: 'PBI', attendeeCount: 20 });
    trackRegisterCareerPath({ registrationId: 'REG-CP-1', careerPath: 'data-analyst' });
    assert.deepEqual(leads(fbqCalls), [
      ['track', 'Lead', {}, { eventID: 'REG-INH-1' }],
      ['track', 'Lead', {}, { eventID: 'REG-CP-1' }],
    ]);
  });
});

test('bundle: one Lead for the request, keyed on the request id', () => {
  withWindow(({ fbqCalls, dataLayer }) => {
    trackRegisterBundle({ registrationId: 'REQ-B-1', bundleId: 'p:s', courseCodes: ['A', 'B'], value: 30000 });
    assert.equal(events(dataLayer, 'register_bundle').length, 1);
    assert.deepEqual(leads(fbqCalls), [['track', 'Lead', { value: 30000, currency: 'THB' }, { eventID: 'REQ-B-1' }]]);
  });
});

test('dedupe: a second call for the same registration sends NOTHING, to either destination', () => {
  withWindow(({ fbqCalls, dataLayer }) => {
    trackRegisterPublic({ formType: 'public', registrationId: 'REG-DUP-1', value: 1 });
    trackRegisterPublic({ formType: 'public', registrationId: 'REG-DUP-1', value: 1 });
    assert.equal(events(dataLayer, 'register_public').length, 1);
    assert.equal(leads(fbqCalls).length, 1);
  });
});

test('registration leads send no Google event directly', () => {
  withWindow(({ gtagCalls }) => {
    trackRegisterInhouse({ registrationId: 'REG-NOGA-1' });
    assert.deepEqual(gtagCalls, []);
  });
});

// ── Public purchase ───────────────────────────────────────────────────────

test('public purchase: dataLayer purchase + GA4 purchase (gtag mode) + Meta Purchase, one transaction id', () => {
  withWindow(({ fbqCalls, gtagCalls, dataLayer }) => {
    trackPublicPurchase({ transactionId: 'TX-PUB-1', value: 10700, method: 'promptpay', items: [{ item_id: 'PBI' }] });
    const nullAt = dataLayer.findIndex((e) => e && e.ecommerce === null);
    const evAt = dataLayer.findIndex((e) => e && e.event === 'purchase');
    assert.ok(nullAt !== -1 && nullAt < evAt, '{ ecommerce: null } comes first');
    assert.equal(dataLayer[evAt].ecommerce.transaction_id, 'TX-PUB-1');
    assert.equal(dataLayer[evAt].form_type, 'public');
    assert.deepEqual(gtagCalls.map((c) => c.slice(0, 2)), [['event', 'purchase']]);
    assert.equal(gtagCalls[0][2].transaction_id, 'TX-PUB-1');
    assert.deepEqual(purchases(fbqCalls), [['track', 'Purchase', { value: 10700, currency: 'THB' }, { eventID: 'TX-PUB-1' }]]);
  });
});

test('public purchase: NO Google Ads conversion — there is no label for it', () => {
  withWindow(({ gtagCalls }) => {
    trackPublicPurchase({ transactionId: 'TX-PUB-NOADS', value: 1, method: 'credit_card' });
    assert.equal(gtagCalls.some((c) => c[1] === 'conversion'), false);
  });
});

test('public purchase: a refresh (second call) counts the sale nowhere twice', () => {
  withWindow(({ fbqCalls, gtagCalls, dataLayer }) => {
    trackPublicPurchase({ transactionId: 'TX-PUB-REF', value: 1, method: 'promptpay' });
    trackPublicPurchase({ transactionId: 'TX-PUB-REF', value: 1, method: 'promptpay' });
    assert.equal(events(dataLayer, 'purchase').length, 1);
    assert.equal(gtagCalls.length, 1);
    assert.equal(purchases(fbqCalls).length, 1);
  });
});

test('public purchase: the dedupe survives a reload — the sessionStorage key is what blocks it', () => {
  let key;
  withWindow(({ store }) => {
    trackPublicPurchase({ transactionId: 'TX-PUB-RELOAD', value: 1, method: 'promptpay' });
    key = Object.keys(store).find((k) => k.includes('TX-PUB-RELOAD'));
  });
  assert.ok(key, 'the purchase was recorded in sessionStorage');
});

test('public purchase: storage blocked → it still fires (losing dedupe beats losing the sale)', () => {
  withWindow(({ fbqCalls, dataLayer }) => {
    trackPublicPurchase({ transactionId: 'TX-PUB-BLOCKED', value: 1, method: 'promptpay' });
    assert.equal(events(dataLayer, 'purchase').length, 1);
    assert.equal(purchases(fbqCalls).length, 1);
  }, { storage: 'blocked' });
});
