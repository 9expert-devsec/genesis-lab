/**
 * "Which option does this stored reference point at?" — the pure half.
 *
 * ── WHY THIS IS NOT IN pickerOptions.js ─────────────────────────────────────
 * Both pickers are CLIENT components and both need these two functions to show
 * the admin what a saved banner currently points at. pickerOptions.js loads the
 * lists, which means it carries `await import('@/models/Article')` and
 * `await import('@/lib/db/connect')` inside its bodies — and a dynamic import is
 * still an EDGE IN THE BUNDLE GRAPH. Importing that module from a client
 * component would pull mongoose toward the browser chunk, lazily but really.
 *
 * The matchers have no such dependency, so they live here and pickerOptions
 * re-exports them for its server-side callers. One definition, two import paths,
 * and the client one cannot reach a database driver.
 *
 * ── THE MATCHING ORDER IS NOT ARBITRARY ─────────────────────────────────────
 * `findCourseOption` goes upstreamId FIRST and then the normalised code, which
 * is exactly `pickCourse`'s order in featureContentRefs. If the picker matched
 * differently from the resolver, the admin would be told about a different
 * course than the one the home page will actually render — a warning that is
 * worse than no warning, because it is confidently about the wrong record.
 */

import { normaliseCourseKey } from '@/lib/courses/hiddenCourses';

/**
 * The course option a stored `course_ref` reaches, or null.
 *
 * NEVER crosses the namespace boundary: the two are disjoint in field names, so
 * a course found in the wrong one resolves to nothing at render time and the
 * picker must say so rather than show a confident match.
 */
export function findCourseOption(items, ref) {
  if (!ref) return null;
  const up = String(ref.upstreamId ?? '').trim();
  const code = normaliseCourseKey(ref.courseId);
  const inKind = (Array.isArray(items) ? items : []).filter((o) => o.kind === ref.kind);
  if (up) {
    const hit = inKind.find((o) => o.upstreamId === up);
    if (hit) return hit;
  }
  if (code) {
    const hit = inKind.find((o) => normaliseCourseKey(o.courseId) === code);
    if (hit) return hit;
  }
  return null;
}

/**
 * The article option for a stored slug — EXACT BYTES.
 *
 * No trimming, no folding, no decoding. 265 of the 488 live slugs contain Thai,
 * and a matcher that normalised would claim a match the `$in` on `Article.slug`
 * will not make.
 */
export function findArticleOption(items, slug) {
  const key = String(slug ?? '');
  if (!key) return null;
  return (Array.isArray(items) ? items : []).find((o) => o.slug === key) ?? null;
}
