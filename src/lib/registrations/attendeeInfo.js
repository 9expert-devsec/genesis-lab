/**
 * THE TWO ATTENDEE QUESTIONS, AND WHY THEY ARE NOT THE SAME QUESTION.
 *
 * ── THE DISTINCTION THIS MODULE EXISTS TO KEEP ──────────────────────────────
 *
 * A public registration answers two different completeness questions and the
 * screens had started to blur them:
 *
 *   · ROSTER (per REGISTRATION, about ARITY) — has the coordinator named as many
 *     people as they said were coming? That is `attendeesListProvided`, the
 *     declared `attendeesCount`, and how many rows carry a person.
 *
 *   · INFO (per ATTENDEE, about FIELDS) — does THIS row hold the four things a
 *     name badge and a certificate need?
 *
 * They can disagree in both directions. A registration with one listed attendee
 * against a declared three is `incomplete` by roster while that single attendee
 * is perfectly `complete` by info. A registration whose roster is `ครบ 2/2` can
 * hold a row with no phone number.
 *
 * The dark summary strip asks the FIRST. The สถานะข้อมูล chip in the attendee
 * table asks the SECOND. Deriving either at a call site is how the two come to
 * be computed twice and answered differently, which is the defect class this
 * whole branch keeps removing — so both live here, in one import-free module the
 * pure tier can load with nothing stubbed.
 *
 * ── WHY THE `not-provided` ROSTER STATE HAS NO PER-ATTENDEE COUNTERPART ─────
 *
 * `attendeesListProvided === false` means `buildAttendees` wrote an EMPTY array
 * (see lib/registration/build-public.js), so there are no rows and therefore no
 * chips. It is a statement about the registration and it is unrepresentable per
 * attendee. That asymmetry is the clearest evidence the two questions differ.
 */

/** The four fields an attendee row is made of, in the order the table shows them. */
export const ATTENDEE_FIELDS = ['firstName', 'lastName', 'email', 'phone'];

/**
 * Is this attendee's information complete, partial, or not filled in at all?
 *
 * ── ALL THREE BRANCHES ARE REACHABLE, AND THAT WAS CHECKED RATHER THAN
 *    ASSUMED ───────────────────────────────────────────────────────────────
 *
 * Every one of the four fields is `required: true` on RegisterPublic's
 * AttendeeSchema AND required by `attendeeSchema` in lib/schemas/register-public,
 * so a row written by the CUSTOMER FORM is always complete. Read that alone and
 * `partial` and `empty` look like dead branches.
 *
 * They are not, and the admin screen is why:
 *
 *   · `updateRegistration` writes with `runValidators: false` — deliberately, so
 *     an admin can correct a record the schema would now reject — so the
 *     sub-schema's `required` never runs on an admin save;
 *   · the attendee editor's `+ เพิ่มผู้เข้าอบรม` appends `EMPTY_ATTENDEE`, four
 *     empty strings, and nothing stops the admin saving with it half filled.
 *
 * So `partial` is "an admin started a row and stopped" and `empty` is "an admin
 * added a slot and typed nothing". Both are states a reader has to be able to
 * see, and a fixture covers each.
 *
 * ── AND WHY THIS DOES NOT VALIDATE ─────────────────────────────────────────
 * Presence only. A malformed email is not `partial` — that would be this module
 * inventing a rule the record does not carry, and the customer form's zod schema
 * is the only thing entitled to have an opinion about the SHAPE of an email.
 *
 * @param {object} attendee
 * @returns {'complete'|'partial'|'empty'}
 */
export function attendeeInfoState(attendee) {
  const filled = ATTENDEE_FIELDS.filter((f) => String(attendee?.[f] ?? '').trim() !== '');
  if (filled.length === ATTENDEE_FIELDS.length) return 'complete';
  if (filled.length === 0) return 'empty';
  return 'partial';
}

/** Which of the four fields this row is missing, in table order. */
export function missingAttendeeFields(attendee) {
  return ATTENDEE_FIELDS.filter((f) => String(attendee?.[f] ?? '').trim() === '');
}

/**
 * Does this row carry a person at all?
 *
 * The roster count's member test, and it is deliberately NOT `state ===
 * 'complete'`: an attendee with a name and no phone number IS a named attendee,
 * and counting them as missing would make a registration read `ยังไม่ครบ 1/2`
 * when both people are on the list and one of them is short a field. That is
 * what the per-attendee chip is for.
 *
 * A NAME OR AN EMAIL, because either identifies a person. A row holding only a
 * phone number is a fragment somebody started, not a person on a roster.
 */
export function isNamedAttendee(attendee) {
  return Boolean(
    String(attendee?.firstName ?? '').trim() ||
    String(attendee?.lastName ?? '').trim() ||
    String(attendee?.email ?? '').trim()
  );
}

/**
 * The ROSTER state of a whole registration.
 *
 * ── ONE DERIVATION, TWO SURFACES ───────────────────────────────────────────
 * The dark summary strip's ผู้เข้าอบรม sub-line and the attendee tab's
 * ความครบถ้วน cell are the same question asked on two screens of one page. They
 * were written independently in round 4 and the second one is what forced this
 * extraction: two derivations of one number is how a page comes to say
 * `รายชื่อครบ 2/2` in one place and something else three inches below it.
 *
 * The two surfaces still WORD it differently — the strip has room for
 * `รายชื่อครบ 2/2` and the 359px cell shows `ครบ 2/2` — and that is formatting,
 * which is the caller's. What may not differ is the STATE and the two numbers.
 *
 * @param {{attendeesListProvided?: boolean, attendeesCount?: number, attendees?: object[]}} doc
 * @returns {{state: 'not-provided'|'complete'|'incomplete', named: number, count: number}}
 */
export function rosterState({ attendeesListProvided, attendeesCount, attendees } = {}) {
  const count = Number(attendeesCount ?? 0);
  const named = (attendees ?? []).filter(isNamedAttendee).length;
  if (attendeesListProvided === false) return { state: 'not-provided', named, count };
  return { state: named >= count ? 'complete' : 'incomplete', named, count };
}
