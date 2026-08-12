import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * WHO OPTS IN TO SEEING HIDDEN COURSES, AND WHO MUST NOT.
 *
 * The behaviour of `listPublicCourses` itself is tested properly in
 * test/pure/listPublicCoursesHidden. What CANNOT be reached from there is which
 * of its twenty-odd call sites asked for the unfiltered list — every one of them
 * is an async Server Component that awaits network I/O before rendering, and
 * getting one wrong is silent in both directions:
 *
 *   · a PUBLIC caller that opts in keeps showing a hidden course, which is the
 *     defect this round removes, on one surface out of twelve;
 *   · an ADMIN caller that does NOT opt in loses data. The previous_course
 *     picker resolves a STORED prerequisite through its `allCourses` prop — 43
 *     of 78 courses hold one — so a filtered list renders an empty picker and
 *     the next save writes the prerequisite away. Nothing goes red; the field
 *     is simply blank afterwards.
 *
 * Every assertion reads `code` (imports stripped), so an import line alone
 * cannot satisfy one — see sourceScan's note on why that choice is a silent
 * failure in both directions.
 */

const OPT_IN = /listPublicCourses\(\s*\{[^}]*includeHidden:\s*true/;

/** Files whose every listPublicCourses call must ask for the unfiltered list. */
const ADMIN_CALLERS = [
  ['src/app/admin/courses/page.jsx', 'the management table — and the only place a course can be un-hidden'],
  ['src/app/admin/courses/new/page.jsx', "CourseForm's allCourses → the previous_course picker"],
  ['src/app/admin/featured-courses/page.jsx', 'featured-slot picker'],
  ['src/app/admin/schedules/page.jsx', 'schedule picker + the course-name column'],
  ['src/app/admin/articles/new/page.jsx', 'related-course picker'],
  ['src/app/admin/articles/[id]/edit/page.jsx', 'related-course picker'],
  ['src/app/admin/career-paths/new/page.jsx', 'curriculum course picker'],
  ['src/app/admin/career-paths/[id]/edit/page.jsx', 'curriculum course picker'],
  ['src/lib/api/courseNameMap.js', 'code → name for admin screens; a miss must never render blank'],
  ['src/lib/actions/course-extensions.js', 'checkAliasAvailable — a hidden course still owns its legacy path'],
  ['src/lib/navmenu/syncNavMenuData.js', 'snapshot writer — the snapshot stores the superset'],
  ['src/lib/landing/syncLandingData.js', 'snapshot writer — the snapshot stores the superset'],
];

for (const [rel, why] of ADMIN_CALLERS) {
  test(`${rel} opts in to hidden courses (${why})`, () => {
    const { code } = readSource(rel);
    const calls = countCallSites(code, 'listPublicCourses');
    assert.ok(calls > 0, 'the file still calls listPublicCourses at all');
    const optIns = (code.match(new RegExp(OPT_IN.source, 'g')) ?? []).length;
    assert.equal(
      optIns,
      calls,
      `${calls} call(s), ${optIns} carrying includeHidden: true — every one must`
    );
  });
}

/** Files that must keep the filtered default. */
const PUBLIC_CALLERS = [
  ['src/app/(public)/training-course/page.jsx', 'the full catalog'],
  ['src/app/(public)/schedule/page.jsx', 'the schedule table is course-driven'],
  ['src/app/(public)/[...slug]/page.jsx', 'program, skill and -all-courses catalogs'],
  ['src/app/(public)/articles/[slug]/page.jsx', 'the related-course rail'],
  ['src/app/(public)/registration/in-house/InhousePageContent.jsx', 'the in-house course picker'],
  ['src/lib/search/searchCorpus.js', '/search'],
  ['src/lib/pageBuilder/resolveSectionData.js', 'course_list sections'],
  ['src/lib/actions/nav-course-preview.js', 'mega menu columns 3 and 4'],
];

for (const [rel, why] of PUBLIC_CALLERS) {
  test(`${rel} keeps the filtered default (${why})`, () => {
    const { code } = readSource(rel);
    assert.ok(countCallSites(code, 'listPublicCourses') > 0, 'it still reads the list');
    assert.ok(
      !OPT_IN.test(code),
      'a public surface must never ask for includeHidden: true'
    );
  });
}

test('CONTROL: the opt-in matcher fires on the shape it is looking for, and only that', () => {
  // Without this, every "keeps the filtered default" assertion above passes for
  // a regex that matches nothing at all — the failure mode the deleted-admin-
  // template guard shipped with.
  assert.ok(OPT_IN.test('await listPublicCourses({ includeHidden: true })'));
  assert.ok(OPT_IN.test('listPublicCourses({ program: pid, includeHidden: true })'));
  assert.ok(!OPT_IN.test('await listPublicCourses()'));
  assert.ok(!OPT_IN.test('await listPublicCourses({ skill })'));
  assert.ok(!OPT_IN.test('listPublicCourses({ includeHidden: false })'));
});

// ── the two guards that would fail SILENTLY, both by staying off the seam ───

test('the create flow duplicate-code guard reads upstream DIRECTLY, uncached', () => {
  /**
   * `findCourseCodeInsensitive` must never come through `listPublicCourses`.
   * Two independent reasons, and they point the same way:
   *
   *   · it must see HIDDEN courses. saveCourseExtension upserts a whole
   *     document keyed by the code, so a code colliding with a hidden course
   *     overwrites that course's SEO, gallery and omisePaymentEnabled — the
   *     silent-destruction case the guard exists for;
   *   · it must see UNCACHED data. A course created upstream inside the cache
   *     window is invisible to the tagged read, and a stale "no duplicate" is
   *     the same overwrite by a different route.
   *
   * Today it satisfies both by owning its own `aiFetch(..., revalidate: 0)`, so
   * the filter cannot reach it. This pins that, rather than trusting it.
   */
  const { code } = readSource('src/lib/actions/courses.js');
  const fn = /export async function findCourseCodeInsensitive[\s\S]*?\n\}/.exec(code);
  assert.ok(fn, 'the guard is still in this file');
  assert.ok(
    !fn[0].includes('listPublicCourses'),
    'it must not route through the filtered adapter'
  );
  assert.match(fn[0], /aiFetch\('\/public-course',\s*\{\s*revalidate:\s*0\s*\}\)/);
});

test('CONTROL: that extraction really does capture the function body', () => {
  // A regex that captured an empty string would make the two assertions above
  // pass while proving nothing.
  const { code } = readSource('src/lib/actions/courses.js');
  const fn = /export async function findCourseCodeInsensitive[\s\S]*?\n\}/.exec(code);
  assert.ok(fn[0].length > 200, 'the captured body is a real body');
  assert.match(fn[0], /toLowerCase\(\)/, 'and it is the case-insensitive match');
});

test("the course editor's allCourses prop also bypasses the filtered adapter", () => {
  // Same previous_course picker as the create page, reached from the edit page,
  // which finds its own course inside the same list. It already reads upstream
  // directly at revalidate: 0; the point here is that it stays that way.
  const { code } = readSource('src/app/admin/courses/[courseId]/edit/page.jsx');
  assert.ok(!code.includes('listPublicCourses'), 'no filtered read on this page');
  assert.match(code, /aiFetch\('\/public-course',\s*\{\s*revalidate:\s*0\s*\}\)/);
  assert.match(code, /allCourses\s*=\s*items/);
  assert.match(code, /allCourses=\{allCourses\}/, 'and it is handed to the form');
});

// ── the snapshot read paths ────────────────────────────────────────────────

test('getNavMenuData filters the snapshot ON READ, not the sync on write', () => {
  /**
   * THE DECISION THIS ROUND TURNED ON. syncNavMenuData runs as a Vercel Cron on
   * the Production deployment, which builds `main`; the mega menu under test is
   * served from `dev`. A filter in the writer does not reach UAT until main
   * ships — on the exact surface the defect was found on — and it makes
   * un-hiding asymmetric, because a write-time filter DELETES the row and only
   * the next 3-hour sync can put it back.
   */
  const { code } = readSource('src/lib/navmenu/getNavMenuData.js');
  assert.ok(countCallSites(code, 'loadHiddenCourseIds') === 1, 'one hidden read');
  assert.match(code, /programs:\s*filterNavMenuGroups\(/);
  assert.match(code, /skills:\s*filterNavMenuGroups\(/);
});

test('the nav hidden read rides in the SAME Promise.all as the reads already there', () => {
  // One indexed query is cheap; a query awaited SERIALLY after three others is
  // a round trip of latency on every public page render, because the header
  // renders on all of them.
  const { code } = readSource('src/lib/navmenu/getNavMenuData.js');
  const block = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(code);
  assert.ok(block, 'the parallel read block is still there');
  assert.match(block[1], /loadHiddenCourseIds\(\)/);
  assert.match(block[1], /NavMenuCache\.findOne/, 'alongside the snapshot read');
});

test('getLandingData filters the home snapshot on read', () => {
  const { code } = readSource('src/lib/landing/getLandingData.js');
  assert.ok(countCallSites(code, 'loadHiddenCourseIds') === 1);
  assert.match(code, /newCoursesWithSchedules:\s*dropHiddenCourses\(/);
  const block = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(code);
  assert.ok(block, 'the parallel read block is there');
  assert.match(block[1], /LandingCache\.findOne/);
});

test('CONTROL: these two files did not simply gain the import and nothing else', () => {
  // Read WITH imports so the difference between "imported" and "used" is
  // visible, then assert the used-count exceeds the import line.
  for (const rel of ['src/lib/navmenu/getNavMenuData.js', 'src/lib/landing/getLandingData.js']) {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /from '@\/lib\/courses\/hiddenCourses'/, `${rel} imports it`);
    assert.ok(countCallSites(code, 'loadHiddenCourseIds') > 0, `${rel} CALLS it`);
  }
});

test('a round whose course is hidden leaves the /search corpus entirely', () => {
  // /schedules is a separate upstream domain and still returns the round.
  // scheduleHaystack falls back to the row's own course_name when course_ref is
  // null, so an unfiltered round stays matchable and renders as a result whose
  // only link is the 404 the course now is.
  const { code } = readSource('src/lib/search/searchCorpus.js');
  assert.match(code, /\.filter\(\(s\) => s\.course_ref !== null\)/);
});
