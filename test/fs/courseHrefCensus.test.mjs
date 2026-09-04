import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources } from '../sourceScan.mjs';

/**
 * THE SET OF FILES THAT BUILD A COURSE URL IS THE KNOWN SET.
 *
 * ══ THE GUARD THAT SURVIVES THE ROUND ═══════════════════════════════════════
 * Every other test this round asserts that a KNOWN call site emits the alias.
 * None of them can see an ELEVENTH one added next month — a new card, a new
 * carousel, a new email template — hand-building `/${code}-training-course`
 * because that is what the surrounding code used to do.
 *
 * That failure is silent by construction: the hand-built path RESOLVES. Both
 * URL forms serve 200, so the new link works, nothing 404s, and the only
 * symptom is that one surface disagrees with the canonical tag it links to.
 * This repo has already shipped a feature that reached one call site out of
 * three while two guards passed, because both checked the component and neither
 * counted call sites.
 *
 * So this counts. A file that derives a course path and is not on the list
 * below fails until someone puts it there — which is the moment to ask whether
 * it should be calling `courseLinkHref` instead.
 *
 * ── WHAT COUNTS AS DERIVING ONE ─────────────────────────────────────────────
 * The `-training-course` suffix in a TEMPLATE or a concatenation. Not the
 * suffix in a comment (comments are stripped), not the bare string as a
 * constant used for parsing — `resolveCourse` and `hiddenCourses` both slice it
 * off a URL rather than building one, and both are listed with that noted.
 */

/**
 * The suffix AT THE END OF A TOKEN.
 *
 * The negative lookahead is load-bearing: two files carry PDF filenames that
 * merely CONTAIN the
 * phrase — '9expert-training-course-catalog-2016.pdf' in legacyBlobFiles and
 * webrootDocuments. A bare /-training-course/ flagged both, and an exclusion
 * list for them would have been the wrong fix: they are not course URLs at all,
 * and the matcher should say so rather than the census carrying two apologies.
 */
const SUFFIX_IN_CODE = /-training-course(?![-\w])/;

/**
 * Every file allowed to contain the suffix, and WHY.
 *
 * The reason matters more than the name: a file added here without one is how
 * a list like this stops meaning anything.
 */
const ALLOWED = new Map([
  // ── the one builder, and the rule it delegates to ────────────────────────
  ['src/lib/courses/courseCanonicalPath.js',
    'THE definition of a course path. Everything else routes through it.'],
  ['src/lib/utils.js',
    'courseHref, the legacy code-only builder. Zero src callers after round U3 '
    + '— kept because it is an exported utility with its own tests, and its '
    + 'return is now checked against courseLinkHref rather than used.'],

  // ── parsers: they SLICE the suffix off a URL, they do not build one ──────
  ['src/lib/resolveCourse.js',
    'PARSES: strips the suffix to recover an upstream course_id.'],
  ['src/lib/courses/hiddenCourses.js',
    'PARSES: findHiddenCourseForSlug decides the URL shape from the string.'],

  // ── cache/revalidation paths, which need the URL a course is CACHED at ───
  ['src/lib/webhooks/courseRevalidatePlan.js',
    'coursePathFromId — the revalidation planner. Deliberately NOT the canonical '
    + 'rule: it rewrites _ to - and courseCanonicalPath must not. See the note there.'],
  ['src/lib/courses/renameCacheFanout.js',
    'derivedCoursePath — which paths to purge when a code is renamed.'],
  ['src/lib/courses/renameCoursePreview.js',
    'shows an admin the before/after URLs of a rename.'],
  ['src/lib/actions/course-extensions.js', 'revalidatePath after a save.'],
  ['src/lib/actions/course-promos.js', 'revalidatePath after a promo change.'],

  // ── admin surfaces ───────────────────────────────────────────────────────
  ['src/app/admin/courses/_components/CourseSeoRail.jsx',
    'the alias input placeholder text.'],

  // ── availability checks, which compare against derived paths ─────────────
  ['src/app/(public)/[...slug]/page.jsx',
    'PARSES: segment.endsWith(suffix) picks the course branch out of the catch-all.'],
]);

const SOURCES = walkSources('src');

test('the walk found the tree — it is not censusing an empty list', () => {
  assert.ok(SOURCES.length > 400, `walked only ${SOURCES.length} files`);
  assert.ok(SOURCES.some((s) => s.rel === 'src/lib/courses/courseLinkHref.js'),
    'the link helper is not in the walk');
});

test('no file outside the known set derives a course URL', () => {
  const offenders = SOURCES
    .filter((s) => SUFFIX_IN_CODE.test(s.code))
    .map((s) => s.rel)
    .filter((rel) => !ALLOWED.has(rel));

  assert.deepEqual(
    offenders, [],
    'a file builds a course URL and is not on the census in '
    + 'test/fs/courseHrefCensus. Both URL forms serve 200, so a hand-built path '
    + 'WORKS — the only symptom is that this surface disagrees with the canonical '
    + 'tag of the page it links to. If it is a link, call courseLinkHref(course). '
    + 'If it genuinely is not, add it to the list WITH a reason.',
  );
});

test('every entry on the census is still real — no stale allowances', () => {
  // The other direction. An allowance that outlives its file is a hole nobody
  // can see: the next file at that path inherits permission it never earned.
  const byRel = new Map(SOURCES.map((s) => [s.rel, s]));
  const stale = [...ALLOWED.keys()].filter((rel) => {
    const src = byRel.get(rel);
    return !src || !SUFFIX_IN_CODE.test(src.code);
  });
  assert.deepEqual(stale, [],
    'these files are on the census but no longer derive a course URL — remove them');
});

test('every allowance carries a reason', () => {
  for (const [rel, why] of ALLOWED) {
    assert.ok(typeof why === 'string' && why.length > 25,
      `${rel} is allowed with no real reason given`);
  }
});

test('courseHref has NO callers in src — the census records that', () => {
  // Round U3 removed the last one. Stated as an assertion rather than left in
  // the report, so re-introducing it is a red rather than a quiet regression.
  const callers = SOURCES
    .filter((s) => s.rel !== 'src/lib/utils.js')
    .filter((s) => /courseHref\s*\(/.test(s.code.replace(/courseLinkHref\s*\(/g, '')))
    .map((s) => s.rel);
  assert.deepEqual(callers, [],
    'courseHref is being called again. It takes a STRING and appends '
    + '-training-course, so it cannot see an alias — use courseLinkHref(course).');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the census fires on a file that is not on the list', () => {
  // Without this a broken matcher reports [] forever. The fixture is local, so
  // the control stays green while the real assertion would go red.
  const fabricated = [
    { rel: 'src/components/NewCard.jsx', code: 'const href = `/${id}-training-course`;' },
    { rel: 'src/lib/utils.js', code: 'const s = "-training-course";' },
  ];
  const offenders = fabricated
    .filter((s) => SUFFIX_IN_CODE.test(s.code))
    .map((s) => s.rel)
    .filter((rel) => !ALLOWED.has(rel));
  assert.deepEqual(offenders, ['src/components/NewCard.jsx']);
});

test('CONTROL: the courseHref matcher does not fire on courseLinkHref', () => {
  // `courseLinkHref(` contains `courseHref(`? No — but `xcourseHref(` would
  // match a naive regex, and stripping courseLinkHref first is what makes the
  // check above meaningful rather than always-red.
  const strip = (s) => s.replace(/courseLinkHref\s*\(/g, '');
  assert.ok(!/courseHref\s*\(/.test(strip('const h = courseLinkHref(course);')));
  assert.ok(/courseHref\s*\(/.test(strip('const h = courseHref(slug);')));
});
