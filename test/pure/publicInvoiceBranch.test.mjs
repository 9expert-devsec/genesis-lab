import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';

/**
 * The public wizard's corporate invoice, Thailand: the 13-digit tax id and the
 * structured branch pair, driven through the REAL root schema rather than
 * `invoiceSchema` alone — the wizard and the API route both parse the root, and
 * a rule that only holds on the inner schema is a rule the app never runs.
 *
 * Also here: the attendee case §3.2 turns on — one attendee, who is the
 * coordinator, with an empty `attendees` array. That combination has to PASS,
 * because the UI can no longer produce an opt-out for it.
 */

const TH_ADDRESS = {
  addressLine: '1 ถนนสุขุมวิท',
  subDistrict: 'ลาดพร้าว',
  district:    'ลาดพร้าว',
  province:    'กรุงเทพมหานคร',
  postalCode:  '10230',
};

const BASE = {
  courseId: 'DA-PBI',
  classId:  'sch-sep',
  coordinator: {
    firstName: 'สมชาย',
    lastName:  'ใจดี',
    email:     'somchai@example.com',
    phone:     '0891112222',
    isAttending: true,
  },
  attendeesCount: 1,
  attendeesListProvided: true,
  attendees: [],
  requestInvoice: false,
  invoice: null,
};

const CORPORATE_TH = {
  type: 'corporate',
  country: 'TH',
  companyName: 'บริษัท ตัวอย่าง จำกัด',
  taxId: '0105556012345',
  branchType: 'head_office',
  branchCode: '',
  thaiAddress: TH_ADDRESS,
};

const withInvoice = (overrides = {}) => ({
  ...BASE,
  requestInvoice: true,
  invoice: { ...CORPORATE_TH, ...overrides },
});

const parse = (o) => publicRegistrationSchema.safeParse(o);
const paths = (r) => r.error.issues.map((i) => i.path.join('.')).sort();
const messageAt = (r, path) => r.error.issues.find((i) => i.path.join('.') === path)?.message;

// ── Corporate, Thailand ─────────────────────────────────────────────────────

test('a complete corporate TH invoice passes', () => {
  const r = parse(withInvoice());
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

test('a 12- and a 14-digit tax id both fail', () => {
  for (const taxId of ['010555601234', '01055560123456']) {
    const r = parse(withInvoice({ taxId }));
    assert.equal(r.success, false, `${taxId} should fail`);
    assert.equal(messageAt(r, 'invoice.taxId'), 'เลขประจำตัวผู้เสียภาษี 13 หลัก');
  }
});

test('a 4- and a 6-digit branch code both fail', () => {
  for (const branchCode of ['0001', '000001']) {
    const r = parse(withInvoice({ branchType: 'branch', branchCode }));
    assert.equal(r.success, false, `${branchCode} should fail`);
    assert.equal(messageAt(r, 'invoice.branchCode'), 'เลขที่สาขา 5 หลัก');
  }
});

test('a sub-branch with exactly 5 digits passes', () => {
  const r = parse(withInvoice({ branchType: 'branch', branchCode: '00001' }));
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
  assert.equal(r.data.invoice.branchCode, '00001');
});

test('THE RULING: head_office + a leftover code NORMALISES, it does not reject', () => {
  // Same decision as the in-house schema, for the same reason: the code input
  // is hidden in that state, so an error there is unreachable and unclearable.
  const r = parse(withInvoice({ branchType: 'head_office', branchCode: '00042' }));
  assert.equal(r.success, true);
  assert.equal(r.data.invoice.branchCode, '');
});

test('`branch` is STRIPPED — the legacy path is never written again', () => {
  const r = parse(withInvoice({ branch: 'สำนักงานใหญ่' }));
  assert.equal(r.success, true);
  assert.equal('branch' in r.data.invoice, false);
});

test('branchType defaults to head_office when a client omits it', () => {
  const { branchType, ...noType } = CORPORATE_TH;
  const r = parse({ ...BASE, requestInvoice: true, invoice: noType });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
  assert.equal(r.data.invoice.branchType, 'head_office');
});

test('an INDIVIDUAL TH invoice is not held to the branch rule', () => {
  // The control only renders for corporate, so validating it for an individual
  // would reject a form the user was never shown.
  const r = parse({
    ...BASE,
    requestInvoice: true,
    invoice: {
      type: 'individual', country: 'TH',
      firstName: 'สมชาย', lastName: 'ใจดี',
      taxId: '0105556012345',
      branchType: 'branch', branchCode: '',
      thaiAddress: TH_ADDRESS,
    },
  });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

// ── Corporate, elsewhere ────────────────────────────────────────────────────

test('a foreign invoice keeps FREE-TEXT branch and skips the Thai rules', () => {
  const r = parse({
    ...BASE,
    requestInvoice: true,
    invoice: {
      type: 'corporate', country: 'OTHER',
      companyName: 'ACME Pte. Ltd.',
      taxId: '',
      branchFree: 'Asia Pacific HQ',
      internationalAddress: { line1: '1 Raffles Place', line2: '#12-04', city: 'Singapore', state: '', postalCode: '048616', country: 'Singapore' },
    },
  });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
  assert.equal(r.data.invoice.branchFree, 'Asia Pacific HQ');
});

test('the foreign free-text branch rejects Thai characters', () => {
  const r = parse({
    ...BASE,
    requestInvoice: true,
    invoice: {
      type: 'corporate', country: 'OTHER',
      companyName: 'ACME Pte. Ltd.',
      branchFree: 'สาขาสิงคโปร์',
      internationalAddress: { line1: '1 Raffles Place', city: 'Singapore', country: 'Singapore' },
    },
  });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'invoice.branchFree'), 'กรุณากรอกเป็นภาษาอังกฤษ');
});

// ── §3.2: the sole attendee IS the coordinator ──────────────────────────────

test('isAttending + count 1 + attendees:[] PASSES — the mirror card is the list', () => {
  /**
   * The schema already computed `expected = attendeesCount - 1` for an
   * attending coordinator, which is 0 here, so no change was needed. Pinned
   * anyway, because the UI change in AttendeesList now DEPENDS on it: with the
   * opt-out checkbox hidden, `attendeesListProvided` is forced back to true and
   * this is the only state the form can be in.
   */
  const r = parse({ ...BASE, attendeesListProvided: true, attendees: [] });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

test('CONTROL: the same shape with TWO attendees still demands the second name', () => {
  // Without this, a superRefine that had stopped counting at all would satisfy
  // the test above.
  const r = parse({ ...BASE, attendeesCount: 2, attendeesListProvided: true, attendees: [] });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'attendees'), 'กรุณากรอกข้อมูลผู้เข้าอบรมให้ครบ 1 ท่าน');
});

test('a NON-attending coordinator with count 1 still needs one attendee', () => {
  const r = parse({
    ...BASE,
    coordinator: { ...BASE.coordinator, isAttending: false },
    attendeesListProvided: true,
    attendees: [],
  });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'attendees'), 'กรุณากรอกข้อมูลผู้เข้าอบรมให้ครบ 1 ท่าน');
});
