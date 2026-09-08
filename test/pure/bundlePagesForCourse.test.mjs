import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectBundlePagesForCourse,
  pageBundleCourseCodes,
  countBundleSections,
  BUNDLE_ROW_LABEL,
} from '@/lib/pageBuilder/bundleCoursePages';

/**
 * "Which published bundle pages contain course X" — the pure selector.
 *
 * ── WHAT THIS FILE IS REALLY GUARDING ───────────────────────────────────
 * Two things, and neither is "does a filter filter".
 *
 * DEPTH. A bundle's courses live in section content at any container depth.
 * MEASURED on the live database: both `promotion_bundle` sections sit at depth
 * 0 — which is exactly why a reader that only looked at the top level would
 * pass every test anyone thought to write, and would then silently lose every
 * bundle an author later put inside a two-column layout. So the depth case is
 * asserted first and deliberately nests deeper than anything stored today.
 *
 * VISIBILITY. A draft bundle must not leak onto a public course page, and an
 * expired one must not either. Both leave through `publicPageHref` returning
 * null, so the gate is asserted through its OUTCOME (no row) with a control
 * proving the same page inside its window IS found — otherwise "no row" is
 * indistinguishable from a fixture that never matched.
 */

const NOW = Date.parse('2026-09-08T00:00:00.000Z');

/** One promotion_bundle section holding the given course codes. */
const bundle = (...codes) => ({
  type: 'promotion_bundle',
  content: { items: codes.map((courseId) => ({ courseId })) },
});

/** A published bundle page, with overrides. */
const page = (over = {}) => ({
  _id: 'p1',
  slug: 'bundle-a',
  title: 'แพ็กเกจ A',
  pageType: 'promotion',
  promotionKind: 'bundle',
  status: 'published',
  promotionOrder: 0,
  promotionCover: 'https://cdn/cover-a.jpg',
  publishStartDate: null,
  publishEndDate: null,
  sections: [bundle('MSE-L1')],
  ...over,
});

const hrefs = (rows) => rows.map((r) => r.href);

// ── depth ─────────────────────────────────────────────────────────────────

test('a bundle nested two containers deep is found', () => {
  /**
   * The whole point. `two_column` inside `container` — both real container
   * types with declared slots — so the walk has to follow `slotsOf` rather than
   * reading the top level and stopping.
   */
  const nested = page({
    sections: [{
      type: 'container',
      content: {
        children: [{
          type: 'two_column',
          content: {
            left: [{ type: 'heading', content: { text: 'x' } }],
            right: [bundle('MSE-L1')],
          },
        }],
      },
    }],
  });
  assert.deepEqual(pageBundleCourseCodes(nested), ['MSE-L1']);
  assert.equal(countBundleSections(nested.sections), 1);
  assert.deepEqual(hrefs(selectBundlePagesForCourse([nested], 'MSE-L1', NOW)), ['/promotions/bundle-a']);
});

test('CONTROL — a top-level-only reader would pass the easy case and fail that one', () => {
  /**
   * The control for the test above: the SAME course at depth 0 is found too, so
   * a green result there is about the depth and not about the fixture happening
   * to match. Without this pair, a broken walk that found nothing anywhere
   * would look identical to a broken walk that only found depth 0.
   */
  assert.deepEqual(hrefs(selectBundlePagesForCourse([page()], 'MSE-L1', NOW)), ['/promotions/bundle-a']);
  const deep = page({ sections: [{ type: 'container', content: { children: [bundle('MSE-L1')] } }] });
  assert.equal(selectBundlePagesForCourse([deep], 'MSE-L1', NOW).length, 1);
});

// ── visibility ────────────────────────────────────────────────────────────

test('a draft page is excluded', () => {
  assert.deepEqual(selectBundlePagesForCourse([page({ status: 'draft' })], 'MSE-L1', NOW), []);
});

test('a page outside its publish window is excluded — with the in-window control', () => {
  /**
   * Both ends of the window, because they fail for different reasons and a gate
   * that checked only one would look correct against the other.
   */
  const expired = page({ publishEndDate: '2026-09-01T00:00:00.000Z' });
  const future = page({ publishStartDate: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(selectBundlePagesForCourse([expired], 'MSE-L1', NOW), [], 'an expired bundle leaked');
  assert.deepEqual(selectBundlePagesForCourse([future], 'MSE-L1', NOW), [], 'a not-yet-started bundle leaked');

  // THE CONTROL: the same page, inside its window, IS found. Without it the two
  // assertions above are satisfied by a fixture that never matched at all.
  const live = page({
    publishStartDate: '2026-09-01T00:00:00.000Z',
    publishEndDate: '2026-10-01T00:00:00.000Z',
  });
  assert.deepEqual(hrefs(selectBundlePagesForCourse([live], 'MSE-L1', NOW)), ['/promotions/bundle-a']);
});

test('publicPageHref returning null ⇒ the row is dropped, not rendered hrefless', () => {
  /**
   * The slug refusal, which is the one case that is NOT about the window.
   * `/promotions/` is a real page that is not this one, so an empty slug must
   * never be concatenated into a link — and the row must vanish rather than
   * arrive with `href: ''` for a component to render as a dead anchor.
   */
  const noSlug = page({ slug: '' });
  const rows = selectBundlePagesForCourse([noSlug], 'MSE-L1', NOW);
  assert.deepEqual(rows, []);
  assert.ok(!rows.some((r) => !r.href), 'a row survived with no href');
});

// ── kind ──────────────────────────────────────────────────────────────────

test("promotionKind 'early_bird' and 'none' pages are excluded", () => {
  for (const promotionKind of ['early_bird', 'none', undefined]) {
    assert.deepEqual(
      selectBundlePagesForCourse([page({ promotionKind })], 'MSE-L1', NOW), [],
      `a ${String(promotionKind)} page was treated as a bundle`,
    );
  }
  // ...and a non-promotion page carrying the kind is excluded too: `pageType`
  // is what makes any of the promotion fields mean anything.
  assert.deepEqual(
    selectBundlePagesForCourse([page({ pageType: 'general' })], 'MSE-L1', NOW), [],
    'a general page with promotionKind bundle was treated as a promotion',
  );
});

// ── one page, one row ─────────────────────────────────────────────────────

test('the same course in two bundles on one page yields ONE row', () => {
  /**
   * Normal and explicitly allowed: a page may hold several bundles, and the
   * same course may sit in more than one. The ROW is the page.
   */
  const twoBundles = page({ sections: [bundle('MSE-L1'), bundle('MSE-L1', 'PBI-L1')] });
  assert.equal(countBundleSections(twoBundles.sections), 2);
  assert.deepEqual(selectBundlePagesForCourse([twoBundles], 'MSE-L1', NOW).length, 1);

  // ...and the same course twice inside ONE bundle is also one row.
  const twice = page({ sections: [bundle('MSE-L1', 'MSE-L1')] });
  assert.equal(selectBundlePagesForCourse([twice], 'MSE-L1', NOW).length, 1);
});

// ── course id matching ────────────────────────────────────────────────────

test('a case-differing course id still matches, and a different one does not', () => {
  /**
   * Mixed-case `course_id` values exist upstream and have already caused 404s
   * in this repo. The control is the second half: a genuinely different code
   * must NOT match, or "case-insensitive" would be indistinguishable from "any
   * code matches anything".
   */
  const p = page({ sections: [bundle('mse-l1')] });
  assert.equal(selectBundlePagesForCourse([p], 'MSE-L1', NOW).length, 1, 'case-differing id did not match');
  assert.equal(selectBundlePagesForCourse([p], '  mse-l1  ', NOW).length, 1, 'untrimmed id did not match');
  assert.equal(selectBundlePagesForCourse([p], 'MSE-L2', NOW).length, 0, 'a different id matched');
  assert.equal(selectBundlePagesForCourse([p], '', NOW).length, 0, 'an empty id matched everything');
});

// ── the view model, and the order ─────────────────────────────────────────

test('the row carries exactly the view model, and the label is the shared constant', () => {
  const [row] = selectBundlePagesForCourse([page()], 'MSE-L1', NOW);
  assert.deepEqual(Object.keys(row).sort(), ['cover', 'href', 'label', 'title']);
  assert.equal(row.href, '/promotions/bundle-a');
  assert.equal(row.title, 'แพ็กเกจ A');
  assert.equal(row.cover, 'https://cdn/cover-a.jpg');
  assert.equal(row.label, BUNDLE_ROW_LABEL);
});

test('rows sort by promotionOrder, then title', () => {
  const pages = [
    page({ _id: 'c', slug: 'c', title: 'ค', promotionOrder: 2 }),
    page({ _id: 'a', slug: 'a', title: 'ก', promotionOrder: 1 }),
    page({ _id: 'b', slug: 'b', title: 'ข', promotionOrder: 1 }),
  ];
  assert.deepEqual(hrefs(selectBundlePagesForCourse(pages, 'MSE-L1', NOW)),
    ['/promotions/a', '/promotions/b', '/promotions/c']);

  // CONTROL: the tiebreak is doing work — same order, titles decide.
  const tied = [
    page({ _id: 'z', slug: 'z', title: 'ฮ', promotionOrder: 0 }),
    page({ _id: 'y', slug: 'y', title: 'ก', promotionOrder: 0 }),
  ];
  assert.deepEqual(hrefs(selectBundlePagesForCourse(tied, 'MSE-L1', NOW)), ['/promotions/y', '/promotions/z']);
});

test('junk never throws — pages and sections are untrusted', () => {
  for (const input of [null, undefined, 'nope', [null, 7, {}], [{ sections: 'no' }]]) {
    assert.deepEqual(selectBundlePagesForCourse(input, 'MSE-L1', NOW), []);
  }
  assert.deepEqual(pageBundleCourseCodes(null), []);
  assert.deepEqual(pageBundleCourseCodes({ sections: [{ type: 'promotion_bundle' }] }), []);
  assert.equal(countBundleSections(undefined), 0);
});
