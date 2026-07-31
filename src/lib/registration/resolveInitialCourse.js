/**
 * In-house wizard: reconcile an explicit `?course=` against a restored draft.
 *
 * An explicit, RESOLVABLE `?course=` is a deliberate act — the user just
 * clicked that course — so it should win over a STALE draft (a leftover from a
 * different course the user never finished). But it must NOT clobber an
 * in-progress choice while the user moves BETWEEN wizard steps for the same
 * course (they may have changed the dropdown on step 1).
 *
 * We tell the two apart with a "source course" marker: the resolved course id
 * the current draft was started from (persisted in sessionStorage by the form).
 *   - URL course differs from the marker → a fresh arrival at a NEW course → URL wins.
 *   - URL course equals the marker        → same session → the draft's course wins.
 *   - URL course missing/unresolvable     → the draft's course wins (never blanks it).
 *
 * `preselectedId` is the URL course already resolved to a real id (case-
 * insensitively) or null when absent/unresolvable — so an unknown `?course=`
 * falls back to the draft rather than to an empty or arbitrary selection.
 */
export function resolveInitialCourseId({ preselectedId, restoredCourseId, sourceCourse }) {
  const restored = restoredCourseId || '';
  if (!preselectedId) return restored; // no resolvable ?course= → keep the draft
  if (sourceCourse !== preselectedId) return preselectedId; // fresh arrival at a new course → URL wins
  return restored || preselectedId; // same session → the draft's (maybe changed) course wins
}

/**
 * Build the form's default values so a restored draft keeps everything (name,
 * email, requirements…) EXCEPT the course, which is resolved separately and
 * applied last so it wins over the draft's stored `coursesInterested`.
 */
export function buildInhouseInitialValues({ defaults, restored, initialCourseId }) {
  return {
    ...defaults,
    ...(restored ?? {}),
    coursesInterested: initialCourseId ? [initialCourseId] : [],
  };
}
