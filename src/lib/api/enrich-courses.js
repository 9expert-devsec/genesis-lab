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

/**
 * @param {object[]} items list-shaped public-course rows
 * @param {object}   [opts]
 * @param {number}   [opts.schedulesPerCourse=3]
 * @param {boolean}  [opts.withSchedules=true]
 *   Set false to skip the SECOND fan-out entirely. The schedule pass costs one
 *   `listSchedulesByCourse` request per course on top of the detail pass, and
 *   a caller that already has every schedule from a single `getAllSchedules()`
 *   — /search's corpus builder does — would be buying the same rows twice, N
 *   requests at a time. `schedules` is still present on the result, as `[]`,
 *   so the returned shape does not change under the caller.
 *   DEFAULT TRUE: every pre-existing caller (/training-course, /program/[slug],
 *   /skill/[slug]) relies on the schedules and must be unaffected.
 * @param {string[]} [opts.includeDetailFields=[]]
 *   Extra keys copied verbatim from the DETAIL response. The fixed mapping
 *   below is tuned for what the course CARDS render; /search additionally needs
 *   `course_objectives` and `training_topics` to match on, and those must not
 *   be added to the default mapping — they are large, and every existing
 *   caller passes its enriched courses straight into a client component, so a
 *   new default field is a payload regression on three other pages.
 */
export async function enrichCoursesWithDetails(
  items,
  { schedulesPerCourse = 3, withSchedules = true, includeDetailFields = [] } = {},
) {
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
  if (withSchedules) {
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
  }

  const extras = Array.isArray(includeDetailFields) ? includeDetailFields : [];

  return items.map((c) => {
    const detail = detailById.get(c.course_id);
    const hoursFromDetail = detail?.course_traininghours ?? null;
    const extra = {};
    for (const key of extras) extra[key] = detail?.[key] ?? null;
    return {
      ...c,
      ...extra,
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
