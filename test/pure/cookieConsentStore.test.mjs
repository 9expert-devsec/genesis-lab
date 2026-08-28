import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_COOKIE,
  CONSENT_SCHEMA_VERSION,
  CONSENT_MAX_AGE_SECONDS,
  serialiseConsent,
  parseConsent,
} from '@/lib/cookieConsentStore';
import { OPTIONAL_CATEGORIES } from '@/components/consent/CookieBanner';

/**
 * The CONSENT RECORD's read/write rules.
 *
 * Every rejection below returns null, which the banner reads as "ask again".
 * That is the only safe response to a record we cannot fully trust, and the
 * tests are written to pin the DIRECTION of each failure, not just that it
 * fails: a bug that made a bad record parse as "all granted" would be a
 * silent, unlawful grant, while one that made a good record parse as null is
 * a visible annoyance. These assertions are what keep the failure on the
 * annoying side.
 */

const KEYS = OPTIONAL_CATEGORIES.map((c) => c.key);
const parse = (raw) => parseConsent(raw, KEYS);
const ALL_OFF = { analytics: false, functional: false, marketing: false };
const ALL_ON = { analytics: true, functional: true, marketing: true };

test('a record round-trips', () => {
  const out = parse(serialiseConsent(ALL_ON, '2026-08-25T00:00:00.000Z'));
  assert.deepEqual(out, ALL_ON);
});

test('an all-denied record round-trips and is NOT confused with absence', () => {
  // The whole reason the banner keeps a three-state `decision`. If this came
  // back null, someone who pressed "ปฏิเสธ" would be asked again on every page
  // load — and every one of those prompts would be the site ignoring an answer
  // it already had.
  const out = parse(serialiseConsent(ALL_OFF, '2026-08-25T00:00:00.000Z'));
  assert.deepEqual(out, ALL_OFF);
  assert.notEqual(out, null);
});

test('the stored payload carries version, categories and a timestamp', () => {
  const raw = JSON.parse(serialiseConsent(ALL_OFF, '2026-08-25T00:00:00.000Z'));
  assert.equal(raw.v, CONSENT_SCHEMA_VERSION);
  assert.deepEqual(raw.categories, ALL_OFF);
  assert.equal(raw.ts, '2026-08-25T00:00:00.000Z');
});

test('"คุกกี้ที่จำเป็น" is NOT in the record', () => {
  // It is not a choice. Storing it would invite a reader to treat it as
  // revocable, or to honour a hand-edited `necessary:false`.
  const raw = JSON.parse(serialiseConsent(ALL_ON, '2026-08-25T00:00:00.000Z'));
  assert.equal('necessary' in raw.categories, false);
});

test('absent / empty / non-string input is "no decision"', () => {
  for (const input of ['', null, undefined, 0, {}, []]) {
    assert.equal(parse(input), null, `${JSON.stringify(input)} must not parse`);
  }
});

test('malformed JSON does not throw — it is just "no decision"', () => {
  // A truncated or hand-edited cookie is an ordinary thing to receive, and it
  // must not be able to break rendering.
  assert.doesNotThrow(() => parse('{"v":1,'));
  assert.equal(parse('{"v":1,'), null);
  assert.equal(parse('not json at all'), null);
});

test('a record from a DIFFERENT schema version is rejected', () => {
  const stale = JSON.stringify({ v: CONSENT_SCHEMA_VERSION + 1, categories: ALL_ON, ts: 'x' });
  assert.equal(parse(stale), null);
  const older = JSON.stringify({ v: CONSENT_SCHEMA_VERSION - 1, categories: ALL_ON, ts: 'x' });
  assert.equal(parse(older), null);
});

test('a record MISSING a current category is rejected, not defaulted', () => {
  // This is the case the round asked for: the category list grows, and an old
  // record says nothing about the new one. Filling the gap with `false` would
  // look harmless and would be wrong — the user never saw that question, so
  // there is no answer to honour.
  const raw = JSON.stringify({
    v: CONSENT_SCHEMA_VERSION,
    categories: { analytics: true, functional: true },
    ts: 'x',
  });
  assert.equal(parse(raw), null);
});

test('a record naming a category we no longer have is rejected', () => {
  const raw = JSON.stringify({
    v: CONSENT_SCHEMA_VERSION,
    categories: { ...ALL_ON, retired: true },
    ts: 'x',
  });
  assert.equal(parse(raw), null);
});

test('the key check is order-independent', () => {
  const raw = JSON.stringify({
    v: CONSENT_SCHEMA_VERSION,
    categories: { marketing: true, analytics: false, functional: true },
    ts: 'x',
  });
  assert.deepEqual(parse(raw), { analytics: false, functional: true, marketing: true });
});

test('STRING "false" is rejected rather than read as truthy', () => {
  // The classic way a denial becomes a grant: JSON.parse gives the string
  // "false", which is truthy, and a lazier check would grant marketing.
  const raw = JSON.stringify({
    v: CONSENT_SCHEMA_VERSION,
    categories: { analytics: 'false', functional: false, marketing: false },
    ts: 'x',
  });
  assert.equal(parse(raw), null);
});

test('CONTROL: a truthiness-based reader WOULD grant on the string "false"', () => {
  // Proof the test above is guarding a real mistake and not a hypothetical.
  const categories = { analytics: 'false' };
  assert.equal(Boolean(categories.analytics), true);
});

test('a non-object categories field is rejected', () => {
  for (const bad of [null, 'yes', 42, ['analytics']]) {
    const raw = JSON.stringify({ v: CONSENT_SCHEMA_VERSION, categories: bad, ts: 'x' });
    assert.equal(parse(raw), null, `categories: ${JSON.stringify(bad)}`);
  }
});

test('parse returns a COPY — the caller cannot mutate the parsed record', () => {
  const raw = serialiseConsent(ALL_ON, 'x');
  const a = parse(raw);
  a.analytics = false;
  assert.equal(parse(raw).analytics, true, 'a second read is unaffected');
});

test('the cookie is named, versioned and expires', () => {
  assert.equal(CONSENT_COOKIE, '9e_cookie_consent');
  assert.equal(typeof CONSENT_SCHEMA_VERSION, 'number');
  // Six months. A consent record that never expires is not consent.
  assert.equal(CONSENT_MAX_AGE_SECONDS, 60 * 60 * 24 * 180);
  assert.ok(CONSENT_MAX_AGE_SECONDS > 0);
});

test('UI-ONLY ROUND: the store maps nothing to Consent Mode signals', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../../src/lib/cookieConsentStore.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['gtag', 'dataLayer', 'ad_storage', 'analytics_storage']) {
    assert.equal(code.includes(forbidden), false, `${forbidden} must not appear yet`);
  }
});
