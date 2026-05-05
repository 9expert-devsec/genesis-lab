/**
 * Enrich a list of public-course items with the fields that only the
 * detail endpoint returns: `course_cover_url`, `course_teaser`,
 * `course_levels`, `course_traininghours`, badge flags, full skill
 * objects, and up to N upcoming schedules.
 *
 * Fan-out is bounded to a small concurrency (10) — better than firing
 * one request per course at the same time. `aiFetch`'s upstream caching
 * keeps repeat hits cheap.
 */

import { getCourseByCode } from './public-courses';
import { listSchedulesByCourse } from './schedules';

const FETCH_CHUNK = 10;

export async function enrichCoursesWithDetails(items, { schedulesPerCourse = 3 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const detailById = new Map();
  for (let i = 0; i < items.length; i += FETCH_CHUNK) {
    const chunk = items.slice(i, i + FETCH_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => getCourseByCode(c.course_id))
    );
    results.forEach((r, idx) => {
      const code = chunk[idx].course_id;
      if (r.status === 'fulfilled' && r.value) {
        detailById.set(code, r.value);
      } else if (r.status === 'rejected') {
        console.warn('[enrich-courses] detail fetch failed:', code, r.reason);
      }
    });
  }

  const scheduleById = new Map();
  for (let i = 0; i < items.length; i += FETCH_CHUNK) {
    const chunk = items.slice(i, i + FETCH_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => listSchedulesByCourse(c._id, { limit: schedulesPerCourse }))
    );
    results.forEach((r, idx) => {
      const id = chunk[idx]._id;
      if (r.status === 'fulfilled') {
        scheduleById.set(id, r.value.items ?? []);
      } else {
        console.warn('[enrich-courses] schedule fetch failed:', id, r.reason);
      }
    });
  }

  return items.map((c) => {
    const detail = detailById.get(c.course_id);
    const hoursFromDetail = detail?.course_traininghours ?? null;
    return {
      ...c,
      course_cover_url: detail?.course_cover_url ?? null,
      course_teaser: detail?.course_teaser ?? null,
      course_levels: detail?.course_levels ?? null,
      course_workshop_status: detail?.course_workshop_status ?? null,
      course_certificate_status: detail?.course_certificate_status ?? null,
      course_type_public: detail?.course_type_public ?? null,
      course_type_inhouse: detail?.course_type_inhouse ?? null,
      course_traininghours:
        hoursFromDetail ??
        (c.course_trainingdays ? c.course_trainingdays * 6 : null),
      // Detail returns full skill objects; fall back to the list's
      // ObjectId strings if detail failed (cards filter those out).
      skills: detail?.skills ?? c.skills,
      schedules: scheduleById.get(c._id) ?? [],
    };
  });
}
