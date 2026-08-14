import { test } from 'node:test';
import assert from 'node:assert/strict';

import { articleSchema, ARTICLE_EXCERPT_MAX } from '@/lib/schemas/article';

/**
 * The excerpt cap — that it exists, where it sits, and that it is one number.
 *
 * ── WHAT THESE ASSERT AND WHAT THEY DELIBERATELY DO NOT ────────────────────
 * They do NOT assert that 2000 is the correct number; no test can, because the
 * argument for it rests on a survivorship-biased sample and is written out in
 * the schema instead. What they assert is the SHAPE the argument depends on:
 *
 *   · a cap still exists — the previous state of this field was "500 with no
 *     reason", and the failure mode of fixing that badly is deleting the cap
 *   · it clears the observed maximum by a real margin, so the migration is not
 *     blocked again on the next paste
 *   · it sits below a typical article body, so a full-body mis-paste is still
 *     rejected
 *   · the number is declared ONCE and the schema uses that declaration, so the
 *     form's counter (which blocks at the same value) cannot drift from it
 *
 * The measured figures the bounds are drawn from, all from production on
 * 2026-08-13, read-only, n=488: excerpt max 497, p95 367, median 186 among the
 * 118 non-empty; body plain text median 2333.
 */

const OBSERVED_EXCERPT_MAX = 497;
const MEDIAN_BODY_PLAIN_TEXT = 2333;

const base = {
  slug: 'a-slug',
  title: 'หัวข้อ',
  content: '<p>เนื้อหา</p>',
};

test('the cap is a single declaration the schema actually uses', () => {
  // Not decoration. The form blocks at this same value, and a literal repeated
  // in two files is a literal that gets raised in one of them — leaving a form
  // that refuses text the server would have accepted, or worse, accepts text
  // the server rejects, which is the exact failure being fixed here.
  assert.equal(typeof ARTICLE_EXCERPT_MAX, 'number');
  assert.equal(ARTICLE_EXCERPT_MAX, 2000);

  const atCap = articleSchema.safeParse({ ...base, excerpt: 'ก'.repeat(ARTICLE_EXCERPT_MAX) });
  assert.equal(atCap.success, true, 'exactly at the cap must pass');

  const overCap = articleSchema.safeParse({ ...base, excerpt: 'ก'.repeat(ARTICLE_EXCERPT_MAX + 1) });
  assert.equal(overCap.success, false, 'one over the cap must fail');
});

test('there is STILL a cap — an uncapped excerpt is not the fix', () => {
  // The lazy way to unblock the team. An uncapped field has no failure mode
  // anyone notices until an entire article body is in production HTML, inside a
  // <p> that is deliberately unclamped.
  const wholeArticle = articleSchema.safeParse({ ...base, excerpt: 'ก'.repeat(50_000) });
  assert.equal(wholeArticle.success, false, 'a 50k-character paste must be rejected');
});

test('the cap clears every excerpt that has ever been stored, with margin', () => {
  // The point of raising it. A cap set snugly above the survivors blocks the
  // same team on the next paste, because the sample cannot see the articles
  // that failed to save.
  assert.ok(
    ARTICLE_EXCERPT_MAX > OBSERVED_EXCERPT_MAX * 3,
    `the cap (${ARTICLE_EXCERPT_MAX}) must clear the observed max (${OBSERVED_EXCERPT_MAX}) ` +
      'by a real margin — the excerpt sample is survivorship-biased and understates demand'
  );
  const longestStored = articleSchema.safeParse({ ...base, excerpt: 'ก'.repeat(OBSERVED_EXCERPT_MAX) });
  assert.equal(longestStored.success, true, 'the longest stored excerpt must still validate');
});

test('the cap sits BELOW a typical article body, so a full-body paste is caught', () => {
  // The other half of the bound, and the reason this is not simply a huge
  // number. If the cap rose above a typical body, the one accident it exists to
  // catch would pass.
  assert.ok(
    ARTICLE_EXCERPT_MAX < MEDIAN_BODY_PLAIN_TEXT,
    `the cap (${ARTICLE_EXCERPT_MAX}) must stay under the median body ` +
      `(${MEDIAN_BODY_PLAIN_TEXT} plain-text chars) or it stops catching mis-pastes`
  );
  const medianBodyPasted = articleSchema.safeParse({ ...base, excerpt: 'ก'.repeat(MEDIAN_BODY_PLAIN_TEXT) });
  assert.equal(medianBodyPasted.success, false, 'a median-length body pasted in must be rejected');
});

test('the cap counts CHARACTERS, so Thai is not penalised', () => {
  // Worth pinning because it is invisible until it is wrong. Thai codepoints are
  // 3 bytes in UTF-8, so a byte-based limit would give Thai editors a third of
  // the room English editors get. zod's .max() on a string is a JS length —
  // UTF-16 code units — and Thai consonants, vowels and tone marks are all in
  // the BMP, so each counts as one. A cap of N means N Thai characters.
  const thai = 'ก'.repeat(ARTICLE_EXCERPT_MAX);
  assert.equal(thai.length, ARTICLE_EXCERPT_MAX);
  assert.ok(Buffer.byteLength(thai, 'utf8') > ARTICLE_EXCERPT_MAX * 2, 'Thai really is multi-byte');
  assert.equal(articleSchema.safeParse({ ...base, excerpt: thai }).success, true);
});

test('the cap trims before measuring, so trailing whitespace cannot fail a save', () => {
  // `.trim()` runs before `.max()` in the chain. A paste that ends in a newline
  // and lands one character over would otherwise be rejected for whitespace the
  // admin cannot see.
  const padded = `  ${'ก'.repeat(ARTICLE_EXCERPT_MAX)}\n\n  `;
  assert.ok(padded.length > ARTICLE_EXCERPT_MAX);
  const parsed = articleSchema.safeParse({ ...base, excerpt: padded });
  assert.equal(parsed.success, true, 'whitespace around a cap-length excerpt must not fail');
  assert.equal(parsed.data.excerpt.length, ARTICLE_EXCERPT_MAX);
});
