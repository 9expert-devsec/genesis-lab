import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseSitemapEntries, extensionsByCourseId } from '@/lib/courses/courseSitemapEntries';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/**
 * Which course URLs the sitemap publishes, and which it refuses to.
 *
 * ══ WHY THE PURE HALF EXISTS AT ALL ═════════════════════════════════════════
 * `sitemap()` cannot be invoked from any tier in this suite — it opens Mongo
 * and calls the upstream course API. A rule that decides what Google indexes
 * does not get to be untestable, so everything that DECIDES lives in a pure
 * function and the route is I/O around it. Same split, same reasoning, as
 * src/lib/redirects/redirectRules.js.
 *
 * ── THE COST OF BEING WRONG IS ASYMMETRIC ───────────────────────────────────
 * Omitting a real course costs some crawl latency. Publishing a URL that
 * answers 404 spends crawl budget on nothing and, repeated across dozens of
 * rows, is a quality signal against the whole domain. So the exclusions are
 * tested harder than the inclusions.
 */

const BASE = 'https://genesis-lab.9expert.app';
const NOW = new Date('2026-09-04T00:00:00.000Z');

const course = (course_id) => ({ course_id, course_name: `Course ${course_id}` });
const ext = (courseId, extra = {}) => ({ courseId, urlAlias: '', isPublished: true, ...extra });

const urls = (entries) => entries.map((e) => e.url);

// ── the happy path ──────────────────────────────────────────────────────────
test('one entry per course, in the canonical form', () => {
  const courses = [course('VIBE-CODE-L1'), course('POWER-BI')];
  const extensions = [ext('VIBE-CODE-L1', { urlAlias: '/build-business-apps-training-course' })];
  const entries = courseSitemapEntries({ courses, extensions, base: BASE, now: NOW });

  assert.equal(entries.length, 2);
  assert.deepEqual(urls(entries), [
    `${BASE}/build-business-apps-training-course`,   // alias
    `${BASE}/power-bi-training-course`,              // derived, no extension
  ]);
});

test('the URL is the SAME one the canonical tag declares', () => {
  // Compared against the helper rather than a literal, so the sitemap and the
  // page cannot drift into publishing different URLs for one course.
  const c = course('VIBE-CODE-L1');
  const e = ext('VIBE-CODE-L1', { urlAlias: '/pretty-course' });
  const [entry] = courseSitemapEntries({ courses: [c], extensions: [e], base: BASE, now: NOW });
  assert.equal(entry.url, `${BASE}${courseCanonicalPath(c, e)}`);
});

test('NEVER two entries for one course — the alias OR the derived path, not both', () => {
  // THE ASSERTION THIS FILE EXISTS FOR. Both URLs serve 200, so emitting both
  // would be this file telling Google to index exactly the duplicate the
  // canonical tag is trying to stop declaring.
  const c = course('VIBE-CODE-L1');
  const e = ext('VIBE-CODE-L1', { urlAlias: '/pretty-course' });
  const entries = courseSitemapEntries({ courses: [c], extensions: [e], base: BASE, now: NOW });
  assert.equal(entries.length, 1, `emitted ${JSON.stringify(urls(entries))}`);
  assert.ok(!urls(entries).includes(`${BASE}/vibe-code-l1-training-course`),
    'the derived path was published alongside the alias');
});

test('two courses resolving to one URL collapse to one entry', () => {
  // Cannot happen today — the unique+sparse index on urlAlias is live in the
  // database — but a sitemap with a repeated <loc> is not the place to discover
  // that it has changed. De-duplication is on the resolved URL, not the id.
  const courses = [course('A'), course('B')];
  const extensions = [ext('A', { urlAlias: '/same' }), ext('B', { urlAlias: '/same' })];
  const entries = courseSitemapEntries({ courses, extensions, base: BASE, now: NOW });
  assert.equal(entries.length, 1);
});

// ── exclusion 1: hidden ─────────────────────────────────────────────────────
test('a course whose extension is isPublished:false is EXCLUDED', () => {
  // Both its URLs 404 — resolveCourse returns null on the alias branch and on
  // the derived branch. The caller filters these out too; this is the last
  // check before the URL is published.
  const courses = [course('HIDDEN-ONE'), course('VISIBLE-ONE')];
  const extensions = [
    ext('HIDDEN-ONE', { urlAlias: '/hidden-course', isPublished: false }),
    ext('VISIBLE-ONE', { urlAlias: '/visible-course' }),
  ];
  const entries = courseSitemapEntries({ courses, extensions, base: BASE, now: NOW });
  assert.deepEqual(urls(entries), [`${BASE}/visible-course`]);
});

test('only an explicit false hides — a missing flag does not', () => {
  // `isPublished` absent reads as VISIBLE everywhere else in this codebase
  // (`!== false`), and a course with no extension row at all has never been
  // hidden by anybody. `!isPublished` here would silently drop both.
  const courses = [course('NO-FLAG'), course('NO-EXT')];
  const extensions = [{ courseId: 'NO-FLAG', urlAlias: '/no-flag-course' }];
  const entries = courseSitemapEntries({ courses, extensions, base: BASE, now: NOW });
  assert.deepEqual(urls(entries), [`${BASE}/no-flag-course`, `${BASE}/no-ext-training-course`]);
});

// ── exclusion 2: orphans ────────────────────────────────────────────────────
test('an ORPHAN extension — no upstream course — never reaches the sitemap', () => {
  // Measured in round U1: EXCEL-HR-02, ZZTEST-CANVA-01 and ZZTEST-AUTO-03 all
  // 404 at BOTH URLs because their courseId matches no upstream course.
  // Excluded structurally: this iterates COURSES and looks extensions up, so an
  // extension with no course is never visited. An implementation that iterated
  // extensions would have had to remember.
  const courses = [course('REAL-ONE')];
  const extensions = [
    ext('REAL-ONE', { urlAlias: '/real-course' }),
    ext('EXCEL-HR-02', { urlAlias: '/excel-dashboard-for-hr-professionals-training-course' }),
    ext('ZZTEST-CANVA-01', { urlAlias: '/canva-with-ai-training-course' }),
    ext('ZZTEST-AUTO-03', { urlAlias: '/workflow-automation-course' }),
  ];
  const entries = courseSitemapEntries({ courses, extensions, base: BASE, now: NOW });
  assert.deepEqual(urls(entries), [`${BASE}/real-course`]);
  for (const dead of ['excel-dashboard', 'canva-with-ai', 'workflow-automation']) {
    assert.ok(!urls(entries).some((u) => u.includes(dead)), `${dead} was published`);
  }
});

// ── the casing seam ─────────────────────────────────────────────────────────
test('the extension is found even when its stored casing differs from upstream', () => {
  // Upstream ids have no canonical casing (five of seventy-seven are mixed) and
  // `extension.courseId` is a copy frozen when an admin last saved that row.
  // An exact-case lookup would miss and publish the DERIVED path for a course
  // that has a perfectly good alias — a URL that works, but not the one the
  // page declares canonical.
  const entries = courseSitemapEntries({
    courses: [course('SQL-PG-Query')],
    extensions: [ext('SQL-PG-QUERY', { urlAlias: '/query-data-with-tsql-training-course' })],
    base: BASE,
    now: NOW,
  });
  assert.deepEqual(urls(entries), [`${BASE}/query-data-with-tsql-training-course`]);
});

// ── entry shape, matching the file's neighbours ─────────────────────────────
test('the entry shape matches the article and custom-page entries', () => {
  const e = ext('WITH-DATE', { urlAlias: '/dated-course', updatedAt: new Date('2026-01-02') });
  const [entry] = courseSitemapEntries({
    courses: [course('WITH-DATE')], extensions: [e], base: BASE, now: NOW,
  });
  assert.deepEqual(Object.keys(entry).sort(), ['changeFrequency', 'lastModified', 'priority', 'url']);
  assert.equal(entry.lastModified.toISOString(), new Date('2026-01-02').toISOString());
  assert.equal(entry.changeFrequency, 'weekly');
  assert.equal(entry.priority, 0.7);
});

test('lastModified falls back when the extension carries no timestamp', () => {
  const [entry] = courseSitemapEntries({
    courses: [course('NO-DATE')], extensions: [], base: BASE, now: NOW,
  });
  assert.equal(entry.lastModified, NOW);
});

test('a trailing slash on the base cannot double the separator', () => {
  const [entry] = courseSitemapEntries({
    courses: [course('POWER-BI')], extensions: [], base: `${BASE}/`, now: NOW,
  });
  assert.equal(entry.url, `${BASE}/power-bi-training-course`);
});

// ── degenerate input ────────────────────────────────────────────────────────
test('nothing in, nothing out — and no throw', () => {
  // The route swallows its own errors, so a throw here would be invisible and
  // would silently drop the article and custom-page entries with it.
  for (const input of [
    { courses: [], extensions: [], base: BASE },
    { courses: null, extensions: null, base: BASE },
    { courses: undefined, extensions: undefined, base: undefined },
    { courses: [{}, { course_id: '' }, { course_id: '   ' }], extensions: [], base: BASE },
  ]) {
    let out;
    assert.doesNotThrow(() => { out = courseSitemapEntries(input); }, JSON.stringify(input));
    assert.deepEqual(out, []);
  }
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the exclusions really exclude — the same rows pass without them', () => {
  // Every exclusion test asserts a SHORTER list. If the function returned []
  // for everything, all of them would pass and the sitemap would publish no
  // courses at all. Each excluded row is shown to be emitted when the reason
  // for excluding it is removed.
  const hidden = ext('X', { urlAlias: '/x-course', isPublished: false });
  assert.equal(courseSitemapEntries({ courses: [course('X')], extensions: [hidden], base: BASE }).length, 0);
  assert.equal(
    courseSitemapEntries({ courses: [course('X')], extensions: [{ ...hidden, isPublished: true }], base: BASE }).length,
    1, 'the row is not emitted even when it is visible — the exclusion test proves nothing',
  );
  // and the orphan becomes emittable the moment its course exists
  const orphan = ext('GHOST', { urlAlias: '/ghost-course' });
  assert.equal(courseSitemapEntries({ courses: [], extensions: [orphan], base: BASE }).length, 0);
  assert.equal(courseSitemapEntries({ courses: [course('GHOST')], extensions: [orphan], base: BASE }).length, 1);
});

test('CONTROL: extensionsByCourseId really keys on the upper-cased id', () => {
  const map = extensionsByCourseId([{ courseId: 'Mixed-Case' }, { courseId: '' }, {}, null]);
  assert.equal(map.size, 1);
  assert.ok(map.has('MIXED-CASE'));
  assert.ok(!map.has('Mixed-Case'), 'the key was not normalised');
});
