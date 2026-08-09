/**
 * THE registration link for a round. Built here and nowhere else.
 *
 * ── WHY IT LEFT ScheduleClient ──────────────────────────────────────────────
 * It was a private function of /schedule, shared by that page's two layouts and
 * pinned by test/fs/scheduleMobileLayoutWiring. That was enough while /schedule
 * was the only surface listing rounds. It is not any more: /search's
 * `ตารางอบรม` section links the same rounds to the same
 * wizard, and it had grown its own byte-identical copy of the template — the
 * exact drift the /schedule guard exists to prevent, one file out of its reach.
 *
 * ── WHY THE `&class=` HALF IS LOAD-BEARING ──────────────────────────────────
 * RegisterWizard skips its round-confirm step when the parameter is present and
 * the id resolves (test/fs/registrationEntryPointClassParam.test.mjs). A second
 * builder that dropped it would restore the extra click on one surface only,
 * which is the kind of regression nobody reports.
 *
 * Falls back to the upstream `signup_url` only when the internal route cannot be
 * built at all — i.e. when the round has no `_id` or the course no `course_id`.
 * Returns null when there is nothing to link to, so a caller can render the row
 * WITHOUT its affordances rather than render a dead link.
 *
 * Not to be confused with lib/courseRegistrationHref, which builds the in-house
 * (quote-only) entry point for a COURSE and knows nothing about rounds.
 */
export function scheduleRegistrationHref(schedule, courseId) {
  if (schedule?._id && courseId) {
    return `/registration/public?course=${String(courseId).toLowerCase()}&class=${schedule._id}`;
  }
  return schedule?.signup_url || null;
}
