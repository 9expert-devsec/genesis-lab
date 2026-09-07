/**
 * The course rows of the sitemap — the PURE half.
 *
 * ══ WHY THIS IS NOT JUST A `.map()` INSIDE sitemap.js ═══════════════════════
 * Everything that DECIDES anything about which course URLs we publish lives
 * here: which courses are excluded, which URL form is emitted, and that a
 * course appears at most once. `src/app/sitemap.js` fetches and calls this.
 *
 * The same shape as src/lib/redirects/redirectRules.js and for the same reason:
 * a sitemap is a set of instructions to a crawler, and `sitemap()` itself
 * cannot be invoked from any tier in this suite — it opens Mongo and calls the
 * upstream course API. A rule that decides what Google indexes does not get to
 * be untestable.
 *
 * ── TWO EXCLUSIONS, AND WHY EACH ONE IS ITS OWN ─────────────────────────────
 * Publishing a URL that answers 404 is worse than not publishing it: it spends
 * crawl budget and, repeated, is a quality signal against the whole site. Two
 * separate populations return 404 today and neither implies the other:
 *
 *   1. HIDDEN — the course's extension has `isPublished === false`.
 *      resolveCourse returns null on both the alias and the derived path, so
 *      both URLs 404. Handled by the CALLER passing an already-filtered list:
 *      `listPublicCourses()` drops these by default, through the one hidden-set
 *      loader. This function re-checks anyway (see below), because "the caller
 *      filtered" is an assumption and this is the last point before the URL is
 *      published.
 *
 *   2. ORPHANED — a CourseExtension whose `courseId` matches no upstream
 *      course. Measured: three of them, EXCEL-HR-02, ZZTEST-CANVA-01 and
 *      ZZTEST-AUTO-03, all 404 at both URLs. These are excluded STRUCTURALLY
 *      rather than by a check: this function iterates COURSES and looks up
 *      extensions, so an extension with no course is never reached. An
 *      implementation that iterated extensions would have had to remember.
 *
 * PURE: no I/O, no database, no env, no clock beyond what the caller passes.
 */

import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/**
 * Extensions keyed by upstream course_id, UPPER-CASED.
 *
 * Upper-cased on both sides because upstream ids have no canonical casing —
 * five of the seventy-seven are mixed — and `extension.courseId` is a copy
 * frozen when an admin last saved that row, which upstream is free to rename
 * afterwards. An exact-case map would silently miss those rows and publish the
 * derived path for a course that has a perfectly good alias. Same key
 * discipline as lib/actions/nav-course-preview's alias map.
 *
 * @param {Array<{courseId?: string}>} extensions
 * @returns {Map<string, object>}
 */
export function extensionsByCourseId(extensions) {
  const map = new Map();
  for (const ext of Array.isArray(extensions) ? extensions : []) {
    const key = String(ext?.courseId ?? '').trim().toUpperCase();
    if (key) map.set(key, ext);
  }
  return map;
}

/**
 * One sitemap entry per course, in its canonical form.
 *
 * @param {object} input
 * @param {Array<object>} input.courses      upstream course rows (already hidden-filtered)
 * @param {Array<object>} input.extensions   every CourseExtension row
 * @param {string} input.base                site origin, no trailing slash
 * @param {Date} [input.now]                 fallback lastModified
 * @returns {Array<{url: string, lastModified: Date, changeFrequency: string, priority: number}>}
 *
 * ── EXACTLY ONE ENTRY PER COURSE, WHICH IS THE WHOLE POINT ──────────────────
 * A course has two working URLs. Emitting both would be this site telling
 * Google to index the duplicate it is trying to stop declaring — the sitemap
 * saying the opposite of the canonical tag, which is a worse state than the
 * sitemap saying nothing, and is what it said nothing rather than doing.
 *
 * The de-duplication is on the RESOLVED URL, not on the course id, so two
 * courses that somehow resolved to one path collapse to one entry rather than
 * producing a sitemap with a repeated `<loc>`. That cannot happen today — the
 * unique+sparse index on urlAlias is live in the database — but a sitemap is
 * not the place to find out that it has changed.
 */
export function courseSitemapEntries({ courses, extensions, base, now = new Date() }) {
  const byId = extensionsByCourseId(extensions);
  const origin = String(base ?? '').replace(/\/+$/, '');
  const seen = new Set();
  const out = [];

  for (const course of Array.isArray(courses) ? courses : []) {
    const key = String(course?.course_id ?? '').trim().toUpperCase();
    if (!key) continue;

    const ext = byId.get(key) ?? null;

    // The hidden re-check. The caller is expected to have filtered already, and
    // does; this is the last point before a URL is published and the cost of
    // being wrong is a 404 in Google's index.
    if (ext?.isPublished === false) continue;

    const path = courseCanonicalPath(course, ext);
    if (!path) continue;

    const url = `${origin}${path}`;
    if (seen.has(url)) continue;
    seen.add(url);

    out.push({
      url,
      // Same precedence shape as the article entries: the row's own timestamp,
      // then the fallback. The extension is the only part of a course this app
      // owns a timestamp for; upstream's list carries none.
      lastModified: ext?.updatedAt ?? now,
      // Courses gain and lose schedule rounds continuously, so they change more
      // often than an article and less often than the catalogue that lists them.
      changeFrequency: 'weekly',
      // Above articles (0.6) and custom pages (0.5), below the static landing
      // routes (0.8) that link to them.
      priority: 0.7,
    });
  }

  return out;
}
