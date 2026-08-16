import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTENDEE_FIELDS,
  attendeeInfoState,
  missingAttendeeFields,
  isNamedAttendee,
  rosterState,
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

test('MORE named rows than declared is complete, not an error', () => {
  // An admin can add rows past the declared count. `named >= count` rather than
  // `===`, so a registration with three people against a declared two reads as
  // complete rather than as some fourth state nobody has designed.
  const r = rosterState({ attendeesListProvided: true, attendeesCount: 2, attendees: [FULL, FULL, FULL] });
  assert.equal(r.state, 'complete');
  assert.equal(r.named, 3);
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
