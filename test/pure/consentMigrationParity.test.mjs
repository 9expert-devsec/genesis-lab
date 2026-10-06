import { test } from 'node:test';
import assert from 'node:assert/strict';

import { consentBootstrapScript, consentSignalsFor, DENIED_DEFAULTS } from '@/lib/analytics/consentMode';
import { OPTIONAL_CATEGORY_KEYS, LEGACY_V1_CATEGORY_KEYS } from '@/lib/consentCategories';
import {
  CONSENT_COOKIE,
  CONSENT_SCHEMA_VERSION,
  LEGACY_CONSENT_SCHEMA_VERSION,
  parseConsent,
  serialiseConsent,
} from '@/lib/cookieConsentStore';

/**
 * CB-C: the v1 → v2 consent migration is written TWICE — parseConsent (the
 * banner, the Meta pixel) and the inline bootstrap string in consentMode.js
 * (Google's `consent default`, before gtag.js loads). The bootstrap cannot
 * import parseConsent: it runs in the HTML before any bundle. So both are fed
 * the SAME table here, and must reach the same verdict on every row:
 * parseConsent's result, mapped through consentSignalsFor, must equal the
 * signals the executed bootstrap queues as its default.
 */

function bootstrapDefault(cookieValue) {
  const src = consentBootstrapScript({
    ga4Id: 'G-TEST', adsId: 'AW-TEST', cookieName: CONSENT_COOKIE, schemaVersion: CONSENT_SCHEMA_VERSION,
  });
  const win = {};
  const doc = { cookie: cookieValue == null ? '' : `${CONSENT_COOKIE}=${encodeURIComponent(cookieValue)}` };
  new Function('window', 'document', src).call(win, win, doc);
  const hit = (win.dataLayer ?? []).map((a) => Array.from(a)).find((c) => c[0] === 'consent' && c[1] === 'default');
  return hit ? hit[2] : null;
}

const rec = (v, categories) => JSON.stringify({ v, categories, ts: '2026-09-01T00:00:00.000Z' });
const V1 = LEGACY_CONSENT_SCHEMA_VERSION;
const V2 = CONSENT_SCHEMA_VERSION;

// [label, raw cookie value, expected parseConsent result]
const TABLE = [
  ['valid v2, all on', rec(V2, { analytics: true, marketing: true }), { analytics: true, marketing: true }],
  ['valid v2, all off', rec(V2, { analytics: false, marketing: false }), { analytics: false, marketing: false }],
  ['valid v2, analytics only', rec(V2, { analytics: true, marketing: false }), { analytics: true, marketing: false }],
  ['valid v1, all on → functional dropped', rec(V1, { analytics: true, functional: true, marketing: true }), { analytics: true, marketing: true }],
  ['valid v1, functional only → both off', rec(V1, { analytics: false, functional: true, marketing: false }), { analytics: false, marketing: false }],
  ['valid v1, marketing only', rec(V1, { analytics: false, functional: false, marketing: true }), { analytics: false, marketing: true }],
  ['malformed JSON', '{"v":2,', null],
  ['not JSON', 'nope', null],
  ['v2 with the v1 key set', rec(V2, { analytics: true, functional: true, marketing: true }), null],
  ['v1 with the v2 key set', rec(V1, { analytics: true, marketing: true }), null],
  ['v2 missing a key', rec(V2, { analytics: true }), null],
  ['v2 extra key', rec(V2, { analytics: true, marketing: true, ads: true }), null],
  ['v1 extra key', rec(V1, { analytics: true, functional: true, marketing: true, ads: true }), null],
  ['v2 string "false"', rec(V2, { analytics: 'false', marketing: false }), null],
  ['v1 string "true" in functional', rec(V1, { analytics: true, functional: 'true', marketing: true }), null],
  ['v1 number in analytics', rec(V1, { analytics: 1, functional: false, marketing: false }), null],
  ['categories is an array', rec(V2, []), null],
  ['categories is null', rec(V2, null), null],
  ['unknown version 3', rec(3, { analytics: true, marketing: true }), null],
  ['no version', JSON.stringify({ categories: { analytics: true, marketing: true } }), null],
  ['top-level array', '[]', null],
];

test('parseConsent: v2 is read as-is, valid v1 is migrated, everything else is null', () => {
  for (const [label, raw, expected] of TABLE) {
    assert.deepEqual(parseConsent(raw, OPTIONAL_CATEGORY_KEYS), expected, label);
  }
});

test('the bootstrap reaches the SAME verdict as parseConsent on every row', () => {
  for (const [label, raw] of TABLE) {
    const viaStore = consentSignalsFor(parseConsent(raw, OPTIONAL_CATEGORY_KEYS));
    assert.deepEqual(bootstrapDefault(raw), viaStore, label);
  }
});

test('a migrated v1 accept-all keeps the visitor in GA4 and Ads — not re-prompted, not lost', () => {
  const v1 = rec(V1, { analytics: true, functional: true, marketing: true });
  assert.equal(bootstrapDefault(v1).analytics_storage, 'granted');
  assert.equal(bootstrapDefault(v1).ad_storage, 'granted');
  assert.equal(bootstrapDefault(v1).functionality_storage, 'denied');
});

test('reading never rewrites: serialiseConsent always writes the CURRENT version', () => {
  assert.equal(JSON.parse(serialiseConsent({ analytics: true, marketing: false }, 'x')).v, 2);
  assert.deepEqual([...LEGACY_V1_CATEGORY_KEYS], ['analytics', 'functional', 'marketing']);
  assert.deepEqual([...OPTIONAL_CATEGORY_KEYS], ['analytics', 'marketing']);
});

test('signals: accept-all, reject-all, analytics-only, marketing-only', () => {
  const ADS = ['ad_storage', 'ad_user_data', 'ad_personalization'];
  const all = consentSignalsFor({ analytics: true, marketing: true });
  assert.equal(all.analytics_storage, 'granted');
  for (const k of ADS) assert.equal(all[k], 'granted', k);

  assert.deepEqual(consentSignalsFor({ analytics: false, marketing: false }), { ...DENIED_DEFAULTS });

  const analyticsOnly = consentSignalsFor({ analytics: true, marketing: false });
  assert.equal(analyticsOnly.analytics_storage, 'granted');
  for (const k of ADS) assert.equal(analyticsOnly[k], 'denied', `analytics-only must leave ${k} denied`);

  const marketingOnly = consentSignalsFor({ analytics: false, marketing: true });
  assert.equal(marketingOnly.analytics_storage, 'denied');
  for (const k of ADS) assert.equal(marketingOnly[k], 'granted', k);

  for (const s of [all, analyticsOnly, marketingOnly]) {
    assert.equal(s.functionality_storage, 'denied');
    assert.equal(s.personalization_storage, 'denied');
    assert.equal(s.security_storage, 'granted');
  }
});

test('CONTROL: the harness sees the cookie (a grant and a denial differ)', () => {
  assert.notDeepEqual(
    bootstrapDefault(rec(V2, { analytics: true, marketing: true })),
    bootstrapDefault(rec(V2, { analytics: false, marketing: false })),
  );
});
