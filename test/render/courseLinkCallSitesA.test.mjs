import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseCard as CatalogueCard } from '@/app/(public)/training-course/_components/CourseCard';
import { CourseCard as SharedCard } from '@/components/course/CourseCard';
import { CourseTableGroup } from '@/app/(public)/training-course/_components/CourseTableGroup';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';
import { readSource } from '../sourceScan.mjs';

/**
 * BATCH A — the four surfaces that link to a course from a list row.
 *
 * ══ WHY EVERY SURFACE GETS ITS OWN TEST ═════════════════════════════════════
 * A guard on the helper is not a guard on its callers. This repo has already
 * shipped a feature that reached one call site out of three while two guards
 * passed, because both checked the component and neither counted call sites.
 * `courseLinkHref` being correct says nothing about whether the catalogue card
 * calls it.
 *
 * ══ AND WHY THE FIXTURES CARRY `urlAlias` ON THE ROW ════════════════════════
 * THE SILENT-FALLBACK TRAP. If the alias never reaches a call site, that site
 * falls back to `/<code>-training-course` — a valid URL that resolves, so
 * nothing 404s and nothing looks wrong. A test fed a row WITHOUT an alias
 * cannot tell "the plumbing works" from "the plumbing is gone": both produce
 * the derived path.
 *
 * So every fixture below is shaped like what `listPublicCourses` actually
 * returns after this round — upstream fields plus `urlAlias` — and the aliased
 * case asserts the ALIAS. Feeding the code form and asserting the code form
 * would be a test of the fallback, not of this round.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * The `href` attribute in rendered markup. Not that a real click lands on the
 * alias URL, not that the page it lands on is the one whose canonical tag
 * agrees, and not that the fetch path really attaches `urlAlias` in production
 * — that is test/pure/courseAliasPlumbing's job, and the two together are the
 * claim. Named as unverified in the round report.
 */

const ALIAS = '/build-business-apps-with-claude-code-training-course';

/** A row shaped like listPublicCourses' output, alias included. */
const row = (urlAlias) => ({
  _id: 'id-1',
  course_id: 'VIBE-CODE-L1',
  course_name: 'Build Business Apps with Claude Code',
  course_teaser: 'สร้างแอปธุรกิจ',
  course_price: 12900,
  course_trainingdays: 2,
  course_traininghours: 12,
  course_levels: '2',
  course_cover_url: 'https://res.cloudinary.com/x/cover.png',
  course_type_public: true,
  course_type_inhouse: false,
  program: { program_name: 'AI', programiconurl: '' },
  skills: [],
  urlAlias,
});

/** Every href in a fragment of markup. */
const hrefs = (markup) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/**
 * The href pointing at the course detail page.
 *
 * Located by EXCLUSION rather than by shape: every card also emits a
 * `/registration/in-house?course=…` link, and the detail href is whatever is
 * left. Matching on `-training-course` instead — the first version of this
 * helper — silently returned null for an alias that does not carry the suffix,
 * and the equality test then failed on `no-slash-course` for a reason that had
 * nothing to do with the component.
 */
const detailHref = (markup) =>
  hrefs(markup).find((h) => h.startsWith('/') && !h.startsWith('/registration')) ?? null;

const SURFACES = [
  [
    'catalogue card',
    (course) => renderToStaticMarkup(createElement(CatalogueCard, { course })),
  ],
  [
    'shared card (also related courses and the PageBuilder sections)',
    (course) => renderToStaticMarkup(createElement(SharedCard, { course })),
  ],
];

for (const [name, render] of SURFACES) {
  test(`${name}: an ALIASED course links to the alias`, () => {
    const markup = render(row(ALIAS));
    assert.ok(hrefs(markup).includes(ALIAS),
      `${name} emitted ${JSON.stringify(hrefs(markup))} — the alias is not among them`);
    assert.ok(!hrefs(markup).includes('/vibe-code-l1-training-course'),
      `${name} still emits the code form alongside the alias`);
  });

  test(`${name}: an UNALIASED course links to the derived path`, () => {
    // The first course without an alias must not produce an empty or malformed
    // href on a page nobody tested.
    const markup = render(row(null));
    assert.equal(detailHref(markup), '/vibe-code-l1-training-course', name);
  });

  test(`${name}: the href EQUALS courseCanonicalPath, so it cannot drift`, () => {
    // The binding assertion, per surface. Compared as a value against the same
    // function the page's <link rel="canonical"> uses.
    for (const alias of [ALIAS, null, '', '   ', 'no-slash-course']) {
      const expected = courseCanonicalPath({ course_id: 'VIBE-CODE-L1' }, { urlAlias: alias });
      const got = detailHref(render(row(alias)));
      assert.equal(got, expected, `${name} with alias ${JSON.stringify(alias)}`);
    }
  });

  test(`${name}: no double slash in any emitted href`, () => {
    for (const alias of [ALIAS, '/pretty', 'pretty', '/pretty/', null]) {
      for (const href of hrefs(render(row(alias)))) {
        assert.ok(!href.startsWith('//'), `${name}: ${href} (alias ${JSON.stringify(alias)})`);
      }
    }
  });
}

// ── the course table, which emits no href at all ────────────────────────────
//
// MEASURED, not assumed. CourseTableGroup renders `<tr onClick={() =>
// router.push(href)}>` with a keyboard handler beside it — there is no <a> and
// no href attribute in its markup, so the scraping the three surfaces above use
// returns [] here for a completely correct component. The first draft of this
// file reported that as three failures and it was the TEST that was wrong.
//
// So this surface is asserted at the only tier that can see it: that it calls
// the shared helper, and that the row it passes is the whole course object
// rather than a code string. Weaker than a rendered href, and said so rather
// than dressed up — the census guard in commit 5 is what stops a hand-built
// path reappearing here.

test('course table: navigates through the shared helper, not a hand-built path', () => {
  const src = readSource('src/app/(public)/training-course/_components/CourseTableGroup.jsx');
  assert.match(src.withImports, /import \{ courseLinkHref \}/, 'the helper is not imported');
  assert.match(src.code, /const href = courseLinkHref\(c\)/,
    'the table builds its own path again — `c`, the whole row, is what carries urlAlias');
  assert.ok(!/courseHref\(/.test(src.code), 'the alias-blind helper is back in the table');
  // …and the value really is what it navigates to.
  assert.match(src.code, /router\.push\(href\)/, 'the computed href is not what is pushed');
});

test('course table: really has no href to scrape — the reason for the test above', () => {
  // Pins the premise. If the table ever grows a real <a href>, this fails and
  // the surface should move up into the rendered-href group, where the
  // assertion is stronger.
  const markup = renderToStaticMarkup(
    createElement(CourseTableGroup, { program: { program_name: 'AI' }, courses: [row(ALIAS)] }),
  );
  assert.ok(markup.length > 200, 'the table rendered nothing at all');
  assert.deepEqual(hrefs(markup), [],
    'the table now emits an href — assert it directly instead of scanning source');
});

// ── the landing feature strip ───────────────────────────────────────────────
//
// Not a component — a pure builder that produces the strip's card model from
// the `landing_cache` snapshot. Tested through its own module rather than by
// rendering the home page, which needs Mongo.

const banner = () => ({
  _id: 'b1',
  type: 'course',
  active: true,
  title: 'Build Business Apps',
  weight: 1,
});

/** The strip's card model for one course banner, with the course resolved. */
async function stripItem(urlAlias) {
  const { mapBannersToFeatureContent } = await import('@/lib/home/featureContentFromBanners');
  const items = mapBannersToFeatureContent([banner()], {
    resolved: new Map([['b1', { course: row(urlAlias), online: false }]]),
  });
  assert.equal(items.length, 1, 'the strip produced no card for a live course banner');
  return items[0];
}

test('landing feature strip: an ALIASED course links to the alias', async () => {
  const item = await stripItem(ALIAS);
  assert.equal(item.detailsUrl ?? item.href ?? item.url, ALIAS,
    `the strip emitted ${JSON.stringify(item.detailsUrl ?? item.href ?? item.url)}`);
});

test('landing feature strip: an UNALIASED course links to the derived path', async () => {
  const item = await stripItem(null);
  assert.equal(item.detailsUrl ?? item.href ?? item.url, '/vibe-code-l1-training-course');
});

test('landing feature strip: the href EQUALS courseCanonicalPath', async () => {
  for (const alias of [ALIAS, null, '   ', 'no-slash-course']) {
    const item = await stripItem(alias);
    assert.equal(
      item.detailsUrl ?? item.href ?? item.url,
      courseCanonicalPath({ course_id: 'VIBE-CODE-L1' }, { urlAlias: alias }),
      `alias ${JSON.stringify(alias)}`,
    );
  }
});

test('landing feature strip: an admin-typed link_url still wins', () => {
  // Pre-existing behaviour, asserted because this round touched the branch
  // below it: a stored link_url beats the derived destination, and an admin who
  // typed a promo landing page meant it.
  return import('@/lib/home/featureContentFromBanners').then(({ mapBannersToFeatureContent }) => {
    const items = mapBannersToFeatureContent(
      [{ ...banner(), link_url: '/promotions/early-bird' }],
      { resolved: new Map([['b1', { course: row(ALIAS), online: false }]]) },
    );
    assert.equal(items[0].detailsUrl ?? items[0].href ?? items[0].url, '/promotions/early-bird');
  });
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the aliased and unaliased renders really differ', () => {
  // Every "links to the alias" test above would pass against a component that
  // ignored the row entirely IF the expected value happened to match. This
  // pins that the alias reaches the markup and changes it.
  for (const [name, render] of SURFACES) {
    assert.notEqual(detailHref(render(row(ALIAS))), detailHref(render(row(null))), name);
  }
});

test('CONTROL: the fixtures carry an alias — the trap this file exists for', () => {
  // If `row()` stopped putting `urlAlias` on the object, every aliased test
  // would fall back to the derived path and the "links to the alias" assertions
  // would fail loudly — but a future edit that "simplified" the fixture would
  // be reverting the round without saying so. Stated as an assertion.
  assert.equal(row(ALIAS).urlAlias, ALIAS);
  assert.ok('urlAlias' in row(null), 'the key must be present even when null');
});
