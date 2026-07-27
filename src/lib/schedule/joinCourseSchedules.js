/**
 * Pure course↔schedule join for the public /schedule table.
 *
 * Kept dependency-free ON PURPOSE: no `next/*`, no db, no models. That is what
 * lets the join be unit-tested in the `pure` tier without a Next request context
 * or a Mongo connection — same rationale as `courseRevalidatePlan.js`. The page
 * fetches (upstream, cached) and logs (console); this module only decides which
 * rows survive.
 *
 * Why it reports what it DROPS: the join is lossy by design — a course with no
 * upcoming schedule is removed from the table entirely, because showing a course
 * with no bookable session is worse than hiding it. That is correct, and it is
 * also silent: in the PYTHON-L1 incident 45 of 77 courses vanished per render
 * with no signal anywhere, so a row missing because upstream filtered it out
 * (empty `signup_url` → excluded from /schedules responses) looked identical to
 * a row correctly absent. `dropped` and `orphans` exist so the caller can say
 * out loud what it threw away. They change no rendering behaviour.
 *
 * `orphans` is currently always empty in production (verified: 0 across 76
 * schedules / 32 distinct refs). The check stays precisely BECAUSE it is zero —
 * a silent invariant nobody re-checks is the one that rots. If it ever goes
 * non-zero, /schedules and /public-course have drifted apart and schedule rows
 * are being discarded with no course to hang them on.
 */

/**
 * Extract the course reference from a schedule row.
 *
 * Upstream sends BOTH shapes and always has: `/schedules` returns `course` as a
 * populated object, while other paths return a bare ObjectId string. Tolerating
 * both is not defensive padding — it is the observed contract.
 */
function courseRefOf(schedule) {
  return typeof schedule?.course === 'string'
    ? schedule.course
    : schedule?.course?._id;
}

/**
 * Attach each course's upcoming schedules and report the losses.
 *
 * @param {object[]} courses   /public-course items (course_id, _id, program, …)
 * @param {object[]} schedules /schedules items (course ref + dates/status/type)
 * @returns {{
 *   rows: object[],
 *   dropped: string[],
 *   orphans: {ref: string, count: number}[]
 * }}
 *   - `rows`    — courses that have >= 1 schedule, reduced to the fields the
 *                 table renders, in input order. This is the render output and
 *                 its semantics are unchanged from the original inline join.
 *   - `dropped` — `course_id` of every course removed for having zero
 *                 schedules, in input order. Falls back to the ObjectId when a
 *                 course carries no code, so the log never prints `undefined`.
 *   - `orphans` — one entry per DISTINCT schedule course-ref that matched no
 *                 course, first-seen order, with how many schedule rows carried
 *                 it. Sum the counts for "how many schedule rows were lost".
 */
export function joinCourseSchedules(courses, schedules) {
  const courseList = Array.isArray(courses) ? courses : [];
  const scheduleList = Array.isArray(schedules) ? schedules : [];

  // Bucket schedules by course ref. Rows with no resolvable ref are skipped
  // here exactly as before — they can be attached to nothing.
  const schedulesByCourseId = new Map();
  for (const s of scheduleList) {
    const ref = courseRefOf(s);
    if (!ref) continue;
    const list = schedulesByCourseId.get(String(ref)) ?? [];
    list.push(s);
    schedulesByCourseId.set(String(ref), list);
  }

  const dropped = [];
  const rows = [];
  const matchedRefs = new Set();

  for (const c of courseList) {
    const key = String(c._id);
    const list = schedulesByCourseId.get(key) ?? [];
    if (list.length === 0) {
      dropped.push(c.course_id ?? key);
      continue;
    }
    matchedRefs.add(key);
    rows.push({
      _id: c._id,
      course_id: c.course_id,
      course_name: c.course_name,
      course_trainingdays: c.course_trainingdays ?? null,
      course_price: c.course_price ?? null,
      program: c.program
        ? {
            _id: c.program._id,
            program_id: c.program.program_id,
            program_name: c.program.program_name,
            programiconurl: c.program.programiconurl ?? null,
          }
        : null,
      schedules: list,
    });
  }

  // Anything bucketed but never claimed by a course is an orphan: a schedule
  // upstream returned for a course /public-course does not list.
  const orphans = [];
  for (const [ref, list] of schedulesByCourseId) {
    if (matchedRefs.has(ref)) continue;
    orphans.push({ ref, count: list.length });
  }

  return { rows, dropped, orphans };
}
