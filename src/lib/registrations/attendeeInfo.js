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

/*
 * ══ `attendeeInfoState`, `missingAttendeeFields` AND `ATTENDEE_FIELDS` ARE
 *    DELETED. ROUND 8. READ THIS BEFORE RE-ADDING ANY OF THEM. ══════════════
 *
 * They answered the per-ATTENDEE question this module's header describes: does
 * THIS row hold the four things a name badge and a certificate need? The answer
 * drove the สถานะข้อมูล chip, and only that chip — checked before deleting, not
 * assumed: `attendeeInfoState` had exactly one caller in `src/`
 * (RegistrationDetailClient's table body), `missingAttendeeFields` exactly one
 * (the chip's title attribute), and `ATTENDEE_FIELDS` was read only by those
 * two. The ผู้เข้าอบรม TAB BADGE renders `attendeesCount` and the LIST SCREEN
 * derives nothing per-attendee — its projection carries no attendees array at
 * all, which is the ruling round 5 recorded.
 *
 * ── THE DEFINITION STOPPED BEING TRUE, WHICH IS WHY IT IS DELETED RATHER
 *    THAN LEFT UNUSED ───────────────────────────────────────────────────────
 *
 * "Complete" meant all FOUR fields. Round 8 makes email and phone OPTIONAL on
 * the admin path (see AttendeeSchema and `updateRegistration`), so a row with a
 * name and nothing else is now a valid record — and `attendeeInfoState` would
 * have called it `partial` forever.
 *
 * A module that defines a rule nothing applies is the thing a future reader
 * picks up and re-wires to the wrong meaning: the name says "is this attendee's
 * information complete", it reads as authoritative, and its answer would be
 * wrong for every record the admin screen can now legitimately create. Leaving
 * it as dead code would have been worse than the chip.
 *
 * RE-POINTING IT AT THE NEW DEFINITION WAS CONSIDERED AND REJECTED. With two
 * required fields, "complete" collapses to "has a name" — one reachable state
 * for a three-state enum, guarding a condition the server already refuses and
 * the editor already warns about. The replacement is
 * `REQUIRED_ATTENDEE_FIELDS` in the detail client, which is deliberately not a
 * "completeness" notion: it is the server's refusal condition restated for the
 * one surface that must warn before the save.
 *
 * THE TWO-QUESTIONS SPLIT IN THIS FILE'S HEADER IS THEREFORE NOW A ONE-QUESTION
 * MODULE. The header is kept because the DISTINCTION is still the reason the
 * roster derivation lives here rather than at a call site, and because a reader
 * arriving from the git history needs to know where the other half went.
 */

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
 * ══ `over` IS A FOURTH STATE, ADDED IN ROUND 8, AND IT WAS HIDING ═══════════
 *
 * This used to read `named >= count ? 'complete' : 'incomplete'`, so a roster
 * with MORE people than seats reported `complete` — the same word as a roster
 * that matches exactly. Round 8 introduces the rule that a roster may not exceed
 * `attendeesCount`, and a screen that cannot tell those two apart cannot show a
 * record breaking it.
 *
 * IT IS NOT HYPOTHETICAL. Measured against production before the rule was
 * written (scripts/_probe-roster-over-capacity.mjs): of 39 public registrations,
 * ONE holds 2 attendees against a count of 1. Every one of those documents
 * reported `complete` until this change.
 *
 * ── AND THE VACUITY THIS CREATES, STATED ──────────────────────────────────
 * `complete` is now STRICTLY `named === count`. Any assertion that read
 * `state === 'complete'` for an over-capacity fixture was passing for the wrong
 * reason and now fails, which is the change working. Any assertion that reads
 * `'complete'` for an EXACT roster is unaffected — checked, not assumed.
 *
 * @param {{attendeesListProvided?: boolean, attendeesCount?: number, attendees?: object[]}} doc
 * @returns {{state: 'not-provided'|'complete'|'incomplete'|'over', named: number, count: number}}
 */
export function rosterState({ attendeesListProvided, attendeesCount, attendees } = {}) {
  const count = Number(attendeesCount ?? 0);
  const named = (attendees ?? []).filter(isNamedAttendee).length;
  if (attendeesListProvided === false) return { state: 'not-provided', named, count };
  if (named > count) return { state: 'over', named, count };
  return { state: named === count ? 'complete' : 'incomplete', named, count };
}

/**
 * IS THERE ROOM FOR ANOTHER NAME?
 *
 * The one place the seat lock's question is answered, so the disabled button,
 * the dashed add-row inside the editor and any future caller cannot disagree
 * about it. The SERVER enforces the rule independently — see
 * `updateRegistration` — because a disabled button is a courtesy and every
 * `'use server'` export is a POST endpoint.
 *
 * `count > 0` guards the degenerate document: `attendeesCount` is `required`
 * with a default of 1 on the schema, but one production record has it missing
 * entirely (measured, same probe), and `0 >= 0` would otherwise lock that record
 * out of ever gaining a name.
 */
export function rosterHasRoom({ attendeesListProvided, attendeesCount, attendees } = {}) {
  const { named, count } = rosterState({ attendeesListProvided, attendeesCount, attendees });
  if (count <= 0) return true;
  return named < count;
}

/**
 * THE DUPLICATE RULE, AND WHAT IT DOES WHEN THERE IS NO EMAIL.
 *
 * ══ EMAIL FIRST, BECAUSE IT IS THE ONLY IDENTIFIER THE RECORD CARRIES ═══════
 *
 * Two rows with the same non-empty email are the same person entered twice.
 * Compared case-insensitively and trimmed, because the schema lowercases on the
 * customer path and `updateRegistration` lowercases on the admin path, but a
 * legacy row may hold either.
 *
 * ══ AND WHEN EMAIL IS ABSENT — A CHOICE, NOT A FALLBACK ═════════════════════
 *
 * Round 8 makes email OPTIONAL on the admin path, so "match on email" stops
 * being a total rule. The three options were:
 *
 *   · MATCH ON NOTHING — a row with no email can never collide. Rejected: it
 *     makes the rule bypassable by clearing a field, and permits unlimited
 *     identical blank-email rows, which is exactly the double-entry the rule
 *     exists to catch.
 *   · MATCH ON NAME ALWAYS — rejected in the other direction: two people really
 *     can share a name, and a roster is the one place a company sends two
 *     staff called สมชาย. Blocking that would make the admin fabricate a
 *     difference to get past a validator.
 *   · MATCH ON NAME ONLY BETWEEN ROWS THAT BOTH LACK AN EMAIL. Chosen.
 *
 * The third is the narrowest rule that still closes the hole. A row WITH an
 * email never collides with a row without one — they are distinguishable, and
 * treating them as the same would block the ordinary flow of adding a name now
 * and its email later. Two rows that carry NOTHING but the same name are
 * indistinguishable in the record itself, and on a roster of at most 50 for one
 * session that is a double-entry far more often than it is twins.
 *
 * The failure mode is stated rather than hidden: this DOES refuse two genuinely
 * different people with the same name and no email addresses. The admin's way
 * past is to give one of them an email, which is the field that would have told
 * them apart in the first place.
 *
 * @returns {number} the index of the first row that duplicates an earlier one, or -1
 */
export function firstDuplicateAttendee(attendees = []) {
  const seenEmail = new Set();
  const seenNamelessName = new Set();

  for (let i = 0; i < attendees.length; i += 1) {
    const a = attendees[i] ?? {};
    const email = String(a.email ?? '').trim().toLowerCase();
    if (email) {
      if (seenEmail.has(email)) return i;
      seenEmail.add(email);
      continue;
    }
    // No email: compare on the full name, and ONLY against other emailless rows.
    const name = `${String(a.firstName ?? '').trim()} ${String(a.lastName ?? '').trim()}`
      .trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name) continue; // an empty slot is not a duplicate of another empty slot
    if (seenNamelessName.has(name)) return i;
    seenNamelessName.add(name);
  }
  return -1;
}
