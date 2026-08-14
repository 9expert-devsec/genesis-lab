import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * /sitemap.xml AND HIDDEN COURSES — and the measurement that has to be said out
 * loud, because it changes what these tests can honestly claim.
 *
 * THE SITEMAP CARRIES NO COURSE URLS AT ALL. It enumerates a hard-coded list of
 * twelve static routes, then `Article` and `CustomPage` from Mongo. There is no
 * route walker and no course read of any kind, so a hidden course cannot be in
 * it — and nothing in src/app/sitemap.js needed changing this round.
 *
 * That makes "a hidden course is absent from the sitemap" true for a reason
 * that has nothing to do with the filter, and a test asserting it would be
 * exactly the shape this suite warns about: green, and incapable of going red.
 *
 * So these guard the property that IS at risk — the day someone adds course
 * entries (a reasonable thing to want; 78 course pages are currently absent
 * from the sitemap), they must come through the filtered read. The control at
 * the bottom fabricates that future file and proves each assertion fires on it.
 */

const SITEMAP = 'src/app/sitemap.js';

/** The two URL shapes a course page can have. */
const COURSE_URL = /-training-course/;
/** Every way this repo reads a list of courses. */
const COURSE_SOURCES = ['listPublicCourses', 'getCourseByCode', 'getCourseByCodeInsensitive'];

test('the sitemap enumerates no course URL today', () => {
  const { raw } = readSource(SITEMAP);
  // `raw`, not `code`: a hard-coded course URL could sit inside STATIC_ROUTES,
  // which is data rather than a call, and scrubbing would not remove it anyway.
  // Reading raw also means a course URL mentioned only in a COMMENT trips this,
  // which is the conservative direction for a guard about what gets indexed.
  assert.ok(!COURSE_URL.test(raw), 'no /<code>-training-course entry');
});

test('the sitemap reads no course source, so no hidden course can reach it', () => {
  const { code } = readSource(SITEMAP);
  for (const name of COURSE_SOURCES) {
    assert.equal(
      countCallSites(code, name),
      0,
      `${name} is not called from the sitemap`
    );
  }
  assert.ok(!code.includes('CourseExtension'), 'and it does not read the extension collection either');
});

test('the sitemap DOES still enumerate the two collections it is meant to', () => {
  // Not decoration. Without it, the two assertions above would also pass
  // against a sitemap.js that had been emptied or deleted down to a stub, and
  // "no course URLs" would be true of a file that produces no URLs at all.
  const { code } = readSource(SITEMAP);
  assert.match(code, /Article\.find\(\{\s*active:\s*true\s*\}\)/);
  assert.match(code, /CustomPage\.find\(/);
  assert.match(code, /status:\s*'published'/);
  assert.match(code, /noIndex:\s*\{\s*\$ne:\s*true\s*\}/, 'and it already excludes de-indexed pages');
});

test('CONTROL: both assertions fire on a sitemap that added courses unfiltered', () => {
  /**
   * The future file, written out here rather than imagined. If someone adds
   * course entries the way every other surface used to read them, this is what
   * the file looks like — and both guards above must reject it. If this control
   * ever stops failing on this text, the guards have stopped guarding.
   */
  const FUTURE = `
    import { listPublicCourses } from '@/lib/api/public-courses';
    export default async function sitemap() {
      const { items } = await listPublicCourses({ includeHidden: true });
      return items.map((c) => ({
        url: \`\${base}/\${c.course_id.toLowerCase()}-training-course\`,
      }));
    }
  `;
  assert.ok(COURSE_URL.test(FUTURE), 'the URL-shape matcher catches it');
  assert.ok(countCallSites(FUTURE, 'listPublicCourses') > 0, 'the source matcher catches it');
});

test('CONTROL: the URL matcher does NOT fire on the sitemap routes that are there', () => {
  // The other half — a matcher broad enough to hit /training-course (which IS a
  // static route, and belongs in the sitemap) would make the first test fail
  // for the wrong reason and get "fixed" by weakening it.
  assert.ok(!COURSE_URL.test("'/training-course'"), '/training-course is the catalog, not a course');
  assert.ok(COURSE_URL.test('/power-bi-training-course'), 'a real course URL still matches');
});
