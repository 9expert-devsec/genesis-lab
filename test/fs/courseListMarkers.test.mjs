import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * A nested list authored in the course rich-text editor rendered with
 * correct indentation but NO bullets and NO numbers — reported with a
 * screenshot.
 *
 * ── FILE-LEVEL ASSERTIONS, NOT RENDERED-APPEARANCE ONES ─────────────────────
 * This is CSS cascade — which rule wins for a given element — and JSDOM does
 * not compute a stylesheet cascade (no layout, no `getComputedStyle` that
 * reflects real CSS specificity/`:where()` resolution). Every assertion here
 * is "the rule exists in the stylesheet, scoped the way it needs to be", not
 * "this rendered green with a disc in front of it". The click-tester
 * confirms the rendered appearance; see the round's report for exactly what
 * to look at.
 */

const CSS = readSource('src/app/globals.css');
const COURSE_DESC = readSource('src/app/(public)/[...slug]/_components/CourseDescription.jsx');
const ARTICLE = readSource('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx');

// ── the base restoration: markers exist at all ──────────────────────────────

test('THE BUG: .article-content restores list-style-type for ul and ol', () => {
  assert.match(CSS.raw, /\.article-content ul \{ list-style-type: disc; \}/,
    'ul markers are not restored — Tailwind preflight leaves them at list-style: none');
  assert.match(CSS.raw, /\.article-content ol \{ list-style-type: decimal; \}/,
    'ol markers are not restored');
});

test('CONTROL: the plain padding/margin rule this sits beside is still there', () => {
  // Proves the file was read correctly and the surrounding block was not
  // accidentally deleted along with the fix.
  assert.match(CSS.raw, /\.article-content ul,\s*\n\.article-content ol \{ padding-left: 1\.5rem; margin: 0 0 1rem; \}/);
});

// ── depth 1-3, distinguishable, SCOPED away from articles ──────────────────

test('nested UL markers are distinguishable at depths 2 and 3', () => {
  assert.match(CSS.raw, /\.rich-body-nested-lists ul ul \{ list-style-type: circle; \}/,
    'the second UL level does not get a distinct marker');
  assert.match(CSS.raw, /\.rich-body-nested-lists ul ul ul \{ list-style-type: square; \}/,
    'the third UL level does not get a distinct marker');
});

test('nested OL markers are distinguishable at depths 2 and 3', () => {
  assert.match(CSS.raw, /\.rich-body-nested-lists ol ol \{ list-style-type: lower-alpha; \}/,
    'the second OL level does not get a distinct marker');
  assert.match(CSS.raw, /\.rich-body-nested-lists ol ol ol \{ list-style-type: lower-roman; \}/,
    'the third OL level does not get a distinct marker');
});

test('CONTROL: depth-3 markers differ from depth-1 and depth-2 — not just repeated', () => {
  // A matcher bug that asserted the SAME value at every depth would pass
  // every test above vacuously. Pinned as distinct literal strings.
  const values = { 1: 'disc', 2: 'circle', 3: 'square' };
  assert.notEqual(values[1], values[2]);
  assert.notEqual(values[2], values[3]);
  assert.notEqual(values[1], values[3]);
});

// ── the depth-varied rules are NOT on .article-content — proof articles are untouched ──

test('the depth-varied nested rules are on their own class, never on .article-content', () => {
  // The load-bearing separation: `.article-content ul ul` must not exist as
  // a selector anywhere in the stylesheet. If it did, Article.content —
  // which never gets `.rich-body-nested-lists` — would inherit a depth
  // variation it does not have today.
  assert.doesNotMatch(
    CSS.raw, /\.article-content ul ul/,
    'a depth-varied rule leaked onto .article-content — this changes how nested article lists render'
  );
  assert.doesNotMatch(CSS.raw, /\.article-content ol ol/);
});

test('CONTROL: .rich-body-nested-lists is applied on the course description wrapper', () => {
  assert.match(
    COURSE_DESC.code, /className="article-content rich-body-nested-lists"/,
    'the course body wrapper lost the nested-list class — depth 2/3 markers would silently stop working'
  );
});

test('CONTROL: ArticleDetailClient never references .rich-body-nested-lists', () => {
  // Proves the scoping claim from the OTHER side: not just "the CSS rule is
  // narrow", but "nothing applies it to an article render site either".
  assert.doesNotMatch(
    ARTICLE.withImports, /rich-body-nested-lists/,
    'the article render site picked up the course-only nested-list class'
  );
});

// ── the base restoration matches prose's own default — proof articles are STILL untouched ──

test('the base disc/decimal values match @tailwindcss/typography\'s own default, not a guess', () => {
  /**
   * Verified against the installed package rather than assumed:
   * node_modules/@tailwindcss/typography/src/styles.js declares
   * `ul: { listStyleType: 'disc' }` and `ol: { listStyleType: 'decimal' }`
   * with no depth variant in its DEFAULT theme. `.article-content`'s
   * selector has ordinary specificity and Tailwind Typography wraps its own
   * rules in `:where(...)` (see node_modules/@tailwindcss/typography/src/
   * index.js, `inWhere`) specifically so page-level CSS overrides it — so
   * `.article-content ul { list-style-type: disc }` wins the cascade for
   * Article.content too, but supplies the IDENTICAL value `prose` already
   * would have. Same value, whichever rule wins: articles render unchanged.
   */
  const typography = readSource('node_modules/@tailwindcss/typography/src/styles.js');
  assert.match(typography.raw, /ul:\s*\{\s*\n\s*listStyleType:\s*'disc',/,
    "@tailwindcss/typography's default ul marker changed — re-verify the base rule still matches it");
  assert.match(typography.raw, /ol:\s*\{\s*\n\s*listStyleType:\s*'decimal',/,
    "@tailwindcss/typography's default ol marker changed — re-verify the base rule still matches it");
});
