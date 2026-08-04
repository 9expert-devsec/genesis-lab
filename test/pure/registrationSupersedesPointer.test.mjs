import { test } from 'node:test';
import assert from 'node:assert/strict';
import RegisterPublic from '@/models/RegisterPublic';
import {
  asRegistrationPointer,
  buildAttendees,
  buildPaidRegistration,
} from '@/lib/registration/build-public';
import { consentFanOut } from '@/components/payment/consent';
import { computePricing } from '@/lib/pricing';

// `supersedesRegistrationId` records that a document came from "สร้าง QR ใหม่",
// so a human reading the orphan audit can tell a regenerate from a genuine
// second booking. It is an ANNOTATION: client-supplied, shape-checked only,
// never resolved. These pin the two properties that matter —
//   1. it is set only when the regenerate path sends one, and
//   2. a malformed value is dropped WITHOUT costing the customer the charge.
//
// buildPaidRegistration is the exact object the charge route hands to
// RegisterPublic.create(), so this asserts what gets WRITTEN, without a database.

const DATA = {
  courseId: 'DA-PBI',
  courseCode: 'DA-PBI',
  courseName: 'Power BI Essentials',
  classId: 'sch-1',
  classDate: '10-11 ส.ค. 2569',
  scheduleType: 'classroom',
  coordinator: {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    email: 'somchai@example.com',
    phone: '0812345678',
    isAttending: false,
  },
  attendeesCount: 1,
  attendeesListProvided: false,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: '',
};

const PRICING = computePricing(10000, 1);
const VALID = '6a2fa84db2f2e65609a619bc'; // a real _id shape from the audit output

const paidDoc = (supersedesRegistrationId) =>
  buildPaidRegistration({
    data: DATA,
    attendees: buildAttendees(DATA),
    pricing: PRICING,
    method: 'promptpay',
    consent: consentFanOut(true),
    ipAddress: '203.0.113.9',
    supersedesRegistrationId,
  });

/**
 * Values that must never be stored. The object and array forms are how a Mongo
 * query-operator injection arrives over JSON — if this ever became a lookup key
 * those are what would reach the query.
 */
const GARBAGE = [
  ['too short (23 hex)', '6a2fa84db2f2e65609a619b'],
  ['too long (25 hex)', '6a2fa84db2f2e65609a619bcd'],
  ['non-hex characters', '6a2fa84db2f2e65609a619bZ'],
  ['sql-ish text', "'; DROP TABLE --"],
  ['empty string', ''],
  ['whitespace only', '   '],
  ['a number', 1234567890],
  ['a query operator object', { $ne: null }],
  ['an array', [VALID]],
  ['a boolean', true],
];

// ── 1. Default: nothing sets it ─────────────────────────────────────────────

test('the model defaults supersedesRegistrationId to null', () => {
  const doc = new RegisterPublic({
    courseId: 'DA-PBI',
    classId: 'sch-1',
    coordinator: DATA.coordinator,
  });
  assert.equal(doc.supersedesRegistrationId, null);
});

test('CONTROL: the model DOES store the field when one is given', () => {
  // Without this, the default test would also pass for a schema that dropped
  // the field entirely and read back undefined.
  const doc = new RegisterPublic({
    courseId: 'DA-PBI',
    classId: 'sch-1',
    coordinator: DATA.coordinator,
    supersedesRegistrationId: VALID,
  });
  assert.equal(doc.supersedesRegistrationId, VALID);
});

test('a normal charge does not set supersedesRegistrationId', () => {
  assert.equal(paidDoc(undefined).supersedesRegistrationId, null, 'argument omitted');
  assert.equal(paidDoc(null).supersedesRegistrationId, null, 'argument explicitly null');
});

test('CONTROL: the same field IS set when the regenerate path sends one', () => {
  // Proves the "normal charge" assertion reads a field that can hold a value.
  assert.equal(paidDoc(VALID).supersedesRegistrationId, VALID);
});

// ── 2. A regenerate persists a valid pointer ────────────────────────────────

test('a regenerate carrying a valid pointer persists it verbatim', () => {
  assert.equal(paidDoc(VALID).supersedesRegistrationId, VALID);
});

test('a valid pointer is accepted in either hex case, unchanged', () => {
  const upper = VALID.toUpperCase();
  assert.equal(paidDoc(upper).supersedesRegistrationId, upper, 'not lower-cased');
  assert.equal(paidDoc(VALID).supersedesRegistrationId, VALID, 'not upper-cased');
});

test('surrounding whitespace is trimmed rather than rejected', () => {
  assert.equal(paidDoc(`  ${VALID}  `).supersedesRegistrationId, VALID);
});

// ── 3. Malformed pointers are dropped, the registration survives ────────────

for (const [label, value] of GARBAGE) {
  test(`malformed pointer (${label}) is dropped to null`, () => {
    assert.equal(paidDoc(value).supersedesRegistrationId, null);
  });

  test(`CONTROL (${label}): the garbage is not stored under any guise`, () => {
    // THE control the malformed case needs: if the route persisted the input
    // instead of null, `null` could still be reported by a sloppy read. Assert
    // the stored value is not the input, in string or raw form.
    const stored = paidDoc(value).supersedesRegistrationId;
    assert.notDeepEqual(stored, value, 'raw input must not survive');
    assert.notEqual(stored, String(value), 'stringified input must not survive');
  });
}

test('CONTROL: that not-stored assertion CAN fail — a valid pointer does survive', () => {
  // The paired positive. If asRegistrationPointer started returning its input
  // unconditionally, every "is dropped" test above would go red and this stays
  // green; if it started returning null unconditionally, this goes red. The two
  // directions together pin the behaviour.
  const stored = paidDoc(VALID).supersedesRegistrationId;
  assert.deepEqual(stored, VALID);
});

test('a malformed pointer does not disturb the rest of the document', () => {
  // "…and the registration is still created": every other field is byte-for-byte
  // what a charge with no pointer at all would have written.
  const strip = ({ supersedesRegistrationId, consent, ...rest }) => rest;
  for (const [label, value] of GARBAGE) {
    assert.deepEqual(strip(paidDoc(value)), strip(paidDoc(null)), `${label} left the doc intact`);
  }
});

test('CONTROL: that comparison can see a difference', () => {
  // If `strip` removed too much, the deepEqual above would hold for any two
  // documents. Change a real field and it must fail.
  const strip = ({ supersedesRegistrationId, consent, ...rest }) => rest;
  const other = buildPaidRegistration({
    data: { ...DATA, attendeesCount: 3 },
    attendees: buildAttendees(DATA),
    pricing: PRICING,
    method: 'credit_card',
    consent: consentFanOut(true),
    ipAddress: '203.0.113.9',
  });
  assert.notDeepEqual(strip(paidDoc(null)), strip(other));
});

test('a charge with a garbage pointer still carries pricing, payment and consent', () => {
  const doc = paidDoc({ $ne: null });
  assert.equal(doc.pricing, PRICING, 'pricing snapshot survives');
  assert.equal(doc.payment.method, 'promptpay', 'payment method survives');
  assert.equal(doc.payment.omiseStatus, 'pending');
  assert.equal(doc.consent.accepted, true, 'consent survives');
  assert.equal(doc.status, 'pending');
});

// ── 4. asRegistrationPointer on its own ─────────────────────────────────────

test('asRegistrationPointer accepts exactly 24 hex characters', () => {
  assert.equal(asRegistrationPointer(VALID), VALID);
  assert.equal(asRegistrationPointer('0'.repeat(24)), '0'.repeat(24));
  assert.equal(asRegistrationPointer('f'.repeat(24)), 'f'.repeat(24));
});

test('CONTROL: 23 and 25 hex characters are both refused', () => {
  // Pins the length check to exactly 24 rather than "at least 24".
  assert.equal(asRegistrationPointer('a'.repeat(23)), null);
  assert.equal(asRegistrationPointer('a'.repeat(25)), null);
});

test('asRegistrationPointer refuses every non-string type', () => {
  for (const v of [undefined, null, 0, 1, true, false, {}, [], () => {}, Symbol('x')]) {
    assert.equal(asRegistrationPointer(v), null, `${String(v)} must not pass`);
  }
});
