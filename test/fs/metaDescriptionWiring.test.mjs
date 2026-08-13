import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * That both meta-description consumers go through the shared helper.
 *
 * ── WHY ONE OF THESE IS A SOURCE GUARD AND THE OTHER IS NOT ────────────────
 * `buildJsonLd` is a pure function and test/pure/metaDescription invokes it for
 * real, with a 400-character excerpt, and asserts the output length. That is
 * the stronger test and it is used where it can be.
 *
 * `generateMetadata` in the article page cannot be called here: it awaits
 * `getArticleBySlug`, which opens a Mongo connection, and the render tier has
 * no database. Stubbing the read to test the two lines around it would be
 * testing the stub. So the wiring is asserted from source instead — with the
 * limitation stated rather than papered over: this proves the helper is CALLED
 * and the raw chain is GONE, not that the rendered <meta> is short.
 *
 * Read from `code` (imports stripped): every assertion is about what the file
 * does, and an import line satisfying a "does not contain X" check is the
 * classic vacuous pass.
 */

const PAGE = 'src/app/(public)/articles/[slug]/page.jsx';
const JSONLD = 'src/lib/articles/buildJsonLd.js';
const HELPER = 'src/lib/seo/metaDescription.js';

test('the article page builds its description through the helper', () => {
  const { code } = readSource(PAGE);

  assert.match(code, /toMetaDescription\(/, 'the page must use the shared helper');

  // The exact defect, as the line that must not come back. `||` short-circuits
  // to the first TRUTHY value and applies no cap, so the moment the value came
  // from `excerpt` (max 2000) or `title` (max 200), seoDescription's max(160)
  // was bypassed entirely.
  assert.ok(
    !/seoDescription\s*\|\|\s*\w+\.excerpt/.test(code),
    'the raw `seoDescription || excerpt || title` chain is the bug — it must not return'
  );
});

test('the meta tag and OpenGraph carry the SAME description', () => {
  // They are one value in the source. Splitting them into two expressions is how
  // one of them keeps a cap the other loses, and nothing on the page would look
  // wrong.
  const { code } = readSource(PAGE);
  const occurrences = (code.match(/description,/g) ?? []).length;
  assert.ok(
    occurrences >= 2,
    'both `description` and `openGraph.description` must be the one resolved value'
  );
  assert.equal(
    (code.match(/const description =/g) ?? []).length,
    1,
    'exactly one description is resolved for the page'
  );
});

test('buildJsonLd builds its description through the same helper', () => {
  const { code } = readSource(JSONLD);
  assert.match(code, /description:\s*toMetaDescription\(/);
  assert.ok(
    !/description:\s*ov\.description\s*\|\|/.test(code),
    'the raw fallback chain must not return here either'
  );
});

test('there is ONE implementation of the truncation, not two', () => {
  /**
   * The requirement that makes the other three worth having. Two call sites
   * that each "truncate to 160" drift the first time one of them is tuned, and
   * the meta tag and the structured data then describe the page differently —
   * which no page renders wrongly, so nobody finds out.
   */
  const owners = walkSources('src')
    .filter((f) => /\bELLIPSIS\b|lastIndexOf\(' '\)/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(owners, [HELPER], `truncation logic leaked into: ${owners.join(', ')}`);
});

test('the limit is declared once, in the helper', () => {
  const declarers = walkSources('src')
    .filter((f) => /META_DESCRIPTION_MAX\s*=/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(declarers, [HELPER]);

  // And it agrees with the schema cap it was taken from. If seoDescription's
  // max is ever retuned, the fallback must move with it or the two disagree
  // about what a description is.
  const schema = readSource('src/lib/schemas/article.js').code;
  const seoMax = schema.match(/seoDescription:\s*z\.string\(\)\.trim\(\)\.max\((\d+)\)/)?.[1];
  const helperMax = readSource(HELPER).code.match(/META_DESCRIPTION_MAX\s*=\s*(\d+)/)?.[1];
  assert.equal(
    helperMax,
    seoMax,
    'the fallback limit must equal seoDescription\'s declared max, or be re-justified'
  );
});
