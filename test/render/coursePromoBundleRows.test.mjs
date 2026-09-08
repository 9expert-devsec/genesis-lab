import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { CourseBundleSection } from '@/app/(public)/[...slug]/_components/CourseBundleSection';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The MSDB block is imported so the byte-identity claim can
// be asserted against the thing it is about, rather than argued.
import { CoursePromoSection } from '@/app/(public)/[...slug]/_components/CoursePromoSection';
// ADDED beside the statements above rather than folded into any. The row's href
// must be the one the SELECTOR produced — a component that rebuilt it would be
// the second link builder `publicPageHref` exists to prevent.
import { selectBundlePagesForCourse } from '@/lib/pageBuilder/bundleCoursePages';

/**
 * The bundle rows on a course detail page.
 *
 * ── THE TWO CLAIMS ──────────────────────────────────────────────────────
 *  1. a bundle row links to `/promotions/<slug>` — the ONLY URL that renders
 *     one of these pages, because a promotion page is diverted off its bare
 *     slug and `/<slug>` answers 308.
 *  2. with no bundles, the promo area is byte-identical to today — which is
 *     what makes this round safe for every course page that has no bundle, i.e.
 *     all of them at the time of writing.
 *
 * The href is not typed into this file. It is taken from the selector, on a
 * page fixture, so a component that quietly built its own link would fail here
 * rather than agreeing with a hard-coded string that happened to match.
 */

const NOW = Date.parse('2026-09-08T00:00:00.000Z');
const html = (el) => renderToStaticMarkup(el);
const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

const bundlePage = (over = {}) => ({
  _id: 'p1',
  slug: 'super-saver',
  title: 'แพ็กเกจซูเปอร์เซฟเวอร์',
  pageType: 'promotion',
  promotionKind: 'bundle',
  status: 'published',
  promotionOrder: 0,
  promotionCover: 'https://cdn/cover.jpg',
  publishStartDate: null,
  publishEndDate: null,
  sections: [{ type: 'promotion_bundle', content: { items: [{ courseId: 'MSE-L1' }] } }],
  ...over,
});

// ── 1. the row, and its href ──────────────────────────────────────────────

test('a bundle row renders with /promotions/<slug> as its href', () => {
  const rows = selectBundlePagesForCourse([bundlePage()], 'MSE-L1', NOW);
  assert.equal(rows.length, 1, 'the fixture produced no row — the rest of this test is vacuous');

  const d = doc(html(CourseBundleSection({ bundles: rows })));
  const anchors = [...d.querySelectorAll('a')];
  const row = anchors.find((a) => a.getAttribute('href') === '/promotions/super-saver');
  assert.ok(row, `no row linked to /promotions/super-saver — got ${anchors.map((a) => a.getAttribute('href'))}`);
  assert.match(row.textContent, /แพ็กเกจซูเปอร์เซฟเวอร์/);

  // ...and NOT the bare slug, which answers 308 for a promotion page. Asserted
  // separately because a row carrying both would satisfy the check above.
  assert.ok(!anchors.some((a) => a.getAttribute('href') === '/super-saver'),
    'a row linked to the bare slug — that URL redirects');
});

test('the row shows the cover, and a page with none still gets a same-size box', () => {
  const withCover = selectBundlePagesForCourse([bundlePage()], 'MSE-L1', NOW);
  const without = selectBundlePagesForCourse([bundlePage({ promotionCover: '' })], 'MSE-L1', NOW);

  const img = doc(html(CourseBundleSection({ bundles: withCover }))).querySelector('img');
  assert.equal(img?.getAttribute('src'), 'https://cdn/cover.jpg');

  const d = doc(html(CourseBundleSection({ bundles: without })));
  assert.equal(d.querySelector('img'), null, 'an empty cover rendered an <img> with no src');
  // The placeholder is the same 80x80 as the image it stands in for, or a row
  // with no cover would be shorter than the one beside it.
  assert.ok(d.querySelector('div.h-\\[80px\\]'), 'no placeholder box for a coverless page');
});

test('two bundles render two rows, in the order the selector returned', () => {
  const rows = selectBundlePagesForCourse([
    bundlePage({ _id: 'b', slug: 'second', title: 'ข', promotionOrder: 2 }),
    bundlePage({ _id: 'a', slug: 'first', title: 'ก', promotionOrder: 1 }),
  ], 'MSE-L1', NOW);
  const hrefs = [...doc(html(CourseBundleSection({ bundles: rows }))).querySelectorAll('a')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h.startsWith('/promotions/') && h !== '/promotions');
  assert.deepEqual(hrefs, ['/promotions/first', '/promotions/second']);
});

// ── 2. byte-identity when there are no bundles ────────────────────────────

test('no bundle rows ⇒ the block renders NOTHING at all', () => {
  /**
   * Not "renders an empty section" — nothing. An empty wrapper would still
   * change the promo area's markup and its spacing, on every course page that
   * has no bundle, which today is all of them.
   */
  for (const bundles of [[], null, undefined, 'nope', 0]) {
    assert.equal(html(CourseBundleSection({ bundles })), '',
      `bundles=${JSON.stringify(bundles)} rendered markup`);
  }
});

test('CONTROL — the promo area is byte-identical, asserted against the MSDB block', () => {
  /**
   * The claim is that a course with no bundles has exactly the promo area it
   * had before. Two halves, and both are asserted rather than argued:
   *
   *   · this round does not modify CoursePromoSection, so its markup for a
   *     fixture is whatever it was — pinned here so a later edit to that
   *     component has to come past this test;
   *   · concatenating the new block onto it adds nothing, because the new block
   *     renders ''.
   *
   * The CONTROL half is the last assertion: with a bundle present the
   * concatenation DOES differ, so the equality above is a real property of the
   * empty case and not of string concatenation.
   */
  const promo = [{
    link: { _id: 'l1' },
    promotion: {
      promotion_id: 'PROMO-1',
      api_slug: 'promo-1',
      title: 'โปรโมชัน MSDB',
      thumbnail_url: 'https://cdn/msdb.jpg',
      end_date: '2026-12-31T00:00:00.000Z',
      is_pinned: false,
    },
  }];

  const msdbOnly = html(CoursePromoSection({ coursePromos: promo }));
  assert.ok(msdbOnly.includes('/promotions/promo-1'), 'the MSDB fixture did not render a row');

  const withEmptyBundles = msdbOnly + html(CourseBundleSection({ bundles: [] }));
  assert.equal(withEmptyBundles, msdbOnly, 'the empty bundle block changed the promo area');

  // THE CONTROL: a non-empty list really does change it, so the equality above
  // is about the empty case rather than about `+ ''` always being a no-op.
  const rows = selectBundlePagesForCourse([bundlePage()], 'MSE-L1', NOW);
  assert.notEqual(msdbOnly + html(CourseBundleSection({ bundles: rows })), msdbOnly,
    'a bundle row rendered nothing — the byte-identity claim proves nothing');
});

test('the two blocks are SIBLINGS — the MSDB cap cannot starve the bundles', () => {
  /**
   * The reason this is a separate block at all. `CoursePromoSection` renders
   * `slice(0, 2)`; merged, a course with two MSDB promotions would show no
   * bundle ever, with nothing indicating anything had been hidden. Asserted on
   * behaviour: two MSDB rows AND a bundle row all reach the markup.
   */
  const twoPromos = [1, 2].map((n) => ({
    link: { _id: `l${n}` },
    promotion: {
      promotion_id: `P${n}`, api_slug: `p-${n}`, title: `โปร ${n}`,
      thumbnail_url: '', end_date: null, is_pinned: false,
    },
  }));
  const rows = selectBundlePagesForCourse([bundlePage()], 'MSE-L1', NOW);
  const markup = html(CoursePromoSection({ coursePromos: twoPromos }))
    + html(CourseBundleSection({ bundles: rows }));
  const hrefs = [...doc(markup).querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.includes('/promotions/p-1'));
  assert.ok(hrefs.includes('/promotions/p-2'));
  assert.ok(hrefs.includes('/promotions/super-saver'),
    'the bundle row was crowded out by the MSDB block that has its own cap');
});
