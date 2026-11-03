import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readTouch,
  mergeTouch,
  classifyChannel,
  buildAttribution,
  attributionField,
  attributionSummary,
  ATTRIBUTION_EMPTY_LABEL,
  CHANNELS,
  FIRST_TOUCH_TTL_DAYS,
} from '@/lib/attribution/attribution';

/**
 * Registration attribution — see src/lib/attribution/attribution.js.
 *
 * The rules under test are the ones a marketing report will be reconciled
 * against, so each is pinned by a case a person can read: what counts as a
 * touch, which touch survives, and what channel it lands in.
 */

const NOW = new Date('2026-11-03T03:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY);
const SITE = 'https://www.9experttraining.com';

const touch = (href, referrer = '', now = NOW) =>
  readTouch({ href: `${SITE}${href}`, referrer, ownHost: 'www.9experttraining.com', now });

// ── readTouch ──────────────────────────────────────────────────────────────

test('UTMs are read and lower-cased; click ids are kept verbatim', () => {
  const t = touch('/power-bi?utm_source=LINE&utm_medium=line_oa&utm_campaign=Nov_Promo&gclid=Cj0KAbC');
  assert.equal(t.utm_source, 'line');
  assert.equal(t.utm_medium, 'line_oa');
  assert.equal(t.utm_campaign, 'nov_promo');
  assert.equal(t.gclid, 'Cj0KAbC');
  assert.equal(t.landing_path, '/power-bi');
  assert.equal(t.captured_at, NOW.toISOString());
});

test('the landing path never carries the query string', () => {
  assert.equal(touch('/x?email=someone@example.com&utm_source=a').landing_path, '/x');
});

test('referrer: external host kept (www stripped), path never stored', () => {
  const t = touch('/', 'https://www.google.co.th/search?q=power+bi');
  assert.equal(t.referrer_host, 'google.co.th');
  assert.equal(JSON.stringify(t).includes('power+bi'), false);
});

test('referrer: the host the page is served from is not a source (www ignored both sides)', () => {
  const own = (href, referrer) =>
    readTouch({ href: `https://www.9experttraining.com${href}`, referrer, ownHost: 'www.9experttraining.com', now: NOW });
  assert.equal(own('/', 'https://www.9experttraining.com/schedule').referrer_host, undefined);
  assert.equal(own('/', 'https://9experttraining.com/schedule').referrer_host, undefined);
});

test('referrer: the CORPORATE site 9expert.co.th is external — a Referral, counted', () => {
  const own = (referrer) =>
    readTouch({ href: 'https://www.9experttraining.com/', referrer, ownHost: 'www.9experttraining.com', now: NOW });
  for (const ref of ['https://www.9expert.co.th/about', 'https://9expert.co.th/']) {
    const t = own(ref);
    assert.equal(t.referrer_host, '9expert.co.th', ref);
    assert.equal(classifyChannel(t), 'Referral', ref);
  }
});

test('referrer: payment return legs and Omise are not a source', () => {
  assert.equal(touch('/registration/payment/complete?id=1', 'https://bank-3ds.example.com/').referrer_host, undefined);
  assert.equal(touch('/masterclass/payment/complete', 'https://pay.omise.co/x').referrer_host, undefined);
  assert.equal(touch('/', 'https://api.omise.co/').referrer_host, undefined);
});

test('admin pages are never a touch', () => {
  assert.equal(touch('/admin'), null);
  assert.equal(touch('/admin/registrations?utm_source=x'), null);
  assert.notEqual(touch('/administrator-course'), null);
});

test('a malformed href is not a touch and does not throw', () => {
  assert.equal(readTouch({ href: 'not a url' }), null);
});

// ── mergeTouch ─────────────────────────────────────────────────────────────

const email = { utm_source: 'newsletter', utm_medium: 'email', landing_path: '/a', captured_at: at(10).toISOString() };
const direct = (daysAgo = 0) => ({ landing_path: '/b', captured_at: at(daysAgo).toISOString() });

test('first visit sets both first and last', () => {
  const s = mergeTouch({}, email, NOW);
  assert.equal(s.first, email);
  assert.equal(s.last, email);
});

test('a Direct return does NOT erase the campaign (last-non-direct)', () => {
  const s0 = { first: email, last: email };
  const s1 = mergeTouch(s0, direct(), NOW);
  assert.equal(s1, s0, 'unchanged state is returned as the same object');
});

test('a new campaign replaces last and keeps first', () => {
  const line = { utm_source: 'line', utm_medium: 'line_oa', captured_at: NOW.toISOString() };
  const s = mergeTouch({ first: email, last: email }, line, NOW);
  assert.equal(s.first, email);
  assert.equal(s.last, line);
});

test('an external referrer counts as a new last touch', () => {
  const ref = { referrer_host: 'pantip.com', captured_at: NOW.toISOString() };
  assert.equal(mergeTouch({ first: email, last: email }, ref, NOW).last, ref);
});

test(`first touch expires after ${FIRST_TOUCH_TTL_DAYS} days; an expired last yields to Direct`, () => {
  const old = { ...email, captured_at: at(FIRST_TOUCH_TTL_DAYS + 1).toISOString() };
  const d = direct();
  const s = mergeTouch({ first: old, last: old }, d, NOW);
  assert.equal(s.first, d);
  assert.equal(s.last, d);
});

test('within the window, first is kept even when last is replaced', () => {
  const recent = { ...email, captured_at: at(FIRST_TOUCH_TTL_DAYS - 1).toISOString() };
  const ref = { referrer_host: 'bing.com', captured_at: NOW.toISOString() };
  assert.equal(mergeTouch({ first: recent, last: recent }, ref, NOW).first, recent);
});

test('null touch and junk state are survivable', () => {
  const s = { first: email, last: email };
  assert.equal(mergeTouch(s, null, NOW), s);
  assert.deepEqual(mergeTouch('junk', direct(), NOW).first, direct());
});

// ── classifyChannel ────────────────────────────────────────────────────────

const CASES = [
  [{ gclid: 'x' }, 'Paid Search'],
  [{ wbraid: 'x' }, 'Paid Search'],
  [{ gbraid: 'x', utm_medium: 'email' }, 'Paid Search'],
  [{ utm_source: 'facebook', utm_medium: 'paid_social' }, 'Paid Social'],
  [{ utm_source: 'instagram', utm_medium: 'paid_social', fbclid: 'x' }, 'Paid Social'],
  [{ utm_source: 'facebook', utm_medium: 'cpc' }, 'Paid Social'],
  [{ utm_source: 'bing', utm_medium: 'cpc' }, 'Paid Search'],
  [{ fbclid: 'x' }, 'Social (Meta)'],
  [{ fbclid: 'x', referrer_host: 'l.facebook.com' }, 'Social (Meta)'],
  [{ utm_source: 'facebook', utm_medium: 'social' }, 'Organic Social'],
  [{ utm_source: 'line', utm_medium: 'line_oa' }, 'LINE'],
  [{ referrer_host: 'liff.line.me' }, 'LINE'],
  [{ utm_source: 'newsletter', utm_medium: 'email' }, 'Email'],
  [{ utm_source: 'partner-x', utm_medium: 'referral' }, 'Referral'],
  [{ utm_source: 'event', utm_campaign: 'expo' }, 'Other Campaign'],
  [{ referrer_host: 'google.co.th' }, 'Organic Search'],
  [{ referrer_host: 'bing.com' }, 'Organic Search'],
  [{ referrer_host: 'm.facebook.com' }, 'Organic Social'],
  [{ referrer_host: 'pantip.com' }, 'Organic Social'],
  [{ referrer_host: 'blog.example.com' }, 'Referral'],
  [{ landing_path: '/' }, 'Direct'],
  [null, 'Direct'],
];

for (const [t, want] of CASES) {
  test(`channel: ${JSON.stringify(t)} → ${want}`, () => {
    assert.equal(classifyChannel(t), want);
    assert.ok(CHANNELS.includes(want));
  });
}

// ── buildAttribution (the server's entry point) ───────────────────────────

test('server: unknown keys dropped, client channel ignored, channel derived from last', () => {
  const out = buildAttribution({
    first: { utm_source: 'newsletter', utm_medium: 'email', captured_at: at(3).toISOString(), evil: 'x' },
    last: { utm_source: 'line', utm_medium: 'line_oa', captured_at: NOW.toISOString(), $where: '1' },
    channel: 'Paid Search',
  });
  assert.equal(out.channel, 'LINE');
  assert.equal('evil' in out.first, false);
  assert.equal('$where' in out.last, false);
  assert.ok(out.last.captured_at instanceof Date);
});

test('server: non-strings, arrays and huge values are neutralised', () => {
  const out = buildAttribution({
    last: { utm_source: { $gt: '' }, utm_campaign: 'x'.repeat(5000), gclid: ['a'], captured_at: 'yesterday' },
  });
  assert.equal(out.last.utm_source, undefined);
  assert.equal(out.last.gclid, undefined);
  assert.equal(out.last.utm_campaign.length, 300);
  assert.equal(out.last.captured_at, undefined);
  assert.equal(out.first, undefined);
  assert.equal(out.channel, 'Other Campaign');
});

test('server: ASCII control characters are stripped from every value', () => {
  const out = buildAttribution({
    last: { utm_source: 'line\u0000\u0007', utm_campaign: '\u001Bnov\u007F', referrer_host: 'a.com\n' },
  }, NOW);
  assert.equal(out.last.utm_source, 'line');
  assert.equal(out.last.utm_campaign, 'nov');
  assert.equal(out.last.referrer_host, 'a.com');
});

test('server: captured_at more than 5 minutes ahead of the server clock is dropped', () => {
  const at = (ms) => new Date(NOW.getTime() + ms).toISOString();
  const keep = buildAttribution({ last: { utm_source: 'a', captured_at: at(4 * 60 * 1000) } }, NOW);
  const drop = buildAttribution({ last: { utm_source: 'a', captured_at: at(6 * 60 * 1000) } }, NOW);
  assert.ok(keep.last.captured_at instanceof Date);
  assert.equal(drop.last.captured_at, undefined);
  assert.equal(drop.last.utm_source, 'a', 'the rest of the touch survives');
});

test('server: last falls back to first when only first was sent', () => {
  const out = buildAttribution({ first: { referrer_host: 'Google.com' } });
  assert.equal(out.last.referrer_host, 'google.com');
  assert.equal(out.channel, 'Organic Search');
});

test('server: nothing usable → undefined, and attributionField spreads to nothing', () => {
  for (const raw of [undefined, null, 'x', 42, [], {}, { first: 'x', last: [] }, { first: {} }]) {
    assert.equal(buildAttribution(raw), undefined, JSON.stringify(raw));
    assert.deepEqual(attributionField(raw), {});
  }
});

// ── attributionSummary (the admin card) ───────────────────────────────────

test('summary: null for a record filed before the field existed', () => {
  assert.equal(attributionSummary(undefined), null);
  assert.equal(attributionSummary({}), null);
});

test('summary: headline is channel / source / campaign of the last touch', () => {
  const s = attributionSummary({
    first: { referrer_host: 'google.com' },
    last: { utm_source: 'test', utm_medium: 'email', utm_campaign: 'gtm_check' },
    channel: 'Email',
  });
  assert.equal(s.headline, 'Email / test / gtm_check');
  assert.equal(s.rows.find((r) => r.label === 'First touch').value, 'google.com');
});

test('summary: click ids are PRESENCE only — the value never reaches the card', () => {
  const s = attributionSummary({
    first: { fbclid: 'IwAR-secret-fbclid-value' },
    last: { gclid: 'Cj0KCQ-secret-gclid-value' },
    channel: 'Paid Search',
  });
  assert.equal(s.rows.find((r) => r.label === 'Click ID').value, 'มี gclid, มี fbclid');
  assert.equal(/secret/.test(JSON.stringify(s)), false);
});

test('summary: the empty-state label names why there is no data', () => {
  assert.equal(ATTRIBUTION_EMPTY_LABEL, 'ไม่มีข้อมูล (ลงทะเบียนก่อนเริ่มเก็บข้อมูลที่มา)');
});
