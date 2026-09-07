import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * /sitemap.xml AND HIDDEN COURSES.
 *
 * ══ THIS FILE'S PREMISE CHANGED, AND THAT WAS ALWAYS THE PLAN ═══════════════
 * It used to open by saying the sitemap carried NO course URLs at all — twelve
 * static routes, Article and CustomPage, and nothing else — so "a hidden course
 * is absent from the sitemap" was true for a reason that had nothing to do with
 * any filter. It then said what should happen next, in its own words:
 *
 *     the day someone adds course entries (a reasonable thing to want; 78
 *     course pages are currently absent from the sitemap), they must come
 *     through the filtered read.
 *
 * That day is this round. Courses are in the sitemap now, so the old assertions
 * — "no course source is read", "no course URL appears" — describe a state that
 * no longer exists and were rewritten rather than deleted. The PROPERTY they
 * protect is unchanged and is the whole reason the file exists: a hidden course
 * must not be published to Google.
 *
 * ── AND ONE OF THEM HAD ALREADY GONE VACUOUS ────────────────────────────────
 * Worth recording, because it is the failure mode this suite keeps finding. The
 * old `no course URL appears` test grepped src/app/sitemap.js for
 * `-training-course`. After this round's change that file emits ~77 course URLs
 * and STILL contains no such literal — the URL is built in
 * lib/courses/courseCanonicalPath, one module away. The test would have stayed
 * green while being wrong about the file it reads. Only its sibling went red.
 * A guard whose subject moves out of the file it scans does not announce
 * itself; it just stops meaning anything.
 *
 * ── WHERE THE GUARANTEE LIVES NOW ───────────────────────────────────────────
 * Two places, and both are asserted here because either alone is bypassable:
 *
 *   1. THE READ IS FILTERED. `listPublicCourses()` with no arguments defaults
 *      to `includeHidden: false` and drops the hidden set through the one
 *      loader every other listing uses. Passing `includeHidden: true` here
 *      would silently publish every hidden course.
 *   2. THE BUILDER RE-CHECKS. courseSitemapEntries skips any course whose
 *      extension says `isPublished === false`, which is the last point before
 *      a URL is published. Its behaviour is tested for real in
 *      test/pure/courseSitemapEntries; what is asserted here is that the
 *      sitemap actually routes through it rather than mapping the list itself.
 */

const SITEMAP = 'src/app/sitemap.js';

/** The two URL shapes a course page can have. */
const COURSE_URL = /-training-course/;
/** Every way this repo reads a list of courses. */
const COURSE_SOURCES = ['listPublicCourses', 'getCourseByCode', 'getCourseByCodeInsensitive'];

test('the sitemap reads courses through the FILTERED list, never includeHidden', () => {
  const { code } = readSource(SITEMAP);

  // It reads exactly one course source, and it is the filtered one.
  assert.equal(countCallSites(code, 'listPublicCourses'), 1,
    'the sitemap must read the course list exactly once');
  for (const name of ['getCourseByCode', 'getCourseByCodeInsensitive']) {
    assert.equal(countCallSites(code, name), 0, `${name} is not a sitemap concern`);
  }

  // THE ONE ARGUMENT THAT WOULD UNDO IT. `includeHidden: true` is a legitimate
  // thing to write — thirteen callers in this repo need it — and it is exactly
  // wrong here.
  assert.ok(!/includeHidden/.test(code),
    'the sitemap passes includeHidden; the hidden set is what must NOT be published');
  assert.match(code, /listPublicCourses\(\)/,
    'the call must take no arguments, so the default filtered read applies');
});

test('the sitemap builds its course entries through the shared builder', () => {
  // Not a `.map()` of its own. The builder is where the second hidden check
  // and the one-entry-per-course rule live, and it is the half that can be
  // tested for real — `sitemap()` itself opens Mongo and calls the upstream
  // API, so it is unreachable from every tier in this suite.
  const { code, withImports } = readSource(SITEMAP);
  assert.match(withImports, /import \{ courseSitemapEntries \}/, 'the builder is not imported');
  assert.equal(countCallSites(code, 'courseSitemapEntries'), 1);
  // …and the raw list never reaches the output without passing through it.
  assert.ok(!/courses\.map\(/.test(code), 'the sitemap maps the course list itself');
});

test('the sitemap does NOT spell a course URL itself', () => {
  const { raw } = readSource(SITEMAP);
  // `raw`, not `code`: a hard-coded course URL could sit inside STATIC_ROUTES,
  // which is data rather than a call, and scrubbing would not remove it anyway.
  //
  // THE CLAIM HAS CHANGED WITH THE FILE. It used to mean "no course is in the
  // sitemap"; it now means "the URL form is not written down here" — the
  // sitemap gets it from courseCanonicalPath, which is what keeps it identical
  // to the page's canonical tag. A literal reappearing here is a second copy of
  // the rule, which is the defect this whole round removed.
  assert.ok(!COURSE_URL.test(raw),
    'a course URL form is spelled out in the sitemap; it must come from courseCanonicalPath');
});

test('the sitemap DOES still enumerate the collections it is meant to', () => {
  // Not decoration. Without it, the assertions above would also pass against a
  // sitemap.js emptied down to a stub, and "no course URL is spelled here"
  // would be true of a file that produces no URLs at all.
  const { code } = readSource(SITEMAP);
  assert.match(code, /Article\.find\(\{\s*active:\s*true\s*\}\)/);
  assert.match(code, /CustomPage\.find\(/);
  assert.match(code, /status:\s*'published'/);
  assert.match(code, /noIndex:\s*\{\s*\$ne:\s*true\s*\}/, 'and it already excludes de-indexed pages');
  assert.match(code, /CourseExtension\.find\(/, 'the extensions the aliases come from');
  // All four populations reach the returned array.
  assert.match(code, /\.\.\.staticEntries/);
  assert.match(code, /\.\.\.articleEntries/);
  assert.match(code, /\.\.\.customPageEntries/);
  assert.match(code, /\.\.\.courseEntries/);
});

test('the course read is best-effort, like its two neighbours', () => {
  // The upstream course API is a network hop. A sitemap without courses is far
  // better than a 500 at /sitemap.xml, and the two existing blocks already
  // swallow for exactly this reason — a new block that threw would take the
  // articles and custom pages down with it.
  const { code } = readSource(SITEMAP);
  const start = code.indexOf('let courseEntries');
  assert.notEqual(start, -1, 'the course block moved — re-anchor this guard');
  const block = code.slice(start, code.indexOf('return [', start));
  assert.match(block, /try \{/, 'the course read is not guarded');
  assert.match(block, /\} catch/, 'the course read does not swallow');
});

// ── CONTROLS ────────────────────────────────────────────────────────────────
test('CONTROL: the includeHidden matcher fires on the file that would publish them', () => {
  /**
   * The wrong version, written out rather than imagined: courses read with the
   * hidden set included, and mapped inline instead of through the builder. Every
   * assertion above must reject it.
   */
  const WRONG = `
    import { listPublicCourses } from '@/lib/api/public-courses';
    export default async function sitemap() {
      const { items: courses } = await listPublicCourses({ includeHidden: true });
      return courses.map((c) => ({
        url: \`\${base}/\${c.course_id.toLowerCase()}-training-course\`,
      }));
    }
  `;
  assert.ok(/includeHidden/.test(WRONG), 'the includeHidden matcher catches it');
  assert.ok(!/listPublicCourses\(\)/.test(WRONG), 'the no-argument matcher catches it');
  assert.ok(/courses\.map\(/.test(WRONG), 'the inline-map matcher catches it');
  assert.ok(COURSE_URL.test(WRONG), 'the URL-shape matcher catches it');
});

test('CONTROL: the URL matcher does NOT fire on the sitemap routes that are there', () => {
  // The other half — a matcher broad enough to hit /training-course (which IS a
  // static route, and belongs in the sitemap) would make the test above fail
  // for the wrong reason and get "fixed" by weakening it.
  assert.ok(!COURSE_URL.test("'/training-course'"), '/training-course is the catalog, not a course');
  assert.ok(COURSE_URL.test('/power-bi-training-course'), 'a real course URL still matches');
});

test('CONTROL: countCallSites really counts, on the real file', () => {
  // Three assertions above compare a count to 0 or 1. A matcher that returned 0
  // for everything would make the "is not a sitemap concern" checks pass
  // vacuously and the ==1 checks fail loudly — so the positive case is pinned
  // against the file itself rather than a fixture.
  const { code } = readSource(SITEMAP);
  assert.ok(code.length > 1500, `${SITEMAP} read as ${code.length} chars`);
  assert.equal(countCallSites(code, 'listPublicCourses'), 1);
  assert.equal(countCallSites(code, 'thisFunctionDoesNotExist'), 0);
  assert.deepEqual(COURSE_SOURCES, ['listPublicCourses', 'getCourseByCode', 'getCourseByCodeInsensitive'],
    'the source list changed — re-read which of them the sitemap may call');
});
