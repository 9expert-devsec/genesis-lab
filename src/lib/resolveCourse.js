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
 * NOTE on case-sensitivity: upstream `course_id` is mixed-case (e.g.
 * `Power-Apps`). The legacy suffix path uppercases the slug because
 * that's what `[...slug]` did before this resolver existed; courses
 * with lowercase letters in their ID still resolve via urlAlias.
 */

import {
  getCourseExtension,
  getCourseExtensionByAlias,
} from '@/lib/actions/course-extensions';
import {
  getCourseByCode,
  getCourseByCodeInsensitive,
} from '@/lib/api/public-courses';

const SUFFIX = '-training-course';

export async function resolveCourse(slug) {
  if (!slug) return null;
  const seg = String(slug).trim();
  if (!seg) return null;

  // 1) Custom URL alias.
  const alias = seg.startsWith('/') ? seg : `/${seg}`;
  const byAlias = await getCourseExtensionByAlias(alias).catch(() => null);
  if (byAlias && byAlias.isPublished !== false) {
    // Exact lookup on purpose: byAlias.courseId is the upstream course_id as
    // stored on the CourseExtension, not a lowercased URL fragment, so it has
    // never lost its casing and needs no fallback.
    const course = await getCourseByCode(byAlias.courseId).catch(() => null);
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
    const course = await getCourseByCodeInsensitive(courseId).catch(() => null);
    if (!course) return null;
    // Look up extension by the upstream's canonical course_id (which
    // may differ in case from the URL fragment).
    const extension = await getCourseExtension(course.course_id).catch(
      () => null
    );
    return { course, extension, mode: 'code' };
  }

  return null;
}
