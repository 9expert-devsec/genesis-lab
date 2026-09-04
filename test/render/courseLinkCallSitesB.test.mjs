import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkillBreadcrumb } from '@/app/(public)/[...slug]/_components/SkillBreadcrumb';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';
import { readSource } from '../sourceScan.mjs';

/**
 * BATCH B — search x2, schedule x2, skill breadcrumb, registration.
 *
 * ══ WHY THREE OF THE SIX ARE SOURCE-ASSERTED AND SAID SO ════════════════════
 * The brief asked for a render test per call site. Four of these six cannot
 * have one, and pretending otherwise would be worse than saying it:
 *
 *   · SearchClient and ScheduleClient are 'use client' components whose course
 *     rows arrive through several layers of filter/sort state. Rendering either
 *     in isolation means reconstructing that state, and the test would then be
 *     asserting the fixture rather than the component.
 *   · RegisterPageContent is an async Server Component that awaits four
 *     network/DB calls before rendering — test/fs/registerBackLinkWiring says
 *     exactly this, and pins it at source for exactly this reason. Its
 *     behavioural half lives there.
 *
 * So those get the assertion the tier CAN make — that the call site passes the
 * whole row to the shared helper rather than building a path — plus the
 * behavioural equality proved once, here, against the same helper they call.
 * The census guard in the next commit is what stops a hand-built path
 * reappearing in any of them.
 *
 * The SkillBreadcrumb is a plain server component and IS rendered.
 *
 * ── WHAT NONE OF THIS TIER CAN SEE ──────────────────────────────────────────
 * That a real click lands on the alias URL. Named as unverified in the report.
 */

const ALIAS = '/build-business-apps-with-claude-code-training-course';
const CODE = 'VIBE-CODE-L1';
const DERIVED = '/vibe-code-l1-training-course';

// ── the breadcrumb, rendered ────────────────────────────────────────────────

const breadcrumb = (urlAlias) => renderToStaticMarkup(createElement(SkillBreadcrumb, {
  course: {
    skills: [],
    program: null,
    previous_course: { course_id: CODE, course_name: 'Prerequisite', urlAlias },
  },
}));

const hrefs = (markup) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

test('skill breadcrumb: its prerequisite LINK IS COMMENTED OUT — a finding', () => {
  /**
   * ── THIS IS NOT ONE OF THE TEN LIVE CALL SITES ──────────────────────────
   * The round brief lists SkillBreadcrumb.jsx:25 among the ten sites emitting
   * the code form. It does build `previousHref` — and the <Link> that would
   * render it sits inside a JSX comment (SkillBreadcrumb.jsx:97), so the value
   * is computed and thrown away. The component emits NO course href at all.
   *
   * The call site was still converted: a dead branch that comes back should
   * come back correct, and leaving the alias-blind helper here would leave a
   * caller for the census guard to trip over. But it is recorded as dead rather
   * than counted as a surface this round fixed.
   */
  const markup = breadcrumb(ALIAS);
  assert.ok(markup.length > 50, 'the breadcrumb rendered nothing at all');
  assert.deepEqual(hrefs(markup), [],
    'the prerequisite link is live again — assert its href directly instead');

  const { code } = readSource('src/app/(public)/[...slug]/_components/SkillBreadcrumb.jsx');
  assert.match(code, /const previousHref = previous\?\.course_id \? courseLinkHref\(previous\)/,
    'the breadcrumb builds its own path again');
  assert.ok(!/courseHref\(/.test(code), 'the alias-blind helper is back in the breadcrumb');
});

// ── the four client / server-component call sites, at source ────────────────

const SOURCE_SITES = [
  ['search: course result card', 'src/app/(public)/search/_components/SearchClient.jsx',
    /const href = courseLinkHref\(course\)/],
  ['search: schedule result row', 'src/app/(public)/search/_components/SearchClient.jsx',
    /href=\{courseLinkHref\(course\)\}/],
  ['schedule: table row', 'src/app/(public)/schedule/_components/ScheduleClient.jsx',
    /href=\{courseLinkHref\(c\)\}/],
  ['schedule: course card', 'src/app/(public)/schedule/_components/ScheduleClient.jsx',
    /const href = courseLinkHref\(course\)/],
];

for (const [name, file, shape] of SOURCE_SITES) {
  test(`${name}: builds its href through the shared helper`, () => {
    const { code, withImports } = readSource(file);
    assert.match(withImports, /import \{ courseLinkHref \}/, `${file} does not import the helper`);
    assert.match(code, shape, `${name} builds its own path`);
    // The alias-blind helper must be gone from the file entirely — a second
    // call site still using it would emit the code form while its neighbour
    // emitted the alias, which is the split this round removes.
    assert.ok(!/courseHref\(/.test(code), `courseHref is still called in ${file}`);
  });
}

test('the search corpus carries urlAlias onto its schedule rows', () => {
  // The schedule result row renders `course_ref`, which the corpus builds with
  // an explicit four-field projection. Without widening it, that surface would
  // emit the code form no matter what the call site did — the alias would
  // simply not be in the data.
  const { code } = readSource('src/lib/search/searchCorpus.js');
  assert.match(code, /urlAlias: c\.urlAlias \?\? null/,
    'course_ref drops the alias, so the schedule search result cannot link to it');
});

test('the course detail route attaches aliases to related and previous courses', () => {
  // Both are EMBEDDED in upstream's detail response and never pass through
  // listPublicCourses, so nothing else would have attached one.
  const { code, withImports } = readSource('src/app/(public)/[...slug]/page.jsx');
  assert.match(withImports, /import \{ attachAliases, loadCourseAliasMap \}/);
  // ── ATTACHED IN THE ASYNC PAGE, PASSED DOWN AS A PROP ────────────────────
  // Not inside CourseDetail: that component is SYNCHRONOUS, and an `await`
  // there compiles to "await isn't allowed in a non-async function". Nothing
  // in this suite compiles the route, so only `next build` said so — which is
  // the reason the build is part of this round's gate and not an afterthought.
  assert.match(code, /relatedCoursesWithAliases=\{attachAliases\(/,
    'the related-course aliases are not attached by the async page');
  assert.match(code, /await loadCourseAliasMap\(\),/);
  assert.match(code, /relatedCoursesWithAliases = \[\]/, 'the prop is not received');
  // NOT previous_course. Its link is dead (see the breadcrumb test above), so
  // attaching an alias for it would be plumbing a path nothing renders.
  assert.ok(!/courseForBreadcrumb/.test(code), 'dead-path plumbing is back');
});

// ── the behavioural half the four source sites share ────────────────────────

test('every batch-B site resolves to the SAME path courseCanonicalPath gives', () => {
  // Proved once against the helper all four call, since the components
  // themselves cannot be rendered in this tier. Not a substitute for a render —
  // it is the half that IS reachable, and the source assertions above are what
  // tie each call site to it.
  for (const alias of [ALIAS, null, '', '   ', '/pretty/', 'no-slash-course']) {
    assert.equal(
      courseLinkHref({ course_id: CODE, urlAlias: alias }),
      courseCanonicalPath({ course_id: CODE }, { urlAlias: alias }),
      `alias ${JSON.stringify(alias)}`,
    );
  }
});

// ── CONTROL ─────────────────────────────────────────────────────────────────

test('CONTROL: the href scraper works — the breadcrumb emitting none is real', () => {
  // The breadcrumb test asserts an EMPTY href list, which a broken scraper
  // would also produce. This proves the scraper finds hrefs when they exist,
  // so "the breadcrumb emits none" is a fact about the component.
  assert.deepEqual(hrefs('<a href="/x">y</a><a href="/z">w</a>'), ['/x', '/z']);
  assert.deepEqual(hrefs('<span>no links</span>'), []);
  // …and the breadcrumb really did render something, it just has no links in it.
  assert.match(breadcrumb(ALIAS), /<div/);
});

test('CONTROL: the source matchers are not vacuous', () => {
  // Four `assert.match` calls against real files. If a path were wrong, they
  // would throw on an empty read rather than fail — and the `!courseHref(`
  // negatives would pass triumphantly against ''.
  for (const [, file] of SOURCE_SITES) {
    const { code } = readSource(file);
    assert.ok(code.length > 5000, `${file} read as ${code.length} chars`);
  }
  // …and the shapes really are specific: a file that merely imported the helper
  // without calling it would fail the second assertion in each test above.
  assert.ok(!/const href = courseLinkHref\(course\)/.test("import { courseLinkHref } from 'x';"));
});
