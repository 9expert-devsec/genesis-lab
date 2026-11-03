import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, contactMethodOf, EVENTS, ALLOWED_KEYS } from '@/lib/analytics/dataLayer';
import { consentBootstrapScript } from '@/lib/analytics/consentMode';
import { CONSENT_COOKIE, CONSENT_SCHEMA_VERSION } from '@/lib/cookieConsentStore';

/**
 * The dataLayer contract (plan R2) and the GTM-mode bootstrap.
 * See src/lib/analytics/dataLayer.js and consentMode.js.
 */

// ── The event names ARE the contract GTM's triggers are built on ───────────

test('event names match the contract table exactly', () => {
  assert.deepEqual(Object.values(EVENTS).sort(), [
    'contact_click', 'file_download', 'page_view', 'postcode_lookup_miss', 'purchase',
    'register_bundle', 'register_career_path', 'register_inhouse', 'register_masterclass',
    'register_public', 'view_landing',
  ]);
});

test('every register_* event matches the container trigger regex ^register_', () => {
  const regs = Object.values(EVENTS).filter((e) => e.startsWith('register'));
  assert.equal(regs.length, 5);
  for (const e of regs) assert.match(e, /^register_/);
});

// ── No personal data, enforced rather than trusted ────────────────────────

const PII = {
  firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.co', phone: '0812345678',
  companyName: 'X', taxId: '0105555555555', address: '1 ถนน', coordinator: { email: 'a@b.co' },
};

test('PII keys spread into an event are DROPPED', () => {
  const out = buildEvent(EVENTS.registerPublic, { ...PII, registration_id: 'r1', course_code: 'PBI' });
  assert.deepEqual(out, { event: 'register_public', registration_id: 'r1', course_code: 'PBI' });
  assert.equal(/สมชาย|a@b\.co|0812345678|0105555555555/.test(JSON.stringify(out)), false);
});

test('CONTROL: none of the PII keys is on the allow-list', () => {
  for (const k of Object.keys(PII)) assert.equal(ALLOWED_KEYS.includes(k), false, k);
});

test('empty values are omitted; numbers stay numbers', () => {
  const out = buildEvent(EVENTS.registerPublic, { value: 0, attendee_count: 2, lead_channel: '', course_code: null });
  assert.deepEqual(out, { event: 'register_public', value: 0, attendee_count: 2 });
});

test('ecommerce keeps only GA4 ecommerce keys, and items only item keys', () => {
  const out = buildEvent(EVENTS.purchase, {
    ecommerce: {
      transaction_id: 'T1', value: 100, currency: 'THB', email: 'x@y.z',
      items: [{ item_id: 'A', item_name: 'n', price: 50, quantity: 2, buyer: 'Somchai' }],
    },
    payment_method: 'promptpay',
  });
  assert.deepEqual(out.ecommerce, {
    transaction_id: 'T1', value: 100, currency: 'THB',
    items: [{ item_id: 'A', item_name: 'n', price: 50, quantity: 2 }],
  });
});

test('course_codes stays an array of strings', () => {
  assert.deepEqual(buildEvent(EVENTS.registerBundle, { course_codes: ['A', '', 2] }).course_codes, ['A', '2']);
});

// ── contact_click ──────────────────────────────────────────────────────────

for (const [href, want] of [
  ['tel:026404049', 'phone'],
  ['TEL:+66 2 640 4049', 'phone'],
  ['mailto:sales@9expert.co.th', 'email'],
  ['https://line.me/R/ti/p/@9expert', 'line'],
  ['https://page.line.me/9expert', 'line'],
  ['https://lin.ee/abcd', 'line'],
  ['https://www.9expert.co.th/contact-us', null],
  ['https://evil.com/?u=line.me', null],
  ['https://notline.me/x', null],
  ['/schedule', null],
  [undefined, null],
]) {
  test(`contactMethodOf(${JSON.stringify(href)}) → ${want}`, () => {
    assert.equal(contactMethodOf(href), want);
  });
}

// ── The bootstrap, executed, in both modes ────────────────────────────────

function run(gtmId) {
  const src = consentBootstrapScript({
    ga4Id: 'G-TEST', adsId: 'AW-TEST', cookieName: CONSENT_COOKIE, schemaVersion: CONSENT_SCHEMA_VERSION,
    ...(gtmId === undefined ? {} : { gtmId }),
  });
  const win = {};
  new Function('window', 'document', src).call(win, win, { cookie: '' });
  return { src, layer: win.dataLayer };
}

test('no GTM id: the bootstrap is byte-for-byte the legacy one', () => {
  assert.equal(run('').src, run(undefined).src);
  const cmds = run('').layer.map((a) => Array.from(a));
  assert.deepEqual(cmds.filter((c) => c[0] === 'config').map((c) => c[1]), ['G-TEST', 'AW-TEST']);
});

test('GTM mode: consent default is the FIRST thing queued', () => {
  const first = Array.from(run('GTM-WB9TPT').layer[0]);
  assert.deepEqual(first.slice(0, 2), ['consent', 'default']);
  assert.equal(first[2].ad_storage, 'denied');
});

test('GTM mode: no gtag js/config — the container owns the Google tag', () => {
  const layer = run('GTM-WB9TPT').layer;
  const gtagCmds = layer.filter((e) => typeof e === 'object' && !('event' in e)).map((a) => Array.from(a)[0]);
  assert.equal(gtagCmds.includes('config'), false);
  assert.equal(gtagCmds.includes('js'), false);
  assert.deepEqual(gtagCmds, ['consent', 'set', 'set']);
});

test('GTM mode: the gtm.js start event comes AFTER consent default', () => {
  const layer = run('GTM-WB9TPT').layer;
  const startAt = layer.findIndex((e) => e && e.event === 'gtm.js');
  assert.equal(startAt, layer.length - 1);
  assert.equal(typeof layer[startAt]['gtm.start'], 'number');
});
