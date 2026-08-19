/**
 * THE FOUR COUPLED FIELDS OF A TRAINING ROUND.
 *
 * A registration stores `classId`, `classDate`, `scheduleType` and
 * `attendanceMode`. They describe ONE round and they must move together.
 *
 * ══ THE TRAP THIS MODULE EXISTS TO MAKE UNREPRESENTABLE ═════════════════════
 *
 * A control that writes only the DATE LABEL leaves `classId` pointing at a
 * different round than the label shows, and NOTHING ON SCREEN WOULD REVEAL THE
 * DISAGREEMENT — the page renders the label, and the id is only visible in the
 * ข้อมูลระบบ card as an opaque string nobody cross-checks.
 *
 * That is worse than the free-text box it replaces, which at least does not
 * claim to be linked to anything.
 *
 * So the fix is not "a careful dropdown". It is that the inconsistent state is
 * UNSENDABLE: the client sends `classId` (plus `attendanceMode` when the round
 * is hybrid) and the SERVER derives the other two from the round it looked up.
 * A client that cannot send a label cannot send one that disagrees with the id.
 *
 * ══ THIS IS RegisterWizard's LOGIC, EXTRACTED — NOT A SECOND COPY ═══════════
 *
 * The public wizard already solved this coupling, in a `useEffect` that calls
 * `setValue` four times on selection. `formatClassDates` and the hybrid rule
 * below are MOVED out of RegisterWizard, which now imports them. Restating
 * either would have been two implementations of one rule, and the one that
 * drifted would be the admin's — the surface with the fewest eyes on it.
 *
 * What could NOT be extracted is the effect itself: it is react-hook-form
 * `setValue` calls against a live form, and the server has no form. So the
 * DERIVATION is shared and the two call sites apply it differently — the wizard
 * into form state, the action into a Mongo `$set`. That is the honest split;
 * see `roundFieldsFor` for the piece both actually share.
 *
 * Pure — no React, no mongoose, no network. Drivable from the `pure` tier.
 */

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * A round's dates as the one label both surfaces show.
 *
 * MOVED VERBATIM from RegisterWizard — byte-for-byte the same output, because
 * it is what every existing `classDate` in the collection was written by, and a
 * "tidier" version would make every re-saved round's label differ from its
 * neighbours' for no reason a reader could see.
 */
export function formatClassDates(dates) {
  if (!dates?.length) return '';
  const sorted = [...dates].sort();
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  const year = start.getFullYear() + 543;
  if (sorted.length === 1) {
    return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} ${year}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${THAI_MONTHS[start.getMonth()]} ${year}`;
  }
  return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} - ${end.getDate()} ${THAI_MONTHS[end.getMonth()]} ${year}`;
}

/** The exact set this module governs. Named so no caller has to remember it. */
export const ROUND_FIELDS = Object.freeze(['classId', 'classDate', 'scheduleType', 'attendanceMode']);

/**
 * Is this round hybrid? One predicate, so the rule is spelled once.
 *
 * `?.` and a string compare rather than a truthiness test: `scheduleType` is
 * free-form upstream and a round with no type at all is CLASSROOM by the
 * convention `scheduleLabel` already encodes.
 */
export const isHybridRound = (round) => round?.type === 'hybrid';

/**
 * THE HYBRID RULE, exactly as RegisterWizard applies it.
 *
 *   · a NON-HYBRID round sets `classroom` automatically — the customer is never
 *     asked, because there is nothing to choose;
 *   · a HYBRID round REQUIRES a choice and is never defaulted. Guessing
 *     `classroom` for someone who meant Teams sends them to a building.
 *
 * Returns `null` when a hybrid round has no valid choice, which the caller must
 * treat as a REFUSAL rather than substituting one. The wizard expresses the same
 * thing as `setValue('attendanceMode', undefined)` plus a zod `required`.
 */
export function attendanceModeFor(round, chosen) {
  if (!isHybridRound(round)) return 'classroom';
  return chosen === 'classroom' || chosen === 'teams' ? chosen : null;
}

/**
 * All four fields for a round, or `null` if the choice is incomplete.
 *
 * THE ONE FUNCTION BOTH CALL SITES SHARE. The wizard spreads it into `setValue`
 * calls; the action spreads it into a `$set`. Neither decides what a round
 * means — this does, once.
 *
 * @param {object} round the upstream schedule row (`_id`, `dates`, `type`)
 * @param {string} [chosenMode] the admin's / customer's hybrid choice
 * @returns {{classId: string, classDate: string, scheduleType: string, attendanceMode: string}|null}
 */
export function roundFieldsFor(round, chosenMode) {
  if (!round?._id) return null;
  const attendanceMode = attendanceModeFor(round, chosenMode);
  if (attendanceMode === null) return null;
  return {
    classId: String(round._id),
    classDate: formatClassDates(round.dates),
    // `?? 'classroom'`, matching `scheduleLabel`'s own falsy branch on the
    // detail screen: a round with no type stored reads as Classroom there, and
    // writing `undefined` here would make the two disagree.
    scheduleType: round.type ?? 'classroom',
    attendanceMode,
  };
}

/**
 * The round currently stored on a registration, as an OPTION — even when it is
 * no longer in the list.
 *
 * ══ REQUIREMENT 5, AND IT IS THE COMMON CASE, NOT AN EDGE CASE ══════════════
 *
 * A stored round that is not in `schedules` must still render as the selected
 * option, marked as no longer offered. Never silently cleared.
 *
 * This matters far more than it first appears. The upstream schedule endpoint
 * applies a `>= today` bound UNCONDITIONALLY — measured and curl-verified in
 * lib/api/schedules.js, and NOT lifted by the `status` parameter. So EVERY
 * registration for a round that has already run has a `classId` the list cannot
 * contain. That is most of the collection, not a rare restructuring.
 *
 * Silently clearing, or rendering the select with nothing chosen, would make an
 * admin opening an old record see a blank round and quite reasonably pick a new
 * one — moving an attendee off a course they already attended.
 *
 * @returns {{value: string, label: string, missing: boolean}|null}
 */
export function storedRoundOption(doc, schedules) {
  const classId = String(doc?.classId ?? '');
  if (!classId) return null;
  const present = (schedules ?? []).some((s) => String(s?._id) === classId);
  if (present) return null;
  return {
    value: classId,
    // The STORED label, not a re-derivation: the round is gone, so there are no
    // dates to format, and `classDate` is the only record of what it said.
    label: String(doc?.classDate ?? '').trim() || classId,
    missing: true,
  };
}
