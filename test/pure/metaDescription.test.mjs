import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toMetaDescription,
  truncateForMeta,
  META_DESCRIPTION_MAX,
} from '@/lib/seo/metaDescription';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';

/**
 * The meta-description helper, and the two consumers that must use it.
 *
 * The defect: `seoDescription` is capped at 160 by articleSchema, but both call
 * sites resolved a `||` chain and passed the result RAW. The moment the value
 * came from the fallback the cap did not apply — `excerpt` is capped at 2000
 * and `title` at 200 — so either could put a paragraph into a <meta> tag.
 *
 * Exposure is zero today (74 articles have an empty seoDescription, none of
 * them with an excerpt), so these guard a path that has not fired yet. They are
 * written against the case that WILL fire: an editor filling the excerpt and
 * leaving the SEO field blank, on a form whose excerpt cap is now 2000.
 */

const OVER = 'A'.repeat(400);

// A real Thai excerpt, the worst measured case for the boundary rule: the
// nearest space backwards from character 160 is 59 characters away.
const THAI_LONG =
  'คุณรู้หรือไม่ว่า Excel มีเครื่องมือ ที่ช่วยให้การทำงานดังกล่าวนี้ ' +
  'ทำงานได้แบบอัตโนมัติเพียงแค่ 1 คลิกโดยไม่ต้องเขียนสูตรใด ๆ ทั้งสิ้นและยังปรับแก้ได้ภายหลังอีกด้วย ' +
  'ซึ่งจะช่วยลดเวลาการทำงานลงได้อย่างมาก';

// ── the limit ───────────────────────────────────────────────────────────────

test('the limit is the one seoDescription already declares', () => {
  assert.equal(META_DESCRIPTION_MAX, 160);
});

test('a long value is cut to at most the limit, ellipsis INCLUDED', () => {
  const out = truncateForMeta(OVER);
  assert.ok(
    out.length <= META_DESCRIPTION_MAX,
    `got ${out.length} — the ellipsis is part of the budget, not added on top of it`
  );
  assert.ok(out.endsWith('…'), 'a cut value must say it was cut');
});

test('a value already within the limit is returned untouched', () => {
  const short = 'สรุปสั้น ๆ ของบทความนี้';
  assert.equal(truncateForMeta(short), short);
  assert.ok(!truncateForMeta(short).endsWith('…'), 'nothing was cut, so nothing claims it was');
});

// ── the boundary rule ───────────────────────────────────────────────────────

test('English cuts on a word boundary, not mid-word', () => {
  const WORDS = ['the', 'quick', 'brown', 'fox'];
  const out = truncateForMeta(`${WORDS.join(' ')} `.repeat(20));

  // The check is that the LAST word survived whole. Asserting "does not end in
  // a letter" would be wrong — a complete word ends in a letter too — so this
  // compares the final token against the vocabulary the fixture is built from.
  const body = out.slice(0, -1);                 // drop the ellipsis
  const lastToken = body.slice(body.lastIndexOf(' ') + 1);
  assert.ok(
    WORDS.includes(lastToken),
    `ended on the partial token ${JSON.stringify(lastToken)} — the cut split a word`
  );
  assert.ok(out.endsWith('…'));
});

test('a FAR space is ignored rather than surrendering a third of the text', () => {
  /**
   * The measured worst case. Thai uses the space as a phrase separator, so the
   * nearest one backwards can be 59 characters away — an unbounded "cut at the
   * last space" rule would have returned 101 characters of an available 160.
   * The lookback is bounded at 15% of the limit for exactly this.
   */
  const out = truncateForMeta(THAI_LONG);
  assert.ok(out.length <= META_DESCRIPTION_MAX);
  assert.ok(
    out.length > META_DESCRIPTION_MAX * 0.8,
    `got ${out.length} of ${META_DESCRIPTION_MAX} — a far space was honoured and ate the description`
  );
});

test('a NEAR space is honoured', () => {
  // The other half of the same rule: within the window, the phrase boundary wins.
  const text = `${'ก'.repeat(150)} ${'ข'.repeat(200)}`;
  const out = truncateForMeta(text);
  assert.equal(out, `${'ก'.repeat(150)}…`, 'a space 9 characters back is inside the window');
});

test('a Thai combining mark is never left dangling', () => {
  /**
   * The real mid-token risk in Thai and the one that is invisible in English:
   * vowel signs and tone marks are separate codepoints, so a hard cut can land
   * between a consonant and its mark and render a dotted-circle glyph.
   *
   * 'กิ' is consonant + U+0E34. The leading 'x' is not decoration: without it
   * the repeat's parity puts a CONSONANT at the cut index, the backoff never
   * runs, and this test passes whether the backoff exists or not — which is
   * exactly what the first version of it did. The fixture therefore asserts
   * that it is cutting on a mark before asserting what happens next.
   */
  const MARK = /[ัิ-ฺ็-๎]/;
  const text = `x${'กิ'.repeat(200)}`;
  const budget = META_DESCRIPTION_MAX - 1;              // the ellipsis takes one
  assert.ok(
    MARK.test(text[budget - 1]),
    'the fixture must actually place a combining mark at the cut, or it proves nothing'
  );

  const out = truncateForMeta(text);
  const lastChar = out.slice(-2, -1); // the char before the ellipsis
  assert.ok(
    !MARK.test(lastChar),
    `ended on a combining mark U+${lastChar.codePointAt(0).toString(16)} — that is a broken glyph`
  );
  assert.ok(out.length <= META_DESCRIPTION_MAX);
});

test('an unbroken token longer than the budget degrades to a hard cut, not to nothing', () => {
  // A bare '…' as a meta description is worse than a clipped word.
  const out = truncateForMeta('A'.repeat(500));
  assert.ok(out.length > 100, `got ${JSON.stringify(out)} — the cut ate everything`);
  assert.ok(out.length <= META_DESCRIPTION_MAX);
});

test('newlines and runs of whitespace are collapsed', () => {
  // It lives in an attribute; a pasted paragraph break is noise.
  assert.equal(truncateForMeta('  หนึ่ง\n\nสอง   สาม\t '), 'หนึ่ง สอง สาม');
  assert.equal(truncateForMeta('a b'), 'a b', 'NBSP survives copy-paste and must fold too');
});

// ── the fallback chain ──────────────────────────────────────────────────────

test('the first non-empty candidate wins, and it is truncated too', () => {
  assert.equal(toMetaDescription('', '  ', 'ที่สาม'), 'ที่สาม');
  assert.equal(toMetaDescription(null, undefined, 'x'), 'x');
  assert.equal(toMetaDescription('', '', ''), '', 'all empty yields empty, never an ellipsis');

  const out = toMetaDescription('', OVER, 'unused title');
  assert.ok(out.length <= META_DESCRIPTION_MAX, 'the FALLBACK is the case that bypassed the cap');
  assert.ok(out.startsWith('AAA'));
});

test('a whitespace-only candidate is empty, not a winner', () => {
  // `||` treats ' ' as truthy, which is how a space-only SEO field would have
  // silently suppressed the excerpt fallback.
  assert.equal(toMetaDescription('   \n  ', 'ของจริง'), 'ของจริง');
});

// ── the two consumers ───────────────────────────────────────────────────────

test('JSON-LD description is truncated when it falls back to the excerpt', () => {
  const ld = buildJsonLd({
    slug: 'x',
    title: 'หัวข้อ',
    excerpt: OVER,
    active: true,
    publishedAt: '2026-01-01T00:00:00.000Z',
    jsonLd: { enabled: true, schemaType: 'Article', overrides: {}, rawOverrideEnabled: false },
  });
  assert.ok(ld, 'the fixture must actually build');
  assert.ok(
    ld.description.length <= META_DESCRIPTION_MAX,
    `JSON-LD description is ${ld.description.length} characters`
  );
  assert.ok(ld.description.endsWith('…'));
});

test('JSON-LD keeps an explicit override, still bounded', () => {
  const ld = buildJsonLd({
    slug: 'x',
    title: 'หัวข้อ',
    excerpt: 'ไม่ควรถูกใช้',
    active: true,
    publishedAt: '2026-01-01T00:00:00.000Z',
    jsonLd: {
      enabled: true, schemaType: 'Article', rawOverrideEnabled: false,
      overrides: { description: `OVERRIDE ${OVER}` },
    },
  });
  assert.ok(ld.description.startsWith('OVERRIDE '), 'the override still wins the chain');
  assert.ok(ld.description.length <= META_DESCRIPTION_MAX);
});
