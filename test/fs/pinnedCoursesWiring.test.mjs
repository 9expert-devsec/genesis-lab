import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * That the article page actually resolves its pinned courses through the shared
 * helper.
 *
 * test/pure/pinnedCourses covers what the helper DECIDES. It cannot see whether
 * the page calls it — and the page cannot be render-tested here: it awaits
 * `getArticleBySlug` (Mongo) and `listPublicCourses` (HTTP), and stubbing both
 * to exercise the two lines between them would be testing the stubs. So the
 * wiring is asserted from source, with the limitation stated: this proves the
 * helper is CALLED and the broken shape is GONE, not that the rendered list is
 * right.
 */

const PAGE = 'src/app/(public)/articles/[slug]/page.jsx';

test('the article page resolves pinned courses through the helper', () => {
  const { code } = readSource(PAGE);
  assert.match(code, /pickPinnedCourses\(article\.relatedCourses,\s*items\)/,
    'the pins and the catalogue must both go through the helper');
});

test('the catalogue-order filter and its exact-case Set are gone', () => {
  /**
   * The exact defect, as the shape that must not return. `.filter` over the
   * catalogue is what discarded the curator's order, and `new Set(...)` with
   * `.has(c.course_id)` is what made a mixed-case pin resolve to nothing.
   * Both were one line, so both come back together if anyone "simplifies" this.
   */
  const { code } = readSource(PAGE);
  assert.ok(
    !/new Set\(article\.relatedCourses\)/.test(code),
    'the exact-case Set is back — a mixed-case pin will silently render nothing'
  );
  assert.ok(
    !/items\s*\?\?\s*\[\]\)\.filter\(\(c\)\s*=>\s*wanted\.has/.test(code),
    'the catalogue-order filter is back — the curator\'s sequence is discarded'
  );
});

test('related ARTICLES still get the treatment they already had', () => {
  // The half that was never broken, and the precedent this fix followed. If
  // getArticlesByIds ever stops re-emitting in caller order, the two halves of
  // one feature diverge again — in the other direction this time.
  const { code } = readSource('src/lib/actions/articles.js');
  assert.match(code, /valid\.map\(\(id\) => byId\.get\(String\(id\)\)\)/,
    'getArticlesByIds must keep re-emitting in the caller\'s order');
});
