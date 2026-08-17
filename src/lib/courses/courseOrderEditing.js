/**
 * WHEN /admin/courses MAY OFFER A DRAG, and what it writes when it does.
 *
 * ── THE HAZARD THIS MODULE EXISTS FOR ──────────────────────────────────────
 * A save replaces `courseOrder` with the COMPLETE membership of the group, so
 * the group on screen must BE the complete membership. The list filters on the
 * client, and two of its three filters narrow WITHIN a group:
 *
 *   · `q`    — matches course name / code, so it keeps some courses in a
 *              program and drops others
 *   · `type` — public / in-house, same
 *   · `program` — selects WHOLE groups, so a group that survives it is intact
 *
 * Dragging under `q` or `type` and saving would write the visible subset and
 * DELETE every filtered-out course from the stored order. Silent, irreversible
 * without a re-seed, and it would look like it worked.
 *
 * The third refusal is the loadCourseOrder-null state. There the screen has no
 * stored list at all — the read failed, or nothing is seeded — and every row is
 * displayed as unlisted. A save from that state would invent an order out of a
 * failure and stamp it 'arranged', which is the one marker the re-seed will not
 * overwrite. So the null state is read-only by rule, not by accident.
 *
 * ── WHY A PURE MODULE RATHER THAN AN `if` IN THE COMPONENT ─────────────────
 * The decision is the safety property, and the assertions that matter ("a null
 * order cannot produce a write", "a filtered view cannot produce a write") are
 * about it rather than about the markup. It is also the same condition the
 * component needs three times: to enable the handle, to enable the save, and to
 * tell the admin WHY it is off — a reason it cannot make up on the spot.
 */

import { normalizeCourseCode } from './courseOrder';

/** Why reordering is unavailable. `null` when it is available. */
export const REORDER_BLOCKED = Object.freeze({
  NO_ORDER: 'no-order',
  FILTERED: 'filtered',
});

/**
 * @param {object} state
 * @param {object|null} state.programCourseOrder null when nothing is seeded or
 *        the read failed — see lib/courses/courseOrderStore.js
 * @param {string} [state.q]    the search filter, '' when inactive
 * @param {string} [state.type] the public/in-house filter, '' when inactive
 * @returns {{allowed: boolean, reason: string|null}}
 */
export function canReorderCourseGroups({ programCourseOrder, q = '', type = '' } = {}) {
  // Checked FIRST, so a screen that is both unseeded and filtered reports the
  // condition the admin cannot fix by clearing a box.
  if (programCourseOrder == null) {
    return { allowed: false, reason: REORDER_BLOCKED.NO_ORDER };
  }
  // `program` is deliberately absent: it selects whole groups, so a group that
  // survives it still holds every course it holds unfiltered.
  if (String(q ?? '').trim() || String(type ?? '').trim()) {
    return { allowed: false, reason: REORDER_BLOCKED.FILTERED };
  }
  return { allowed: true, reason: null };
}

/**
 * The array a save sends: every row of the group, in displayed order.
 *
 * Built from the ROWS RENDERED rather than from the stored list, because the
 * rendered set is what the admin arranged and what they are agreeing to — and
 * because rebuilding from the stored list would silently re-drop the very
 * unlisted courses the save is supposed to adopt.
 *
 * Normalised and de-duplicated here as well as in the action. Not belt and
 * braces: this is what the SCREEN will renumber from once the save succeeds, so
 * if the two disagreed the admin would be shown a different list from the one
 * that was written.
 */
export function orderedCodesForGroup(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows ?? []) {
    const code = normalizeCourseCode(row?.course?.course_id ?? row?.course_id);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
