import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttendees,
  buildConsentRecord,
  buildQuoteRegistration,
} from '@/lib/registration/build-public';
import { consentFanOut } from '@/components/payment/consent';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';

// The quote route used to drop consent on the floor: RegisterPublic.create()
// simply never named the field, so the model's `default: null` won. Step 2 now
// shows a consent checkbox on the quote path, so what the customer ticks has to
// survive to Mongo.
//
// buildQuoteRegistration is the exact object the route hands to
// RegisterPublic.create(), so these assert what gets WRITTEN — one function
// call away from the database, with no database.

const BODY = {
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

const FLAGS = ['dataChecked', 'noRefund', 'changePolicy', 'termsAccepted'];

/** Run a raw body through the real schema, then through the route's builder. */
function docFor(body) {
  const parsed = publicRegistrationSchema.safeParse(body);
  assert.equal(
    parsed.success,
    true,
    `fixture must validate: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`,
  );
  const data = parsed.data;
  return buildQuoteRegistration({
    data,
    attendees: buildAttendees(data),
    ipAddress: '203.0.113.9',
  });
}

// ── The gap this closes ─────────────────────────────────────────────────────

test('a quote submission carrying consent writes all four booleans true', () => {
  const doc = docFor({ ...BODY, consent: consentFanOut(true) });
  for (const flag of FLAGS) {
    assert.equal(doc.consent[flag], true, `${flag} must be persisted as true`);
  }
});

test('a quote submission carrying consent writes a non-null acceptedAt', () => {
  const doc = docFor({ ...BODY, consent: consentFanOut(true) });
  assert.notEqual(doc.consent.acceptedAt, null);
  assert.ok(doc.consent.acceptedAt instanceof Date, 'acceptedAt is a Date');
  assert.equal(Number.isNaN(doc.consent.acceptedAt.getTime()), false, 'a valid Date');
});

test('a quote submission carrying consent records accepted + the client IP', () => {
  const doc = docFor({ ...BODY, consent: consentFanOut(true) });
  assert.equal(doc.consent.accepted, true);
  assert.equal(doc.consent.ipAddress, '203.0.113.9');
});

test('CONTROL: dropping consent from the body writes consent: null', () => {
  // This is the pre-fix behaviour and the toggle-OFF path. If the assertions
  // above were reading a hard-coded record rather than the request, this would
  // also come back all-true and the fix would be untested.
  const doc = docFor(BODY);
  assert.equal(doc.consent, null, 'no checkbox shown → nothing recorded');
});

test('CONTROL: an unticked consent object is recorded as NOT accepted', () => {
  // Proves `accepted` tracks the flags instead of being pinned true.
  const doc = docFor({ ...BODY, consent: consentFanOut(false) });
  assert.equal(doc.consent.accepted, false);
  for (const flag of FLAGS) {
    assert.equal(doc.consent[flag], false, `${flag} must be persisted as false`);
  }
});

test('CONTROL: a partial consent object is recorded verbatim, not rounded up', () => {
  // The quote path is NOT covered by the schema's all-four rule, so a partial
  // set can reach the builder. It must be stored as given, with accepted false.
  for (const missing of FLAGS) {
    const doc = docFor({ ...BODY, consent: { ...consentFanOut(true), [missing]: false } });
    assert.equal(doc.consent.accepted, false, `${missing} missing → accepted false`);
    assert.equal(doc.consent[missing], false, `${missing} stored as false`);
    for (const other of FLAGS.filter((f) => f !== missing)) {
      assert.equal(doc.consent[other], true, `${other} stored as true`);
    }
  }
});

// ── The rest of the quote document is unchanged ─────────────────────────────

test('the quote document carries no pricing or payment sub-document', () => {
  const doc = docFor({ ...BODY, consent: consentFanOut(true) });
  assert.equal('pricing' in doc, false, 'a quote has no pricing snapshot');
  assert.equal('payment' in doc, false, 'a quote has no charge');
  assert.equal(doc.status, 'pending');
  assert.equal(doc.source, 'web');
});

test('adding consent did not disturb the rest of the document', () => {
  const withConsent = docFor({ ...BODY, consent: consentFanOut(true) });
  const without = docFor(BODY);
  const strip = ({ consent, ...rest }) => rest;
  assert.deepEqual(strip(withConsent), strip(without), 'only `consent` differs');
});

test('CONTROL: that comparison can see a difference', () => {
  // If `strip` removed too much, the deepEqual above would pass for any two
  // documents. Change a real field and it must fail.
  const a = docFor({ ...BODY, consent: consentFanOut(true) });
  const b = docFor({ ...BODY, attendeesCount: 3 });
  const strip = ({ consent, ...rest }) => rest;
  assert.notDeepEqual(strip(a), strip(b));
});

// ── buildConsentRecord in isolation ─────────────────────────────────────────

test('buildConsentRecord returns null for null/undefined consent', () => {
  assert.equal(buildConsentRecord(null, '1.2.3.4'), null);
  assert.equal(buildConsentRecord(undefined, '1.2.3.4'), null);
});

test('buildConsentRecord coerces non-boolean truthiness to real booleans', () => {
  const rec = buildConsentRecord({
    dataChecked: 1,
    noRefund: 'yes',
    changePolicy: {},
    termsAccepted: true,
  });
  for (const flag of FLAGS) {
    assert.equal(rec[flag], true, `${flag} coerced to boolean true`);
    assert.equal(typeof rec[flag], 'boolean', `${flag} is a boolean, not truthy`);
  }
});

test('CONTROL: falsy values coerce to false, not dropped', () => {
  const rec = buildConsentRecord({ dataChecked: 0, noRefund: '', changePolicy: null });
  for (const flag of FLAGS) {
    assert.equal(rec[flag], false, `${flag} coerced to boolean false`);
    assert.equal(typeof rec[flag], 'boolean', `${flag} is a boolean, not undefined`);
  }
});
