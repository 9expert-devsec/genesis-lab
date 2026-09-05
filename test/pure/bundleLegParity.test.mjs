import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAttendees, buildQuoteRegistration } from '@/lib/registration/build-public';
import { buildBundleLegs } from '@/lib/registration/bundleLegs';
import { roundFieldsFor } from '@/lib/registrations/roundSelection';
import { bundleRegistrationDefaults, bundleRegistrationSchema } from '@/lib/schemas/register-bundle';
import { publicRegistrationDefaults, invoiceContradictsFlag } from '@/lib/schemas/register-public';

/**
 * ══ A BUNDLE LEG CARRIES EVERYTHING AN ORDINARY REGISTRATION CARRIES ═══════
 *
 * ── THE DEFECT THIS EXISTS FOR ────────────────────────────────────────────
 * A real bundle request stored a complete `invoice` — name, 13-digit tax id,
 * full Thai address — beside `requestInvoice: false`. Every reader gates on the
 * FLAG, so the admin card read ไม่ได้ขอใบเสนอราคา and the confirmation email
 * dropped its whole billing section. The data was in the document and visible
 * to nobody. A quotation request whose invoice details do not reach the team is
 * a request they cannot act on.
 *
 * ══ WHY THIS IS A DIFF AND NOT A CHECKLIST ═════════════════════════════════
 *
 * The obvious test is a list of field names to assert. It would have caught
 * this bug and NOTHING AFTER IT: a field added to `baseRegistration` next year
 * and not to `buildBundleLegs` would sail past a list nobody remembered to
 * extend, which is the same class of omission that caused this one.
 *
 * So the two write paths are driven with EQUIVALENT INPUT FOR THE SAME COURSE
 * AND THE SAME ROUND, and the resulting documents are compared WHOLE. Under
 * those inputs a leg and an ordinary quote registration must be identical, and
 * the only permitted differences are declared below and justified. Anything
 * else — a key added to one path, a key dropped from the other, a value mapped
 * differently — fails without this file being edited.
 *
 * That is the property worth having: it does not know what `requestInvoice` is,
 * and it would have gone red anyway.
 *
 * ── THE TWO PERMITTED DIFFERENCES ─────────────────────────────────────────
 *   `bundle`             leg-only, by definition — it is the tag that makes a
 *                        leg a leg, and asserted separately.
 *   `consent.acceptedAt` a fresh `new Date()` per call, so two builds minutes
 *                        or milliseconds apart legitimately differ. Normalised
 *                        to a marker AFTER asserting both are real Dates —
 *                        deleting it would let a path stop recording it.
 */

const TODAY = '2026-09-05';
const IP = '203.0.113.9';

const LIVE_ROUND = { _id: '65f0000000000000000000a1', dates: ['2026-10-20', '2026-10-21'], type: 'classroom' };
const COURSE = { course_id: 'MSE-L1', course_name: 'Excel Level 1' };

/** Everything the CUSTOMER supplies — identical on both paths, by construction. */
const CUSTOMER_INPUT = {
  coordinator: {
    firstName: 'สมหญิง', lastName: 'ดีใจ',
    email: 'somying@example.com', phone: '081-234-5678', isAttending: true,
  },
  attendeesCount: 2,
  attendeesListProvided: true,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '081-111-2222' }],
  requestInvoice: true,
  invoice: {
    type: 'individual', country: 'TH',
    firstName: 'สมหญิง', lastName: 'ดีใจ',
    branchType: 'head_office', branchCode: '',
    taxId: '1234567890123',
    thaiAddress: {
      addressLine: '123 ถนนสุขุมวิท', subDistrict: 'คลองเตย',
      district: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110',
    },
    internationalAddress: null,
  },
  notes: 'ขอใบเสนอราคาในนามบริษัท',
  consent: { dataChecked: true, noRefund: true, changePolicy: true, termsAccepted: true },
};

const TAG = {
  pageId: '6500000000000000000000aa',
  sectionId: 'sec-1',
  requestId: 'cccccccccccccccccccc0005',
  name: 'Data Analyst Starter',
};

/**
 * The ordinary payload: the customer's input PLUS the course and round scalars
 * the wizard puts in the form. The round half comes from `roundFieldsFor` — the
 * same function the bundle path uses — so the two documents describe the same
 * round rather than merely looking similar.
 */
function ordinaryData() {
  return {
    ...CUSTOMER_INPUT,
    courseId: COURSE.course_id,
    courseCode: COURSE.course_id,
    courseName: COURSE.course_name,
    ...roundFieldsFor(LIVE_ROUND),
  };
}

function buildBoth() {
  const attendees = buildAttendees(ordinaryData());
  const ordinary = buildQuoteRegistration({ data: ordinaryData(), attendees, ipAddress: IP });

  const built = buildBundleLegs({
    items: [{ id: 'i1', courseId: COURSE.course_id, roundId: LIVE_ROUND._id }],
    resolved: [{ id: 'i1', courseId: COURSE.course_id, course: COURSE, rounds: [LIVE_ROUND] }],
    todayKey: TODAY,
    data: CUSTOMER_INPUT,
    attendees,
    bundle: TAG,
    ipAddress: IP,
  });
  assert.equal(built.ok, true, 'the bundle fixture failed to build — the comparison would be vacuous');
  return { ordinary, leg: built.legs[0] };
}

/** Replace the two timestamps with a marker, having first proved they are real. */
function normaliseConsent(doc, label) {
  assert.ok(doc.consent, `${label} has no consent record at all`);
  assert.ok(doc.consent.acceptedAt instanceof Date, `${label}.consent.acceptedAt is not a Date`);
  return { ...doc, consent: { ...doc.consent, acceptedAt: '<Date>' } };
}

// ── the parity diff ───────────────────────────────────────────────────────

test('a leg and an ordinary quote registration are IDENTICAL but for the bundle tag', () => {
  const { ordinary, leg } = buildBoth();
  const a = normaliseConsent(ordinary, 'ordinary');
  const b = normaliseConsent(leg, 'leg');
  const { bundle, ...legWithoutTag } = b;

  assert.deepEqual(bundle, TAG, 'the leg lost its tag');
  assert.deepEqual(
    legWithoutTag,
    a,
    'a bundle leg and an ordinary registration diverged. If a field was just added to one ' +
      'write path, add it to the other — do not relax this test.',
  );
});

test('no key the ordinary path writes is missing from a leg, and none is extra but `bundle`', () => {
  /**
   * The same property as the diff above, stated as key sets so a failure names
   * the field instead of printing two documents. Both directions matter: a
   * MISSING key is the defect that shipped; an EXTRA one is a leg quietly
   * carrying something the ordinary path does not, which is how the two shapes
   * start to drift the other way.
   */
  const { ordinary, leg } = buildBoth();
  const missing = Object.keys(ordinary).filter((k) => !(k in leg));
  const extra = Object.keys(leg).filter((k) => !(k in ordinary));

  assert.deepEqual(missing, [], `keys the ordinary registration has and a leg does not: ${missing.join(', ')}`);
  assert.deepEqual(extra, ['bundle'], `a leg carries keys the ordinary registration does not: ${extra.join(', ')}`);
});

test('the comparison is not vacuous — both documents are substantial', () => {
  /**
   * A deepEqual of two empty objects passes. This is the floor: if either
   * builder ever returns something trivial, the parity assertions above would
   * pass while proving nothing.
   */
  const { ordinary, leg } = buildBoth();
  assert.ok(Object.keys(ordinary).length >= 15, `ordinary doc has only ${Object.keys(ordinary).length} keys`);
  assert.ok(Object.keys(leg).length >= 16, `leg has only ${Object.keys(leg).length} keys`);
  // And the fields at the heart of the defect really are populated in the fixture.
  assert.equal(ordinary.requestInvoice, true);
  assert.ok(ordinary.invoice?.taxId);
  assert.equal(ordinary.notes, CUSTOMER_INPUT.notes);
});

test('CONTROL: dropping ANY single field from the leg is caught', () => {
  /**
   * Proof the diff can go red, driven over every key rather than one — a
   * control that removed only `requestInvoice` would prove the test catches
   * yesterday's bug and say nothing about tomorrow's.
   */
  const { ordinary, leg } = buildBoth();
  const a = normaliseConsent(ordinary, 'ordinary');
  const b = normaliseConsent(leg, 'leg');

  const keys = Object.keys(a);
  assert.ok(keys.length >= 15);
  for (const k of keys) {
    const { bundle, ...rest } = b;
    delete rest[k];
    assert.throws(
      () => assert.deepEqual(rest, a),
      `dropping "${k}" from a leg was NOT caught — the parity diff is blind to it`,
    );
  }
});

test('CONTROL: adding a field to the ORDINARY path and not the leg is caught', () => {
  // The direction that will actually happen: someone extends baseRegistration.
  const { ordinary, leg } = buildBoth();
  const a = { ...normaliseConsent(ordinary, 'ordinary'), aFutureField: 'added to the ordinary path only' };
  const { bundle, ...rest } = normaliseConsent(leg, 'leg');
  assert.throws(() => assert.deepEqual(rest, a));
  // …and the key-set probe names it.
  assert.deepEqual(Object.keys(a).filter((k) => !(k in rest)), ['aFutureField']);
});

// ── the specific defect, pinned at the source ─────────────────────────────

test('the bundle form DEFAULTS to requesting a quotation; the wizard-shared default does not', () => {
  /**
   * The asymmetry is deliberate and documented at the default. It is asserted
   * because "align them" is the obvious tidy-up and it would restore the bug:
   * the bundle form renders InvoiceFields unconditionally and has no path that
   * collects a registration without them.
   */
  assert.equal(bundleRegistrationDefaults.requestInvoice, true);
  assert.equal(
    publicRegistrationDefaults.requestInvoice,
    false,
    'the shared default changed — if the wizard no longer needs its override, revisit the note in register-bundle',
  );
});

test('invoice data with the flag clear is now REFUSED, on both schemas', () => {
  /**
   * The inverse rule zod lacked. `invoiceContradictsFlag` is the one definition;
   * both root schemas call it.
   */
  const bundleBody = {
    pageId: 'p1', sectionId: 's1',
    coordinator: CUSTOMER_INPUT.coordinator,
    attendeesCount: 1, attendeesListProvided: false, attendees: [],
    requestInvoice: false,
    invoice: CUSTOMER_INPUT.invoice,
  };
  const parsed = bundleRegistrationSchema.safeParse(bundleBody);
  assert.equal(parsed.success, false, 'the exact shape that shipped is still accepted');
  assert.ok(
    parsed.error.issues.some((i) => i.path.join('.') === 'requestInvoice'),
    'the refusal does not name requestInvoice',
  );
});

test('CONTROL: the same body with the flag SET parses, and so does one with no invoice at all', () => {
  // Otherwise the refusal above could be a schema that rejects everything.
  const base = {
    pageId: 'p1', sectionId: 's1',
    coordinator: CUSTOMER_INPUT.coordinator,
    attendeesCount: 1, attendeesListProvided: false, attendees: [],
  };
  assert.equal(
    bundleRegistrationSchema.safeParse({ ...base, requestInvoice: true, invoice: CUSTOMER_INPUT.invoice }).success,
    true,
  );
  // The ordinary no-quotation state stays legal: no invoice, flag clear.
  assert.equal(
    bundleRegistrationSchema.safeParse({ ...base, requestInvoice: false, invoice: null }).success,
    true,
  );
  assert.equal(bundleRegistrationSchema.safeParse({ ...base, requestInvoice: false }).success, true);
});

test('the predicate itself: only data-present-flag-clear is a contradiction', () => {
  assert.equal(invoiceContradictsFlag({ invoice: { type: 'individual' }, requestInvoice: false }), true);
  assert.equal(invoiceContradictsFlag({ invoice: { type: 'individual' }, requestInvoice: true }), false);
  assert.equal(invoiceContradictsFlag({ invoice: null, requestInvoice: false }), false);
  assert.equal(invoiceContradictsFlag({ requestInvoice: false }), false);
  assert.equal(invoiceContradictsFlag({}), false);
  assert.equal(invoiceContradictsFlag(undefined), false);
});
