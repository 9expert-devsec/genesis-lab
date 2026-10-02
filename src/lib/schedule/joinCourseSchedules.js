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
 * upcoming schedule gets no joined row. That used to be the end of it, on the
 * view that a course with no bookable session was better hidden. RULED OTHERWISE
 * 2026-10-02: a public course that vanished when its last round closed read to
 * visitors as "no longer offered" (SQL-BI-ETL). So the page now lists every
 * public course through `scheduleListRows` below, and the joined rows remain the
 * input for the things that are about ROUNDS — the month range and the JSON-LD.
 * The silence was a separate problem: in the PYTHON-L1 incident 45 of 77 courses vanished per render
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
 * One course as the /schedule table renders it: the fields the row shows, and
 * its rounds. Shared by the joined rows and by the no-round rows of
 * `scheduleListRows`, so the two cannot drift into different shapes.
 */
function scheduleRow(c, list) {
  return {
    _id: c._id,
    course_id: c.course_id,
    course_name: c.course_name,
    /**
     * THE ADMIN'S CUSTOM PATH, AND WHY IT WAS MISSING.
     *
     * `courseCanonicalPath` answers "what is this course's canonical URL?" from
     * the alias FIRST and the `course_id` only as a fallback. This projection
     * did not carry the alias, so every consumer of a row from here fell
     * through to the derived path — and two of them did so silently:
     *
     *   · ScheduleClient's CourseCard calls `courseLinkHref(course)` under a
     *     comment reading "the row carries urlAlias". It did not. Measured on a
     *     production build 2026-09-29: all 44 course links on /schedule pointed
     *     at `/<code>-training-course` (e.g. /claude-ai-training-course) while
     *     the course's canonical is its alias (/claude-cowork-training-course),
     *     so every one of them took a 308 through courseRedirectTarget before
     *     landing. A working link with an extra hop is the quietest possible
     *     version of this bug.
     *   · lib/seo/scheduleJsonLd emits each course's `@id` from the same rule.
     *     Without the alias, /schedule and /training-course named the SAME
     *     course with two different URLs — 44 of 44 — which is two entities to
     *     a crawler and defeats the point of a shared Course node.
     *
     * `listPublicCourses` attaches `urlAlias` to every course it returns (see
     * attachAliases in lib/courses/hiddenCourses), so the value was always
     * present on the input and only this projection dropped it. `?? null`
     * matches the sibling fields and is what `normaliseAlias` reads as "no
     * alias", falling through to the derived path exactly as before for the
     * courses that genuinely have none.
     */
    urlAlias: c.urlAlias ?? null,
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
  };
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
    rows.push(scheduleRow(c, list));
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

/**
 * The /schedule course list: every course the page should show, with or
 * without rounds, in `courses` order.
 *
 *   · a course with a joined row → that row, unchanged;
 *   · a PUBLIC course (`course_type_public === true`) with no rounds → the same
 *     row shape with `schedules: []`, which renders as a row of empty months;
 *   · any other course with no rounds → nothing. That is the in-house-only
 *     course (`course_type_public: false`), and also a row missing the flag:
 *     only an explicit `true` earns an empty row.
 *
 * Hidden courses (CourseExtension.isPublished === false) never reach here —
 * `listPublicCourses` removes them before the page sees the list.
 *
 * @param {object[]} courses    /public-course items, as passed to joinCourseSchedules
 * @param {object[]} joinedRows `rows` from joinCourseSchedules(courses, …)
 * @returns {object[]}
 */
export function scheduleListRows(courses, joinedRows) {
  const joined = new Map(
    (Array.isArray(joinedRows) ? joinedRows : []).map((r) => [String(r._id), r]),
  );
  const out = [];
  for (const c of Array.isArray(courses) ? courses : []) {
    const row = joined.get(String(c?._id));
    if (row) out.push(row);
    else if (c?.course_type_public === true) out.push(scheduleRow(c, []));
  }
  return out;
}
