'use server';

import { listPublicCourses, getCourseByCode } from '@/lib/api/public-courses';

/**
 * Lazy "recommend" lookups for the หลักสูตร mega menu's Col 4 preview.
 *
 * Two-step lookup: the list endpoint returns course_id/course_name but
 * NOT course_cover_url — only the detail endpoint carries the cover. So
 * we list to find the first course, then fetch its detail for the cover.
 * Both are best-effort: any failure returns null and the client renders
 * no preview (or the placeholder).
 */

export async function getFirstCourseByProgram(programId) {
  if (!programId) return null;
  try {
    const { items } = await listPublicCourses({ program: String(programId) });
    const first = items?.[0];
    if (!first?.course_id) return null;
    const detail = await getCourseByCode(first.course_id);
    return {
      course_id: first.course_id,
      course_name: first.course_name ?? detail?.course_name ?? '',
      course_cover_url: detail?.course_cover_url ?? null,
    };
  } catch {
    return null;
  }
}

export async function getFirstCourseBySkill(skillUpstreamId) {
  if (!skillUpstreamId) return null;
  try {
    const { items } = await listPublicCourses({ skill: String(skillUpstreamId) });
    const first = items?.[0];
    if (!first?.course_id) return null;
    const detail = await getCourseByCode(first.course_id);
    return {
      course_id: first.course_id,
      course_name: first.course_name ?? detail?.course_name ?? '',
      course_cover_url: detail?.course_cover_url ?? null,
    };
  } catch {
    return null;
  }
}
