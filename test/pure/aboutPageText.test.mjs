import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUOTE_FALLBACK, quoteCardText } from '@/lib/about/aboutText';
import {
  COMPANY_PROFILE_PATH,
  companyProfileBlobUrl,
  formatProfileSize,
  getCompanyProfileSize,
} from '@/lib/about/companyProfileSize';

/**
 * /about-us: the AboutConfig tagline in the Story quote card, and the company
 * profile size read from the file. See src/lib/about/.
 */

test('quote card: text without surrounding quotes gets one pair of “ ”', () => {
  // the live tagline: quotes INSIDE, not around — kept verbatim, wrapped once
  assert.equal(
    quoteCardText('  สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"  '),
    '“สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"”',
  );
  assert.equal(quoteCardText('Never Stop Learning'), '“Never Stop Learning”');
});

test('quote card: text already wrapped in quote characters is shown as-is', () => {
  for (const t of ['“ก ข”', '"ก ข"', "'ก ข'", '“ก ข"']) {
    assert.equal(quoteCardText(t), t);
  }
  // a lone quote character is not "already quoted"
  assert.equal(quoteCardText('"'), '“"”');
});

test('quote card: empty or missing tagline → the fallback, quoted', () => {
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(quoteCardText(empty), `“${QUOTE_FALLBACK}”`);
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
