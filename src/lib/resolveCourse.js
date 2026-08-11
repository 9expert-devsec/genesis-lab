/**
 * Resolve a public URL slug to its course detail.
 *
 * Two paths in priority order:
 *   1. `urlAlias` match in CourseExtension — admin set a pretty URL.
 *   2. Legacy "<code>-training-course" suffix — strip + uppercase to
 *      get the upstream `course_id`.
 *
 * Returns `{ course, extension, mode }` or `null`. `extension` may be
 * `null` even on a successful resolution (legacy URLs without an
 * extension document).
 *
 * NOTE on case-sensitivity: upstream `course_id` has no canonical casing (5 of
 * 77 are mixed-case) and upstream may RENAME one at any time. BOTH paths
 * therefore look up through `getCourseByCodeInsensitive`, for two different
 * reasons:
 *
 *   path 2 never had the casing — it uppercases a URL fragment.
 *   path 1 had it and it went STALE — `extension.courseId` is a copy frozen
 *          when an admin last saved that row, and nothing propagates a rename.
 *
 * The older note here said courses with lowercase letters "still resolve via
 * urlAlias". That was the exact opposite of the truth once upstream renamed
 * `Power-Apps` to `POWER-APPS`: the alias path was the one that broke.
 */

import {
  getCourseExtension,
  getCourseExtensionByAlias,
} from '@/lib/actions/course-extensions';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';

const SUFFIX = '-training-course';

/**
 * `deps` exists so both paths are testable without a network or a database;
 * production callers pass nothing. Same reasoning as
 * getCourseByCodeInsensitive's own `deps` — this resolver's whole behaviour is
 * which lookup it reaches for, and that is not observable from source text
 * alone (an fs guard asserting the CALL is what let the stale-casing bug sit
 * here, green, in the first place).
 */
export async function resolveCourse(
  slug,
  {
    fetchExtensionByAlias = getCourseExtensionByAlias,
    fetchExtension = getCourseExtension,
    fetchCourse = getCourseByCodeInsensitive,
  } = {}
) {
  if (!slug) return null;
  const seg = String(slug).trim();
  if (!seg) return null;

  // 1) Custom URL alias.
  const alias = seg.startsWith('/') ? seg : `/${seg}`;
  const byAlias = await fetchExtensionByAlias(alias).catch(() => null);
  if (byAlias && byAlias.isPublished !== false) {
    /**
     * CASE-TOLERANT, because the stored key can LAG AN UPSTREAM RENAME.
     *
     * This used to be an exact `getCourseByCode`, under a comment asserting
     * that the stored id could not have a casing problem and so needed no
     * fallback. That was false, and it cost a live 404. (Deliberately
     * paraphrased rather than quoted: an fs guard greps for the original
     * sentence, and a verbatim quotation here would trip it.)
     *
     * The casing here is not LOST, it is STALE. `courseId` is a copy of the
     * upstream `course_id`, frozen on the CourseExtension the day an admin last
     * saved that row — upstream is free to rename afterwards and nothing
     * propagates it. Extension `69f87551aac437056dfc02cf` was written
     * 2026-05-04 holding `Power-Apps`; upstream has since become `POWER-APPS`.
     * The exact fetch missed, path 1 fell through, path 2 uppercased the ALIAS
     * to POWER-APPS-FOR-BUSINESS which is not a course either, and
     * /power-apps-for-business-training-course 404'd while
     * /POWER-APPS-training-course served fine.
     *
     * So this is the same permanent condition path 2 already handles, reached
     * by a different route: path 2's id comes from a URL that never had the
     * casing, path 1's comes from a copy that had it and went out of date.
     * Neither is recoverable by exact match, and repairing the row would fix
     * this one URL and none of the next ones — nothing stops upstream renaming
     * again tomorrow.
     */
    const course = await fetchCourse(byAlias.courseId).catch(() => null);
    if (course) {
      return { course, extension: byAlias, mode: 'alias' };
    }
  }

  // 2) Legacy "<code>-training-course" pattern.
  if (seg.endsWith(SUFFIX)) {
    // Uppercased because that is how the great majority of upstream ids are
    // stored, so it is the casing that hits the direct lookup. The five
    // mixed-case ids miss it and are recovered by the case-insensitive
    // fallback inside the helper — without which /power-apps-training-course
    // and four siblings 404 outright.
    const courseId = seg.slice(0, -SUFFIX.length).toUpperCase();
    if (!courseId) return null;
    const course = await fetchCourse(courseId).catch(() => null);
    if (!course) return null;
    // Look up extension by the upstream's canonical course_id (which
    // may differ in case from the URL fragment).
    const extension = await fetchExtension(course.course_id).catch(
      () => null
    );
    return { course, extension, mode: 'code' };
  }

  return null;
}
