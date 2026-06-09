'use server';

import { listPublicCourses, getCourseByCode } from '@/lib/api/public-courses';

/**
 * Lazy lookups for the หลักสูตร mega menu's Programs/Skills cascade.
 *
 * Two-tier: hovering a Program/Skill in Col 2 lists its courses (Col 3)
 * via the list endpoint (fast, no cover); hovering a course row in Col 3
 * fetches that single course's cover (Col 4) via the detail endpoint —
 * the list endpoint does NOT carry `course_cover_url`. All reads are
 * best-effort: any failure degrades to an empty list / null preview.
 */

/**
 * Returns all courses for a program + the first course's cover, so Col 4
 * can show a default preview immediately on Col 2 hover (before any Col 3
 * hover). Hovering a course in Col 3 then overrides it via getCoursePreview.
 * {
 *   items: [{ course_id, course_name }],
 *   firstCover: { course_id, course_name, course_cover_url } | null
 * }
 */
export async function getCoursesByProgram(programId) {
  if (!programId) return { items: [], firstCover: null };
  try {
    const { items } = await listPublicCourses({ program: String(programId) });
    if (!items?.length) return { items: [], firstCover: null };
    return {
      items: items.map((c) => ({
        course_id: c.course_id,
        course_name: c.course_name ?? '',
      })),
      firstCover: await firstCourseCover(items[0]),
    };
  } catch {
    return { items: [], firstCover: null };
  }
}

/**
 * Returns all courses for a skill + the first course's cover (default Col 4).
 * {
 *   items: [{ course_id, course_name }],
 *   firstCover: { course_id, course_name, course_cover_url } | null
 * }
 */
export async function getCoursesBySkill(skillUpstreamId) {
  if (!skillUpstreamId) return { items: [], firstCover: null };
  try {
    const { items } = await listPublicCourses({ skill: String(skillUpstreamId) });
    if (!items?.length) return { items: [], firstCover: null };
    return {
      items: items.map((c) => ({
        course_id: c.course_id,
        course_name: c.course_name ?? '',
      })),
      firstCover: await firstCourseCover(items[0]),
    };
  } catch {
    return { items: [], firstCover: null };
  }
}

/**
 * Cover of a list course's detail (course_cover_url lives only on the
 * detail endpoint). Returns null if the course/detail is missing.
 */
async function firstCourseCover(listCourse) {
  if (!listCourse?.course_id) return null;
  const detail = await getCourseByCode(listCourse.course_id);
  if (!detail) return null;
  return {
    course_id: listCourse.course_id,
    course_name: listCourse.course_name ?? '',
    course_cover_url: detail.course_cover_url ?? null,
  };
}

/**
 * Fetch cover preview for a single course by course_id.
 * Called when the user hovers a course row in Col 3.
 * Returns { course_id, course_name, course_cover_url } or null.
 *
 * course_cover_url is only available on the detail endpoint (getCourseByCode),
 * not on the list endpoint.
 */
export async function getCoursePreview(courseId) {
  if (!courseId) return null;
  try {
    const detail = await getCourseByCode(courseId);
    if (!detail) return null;
    return {
      course_id: detail.course_id ?? courseId,
      course_name: detail.course_name ?? '',
      course_cover_url: detail.course_cover_url ?? null,
    };
  } catch {
    return null;
  }
}
