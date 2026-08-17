import { normalizeScheduleStatus } from '@/lib/scheduleStatus';

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
 * ── WHY A FULL ROUND RETURNS null ───────────────────────────────────────────
 * Upstream used to withhold `full` rounds from every public feed, so "is this
 * round registerable" and "did this round arrive" were the same question and
 * nobody had to ask it here. They are now different questions: the public
 * surfaces request open+nearly_full+full precisely so a sold-out round can be
 * SHOWN, and the moment it is shown it must not also be clickable.
 *
 * Returning null is what makes the disabling REAL rather than cosmetic. Both
 * /schedule layouts and /search already branch on a null href to render the row
 * without its affordances (no anchor, no chevron) — the contract the paragraph
 * above already promised — so one return here disables the desktop table cell,
 * the mobile round card and the search row together, with no fourth copy of the
 * rule to drift. Greying a link that still navigates would be the failure mode.
 *
 * `normalizeScheduleStatus` and not `=== 'full'`: the local ScheduleStatus
 * override collection spells the same state `closed`, and a round closed by an
 * admin override must be exactly as unclickable as one MSDB reports full.
 *
 * Note this deliberately shadows the signup_url fallback too. A full round with
 * a live upstream signup_url is the worst case — a working link into a form
 * that will take a booking for a round with no seats.
 *
 * Not to be confused with lib/courseRegistrationHref, which builds the in-house
 * (quote-only) entry point for a COURSE and knows nothing about rounds.
 */
export function scheduleRegistrationHref(schedule, courseId) {
  if (normalizeScheduleStatus(schedule?.status) === 'full') return null;
  if (schedule?._id && courseId) {
    return `/registration/public?course=${String(courseId).toLowerCase()}&class=${schedule._id}`;
  }
  return schedule?.signup_url || null;
}
