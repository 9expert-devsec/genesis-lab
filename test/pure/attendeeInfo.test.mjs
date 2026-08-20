import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTENDEE_FIELDS,
  attendeeInfoState,
  missingAttendeeFields,
  isNamedAttendee,
  rosterState,
  rosterHasRoom,
  firstDuplicateAttendee,
} from '@/lib/registrations/attendeeInfo';

/**
 * THE TWO ATTENDEE QUESTIONS, AT THEIR FUNCTIONS.
 *
 * The module's premise is that "is this ROW complete" and "is this REGISTRATION's
 * roster complete" are different questions that had started to be answered by
 * two independent derivations three inches apart on one page. These tests pin
 * both, and pin the disagreements between them — because the day they stop being
 * able to disagree is the day one of them is wrong.
 *
 * Pure tier: the module imports nothing, so it loads here with nothing stubbed.
 */

const FULL  = { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '0812345678' };
const EMPTY = { firstName: '', lastName: '', email: '', phone: '' };

// ── 1. The per-attendee state: all three branches ───────────────────────────

test('a row with all four fields is complete', () => {
  assert.equal(attendeeInfoState(FULL), 'complete');
  assert.deepEqual(missingAttendeeFields(FULL), []);
});

test('a row with none of the four is empty', () => {
  assert.equal(attendeeInfoState(EMPTY), 'empty');
  assert.deepEqual(missingAttendeeFields(EMPTY), ATTENDEE_FIELDS);
});

test('EVERY single-field-missing row is partial, and names the field it lacks', () => {
  // Not one representative case: each of the four fields must be able to be the
  // missing one, or a guard written against `email` would be silent about a
  // missing `phone`.
  for (const field of ATTENDEE_FIELDS) {
    const row = { ...FULL, [field]: '' };
    assert.equal(attendeeInfoState(row), 'partial', `a row missing ${field} is not partial`);
    assert.deepEqual(missingAttendeeFields(row), [field]);
  }
});

test('a row with exactly one field filled is partial, not empty', () => {
  for (const field of ATTENDEE_FIELDS) {
    const row = { ...EMPTY, [field]: 'x' };
    assert.equal(attendeeInfoState(row), 'partial', `a row holding only ${field} is not partial`);
  }
});

test('whitespace is not a value', () => {
  // The admin editor writes what was typed. A space bar is not a phone number,
  // and treating it as one would report a row complete that a certificate cannot
  // be printed from.
  assert.equal(attendeeInfoState({ ...FULL, phone: '   ' }), 'partial');
  assert.equal(attendeeInfoState({ firstName: ' ', lastName: '\t', email: '', phone: '' }), 'empty');
});

test('a missing or malformed attendee object does not throw', () => {
  // `attendees` comes off a lean() document; a legacy row could be anything.
  assert.equal(attendeeInfoState(undefined), 'empty');
  assert.equal(attendeeInfoState(null), 'empty');
  assert.equal(attendeeInfoState({}), 'empty');
});

test('it does NOT validate — a malformed email is still a filled field', () => {
  /**
   * Presence only, deliberately. `partial` means "an admin started this row and
   * stopped"; making it also mean "this email is not RFC-shaped" would put a
   * validation rule in a display derivation, and the customer form's zod schema
   * is the only thing entitled to an opinion about the shape of an email.
   */
  assert.equal(attendeeInfoState({ ...FULL, email: 'not-an-email' }), 'complete');
  assert.equal(attendeeInfoState({ ...FULL, phone: '1' }), 'complete');
});

// ── 2. The roster state: all three branches ─────────────────────────────────

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

// ── 3. The two questions genuinely differ ───────────────────────────────────

test('a COMPLETE roster can hold an INCOMPLETE attendee', () => {
  /**
   * The disagreement that makes the split necessary. Both people are on the
   * list, so the roster is `ครบ 2/2`; one of them has no phone number, so that
   * row's chip says ข้อมูลไม่ครบ. A single derivation would have to answer both
   * and would be wrong about one of them.
   */
  const partial = { ...FULL, phone: '' };
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, partial] });
  assert.equal(r.state, 'complete');
  assert.equal(attendeeInfoState(partial), 'partial');
});

test('an INCOMPLETE roster can hold only COMPLETE attendees', () => {
  // The other direction: one person named against a declared three, and that
  // person's record is perfect.
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 3, attendees: [FULL] });
  assert.equal(r.state, 'incomplete');
  assert.equal(attendeeInfoState(FULL), 'complete');
});

test('a row counts toward the roster on a name OR an email, not on completeness', () => {
  /**
   * `isNamedAttendee` is deliberately NOT `state === 'complete'`. An attendee
   * with a name and no phone IS a named attendee, and counting them as missing
   * would make a registration read `ยังไม่ครบ 1/2` when both people are on the
   * list and one is short a field — which is precisely what the per-attendee
   * chip is for.
   */
  assert.ok(isNamedAttendee({ ...EMPTY, firstName: 'สมชาย' }));
  assert.ok(isNamedAttendee({ ...EMPTY, lastName: 'ใจดี' }));
  assert.ok(isNamedAttendee({ ...EMPTY, email: 'a@b.c' }));
  // A phone alone is a fragment somebody started, not a person on a roster.
  assert.equal(isNamedAttendee({ ...EMPTY, phone: '0812345678' }), false);
  assert.equal(isNamedAttendee(EMPTY), false);
  assert.equal(isNamedAttendee(undefined), false);
});

test('CONTROL: the roster count and the completeness count are different numbers', () => {
  // If `isNamedAttendee` ever became "all four fields", this array would produce
  // the same number both ways and every disagreement test above would be vacuous.
  const rows = [FULL, { ...FULL, phone: '' }, EMPTY];
  const named = rows.filter(isNamedAttendee).length;
  const complete = rows.filter((a) => attendeeInfoState(a) === 'complete').length;
  assert.equal(named, 2);
  assert.equal(complete, 1);
  assert.notEqual(named, complete, 'the two counts agree — the split is no longer doing anything');
});

test('the `not-provided` state has NO per-attendee counterpart', () => {
  /**
   * The clearest evidence the two questions differ, asserted rather than argued.
   * `attendeeInfoState` has three branches and none of them is `not-provided` —
   * that state means the ARRAY IS EMPTY, so there is no row to ask about.
   */
  const states = new Set([FULL, { ...FULL, phone: '' }, EMPTY].map(attendeeInfoState));
  assert.deepEqual([...states].sort(), ['complete', 'empty', 'partial']);
  assert.ok(!states.has('not-provided'), 'a per-attendee state claims a per-registration one');

  const optedOut = rosterState({ attendeesListProvided: false, attendeesCount: 2, attendees: [] });
  assert.equal(optedOut.state, 'not-provided');
  assert.equal(optedOut.named, 0, 'there are rows in a state whose whole meaning is that there are none');
});
