/**
 * WHO IS ON A CAREER PATH REGISTRATION'S ROSTER — one definition, three readers.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO END ────────────────────────────────────
 * `attendees` on a CareerPathRegistration EXCLUDES the coordinator, and it can
 * be LONGER than the slots it fills. Setting จำนวนผู้สมัคร to 2 with the
 * "ผู้ประสานงานเป็นผู้เข้าอบรม" box unticked registers `attendees.0` and
 * `attendees.1`; ticking it re-renders one row, but the form leaves
 * react-hook-form at its default `shouldUnregister: false`, so index 1 survives
 * in form state and is written to the document.
 *
 * So the roster is neither `attendees` nor `1 + attendees.length`. All three
 * readers computed the latter, and a 2-person ticked request rendered a blank
 * THIRD row whose email and phone both read ไม่ได้ระบุ — on the review step, on
 * the admin detail card, and in a confirmation mail that was actually sent.
 *
 * ── WHY IT IS A MODULE AND NOT A THIRD COPY ─────────────────────────────────
 * The fix was written out three times because the readers live in a client
 * component, a server component and a pure model builder with no module they all
 * already imported. That was held together by a guard asserting the three carried
 * the SAME cap expression — a text match, which is the right shape for duplicated
 * logic and the wrong one the moment there is a single definition. There is one
 * now, and the guard asks who imports it instead.
 *
 * ── DEPENDENCY-FREE, ON PURPOSE ─────────────────────────────────────────────
 * No env, no db, no network, no clock, no `next/*`, no React. That is what lets
 * `careerPathRegistrationModel` — which states its own purity and is exercised
 * in the `pure` tier — import it, the same way it already imports
 * `branchLabel.js` from this folder.
 *
 * ── NOTHING HERE WRITES ─────────────────────────────────────────────────────
 * Both functions are DISPLAY arithmetic over a document that is already stored.
 * `attendees` keeps its meaning on every registration, old and new; no migration
 * was performed and none is implied by this file existing.
 */

/**
 * How many people this request is for.
 *
 * `attendeeCount` is the headcount authority on the document — the review step,
 * the admin detail row and the mail's `total_participants` all read it, and they
 * agree because they read the same field. It is deliberately NOT derived from
 * `attendees.length`: the two disagree on every registration, and on one whose
 * names were deferred the array is empty while four people are coming.
 *
 * A missing, zero, negative or non-numeric count falls back to 1 — the schema's
 * own default — rather than to the array's length. A document with a broken count
 * is not a document whose roster length should quietly become the authority
 * instead.
 *
 * @param {object} reg a CareerPathRegistration document
 * @returns {number} a positive integer, always
 */
export function participantCount(reg) {
  const n = Math.floor(Number(reg?.attendeeCount));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * The stored attendee rows this request actually has slots for.
 *
 * The coordinator occupies slot 1 when `isCoordinator` is set and is NOT in the
 * array, so the typed rows are capped at `participantCount` minus that slot.
 * Callers that render a roster prepend the coordinator themselves — this returns
 * only what was typed, which is what every caller needs and none of them can get
 * from `attendees` alone.
 *
 * IT IS A CAP, NEVER PADDING. Fewer stored rows than slots means somebody did not
 * fill a form in, and inventing a row for them is precisely the defect this
 * module exists to remove. The zod schema requires every needed row before
 * submit, so a real registration always has enough and the cap only ever removes
 * ghosts.
 *
 * @param {object} reg a CareerPathRegistration document
 * @returns {object[]} a prefix of `reg.attendees`; never longer, never padded
 */
export function typedAttendeeRows(reg) {
  const stored = Array.isArray(reg?.attendees) ? reg.attendees : [];
  const slots = Math.max(0, participantCount(reg) - (reg?.isCoordinator ? 1 : 0));
  return stored.slice(0, slots);
}
