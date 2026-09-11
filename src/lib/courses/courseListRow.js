/**
 * The public course-list row: what /training-course sends the browser for
 * each course, and nothing else.
 *
 * ── THE COST THIS EXISTS TO CUT ─────────────────────────────────────────────
 * /training-course renders CourseListClient — a client component — with every
 * course as a prop, and props to a client component are serialised into the
 * RSC flight (`self.__next_f.push` <script> chunks). Measured on the prerendered
 * page at 77 courses: the `items` prop alone was 985,495 bytes serialised, 61%
 * of the flight and over half of a 1,826,208-byte page, across 41 keys per
 * row. `training_topics` was 369 KB of it, `related_courses` (nested course
 * objects) 212 KB, `course_objectives` 56 KB, `course_target_audience` 33 KB —
 * none of which the page reads. The cards show a name, a price, a duration,
 * badges and a round strip; the list filters on program, skill and a text
 * search. Everything else was ballast shipped 77 times.
 *
 * ── THE RULE: A KEY IS HERE BECAUSE A CONSUMER READS IT ────────────────────
 * Not by eye. Each key below names the component or helper that reads it
 * (test/pure/courseListRow derives the same list from those files' source
 * and asserts this set covers it, so a new read that is not here goes red —
 * and a key nobody reads any more goes red the other way). The consumers:
 *
 *   CourseListClient  course_id, course_name (search); skills[]._id/skill_id
 *                     (skill filter); program.program_name/_id (program
 *                     filter, grouping, sort)
 *   CourseCardGroup   _id, course_id, course_name (keys; earlyBirdMap lookup)
 *   CourseCard        course_id, course_name, course_trainingdays,
 *                     course_traininghours, course_price, course_cover_url,
 *                     course_teaser, course_levels, course_workshop_status,
 *                     course_certificate_status, course_type_public,
 *                     course_type_inhouse, program.{programiconurl,
 *                     program_name}, skills[], schedules[]
 *     via courseLinkHref → courseCanonicalPath   course_id, urlAlias
 *     via skillCapsuleHref                       skills[]._id/skill_id/
 *                                                upstreamCode/upstreamId
 *     via scheduleRegistrationHref               schedules[]._id/status/
 *                                                signup_url
 *   CourseTableGroup  _id, course_id, course_name, course_trainingdays,
 *                     course_price, program.{program_name, programiconurl}
 *
 * The three nested objects (`program`, `skills`, `schedules`) are passed
 * through WHOLE. They are ~11% of the trimmed row and small in absolute
 * terms (≈1.4 KB per course together); trimming inside them is a second,
 * separately-measured step, not this one.
 *
 * Same shape as lib/pageBuilder/courseCatalogue.js's projectCourseCatalogue —
 * an explicit key list and a pure function — because that is the precedent
 * this repo already has for a row crossing to the client, and a second idiom
 * would be one more thing to keep in step.
 *
 * Applied in app/(public)/training-course/page.jsx, AFTER enrichCoursesWithDetails
 * and BEFORE the row reaches CourseListClient. Not inside the enricher: that
 * is shared by /program/[slug], /skill/[slug], the catch-all and /search,
 * each of which is its own measured rollout.
 */

export const COURSE_LIST_ROW_KEYS = Object.freeze([
  '_id',
  'course_id',
  'course_name',
  'urlAlias',
  'course_price',
  'course_trainingdays',
  'course_traininghours',
  'course_cover_url',
  'course_teaser',
  'course_levels',
  'course_workshop_status',
  'course_certificate_status',
  'course_type_public',
  'course_type_inhouse',
  'program',
  'skills',
  'schedules',
]);

/**
 * Project enriched course rows down to COURSE_LIST_ROW_KEYS.
 *
 * Keys are copied only when PRESENT on the row (`in`), so a row that never
 * had `urlAlias` does not grow an `undefined` — which JSON.stringify would
 * drop anyway, but which would make the exact-set assertion in the test
 * lie about what the browser receives.
 *
 * @param {object[]} items enriched rows from enrichCoursesWithDetails
 * @returns {object[]} rows carrying only the keys the list page reads
 */
export function projectCourseListRows(items) {
  const rows = Array.isArray(items) ? items : [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const slim = {};
    for (const key of COURSE_LIST_ROW_KEYS) {
      if (key in row) slim[key] = row[key];
    }
    out.push(slim);
  }
  return out;
}
