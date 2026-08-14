'use server';

import { listPublicCourses, getCourseByCode } from '@/lib/api/public-courses';
import { dbConnect } from '@/lib/db/connect';
import CourseExtension from '@/models/CourseExtension';

/**
 * Attach `urlAlias` (from CourseExtension) to a list-course array and its
 * firstCover. The upstream list API doesn't carry urlAlias. Stored aliases
 * keep a leading slash (e.g. "/power-bi-...-training-course"); strip it so
 * courseHref() produces a single-slash URL on the client.
 */
async function attachAliases(items, firstCover) {
  await dbConnect();
  const ids = items.map((c) => c.course_id).filter(Boolean);
  const exts = await CourseExtension.find(
    { courseId: { $in: ids } },
    { courseId: 1, urlAlias: 1 }
  ).lean();
  const aliasMap = Object.fromEntries(
    exts.map((e) => [
      String(e.courseId).toUpperCase(),
      e.urlAlias ? String(e.urlAlias).replace(/^\/+/, '') : null,
    ])
  );
  return {
    items: items.map((c) => ({
      ...c,
      urlAlias: aliasMap[String(c.course_id).toUpperCase()] ?? null,
    })),
    firstCover: firstCover
      ? {
          ...firstCover,
          urlAlias: aliasMap[String(firstCover.course_id).toUpperCase()] ?? null,
        }
      : null,
  };
}

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
    const mapped = items.map((c) => ({
      course_id: c.course_id,
      course_name: c.course_name ?? '',
    }));
    const firstCover = await firstCourseCover(items[0]);
    return attachAliases(mapped, firstCover);
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
    const mapped = items.map((c) => ({
      course_id: c.course_id,
      course_name: c.course_name ?? '',
    }));
    const firstCover = await firstCourseCover(items[0]);
    return attachAliases(mapped, firstCover);
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
 * Fetch the COVER for a single course by course_id, for Col 4.
 * Called when the user hovers a course row in Col 3.
 * Returns { course_id, course_cover_url } or null.
 *
 * course_cover_url is only available on the detail endpoint (getCourseByCode),
 * not on the list endpoint. That is the whole reason this call exists.
 *
 * ── WHY IT RETURNS NO NAME, AND NO ALIAS ───────────────────────────────────
 * It used to return `course_name` and `urlAlias` as well, and the card rendered
 * them. Both were free on a response fetched for the image, and neither was
 * ever the right source: the Col 3 row the user hovered already carries a name
 * and an alias, out of the nav snapshot, and the card is a preview OF THAT ROW.
 * Returning a second copy of either is what let the menu show the snapshot's
 * name in the list and the detail endpoint's name on the card simultaneously
 * after a rename.
 *
 * So the name is not overridden downstream — it is not returned. There is no
 * second name for a caller to pick up by accident. The shape the card is built
 * from is owned by lib/navmenu/coursePreview.js#composeCoursePreview, which
 * reads identity, name and alias from the row and only the image from here.
 *
 * Dropping the alias also removes a CourseExtension round-trip from every
 * course hover. The row's alias is what Col 3's own link already uses, so the
 * card and the row now resolve to the same href by construction rather than by
 * two independent lookups happening to agree.
 */
export async function getCoursePreview(courseId) {
  if (!courseId) return null;
  try {
    const detail = await getCourseByCode(courseId);
    if (!detail) return null;
    return {
      course_id: detail.course_id ?? courseId,
      course_cover_url: detail.course_cover_url ?? null,
    };
  } catch {
    return null;
  }
}
