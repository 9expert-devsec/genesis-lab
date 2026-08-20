import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNamedAttendee,
  rosterState,
  rosterHasRoom,
  firstDuplicateAttendee,
} from '@/lib/registrations/attendeeInfo';

/**
 * THE ROSTER, AT ITS FUNCTIONS.
 *
 * ── THIS FILE COVERED TWO QUESTIONS AND NOW COVERS ONE ────────────────────
 * The module's premise was that "is this ROW complete" and "is this
 * REGISTRATION's roster complete" are different questions, answered by two
 * derivations three inches apart on one page. Round 8 DELETED the first: its
 * definition of complete was all four attendee fields, and email and phone
 * became optional, so it would have reported every valid two-field row as
 * deficient. See lib/registrations/attendeeInfo.
 *
 * What remains is the roster question plus the two rules round 8 added to it —
 * the seat lock (`rosterHasRoom`) and the duplicate rule
 * (`firstDuplicateAttendee`). Both are per-REGISTRATION, so this file is
 * coherent rather than half-empty.
 *
 * Pure tier: the module imports nothing, so it loads here with nothing stubbed.
 */

const FULL  = { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '0812345678' };
const EMPTY = { firstName: '', lastName: '', email: '', phone: '' };

/*
 * ── SECTION 1 IS DELETED WITH ITS SUBJECT. ROUND 8. ────────────────────────
 *
 * Eight tests covered `attendeeInfoState` and `missingAttendeeFields` — the
 * per-ATTENDEE question. Both functions are gone: their definition of "complete"
 * was all FOUR fields, and round 8 made email and phone optional on the admin
 * path, so a valid row would have been reported `partial` forever. See the note
 * in lib/registrations/attendeeInfo for why re-pointing them was rejected.
 *
 * WHAT WENT WITH THEM, named rather than silently dropped:
 *   · all four fields present → complete; none → empty; one missing → partial
 *   · every single-field-missing case, so a guard on `email` could not be
 *     silent about `phone`
 *   · whitespace is not a value
 *   · a malformed attendee object does not throw
 *   · it does NOT validate — a malformed email is still a filled field
 *
 * THE LAST TWO CARRIED CLAIMS THAT OUTLIVE THE FUNCTIONS, and both are now the
 * server's rather than a display derivation's:
 *   · whitespace — `updateRegistration` refuses on `!a.firstName?.trim()`, so
 *     a space bar is still not a name. Pinned in fs/rosterSeatLock.
 *   · presence-not-validation — the admin path checks presence only and the
 *     customer form's zod remains the only thing entitled to an opinion about
 *     the SHAPE of an email. Pinned in fs/rosterSeatLock's asymmetry tests,
 *     which assert the wizard still carries `.email(` and `thaiPhoneRegex`.
 *
 * Nothing was retained under a new name and nothing is being quietly kept alive.
 */

// ── 2. The roster state: all four branches ──────────────────────────────────

test('an opted-out roster is not-provided regardless of the numbers', () => {
  // `buildAttendees` writes an EMPTY array in this state, so there is nothing to
  // be complete against and the count is not a denominator.
  const r = rosterState({ attendeesListProvided: false, attendeesCount: 3, attendees: [] });
  assert.equal(r.state, 'not-provided');
  assert.equal(r.count, 3);
  assert.equal(r.named, 0);
});

test('as many named rows as declared is complete', () => {
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, FULL] });
  assert.deepEqual(r, { state: 'complete', named: 2, count: 2 });
});

test('fewer named rows than declared is incomplete', () => {
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 3, attendees: [FULL] });
  assert.deepEqual(r, { state: 'incomplete', named: 1, count: 3 });
});

test('MORE named rows than declared is `over` — the fourth state now exists', () => {
  /**
   * ══ RE-POINTED IN ROUND 8, AND THE OLD RULING IS WITHDRAWN ON PURPOSE ══════
   *
   * This test used to read "MORE named rows than declared is complete, not an
   * error", and its comment said `named >= count` rather than `===` so that an
   * over-capacity roster "reads as complete rather than as some fourth state
   * nobody has designed".
   *
   * SOMEBODY HAS NOW DESIGNED IT. Round 8 makes the roster's not exceeding
   * `attendeesCount` a rule, and a derivation that reports the breach with the
   * same word as compliance cannot drive a screen that shows it.
   *
   * ── THE OLD ASSERTION WAS TRUE AND HID A LIVE DEFECT ─────────────────────
   * Not a hypothetical fourth state: measured against production before the rule
   * was written, ONE of 39 public registrations holds 2 attendees against a
   * count of 1. It reported `complete` for as long as this test asserted it
   * should. See scripts/_probe-roster-over-capacity.mjs.
   */
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, FULL, FULL] });
  assert.equal(r.state, 'over');
  assert.equal(r.named, 3);
  assert.equal(r.count, 2);
});

test('`complete` is now STRICT — exactly as many names as seats', () => {
  // The other half of the split. Without this, `over` could have been introduced
  // by a bug that reported it for the EXACT case too, and every assertion above
  // would still pass.
  const exact = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, FULL] });
  assert.equal(exact.state, 'complete');
  const under = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL] });
  assert.equal(under.state, 'incomplete');
});

test('the production shape reproduces: 2 named against a count of 1', () => {
  // The exact record the probe found, as a fixture. A rule written for a state
  // nobody has an example of is a rule nobody has tested.
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 1, attendees: [FULL, FULL] });
  assert.deepEqual(r, { state: 'over', named: 2, count: 1 });
});

// ── The seat lock's question ────────────────────────────────────────────────

test('rosterHasRoom says no at capacity and beyond, yes below it', () => {
  const room = (count, n) => rosterHasRoom({
    attendeesListProvided: true, attendeesCount: count, attendees: Array(n).fill(FULL),
  });
  assert.equal(room(3, 1), true,  'a roster below capacity has room');
  assert.equal(room(3, 2), true);
  assert.equal(room(3, 3), false, 'a full roster has no room');
  assert.equal(room(1, 2), false, 'an ALREADY-OVER roster has no room — it does not get more');
});

test('a document with no attendeesCount is not locked out of gaining a name', () => {
  /**
   * The degenerate shape, and it is real: `attendeesCount` is `required` with a
   * default of 1, and ONE production record has it missing entirely. Without the
   * `count <= 0` guard `0 >= 0` would be "full" and that record could never gain
   * an attendee — a rule locking a document out of being fixed.
   */
  assert.equal(rosterHasRoom({ attendeesListProvided: true, attendees: [] }), true);
  assert.equal(rosterHasRoom({ attendeesListProvided: true, attendeesCount: 0, attendees: [FULL] }), true);
});

test('an opted-out roster still has room — nothing to be full of', () => {
  // `attendeesListProvided: false` means buildAttendees wrote an EMPTY array, so
  // the coordinator can still start listing people later.
  assert.equal(rosterHasRoom({ attendeesListProvided: false, attendeesCount: 3, attendees: [] }), true);
});

// ── The duplicate rule ──────────────────────────────────────────────────────

const person = (over = {}) => ({ firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '08', ...over });

test('the same EMAIL twice is a duplicate, whatever the names say', () => {
  // Email is the only identifier the record carries, so it wins outright — two
  // rows with one address are one person entered twice even if the names differ
  // (a married name, a typo, a nickname).
  const rows = [person(), person({ firstName: 'สมหญิง', lastName: 'ดีใจ' })];
  assert.equal(firstDuplicateAttendee(rows), 1);
});

test('email comparison is trimmed and case-insensitive', () => {
  // The customer path lowercases and so does updateRegistration, but a legacy
  // row may hold either — so the comparison cannot assume normalisation.
  assert.equal(firstDuplicateAttendee([person({ email: 'A@B.C' }), person({ email: ' a@b.c ' })]), 1);
});

test('two DIFFERENT people are not a duplicate', () => {
  // Without this, a rule that returned 1 for everything would satisfy the tests
  // above and block every roster of more than one person.
  assert.equal(firstDuplicateAttendee([person(), person({ email: 'c@d.e' })]), -1);
  assert.equal(firstDuplicateAttendee([person()]), -1);
  assert.equal(firstDuplicateAttendee([]), -1);
});

test('with NO email, the same full name is a duplicate', () => {
  /**
   * The case round 8 created by making email optional. Matching on nothing would
   * make the rule bypassable by clearing a field and would permit unlimited
   * identical blank rows.
   */
  const rows = [person({ email: '' }), person({ email: '' })];
  assert.equal(firstDuplicateAttendee(rows), 1);
});

test('a row WITH an email never collides with a row without one', () => {
  /**
   * The deliberate narrowing. The two are distinguishable in the record, and
   * treating them as the same would block the ordinary flow of adding a name now
   * and its email later — on the very screen whose job is filling gaps in.
   */
  assert.equal(firstDuplicateAttendee([person(), person({ email: '' })]), -1);
  assert.equal(firstDuplicateAttendee([person({ email: '' }), person()]), -1);
});

test('two DIFFERENT emailless people are not a duplicate', () => {
  assert.equal(firstDuplicateAttendee([
    person({ email: '' }),
    person({ email: '', firstName: 'สมหญิง' }),
  ]), -1);
});

test('an empty SLOT is not a duplicate of another empty slot', () => {
  /**
   * The + button appends four empty strings. Two untouched slots would otherwise
   * collide on the empty name and refuse a save the admin has not made yet —
   * the validator firing on the act of making room to type.
   */
  const blank = { firstName: '', lastName: '', email: '', phone: '' };
  assert.equal(firstDuplicateAttendee([blank, blank, blank]), -1);
});

test('THE COORDINATOR SEAT: attendees[0] being the coordinator is NOT a duplicate', () => {
  /**
   * ── BOTH DIRECTIONS OF THE CASE THE BRIEF NAMES ───────────────────────────
   *
   * When `coordinator.isAttending` is true, `buildAttendees` copies the
   * coordinator into `attendees[0]` — so their email is legitimately IN the
   * roster, once. The rule must not fire on that, or every attending
   * coordinator's registration would be unsaveable.
   *
   * It must fire when that same person is added a SECOND time, which is the
   * commonest way this duplicate actually happens: the admin does not realise
   * the coordinator already occupies a seat.
   *
   * The rule is `within the attendees array`, so both fall out of one check
   * rather than needing a coordinator-shaped exception.
   */
  const coordinator = person({ email: 'coord@x.co' });
  assert.equal(firstDuplicateAttendee([coordinator]), -1,
    'the coordinator occupying their own seat reads as a duplicate');
  assert.equal(firstDuplicateAttendee([coordinator, person({ email: 'other@x.co' })]), -1,
    'the coordinator plus a second person reads as a duplicate');
  assert.equal(firstDuplicateAttendee([coordinator, { ...coordinator }]), 1,
    'the coordinator added twice is NOT caught — the commonest form of this mistake');
});

test('the INDEX returned is the second occurrence, so the message can name it', () => {
  // A boolean would leave the error saying "there is a duplicate somewhere" on a
  // roster of up to 50. The index is what lets it say which row.
  const rows = [person({ email: 'a@x' }), person({ email: 'b@x' }), person({ email: 'a@x' })];
  assert.equal(firstDuplicateAttendee(rows), 2, 'the FIRST occurrence was blamed instead of the second');
});

test('`attendeesListProvided` undefined behaves as provided', () => {
  // The model defaults it to true, and a legacy document may not carry it at
  // all. Only an explicit `false` means the coordinator opted out — a missing
  // field must not silently claim they did.
  const r = rosterState({ attendeesCount: 1, attendees: [FULL] });
  assert.equal(r.state, 'complete');
});

// ── 3. Membership is not completeness ───────────────────────────────────────
//
// This section was "the two questions genuinely differ", and four of its five
// tests compared `rosterState` against `attendeeInfoState` — a comparison with
// only one side left. They are not retained under new names.
//
// WHAT SURVIVES IS THE HALF THAT WAS NEVER ABOUT THE CHIP: `isNamedAttendee`
// decides who COUNTS toward the roster, and it is deliberately not "has every
// field". That claim now stands on its own terms rather than by contrast, and
// it matters MORE than it did — email and phone are optional, so rows with two
// fields are ordinary and must still count as people.

test('a row counts toward the roster on a name OR an email, never on how full it is', () => {
  /**
   * ── RE-POINTED, AND THE ARGUMENT CHANGED UNDER IT ─────────────────────────
   * This used to read "not on completeness", where completeness meant
   * `attendeeInfoState`. With that gone the claim is stated directly: membership
   * is identity, not richness. A person with a name and no contact details is a
   * person on a roster.
   *
   * The old wording justified it by pointing at the per-attendee chip — "which is
   * precisely what the chip is for". That justification is gone with the chip;
   * the rule is not, and its reason is now simply that a seat is occupied by
   * whoever is in it.
   */
  assert.ok(isNamedAttendee({ ...EMPTY, firstName: 'สมชาย' }));
  assert.ok(isNamedAttendee({ ...EMPTY, lastName: 'ใจดี' }));
  assert.ok(isNamedAttendee({ ...EMPTY, email: 'a@b.c' }));
  // A phone alone is a fragment somebody started, not a person on a roster.
  assert.equal(isNamedAttendee({ ...EMPTY, phone: '0812345678' }), false);
  assert.equal(isNamedAttendee(EMPTY), false);
  assert.equal(isNamedAttendee(undefined), false);
});

test('a two-field row still occupies a seat — the case round 8 made ordinary', () => {
  /**
   * THE ASSERTION THE DELETION MADE NECESSARY. Before round 8 every stored row
   * had all four fields, so "does a two-field row count" was a question about a
   * shape the customer form could not produce. The admin path can now produce it
   * deliberately, and if `isNamedAttendee` had ever been tightened to "complete"
   * the seat lock would have miscounted every such roster — letting a full one
   * accept more names.
   */
  const nameOnly = { firstName: 'ปรีชา', lastName: 'ตั้งใจ', email: '', phone: '' };
  assert.ok(isNamedAttendee(nameOnly));
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, nameOnly] });
  assert.equal(r.state, 'complete', 'a two-field row did not count toward the roster');
  assert.equal(r.named, 2);
  assert.equal(rosterHasRoom({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, nameOnly] }),
    false, 'the seat lock would let a full roster take another name');
});

test('CONTROL: membership and "has every field" are genuinely different counts', () => {
  /**
   * If `isNamedAttendee` were ever tightened to require all four, this array
   * would give the same number both ways and the test above would be vacuous.
   * The second count is written out HERE rather than imported, because the
   * function that used to supply it is deleted — and a control that depends on
   * the thing it is controlling for is not a control.
   */
  const rows = [FULL, { ...FULL, phone: '' }, EMPTY];
  const named = rows.filter(isNamedAttendee).length;
  const allFour = rows.filter((a) =>
    ['firstName', 'lastName', 'email', 'phone'].every((f) => String(a?.[f] ?? '').trim() !== '')).length;
  assert.equal(named, 2);
  assert.equal(allFour, 1);
  assert.notEqual(named, allFour, 'membership has collapsed into completeness');
});

test('the `not-provided` state means the array is EMPTY, not that rows are thin', () => {
  /**
   * Kept, with its subject narrowed. The old version proved `not-provided` had
   * no per-attendee counterpart by enumerating `attendeeInfoState`'s branches.
   * What it was really pinning is that `not-provided` is a statement about the
   * REGISTRATION — the coordinator opted out and `buildAttendees` wrote an empty
   * array — and cannot be inferred from any row, because there are none.
   */
  const optedOut = rosterState({ attendeesListProvided: false, attendeesCount: 2, attendees: [] });
  assert.equal(optedOut.state, 'not-provided');
  assert.equal(optedOut.named, 0, 'there are rows in a state whose whole meaning is that there are none');

  // …and a roster of THIN rows is not the same state. It is `complete`, because
  // two people are named; their fields are not this derivation's question.
  const thin = { firstName: 'ก', lastName: 'ข', email: '', phone: '' };
  const stated = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [thin, thin] });
  assert.equal(stated.state, 'complete', 'thin rows were mistaken for an opted-out roster');
});
