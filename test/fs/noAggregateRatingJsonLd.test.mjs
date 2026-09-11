import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * NOTHING UNDER src/ CONSTRUCTS AggregateRating OR Review MARKUP.
 *
 * ── THE RULE, AND WHERE IT ALREADY LIVES ───────────────────────────────────
 * lib/schemas/pageBuilder.js keeps Review and AggregateRating out of
 * JSONLD_TYPES — "must NEVER be emitted" — and the JSON-LD hook point in
 * app/(public)/[...slug]/page.jsx repeats it. Both are comments and an
 * allow-list; neither reached lib/courses/buildCourseJsonLd.js, which
 * predated them and emitted a site-wide 4.9 / 90,000-review rating on every
 * course page until it was removed. This guard is what makes the rule a
 * property of the tree rather than of two files someone remembered to read.
 *
 * ── SCOPED TO CONSTRUCTION, NOT TO THE WORDS ───────────────────────────────
 * What is banned is BUILDING the markup: an `aggregateRating:` / `review:`
 * object key, or an `'AggregateRating'` / `'Review'` string in `@type`
 * position. Scanned on `readSource().code` — comments stripped — so the two
 * prohibitions above, which name the types in prose, do not trip the guard
 * they justify. TestimonialStats.jsx shows "4.9" and "90,000" to human
 * readers as marketing copy; it contains neither identifier and is out of
 * scope here on purpose — the defect was asserting those numbers as
 * machine-readable review data about each course, not displaying them.
 *
 * A `review` key alone is too common a word to ban tree-wide (form fields,
 * admin review states), so the object-key form is checked only next to a
 * JSON-LD context: within files that build a document (`'@context'` or
 * `'@type'` present in code). `AggregateRating` and `Review` as `@type`
 * values are banned everywhere.
 */

const SRC_FILES = walkSources('src');

/** `aggregateRating:` as an object key, or assigned: `.aggregateRating =`, `["aggregateRating"] =`. */
const RATING_KEY = /(^|[\s{,(\[.])['"]?aggregateRating['"]?\s*[:=\]]/m;
/** `'@type': 'AggregateRating'` or `'@type': 'Review'`, any quote style / spacing. */
const RATING_TYPE = /['"]@type['"]\s*:\s*['"](AggregateRating|Review)['"]/;
/** A `review:` key, only meaningful in a file that builds JSON-LD. */
const REVIEW_KEY = /(^|[\s{,(])['"]?review['"]?\s*:\s*\{/m;
const BUILDS_JSONLD = /['"]@(context|type)['"]/;

/** The offences a code string carries, by kind. Empty array = clean. */
export function ratingMarkup(code) {
  const hits = [];
  if (RATING_KEY.test(code)) hits.push('aggregateRating key');
  if (RATING_TYPE.test(code)) hits.push('@type AggregateRating/Review');
  if (BUILDS_JSONLD.test(code) && REVIEW_KEY.test(code)) hits.push('review key in a JSON-LD builder');
  return hits;
}

test('the walk reaches the whole of src/', () => {
  // A guard over an empty set passes forever.
  assert.ok(SRC_FILES.length >= 300, `the walk reached only ${SRC_FILES.length} files under src/`);
  assert.ok(SRC_FILES.some((f) => f.rel === 'src/lib/courses/buildCourseJsonLd.js'), 'the builder is not in the walk');
});

test('no file under src/ constructs aggregateRating / AggregateRating / Review markup', () => {
  const offenders = SRC_FILES
    .map((f) => [f.rel, ratingMarkup(f.code)])
    .filter(([, hits]) => hits.length);
  assert.deepEqual(offenders, [],
    'these files build review markup. It may return ONLY when real per-course ratings exist '
    + 'AND are rendered in visible content — see lib/schemas/pageBuilder.js JSONLD_TYPES.');
});

test('the two existing prohibitions are still stated, in prose, where they were', () => {
  // The guard justifies itself by pointing at them; if they go, this file
  // becomes the only record of the rule and its header stops being true.
  assert.match(readSource('src/lib/schemas/pageBuilder.js').raw, /AggregateRating[\s\S]{0,80}NEVER be emitted/);
  assert.match(readSource('src/app/(public)/[...slug]/page.jsx').raw, /Never emit Review or\s*\/\/\s*AggregateRating/);
  // And JSONLD_TYPES itself does not list them.
  assert.doesNotMatch(readSource('src/lib/schemas/pageBuilder.js').code, /['"](AggregateRating|Review)['"]/);
});

test('the builder\'s comment records the removal — so it is not re-added as a missing feature', () => {
  const builder = readSource('src/lib/courses/buildCourseJsonLd.js');
  assert.match(builder.raw, /NO aggregateRating, NO review/);
  assert.match(builder.raw, /pageBuilder\.js/);
  assert.match(builder.raw, /\[\.\.\.slug\]\/page\.jsx/);
  assert.match(builder.raw, /real per-course ratings exist AND[\s\S]{0,80}visible content/);
  // …and the code itself is clean (the comment names the types; the code may not).
  assert.deepEqual(ratingMarkup(builder.code), []);
});

test('TestimonialStats.jsx is NOT an offender — marketing copy is out of scope', () => {
  const stats = readSource('src/app/_components/home/TestimonialStats.jsx');
  assert.deepEqual(ratingMarkup(stats.code), []);
  // It really does show the numbers; the guard is not passing because the
  // file is empty of them.
  assert.match(stats.raw, /4\.9/);
});

test('CONTROL: the scanner catches every construction form it bans', () => {
  assert.deepEqual(ratingMarkup(`const x = {\n  aggregateRating: {\n    '@type': 'AggregateRating',\n    ratingValue: '4.9',\n  },\n};`),
    ['aggregateRating key', '@type AggregateRating/Review']);
  assert.deepEqual(ratingMarkup(`doc["aggregateRating"] = r;`), ['aggregateRating key']);
  assert.deepEqual(ratingMarkup(`doc.aggregateRating = r;`), ['aggregateRating key']);
  assert.deepEqual(ratingMarkup(`const t = { "@type": "Review", author: a };`), ['@type AggregateRating/Review']);
  assert.deepEqual(ratingMarkup(`return { '@context': 'https://schema.org', review: { name: 'x' } };`), ['review key in a JSON-LD builder']);
});

test('CONTROL: the scanner reads prose and marketing text as innocent', () => {
  // The two prohibitions, verbatim, as they appear in code comments.
  assert.deepEqual(ratingMarkup(readSource('src/lib/schemas/pageBuilder.js').code), []);
  // A `review` key in a file that builds no JSON-LD (an admin form state).
  assert.deepEqual(ratingMarkup(`const state = { review: { open: true } };`), []);
  // The word in a string shown to people.
  assert.deepEqual(ratingMarkup(`<p>คะแนนรีวิว 4.9 จาก 90,000 ผู้เรียน</p>`), []);
});

test('CONTROL: the sweep fails and NAMES a file the guard was not written around', () => {
  // A file with nothing to do with JSON-LD, poisoned with the removed block:
  // the failure must come from the WALK, not from a list of suspects.
  const f = 'src/app/_components/home/TestimonialStats.jsx';
  const poisoned = `${readSource(f).code}
export const ld = { aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', ratingCount: '90000' } };`;
  assert.deepEqual(ratingMarkup(poisoned), ['aggregateRating key', '@type AggregateRating/Review']);
  assert.throws(
    () => assert.deepEqual([[f, ratingMarkup(poisoned)]].filter(([, h]) => h.length), [], `${f} builds review markup`),
    (e) => e.message.includes('TestimonialStats.jsx'),
    'the failure must name the offending file');
});
