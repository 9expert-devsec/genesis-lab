import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUOTE_FALLBACK } from '@/lib/about/aboutText';
import { quoteParts } from '@/lib/about/quoteParts';
import {
  COMPANY_PROFILE_PATH,
  companyProfileBlobUrl,
  companyProfileMeta,
  formatProfileSize,
  getCompanyProfileSize,
} from '@/lib/about/companyProfileSize';

/**
 * /about-us: the AboutConfig tagline in the Story quote card, and the company
 * profile size read from the file. See src/lib/about/.
 */

// ── the pull quote (round AB-3c): emphasis from the stored quote pair ──────
const NO_QUOTES = /["“”]/;
const all = (p) => p.before + p.emphasis + p.after;

test('pull quote: the stored tagline splits on its inner straight quotes', () => {
  const p = quoteParts('  สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"  ');
  assert.deepEqual(p, { before: 'สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ ', emphasis: 'ขับเคลื่อนประเทศไทย', after: '' });
  assert.equal(NO_QUOTES.test(all(p)), false, 'no quote mark survives');
});

test('pull quote: curly inner quotes, text after the pair, and a surrounding pair', () => {
  assert.deepEqual(quoteParts('ก “ข” ค'), { before: 'ก ', emphasis: 'ข', after: ' ค' });
  // a pair an older component wrapped around the whole tagline is dropped
  assert.deepEqual(quoteParts('“ก "ข"”'), { before: 'ก ', emphasis: 'ข', after: '' });
  assert.deepEqual(quoteParts('"ก ข"'), { before: 'ก ข', emphasis: '', after: '' });
  // only the FIRST pair is emphasis; later marks are dropped, not shown
  const two = quoteParts('"ก" และ "ข"');
  assert.deepEqual(two, { before: '', emphasis: 'ก', after: ' และ ข' });
  for (const t of ['ก “ข” ค', '“ก "ข"”', '"ก" และ "ข"', 'ก "ข', '"']) {
    assert.equal(NO_QUOTES.test(all(quoteParts(t))), false, t);
  }
});

test('pull quote: no inner pair → the whole text, no emphasis', () => {
  assert.deepEqual(quoteParts('Never Stop Learning'), { before: 'Never Stop Learning', emphasis: '', after: '' });
});

test('pull quote: empty or missing tagline → the fallback, never a crash', () => {
  for (const empty of ['', '   ', null, undefined, '""', '“”', '"']) {
    assert.deepEqual(quoteParts(empty), { before: QUOTE_FALLBACK, emphasis: '', after: '' }, String(empty));
  }
  assert.equal(QUOTE_FALLBACK, 'สอนแบ่งปันความรู้เทคโนโลยี เพื่อขับเคลื่อนประเทศไทย');
});

test('profile size: 1024² megabytes, one decimal; nothing usable → null', () => {
  assert.equal(formatProfileSize(22899697), '21.8 MB');
  assert.equal(formatProfileSize('22899697'), '21.8 MB');
  for (const bad of [null, undefined, '', '0', 0, -5, 'abc']) {
    assert.equal(formatProfileSize(bad), null, String(bad));
  }
});

test('the HEAD goes to the rewrite\'s own Blob destination', () => {
  assert.equal(COMPANY_PROFILE_PATH, '/9expert-company-profile.pdf');
  assert.equal(
    companyProfileBlobUrl('https://blob.example/'),
    'https://blob.example/webroot-documents/9expert-company-profile.pdf',
  );
  assert.equal(companyProfileBlobUrl(''), null);
});

test('getCompanyProfileSize: HEADs, reads Content-Length; any failure hides the size', async () => {
  const calls = [];
  const ok = (len) => async (url, init) => {
    calls.push([url, init.method]);
    return { ok: true, headers: new Headers(len == null ? {} : { 'content-length': String(len) }) };
  };
  assert.equal(await getCompanyProfileSize({ url: 'https://b/x.pdf', fetchImpl: ok(22899697) }), '21.8 MB');
  assert.deepEqual(calls[0], ['https://b/x.pdf', 'HEAD']);

  assert.equal(await getCompanyProfileSize({ url: 'https://b/x.pdf', fetchImpl: ok(null) }), null);
  assert.equal(
    await getCompanyProfileSize({ url: 'https://b/x.pdf', fetchImpl: async () => ({ ok: false, headers: new Headers() }) }),
    null,
  );
  assert.equal(
    await getCompanyProfileSize({ url: 'https://b/x.pdf', fetchImpl: async () => { throw new Error('offline'); } }),
    null,
  );
  assert.equal(await getCompanyProfileSize({ url: null, fetchImpl: ok(1) }), null);
});

test('Company Profile meta: bytes become "x.x MB"; a missing page count drops that part', () => {
  assert.equal(companyProfileMeta({ bytes: 18272549 }), 'PDF · 17.4 MB');
  assert.equal(companyProfileMeta({ size: '17.4 MB' }), 'PDF · 17.4 MB');
  assert.equal(companyProfileMeta({ bytes: 18272549, pages: 24 }), 'PDF · 24 หน้า · 17.4 MB');
  for (const pages of [undefined, null, 0, -3, 2.5, 'abc']) {
    assert.equal(companyProfileMeta({ bytes: 18272549, pages }), 'PDF · 17.4 MB', String(pages));
  }
  // nothing readable at all → just the format, never an invented figure
  assert.equal(companyProfileMeta({}), 'PDF');
  assert.equal(companyProfileMeta({ bytes: 0 }), 'PDF');
});
