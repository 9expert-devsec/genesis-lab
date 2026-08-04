import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicRegistrationModel } from '@/lib/email/models/publicRegistrationModel';
import { buildPublicPaidReceiptModel } from '@/lib/email/models/publicPaidReceiptModel';
import { buildInhouseRegistrationModel } from '@/lib/email/models/inhouseRegistrationModel';
import { paidReceiptEmail } from '@/lib/email/templates/registration-paid';
import { AMBIENT_PROBE, AMBIENT_TZ, withTZ, zoneProbe } from '../withTZ.mjs';

/**
 * The three Postmark TemplateModel builders.
 *
 * ── WHAT IS ACTUALLY AT RISK HERE ───────────────────────────────────────────
 * A Postmark Template fails SILENTLY. Send a model with a misspelled key and
 * Mustachio renders an empty string where the value should be — no error, no
 * non-2xx, a `{ messageId }` in the logs and a customer holding an email with a
 * blank course name. Send `null` where a conditional block belongs and it
 * renders the section as EMPTY and drops it, which looks exactly like a
 * correctly-hidden block. There is no type checking across that wire and no
 * schema on the far side; these tests are the entire contract.
 *
 * That is why the conditional-block sweep below is not a style check. `false`
 * is the ONLY spelling of "hidden". `null` and `undefined` are indistinguishable
 * from it in the rendered output and distinguishable from it nowhere else.
 *
 * ── WHAT THIS FILE CANNOT SEE ───────────────────────────────────────────────
 *   · Whether the Postmark template actually references these keys. A key the
 *     template never reads and a key the template misspells produce identical
 *     model output. Only a human looking at a rendered preview closes that gap,
 *     which is why the change ships a dashboard checklist.
 *   · Whether Mustachio treats a given value as truthy the way we assume.
 *   · Whether the senders honour the model at all — see test/pure/sendPlan and
 *     test/fs/emailTemplateSenders for the delivery half.
 *
 * `paid_at_label` USED TO BE on this list and no longer is. The first version
 * of this file asserted the Bangkok-rendered string and recorded the zone as an
 * unclosable limit, because reverting formatPaidAt to the runtime-local
 * `getHours()/getMonth()` form left the entire suite GREEN on this machine —
 * whose system zone is Asia/Bangkok, as the office laptops are. That is exactly
 * how incident b-001 hid. It is closed below with `withTZ` from
 * test/withTZ.mjs, which forces the zone and restores the ambient one; the
 * label is now asserted under UTC and Los Angeles as well as Bangkok, so the
 * pinning is proven where it actually matters — on Vercel, which runs UTC.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const COORDINATOR = {
  firstName: 'พิรัศมิ์',
  lastName: 'สังข์สุวรรณ',
  email: 'pirasak@9expert.co.th',
  phone: '0889432707',
  isAttending: true,
};

const ATTENDEES = [
  { firstName: 'พิรัศมิ์', lastName: 'สังข์สุวรรณ', email: 'pirasak@9expert.co.th', phone: '0889432707' },
  { firstName: 'ทดสอบ', lastName: 'ระบบ', email: 'test@example.com', phone: '0812345678' },
];

const INVOICE_PERSONAL = {
  type: 'individual',
  firstName: 'พิรัศมิ์',
  lastName: 'สังข์สุวรรณ',
  taxId: '1234567894213',
  branch: '',
  country: 'TH',
};

const INVOICE_CORPORATE = {
  type: 'corporate',
  companyName: '9EXPERT COMPANY LIMITED',
  taxId: '0105556012345',
  branch: 'สำนักงานใหญ่',
  country: 'TH',
};

const REG_DATA = {
  courseId: 'EXCEL-ADV',
  courseName: 'Microsoft Excel Advanced',
  classDate: '18-19 พ.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  coordinator: COORDINATOR,
  attendeesCount: 2,
  attendeesListProvided: true,
  attendees: ATTENDEES,
  requestInvoice: true,
  invoice: INVOICE_PERSONAL,
};

const COURSE_COVER = 'https://res.cloudinary.com/9expert/image/upload/covers/excel-adv.png';

function regModel(overrides = {}) {
  const {
    attendees = ATTENDEES,
    invoiceCountry = 'TH',
    invoiceAddress = '254/271 สนามชัย เมืองสุพรรณบุรี สุพรรณบุรี 72000',
    courseImage = COURSE_COVER,
    ...dataOverrides
  } = overrides;
  return buildPublicRegistrationModel({
    referenceNumber: 'A1B2C3D4',
    data: { ...REG_DATA, ...dataOverrides },
    attendees,
    invoiceCountry,
    invoiceAddress,
    courseImage,
  });
}

const PAID_DOC = {
  _id: '6931505831d45afebddb77d7',
  courseId: 'EXCEL-ADV',
  courseName: 'Microsoft Excel Advanced',
  classDate: '18-19 พ.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'classroom',
  coordinator: COORDINATOR,
  attendeesCount: 2,
  attendeesListProvided: true,
  attendees: ATTENDEES,
  requestInvoice: true,
  invoice: INVOICE_CORPORATE,
  pricing: { pricePerSeat: 3900, seats: 2, subtotal: 7800, vatAmount: 546, total: 8346 },
  payment: { method: 'credit_card', paidAt: '2026-07-30T20:15:00.000Z' },
};

/**
 * The same registration, as the HARD-CODED fallback template wants it. Kept
 * beside the doc fixture so the two describe one payment, not two.
 */
const PAID_TEMPLATE_ARGS = {
  referenceNumber: 'BDDB77D7',
  firstName: COORDINATOR.firstName,
  courseName: 'Microsoft Excel Advanced',
  classDate: '18-19 พ.ค. 2569',
  attendanceMode: 'classroom',
  scheduleType: 'hybrid',
  attendees: ATTENDEES,
  attendeesListProvided: true,
  coordinatorIsAttending: true,
  attendeesCount: 2,
  invoice: INVOICE_CORPORATE,
  invoiceCountry: 'TH',
  invoiceAddress: '318 อาคารเอเวอร์กรีน เพลส กรุงเทพฯ 10400',
  requestInvoice: true,
  pricing: { pricePerSeat: 3900, seats: 2, subtotal: 7800, vatAmount: 546, total: 8346 },
  method: 'credit_card',
};

function paidModel(docOverrides = {}, rest = {}) {
  return buildPublicPaidReceiptModel({
    doc: { ...PAID_DOC, ...docOverrides },
    invoiceCountry: 'TH',
    invoiceAddress: '318 อาคารเอเวอร์กรีน เพลส กรุงเทพฯ 10400',
    ...rest,
  });
}

const INHOUSE_DATA = {
  coursesInterested: ['COPILOT-STU'],
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@acme.co.th',
  contactPhone: '0812345678',
  contactRole: 'ผู้จัดการฝ่ายบุคคล',
  contactDepartment: 'ฝ่ายทรัพยากรบุคคล',
  // NO `companyName`. The form stopped asking for the company twice; the field
  // is off the zod schema, so a fixture carrying it would test a key that can
  // no longer reach this builder. `quotationCompany` is now the single source
  // for BOTH company_name and billing_company_name.
  participantsCount: 15,
  trainingFormat: 'onsite',
  // The structured venue, in the quotation-address shape. NOT `onsiteAddress` —
  // that path is a legacy String on RegisterInhouse and nothing writes it.
  onsiteVenue: {
    addressLine: '123 อาคารเอ',
    subDistrict: 'คลองตัน',
    district: 'คลองเตย',
    province: 'กรุงเทพฯ',
    postalCode: '10110',
  },
  // No `scheduleMode`: the 3-card selector is gone and a month is the whole of
  // the schedule now.
  preferredMonth: 'กันยายน 2569',
  quotationCompany: 'ACME (Thailand) Co., Ltd.',
  taxId: '0105556012345',
  // Structured, replacing the free-text `branch`. The legacy path still reads
  // back — pinned by its own test below rather than baked into the fixture.
  branchType: 'head_office',
  branchCode: '',
  message: 'ต้องการอบรมช่วงเช้า',
};

/**
 * NOTE the `courseName` default is '' — the LOOKUP-FAILED state — so every test
 * that does not care about the title exercises the code fallback. Tests that
 * are about the resolved title pass it explicitly.
 */
function inhouseModel(
  overrides = {},
  quotationAddress = '99 ถนนสุขุมวิท กรุงเทพฯ 10110',
  courseImage = COURSE_COVER,
  courseName = ''
) {
  return buildInhouseRegistrationModel({
    referenceNumber: 'Z9Y8X7W6',
    data: { ...INHOUSE_DATA, ...overrides },
    quotationAddress,
    courseImage,
    courseName,
  });
}

/** Every leaf, recursively, that is `null` or `undefined`. */
function findNullish(value, at = '') {
  if (value === null || value === undefined) return [at || '<root>'];
  if (Array.isArray(value)) return value.flatMap((v, i) => findNullish(v, `${at}[${i}]`));
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => findNullish(v, at ? `${at}.${k}` : k));
  }
  return [];
}

const ALL_MODELS = () => [
  ['publicRegistration/full', regModel()],
  ['publicRegistration/minimal', regModel({ attendeesListProvided: false, attendees: [], requestInvoice: false, invoice: null, scheduleType: 'classroom', notes: '', courseImage: '' })],
  ['publicRegistration/corporate', regModel({ invoice: INVOICE_CORPORATE, notes: 'ขอใบเสนอราคาด่วน' })],
  ['publicPaidReceipt/full', paidModel()],
  ['publicPaidReceipt/minimal', paidModel({ attendeesListProvided: false, attendees: [], requestInvoice: false, invoice: null, scheduleType: 'classroom', payment: {} })],
  ['inhouse/full', inhouseModel()],
  // 'minimal' is now an ONLINE enquiry with nothing optional filled in.
  // 'flexible' / 'notSure' are no longer reachable through the form, so a
  // fixture built on them would be pinning a state the app cannot produce —
  // their fail-safe handling is asserted explicitly, further down.
  ['inhouse/minimal', inhouseModel({ trainingFormat: 'online', onsiteVenue: null, preferredMonth: '', taxId: '', branchType: undefined, branchCode: '', message: '', quotationCompany: '', contactRole: '', contactDepartment: '', coursesInterested: [] }, '')],
  ['inhouse/onsite', inhouseModel({ trainingFormat: 'onsite', onsiteVenue: { addressLine: '99 ถนนสุขุมวิท', subDistrict: 'คลองตัน', district: 'วัฒนา', province: 'กรุงเทพฯ', postalCode: '10110' } })],
];

// ── The object-or-false convention ──────────────────────────────────────────

test('NO model, in any state, contains null or undefined anywhere', () => {
  for (const [label, model] of ALL_MODELS()) {
    assert.deepEqual(
      findNullish(model),
      [],
      `${label} emitted a nullish value. Mustachio renders {{#block}} for null as an ` +
        `EMPTY block and drops the section silently — indistinguishable from a ` +
        `correctly-hidden false.`
    );
  }
});

test('every conditional block is an object or the boolean false, never a bare truthy', () => {
  const BLOCK_KEYS = [
    'attendance_mode',
    'attendee_list',
    'attendee_later',
    'document_requested',
    // Flat billing (public registration) — these moved OUT of document_requested
    // so the template can reach them with a single {{#billing_personal}}.
    'billing_personal',
    'billing_company',
    'billing_notes',
    // In-house
    'training_venue',
    'billing_tax_id',
    'billing_branch',
    'billing_address',
  ];
  for (const [label, model] of ALL_MODELS()) {
    for (const key of BLOCK_KEYS) {
      if (!(key in model)) continue;
      const v = model[key];
      const ok = v === false || (typeof v === 'object' && v !== null && !Array.isArray(v));
      assert.ok(ok, `${label}.${key} is ${JSON.stringify(v)} — must be an object or false`);
    }
  }
});

test('CONTROL: findNullish actually finds a nullish leaf', () => {
  // Without this, a broken sweep returns [] for everything and the two tests
  // above pass over models full of nulls.
  assert.deepEqual(findNullish({ a: { b: null } }), ['a.b']);
  assert.deepEqual(findNullish({ a: [1, undefined] }), ['a[1]']);
  assert.deepEqual(findNullish({ a: false, b: '', c: 0 }), [], 'false/empty-string/zero are NOT nullish');
});

// ── Attendee list: provided / later / the third state ───────────────────────

test('attendee list provided renders a numbered items block', () => {
  const m = regModel();
  assert.equal(m.attendee_list.count, 2);
  assert.equal(m.attendee_list.items.length, 2);
  assert.deepEqual(m.attendee_list.items[0], {
    index: 1,
    name: 'พิรัศมิ์ สังข์สุวรรณ',
    email: 'pirasak@9expert.co.th',
    phone: '0889432707',
    is_coordinator: true,
  });
  assert.equal(m.attendee_list.items[1].index, 2);
  assert.equal(m.attendee_later, false);
});

test('"will notify later" is a block, and the list is false', () => {
  const m = regModel({ attendeesListProvided: false, attendees: [] });
  assert.equal(m.attendee_list, false);
  assert.deepEqual(m.attendee_later, { show: true });
});

test('THIRD STATE: list promised but empty shows NEITHER block', () => {
  // The hard-coded template has exactly this hole and it is easy to collapse:
  // "show the later-note whenever the table is absent" would tell a customer
  // who DID submit names that their names are missing.
  const m = regModel({ attendeesListProvided: true, attendees: [] });
  assert.equal(m.attendee_list, false);
  assert.equal(m.attendee_later, false);
});

test('coordinator NOT attending: no row carries the coordinator marker', () => {
  const m = regModel({ coordinator: { ...COORDINATOR, isAttending: false } });
  assert.equal(m.attendee_list.items.every((i) => i.is_coordinator === false), true);
});

test('coordinator attending marks ONLY the first row', () => {
  const m = regModel();
  assert.deepEqual(m.attendee_list.items.map((i) => i.is_coordinator), [true, false]);
});

test('attendee names survive a missing surname without a trailing space', () => {
  const m = regModel({ attendees: [{ firstName: 'สมชาย', email: 'a@b.c', phone: '0800000000' }] });
  assert.equal(m.attendee_list.items[0].name, 'สมชาย');
  assert.equal(m.attendee_list.items[0].email, 'a@b.c');
});

test('count falls back to the array length when attendeesCount is absent', () => {
  const m = regModel({ attendeesCount: undefined });
  assert.equal(m.attendee_list.count, 2);
  assert.equal(m.total_participants, 2);
});

// ── Invoice / billing ───────────────────────────────────────────────────────

test('invoice NOT requested hides the whole billing block', () => {
  const m = regModel({ requestInvoice: false });
  assert.equal(m.document_requested, false);
});

test('requestInvoice true but no invoice object still hides the block', () => {
  // A half-filled form must not render an empty billing panel.
  const m = regModel({ requestInvoice: true, invoice: null });
  assert.equal(m.document_requested, false);
});

test('individual: billing_personal is the object, billing_company is false', () => {
  const m = regModel();
  assert.equal(m.billing_company, false);
  assert.equal(m.billing_personal.billing_name, 'พิรัศมิ์ สังข์สุวรรณ');
  assert.equal(m.invoice_type_label, 'บุคคลทั่วไป');
});

test('corporate: billing_company is the object, billing_personal is false', () => {
  const m = regModel({ invoice: INVOICE_CORPORATE });
  assert.equal(m.billing_personal, false);
  assert.equal(m.billing_company.billing_company_name, '9EXPERT COMPANY LIMITED');
  assert.equal(m.invoice_type_label, 'นิติบุคคล / บริษัท');
});

test('an empty branch is a false block, not an empty row', () => {
  const m = regModel();
  assert.equal(m.billing_personal.billing_branch, false);
  assert.deepEqual(m.billing_personal.billing_tax_id, { text: '1234567894213' });
});

test('a present branch is a text block', () => {
  const m = regModel({ invoice: INVOICE_CORPORATE });
  assert.deepEqual(m.billing_company.billing_branch, { text: 'สำนักงานใหญ่' });
});

test('an empty address is a false block', () => {
  const m = regModel({ invoiceAddress: '' });
  assert.equal(m.billing_personal.billing_address, false);
});

test('a whitespace-only address is a false block, not a block of spaces', () => {
  const m = regModel({ invoiceAddress: '   ' });
  assert.equal(m.billing_personal.billing_address, false);
});

test('TH renders ไทย', () => {
  assert.equal(regModel({ invoiceCountry: 'TH' }).invoice_country_label, 'ไทย');
});

test('OTHER renders ต่างประเทศ', () => {
  assert.equal(regModel({ invoiceCountry: 'OTHER' }).invoice_country_label, 'ต่างประเทศ');
});

test('an unset country falls to ไทย rather than labelling a Thai company foreign', () => {
  // The template this replaces asks `=== 'TH'`, so null renders as ต่างประเทศ.
  // The schema only emits TH|OTHER so they agree on all real data; asking the
  // positive question makes the junk-input failure the safer of the two.
  assert.equal(regModel({ invoiceCountry: null }).invoice_country_label, 'ไทย');
});

// ── Attendance mode: hybrid only ────────────────────────────────────────────

test('hybrid schedule shows the mode block with the Teams label', () => {
  assert.deepEqual(regModel().attendance_mode, { label: 'Online via Microsoft Teams' });
});

test('hybrid schedule with classroom mode shows the Classroom label', () => {
  assert.deepEqual(
    regModel({ attendanceMode: 'classroom' }).attendance_mode,
    { label: 'Classroom' }
  );
});

test('NON-hybrid schedule hides the mode block entirely', () => {
  // On a classroom-only schedule the mode carries no information — there was
  // nothing to choose between — and the template omits the row.
  assert.equal(regModel({ scheduleType: 'classroom' }).attendance_mode, false);
  assert.equal(regModel({ scheduleType: 'online' }).attendance_mode, false);
  assert.equal(regModel({ scheduleType: undefined }).attendance_mode, false);
});

test('an unknown attendance mode fails safe to Classroom', () => {
  assert.deepEqual(regModel({ attendanceMode: 'zoom' }).attendance_mode, { label: 'Classroom' });
});

// ── Public registration: scalars and fallbacks ──────────────────────────────

test('public registration maps the reference, course and coordinator', () => {
  const m = regModel();
  assert.equal(m.ref_no, 'A1B2C3D4');
  assert.equal(m.course_name, 'Microsoft Excel Advanced');
  assert.equal(m.course_date, '18-19 พ.ค. 2569');
  assert.equal(m.coordinator_name, 'พิรัศมิ์ สังข์สุวรรณ');
  assert.equal(m.coordinator_first_name, 'พิรัศมิ์');
  assert.equal(m.coordinator_email, 'pirasak@9expert.co.th');
  assert.equal(m.coordinator_phone, '0889432707');
  assert.equal(m.total_participants, 2);
});

test('a missing class date resolves to the template fallback, not an empty row', () => {
  // Mustachio has no `||`, so the fallback has to be resolved on this side.
  assert.equal(regModel({ classDate: '' }).course_date, 'ตามรอบที่เลือก');
  assert.equal(regModel({ classDate: undefined }).course_date, 'ตามรอบที่เลือก');
});

test('a missing course name falls back to the course id', () => {
  assert.equal(regModel({ courseName: '' }).course_name, 'EXCEL-ADV');
});

test('every public-registration value is a string, number, or block — nothing exotic', () => {
  // Postmark serialises the model as JSON; a Date or a mongoose subdocument
  // crossing this boundary renders as whatever JSON.stringify makes of it.
  for (const [k, v] of Object.entries(regModel())) {
    const t = typeof v;
    assert.ok(
      t === 'string' || t === 'number' || t === 'boolean' || (t === 'object' && v !== null),
      `${k} is a ${t}`
    );
  }
});

// ── Paid receipt ────────────────────────────────────────────────────────────

test('paid receipt derives ref_no from the last 8 of the id, uppercased', () => {
  assert.equal(paidModel().ref_no, 'BDDB77D7');
});

test('paid receipt formats the frozen pricing snapshot as Thai currency', () => {
  const m = paidModel();
  assert.equal(m.price_per_seat, '3,900.00');
  assert.equal(m.subtotal, '7,800.00');
  assert.equal(m.vat_amount, '546.00');
  assert.equal(m.total, '8,346.00');
  assert.equal(m.seats, 2);
});

test('missing pricing renders zeros rather than blanks', () => {
  const m = paidModel({ pricing: undefined });
  assert.equal(m.total, '0.00');
  assert.equal(m.price_per_seat, '0.00');
});

test('seats falls back to the attendee count when the snapshot omits it', () => {
  const m = paidModel({ pricing: { total: 100 } });
  assert.equal(m.seats, 2);
});

test('credit card and PromptPay get their Thai labels', () => {
  assert.equal(paidModel().payment_method_label, 'บัตรเครดิต/เดบิต');
  assert.equal(paidModel({ payment: { method: 'promptpay' } }).payment_method_label, 'QR PromptPay');
});

test('paid_at is rendered in Asia/Bangkok with a Buddhist-era year', () => {
  // 2026-07-30T20:15Z is 31 July 03:15 in Bangkok — the instant is chosen so
  // the DAY differs from UTC, which is the half of the old bug that turned a
  // late-evening payment into a receipt dated the day before.
  assert.equal(paidModel().paid_at_label, '31 กรกฎาคม 2569 เวลา 03:15 น.');
});

test('paid_at is IDENTICAL under UTC, Asia/Bangkok and America/Los_Angeles', () => {
  // THE TEST ABOVE IS WORTH NOTHING ON ITS OWN HERE. This machine's system zone
  // is Asia/Bangkok, so a regression to runtime-local formatting produces the
  // identical string and passes. Vercel runs UTC, where the same code is seven
  // hours wrong — which is precisely how incident b-001 hid on a Bangkok
  // laptop while corrupting every article timestamp in production.
  //
  // withTZ is SYNCHRONOUS and restores the resolved ambient zone (not `delete`,
  // which does not restore); the builder is pure and synchronous, so no
  // mutation escapes this block. See test/withTZ.mjs.
  const expected = '31 กรกฎาคม 2569 เวลา 03:15 น.';
  for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
    const got = withTZ(tz, () => paidModel().paid_at_label);
    assert.equal(got, expected, `paid_at_label drifted under TZ=${tz} — the Asia/Bangkok pin is gone`);
  }
});

test('CONTROL: the zone really is variable in-process, or the test above is vacuous', () => {
  // If Node ever stops honouring a mid-process TZ change, the sweep above
  // passes by agreeing with itself. This asserts the runtime-local expression —
  // the exact shape formatPaidAt must NOT use — genuinely differs between the
  // two zones, so a green sweep means the pin works rather than that nothing
  // moved.
  const local = () => new Date('2026-07-30T20:15:00.000Z').getDate();
  assert.equal(withTZ('UTC', local), 30, 'UTC still sees the 30th');
  assert.equal(withTZ('Asia/Bangkok', local), 31, 'Bangkok has rolled over to the 31st');
});

test('the HTML FALLBACK renders the same paid-at instant as the template model', () => {
  // The two paths can both fire — the fallback whenever the alias is unset or a
  // send fails — so they must not disagree about when the customer paid. They
  // DID: the fallback formatted in the runtime zone (UTC on Vercel, so seven
  // hours early, and a pre-07:00 payment printed the previous day's date) while
  // the model was pinned to Asia/Bangkok.
  //
  // Asserting they AGREE, rather than asserting each against a literal, is what
  // keeps them from drifting apart again: a future edit to either one has to
  // move both.
  const expected = paidModel().paid_at_label;
  for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
    const { text } = withTZ(tz, () =>
      paidReceiptEmail({ ...PAID_TEMPLATE_ARGS, paidAt: PAID_DOC.payment.paidAt })
    );
    assert.ok(
      text.includes(expected),
      `under TZ=${tz} the fallback does not contain "${expected}" — the two paid-at renderings have diverged`
    );
  }
});

test('CONTROL: the fallback paid-at assertion can actually fail', () => {
  // The check above is an `includes` over a long string, which is exactly the
  // shape that passes for the wrong reason. This pins that a DIFFERENT instant
  // is not found — so the match is about the value, not about the template
  // happening to contain a date-shaped substring somewhere.
  const { text } = paidReceiptEmail({
    ...PAID_TEMPLATE_ARGS,
    paidAt: '2026-01-02T03:04:00.000Z',
  });
  assert.equal(text.includes(paidModel().paid_at_label), false);
  assert.ok(text.includes('2 มกราคม 2569 เวลา 10:04 น.'), 'the fallback renders its own instant in Bangkok');
});

test('CONTROL: withTZ left the ambient zone exactly as it found it', () => {
  // process.env.TZ is process-global and the runner is isolation:'none' with
  // concurrency — a leak here lands as a failure in an unrelated tier, which is
  // what happened the first time this mechanism was written.
  assert.equal(zoneProbe(), AMBIENT_PROBE, 'this file leaked a timezone into the rest of the suite');
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, AMBIENT_TZ, 'Intl leaked too');
});

test('a missing or unparseable paid-at renders the em dash, never a blank row', () => {
  assert.equal(paidModel({ payment: {} }).paid_at_label, '—');
  assert.equal(paidModel({ payment: { paidAt: 'not-a-date' } }).paid_at_label, '—');
});

test('paid receipt carries the same attendee and billing blocks', () => {
  const m = paidModel();
  assert.equal(m.attendee_list.items.length, 2);
  assert.equal(m.document_requested.billing_company.billing_company_name, '9EXPERT COMPANY LIMITED');
  assert.equal(m.document_requested.billing_personal, false);
});

test('paid receipt hides the mode block on a non-hybrid schedule', () => {
  assert.equal(paidModel({ scheduleType: 'classroom' }).attendance_mode, false);
  assert.deepEqual(paidModel({ scheduleType: 'hybrid' }).attendance_mode, { label: 'Classroom' });
});

// ── In-house ────────────────────────────────────────────────────────────────

test('in-house maps the contact into the coordinator vocabulary', () => {
  const m = inhouseModel();
  assert.equal(m.ref_no, 'Z9Y8X7W6');
  assert.equal(m.coordinator_name, 'สมชาย ใจดี');
  assert.equal(m.coordinator_first_name, 'สมชาย');
  assert.equal(m.coordinator_email, 'somchai@acme.co.th');
  assert.equal(m.coordinator_phone, '0812345678');
  // ONE SOURCE, TWO KEYS. `company_name` used to read `d.companyName`, a second
  // company field the contact section asked for separately — people filled the
  // two in differently and the mail greeted one legal entity while billing
  // another. Both keys now derive from `quotationCompany`; both are KEPT
  // because the Postmark template interpolates each in a different place.
  assert.equal(m.company_name, 'ACME (Thailand) Co., Ltd.');
  assert.equal(m.company_name, m.billing_company_name, 'both keys, one source');
  assert.equal(m.total_participants, 15);
});

test('training format labels: the two live values, plus the legacy fail-safe', () => {
  // CHANGED with the form: 'flexible' was removed as an option and the schema
  // now requires an explicit choice, so the third case is UNREACHABLE for a new
  // submission. It is still asserted because a re-send of a historical enquiry
  // reaches this builder with 'flexible' on it, and without the fallback the
  // customer's mail would say the literal string 'undefined'.
  assert.equal(inhouseModel({ trainingFormat: 'onsite' }).training_format_label, 'Onsite');
  assert.equal(inhouseModel({ trainingFormat: 'online' }).training_format_label, 'Online');
  assert.equal(inhouseModel({ trainingFormat: 'flexible' }).training_format_label, 'ยังไม่ระบุ — ทีมขายจะช่วยแนะนำ');
});

test('schedule label is the month, unconditionally', () => {
  // NARROWED with the form: the scheduleMode selector (month / dateRange /
  // notSure) is gone and `preferredMonth` is unconditionally required, so there
  // is no mode to branch on. The three former branch tests were REPLACED by
  // this one plus the legacy case below — deleted claims, not deleted coverage.
  assert.equal(inhouseModel().schedule_label, 'เดือนที่สนใจ: กันยายน 2569');
});

test('schedule label falls back for a document that never had a month', () => {
  // The 'dateRange' and 'notSure' enquiries in the collection carry no
  // preferredMonth at all. 'เดือนที่สนใจ: ' with nothing after the colon reads
  // as a bug, so the fallback stays — and a stale preferredDateFrom must NOT
  // resurrect the removed branch.
  const m = inhouseModel({ preferredMonth: '', preferredDateFrom: '2026-09-01', preferredDateTo: '2026-09-03' });
  assert.equal(m.schedule_label, 'เดือนที่สนใจ: ตามที่ทีมขายแนะนำ');
  assert.equal(JSON.stringify(m).includes('2026-09-01'), false, 'the dead date-range branch is really gone');
});

test('billing_address is a block when present and false when not', () => {
  // Formerly `quotation_address` — see the rename test below.
  assert.deepEqual(inhouseModel({}, '99 ถนนสุขุมวิท กรุงเทพฯ 10110').billing_address, {
    text: '99 ถนนสุขุมวิท กรุงเทพฯ 10110',
  });
  assert.equal(inhouseModel({}, '').billing_address, false);
  // Called through the builder directly: passing `undefined` to the local
  // helper would hit ITS default argument and silently test the present case.
  assert.equal(
    buildInhouseRegistrationModel({ referenceNumber: 'Z', data: INHOUSE_DATA }).billing_address,
    false
  );
});

test('in-house still carries NO admin-only enquiry detail', () => {
  /**
   * NARROWED A SECOND TIME, and the claim has changed meaning — recorded here
   * because that is the sort of thing a green test otherwise hides.
   *
   * ROUND 1 dropped `coursesInterested` and `message`: they became
   * `course_name` and `billing_notes`, part of the approved design.
   *
   * ROUND 2 (this change) drops `objective`, `skillLevel` and `onsiteEquipment`
   * from the list — NOT because the model started carrying them, but because
   * THE FORM STOPPED ASKING. Asserting their absence from the model would be
   * vacuous now: they are absent from the submission too, so the assertion
   * would pass no matter what this builder did with them. The paths survive on
   * the Mongoose schema for historical documents and nothing more.
   *
   * What is left is the original claim, still live: these fields ARE collected
   * by the current form, were rendered by the DELETED admin template and by
   * nothing else, and so do not appear in the BCC copy of the customer's mail —
   * now the only notification anyone internal receives. A loss on record.
   */
  const m = inhouseModel({
    contentMode: 'custom',
    contentDetails: 'เน้น Pivot Table',
    onlineRegion: 'APAC',
    onlineTimezone: 'ICT 09:00-16:00',
    scheduleNote: 'หลีกเลี่ยงวันศุกร์',
  });
  const serialised = JSON.stringify(m);
  for (const leaked of ['custom', 'เน้น Pivot Table', 'APAC', 'ICT 09:00-16:00', 'หลีกเลี่ยงวันศุกร์']) {
    assert.equal(serialised.includes(leaked), false, `${leaked} leaked into the in-house model`);
  }
});

test('CONTROL: the exclusion sweep above CAN fire', () => {
  // Without this, a builder that stopped emitting anything at all would pass
  // the sweep — and so would a sweep whose probes no longer match the fixture.
  // Fired on values the model IS supposed to carry.
  const serialised = JSON.stringify(inhouseModel());
  for (const carried of ['ACME (Thailand) Co., Ltd.', '0105556012345', 'กันยายน 2569', 'ต้องการอบรมช่วงเช้า']) {
    assert.ok(serialised.includes(carried), `${carried} should be in the model`);
  }
});

// ── course_image (both builders) ────────────────────────────────────────────

test('course_image is the caller-supplied URL, as a plain string', () => {
  assert.equal(regModel().course_image, COURSE_COVER);
  assert.equal(inhouseModel().course_image, COURSE_COVER);
});

test('course_image is EMPTY STRING when there is no cover — never null', () => {
  // The template gates the <img> on {{#course_image}}. '' is falsy to Mustachio
  // so the whole tag disappears; null would too, but null is banned everywhere
  // in these models and undefined would come out as the string "undefined" in
  // some renderers. The empty case is the NORMAL case whenever the upstream
  // fetch fails — the route swallows the error precisely so the mail still goes.
  for (const empty of ['', null]) {
    assert.equal(regModel({ courseImage: empty }).course_image, '');
    assert.equal(inhouseModel({}, '99 ถนน', empty).course_image, '');
  }
  // `undefined` goes through the BUILDERS directly: passing it to either local
  // helper hits that helper's own default argument and silently tests the
  // populated case instead. Same trap this file already hit once.
  assert.equal(
    buildPublicRegistrationModel({ referenceNumber: 'A', data: REG_DATA }).course_image,
    ''
  );
  assert.equal(
    buildInhouseRegistrationModel({ referenceNumber: 'Z', data: INHOUSE_DATA }).course_image,
    ''
  );
});

test('course_image never carries a src-breaking whitespace-only value', () => {
  // A `src="  "` renders a broken-image icon rather than nothing, which is the
  // exact failure the empty-string contract exists to avoid.
  assert.equal(regModel({ courseImage: '   ' }).course_image.trim(), '');
});

// ── training_type_label: ALWAYS present ─────────────────────────────────────

test('training_type_label is populated for classroom, hybrid AND online', () => {
  // THE BUG THIS FIXES: the ประเภทการอบรม row was driven by `attendance_mode`,
  // which only fires on hybrid — so it rendered BLANK for two of the three
  // schedule types, on the majority of registrations.
  assert.equal(regModel({ scheduleType: 'classroom' }).training_type_label, 'Classroom');
  assert.equal(regModel({ scheduleType: 'online' }).training_type_label, 'Online via Microsoft Teams');
  assert.equal(regModel({ scheduleType: 'hybrid', attendanceMode: 'teams' }).training_type_label, 'Online via Microsoft Teams');
  assert.equal(regModel({ scheduleType: 'hybrid', attendanceMode: 'classroom' }).training_type_label, 'Classroom');
});

test('training_type_label is NEVER empty, for any schedule/mode combination', () => {
  for (const scheduleType of ['classroom', 'hybrid', 'online', undefined, null, 'nonsense']) {
    for (const attendanceMode of ['classroom', 'teams', undefined, null, 'zoom']) {
      const label = regModel({ scheduleType, attendanceMode }).training_type_label;
      assert.equal(typeof label, 'string');
      assert.ok(label.length > 0, `blank label for ${scheduleType}/${attendanceMode}`);
    }
  }
});

test('training_type_label and attendance_mode COEXIST and stay independent', () => {
  // They answer different questions: the label is "what is this course", the
  // block is "which of the two options you picked". Merging loses one of them.
  const hybrid = regModel({ scheduleType: 'hybrid', attendanceMode: 'teams' });
  assert.equal(hybrid.training_type_label, 'Online via Microsoft Teams');
  assert.deepEqual(hybrid.attendance_mode, { label: 'Online via Microsoft Teams' });

  const classroom = regModel({ scheduleType: 'classroom' });
  assert.equal(classroom.training_type_label, 'Classroom');
  assert.equal(classroom.attendance_mode, false, 'the hybrid-only block must stay hidden');
});

// ── public registration: flat billing + notes ───────────────────────────────

test('billing blocks are reachable at the TOP LEVEL, not nested', () => {
  // The nesting is what made the draft template render a heading with nothing
  // under it: the outer section opened, the inner block was addressed as if it
  // were top-level, resolved to nothing, and Mustachio dropped it silently.
  const m = regModel();
  assert.ok(Object.hasOwn(m, 'billing_personal'), 'billing_personal must be top-level');
  assert.ok(Object.hasOwn(m, 'billing_company'), 'billing_company must be top-level');
  assert.equal(Object.hasOwn(m.document_requested, 'billing_personal'), false,
    'document_requested is a show/hide flag only — it must not carry the blocks');
});

test('document_requested is a show flag, present and absent', () => {
  assert.deepEqual(regModel().document_requested, { show: true });
  assert.equal(regModel({ requestInvoice: false }).document_requested, false);
});

test('with no document requested, every billing key is hidden and no label is invented', () => {
  const m = regModel({ requestInvoice: false });
  assert.equal(m.billing_personal, false);
  assert.equal(m.billing_company, false);
  // Empty rather than derived: `invoice?.type` would fall to the individual
  // default and put a confident label on a document nobody asked for.
  assert.equal(m.invoice_type_label, '');
  assert.equal(m.invoice_country_label, '');
});

test('billing_notes is a block when notes exist and false when they do not', () => {
  assert.deepEqual(regModel({ notes: 'ขอใบเสนอราคาด่วน' }).billing_notes, { text: 'ขอใบเสนอราคาด่วน' });
  assert.equal(regModel({ notes: '' }).billing_notes, false);
  assert.equal(regModel({ notes: undefined }).billing_notes, false);
  assert.equal(regModel({ notes: '   ' }).billing_notes, false);
});

// ── in-house: the new fields ────────────────────────────────────────────────

test('course_name is the RESOLVED TITLE when the lookup succeeded', () => {
  // The whole point of the change: the customer reads the course they asked
  // about, not the internal code for it.
  const m = inhouseModel({}, '99 ถนน', COURSE_COVER, 'AI Agents with Microsoft Copilot Studio');
  assert.equal(m.course_name, 'AI Agents with Microsoft Copilot Studio');
});

test('course_name FALLS BACK TO THE CODE when the lookup failed — never blank', () => {
  // Upstream 500, DNS, timeout: the route swallows it and passes ''. A code is
  // ugly; a blank course name on a quote-request confirmation is unusable —
  // the customer would not know which course the mail is about.
  const m = inhouseModel({ coursesInterested: ['COPILOT-STU'] }, '99 ถนน', '', '');
  assert.equal(m.course_name, 'COPILOT-STU');
});

test('a resolved title WINS over the code, and neither is concatenated', () => {
  const m = inhouseModel({ coursesInterested: ['COPILOT-STU'] }, '99 ถนน', '', 'Copilot Studio');
  assert.equal(m.course_name, 'Copilot Studio');
  assert.equal(m.course_name.includes('COPILOT-STU'), false);
});

test('DOCUMENTED LIMIT: a second course is SILENTLY DROPPED', () => {
  // The form is a single-select that wraps one value in an array, so this is
  // unreachable through the UI today — but the zod schema is z.array().min(1),
  // which is wider than the UI, so an API client can produce it. Pinned so the
  // day it becomes reachable the limit is already written down instead of
  // being discovered by a customer holding a confirmation for one of the two
  // courses they asked about.
  const m = inhouseModel({ coursesInterested: ['COPILOT-STU', 'EXCEL-ADV'] }, '99 ถนน', '', '');
  assert.equal(m.course_name, 'COPILOT-STU');
  assert.equal(
    JSON.stringify(m).includes('EXCEL-ADV'), false,
    'the second course leaked in somewhere — the drop must be total, not partial'
  );
});

test('course_name survives an empty or malformed list without emitting nullish', () => {
  assert.equal(inhouseModel({ coursesInterested: [] }, '99 ถนน', '', '').course_name, '');
  assert.equal(inhouseModel({ coursesInterested: undefined }, '99 ถนน', '', '').course_name, '');
  // A null in slot 0 must not become the course name.
  assert.equal(inhouseModel({ coursesInterested: [null, 'B'] }, '99 ถนน', '', '').course_name, 'B');
});

test('contact_position and contact_department map from the schema field names', () => {
  const m = inhouseModel();
  assert.equal(m.contact_position, 'ผู้จัดการฝ่ายบุคคล');
  assert.equal(m.contact_department, 'ฝ่ายทรัพยากรบุคคล');
  const bare = inhouseModel({ contactRole: '', contactDepartment: undefined });
  assert.equal(bare.contact_position, '');
  assert.equal(bare.contact_department, '');
});

test('training_venue is the TRAINING location for an onsite enquiry', () => {
  // Reads the STRUCTURED `onsiteVenue`, in the five-field order the form's
  // address autocomplete fills. It is deliberately not the legacy trio of
  // strings: re-typing `onsiteAddress` as a subdocument would be a cast failure
  // on every historical document.
  assert.deepEqual(inhouseModel({ trainingFormat: 'onsite' }).training_venue, {
    text: '123 อาคารเอ คลองตัน คลองเตย กรุงเทพฯ 10110',
  });
});

test('training_venue is FALSE for online, and for a legacy flexible enquiry', () => {
  // Gated on the FORMAT, not on "is the venue non-empty": the schema lets an
  // online enquiry keep a stale onsiteVenue from a customer who changed their
  // mind mid-form, and printing that back as the venue is the same class of
  // error as showing them the billing address.
  assert.equal(inhouseModel({ trainingFormat: 'online' }).training_venue, false);
  assert.equal(inhouseModel({ trainingFormat: 'flexible' }).training_venue, false);
  assert.equal(inhouseModel({ trainingFormat: undefined }).training_venue, false);
});

test('training_venue is FALSE when onsite but no venue was given', () => {
  // Both spellings of "no venue": absent, and present-but-blank.
  assert.equal(inhouseModel({ trainingFormat: 'onsite', onsiteVenue: null }).training_venue, false);
  assert.equal(
    inhouseModel({ trainingFormat: 'onsite', onsiteVenue: { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' } }).training_venue,
    false
  );
});

test('a LEGACY onsite document, whose venue is the three old strings, yields nothing', () => {
  // Stated rather than discovered. The email model reads `onsiteVenue` only, and
  // a re-send of a pre-change enquiry therefore has no venue block — the mail is
  // one row shorter, not wrong. The admin detail view DOES fall back to the
  // legacy strings, which is where anyone chasing an old enquiry is looking.
  assert.equal(
    inhouseModel({ trainingFormat: 'onsite', onsiteVenue: null, onsiteAddress: '123 อาคารเอ', onsiteDistrict: 'คลองเตย', onsiteProvince: 'กรุงเทพฯ' }).training_venue,
    false
  );
});

test('THE CONFLATION THIS EXISTS TO STOP: venue and billing address are different values', () => {
  // The draft template rendered the BILLING address under a "สถานที่จัดอบรม"
  // heading — telling the customer their course is held at their accounts
  // department. Distinct fields, distinct sources, asserted distinct.
  const m = inhouseModel(
    { trainingFormat: 'onsite', onsiteVenue: { addressLine: '123 อาคารเอ', subDistrict: '', district: '', province: '', postalCode: '' } },
    '99 ถนนสุขุมวิท กรุงเทพฯ 10110'
  );
  assert.deepEqual(m.training_venue, { text: '123 อาคารเอ' });
  assert.deepEqual(m.billing_address, { text: '99 ถนนสุขุมวิท กรุงเทพฯ 10110' });
  assert.notDeepEqual(m.training_venue, m.billing_address);
});

test('in-house billing fields map from the quotation section', () => {
  const m = inhouseModel();
  assert.equal(m.billing_company_name, 'ACME (Thailand) Co., Ltd.');
  assert.deepEqual(m.billing_tax_id, { text: '0105556012345' });
  assert.deepEqual(m.billing_branch, { text: 'สำนักงานใหญ่' });
  assert.deepEqual(m.billing_notes, { text: 'ต้องการอบรมช่วงเช้า' });
});

test('billing_branch reads a LEGACY free-text branch when there is no structured pair', () => {
  // Pre-split documents hold a free-text `branch` and no branchType. Verbatim,
  // because we cannot know which of the two structured shapes it meant and
  // guessing would invent data.
  assert.deepEqual(
    inhouseModel({ branchType: undefined, branchCode: '', branch: 'สาขาบางนา' }).billing_branch,
    { text: 'สาขาบางนา' }
  );
  // And the structured pair WINS when both are present — an edited document.
  assert.deepEqual(
    inhouseModel({ branchType: 'branch', branchCode: '00007', branch: 'สาขาบางนา' }).billing_branch,
    { text: 'สาขาที่ 00007' }
  );
});

test('in-house billing blocks are false when the quotation section is empty', () => {
  const m = inhouseModel({ quotationCompany: '', taxId: '', branchType: undefined, branchCode: '', message: '' }, '');
  assert.equal(m.billing_company_name, '');
  assert.equal(m.billing_tax_id, false);
  assert.equal(m.billing_branch, false);
  assert.equal(m.billing_address, false);
  assert.equal(m.billing_notes, false);
});

test('quotation_address is GONE — one address value must not have two names', () => {
  // It held the billing address under a name that invited the venue mix-up.
  // Renamed to billing_address rather than duplicated; a lingering alias is how
  // a template author picks the wrong one.
  assert.equal('quotation_address' in inhouseModel(), false);
});

test('the three builders agree on the keys a subject line can interpolate', () => {
  // Every subject must carry {{ref_no}} — the BCC copy is the only notification
  // staff get, so the reference has to be readable in an inbox list without
  // opening the mail. A subject can only use TOP-LEVEL scalars.
  for (const [label, model] of ALL_MODELS()) {
    assert.equal(typeof model.ref_no, 'string', `${label} has no scalar ref_no`);
    assert.ok(model.ref_no.length > 0 || label.includes('minimal'), `${label} ref_no is empty`);
  }
  assert.equal(typeof regModel().course_name, 'string');
  assert.equal(typeof paidModel().course_name, 'string');
  assert.equal(typeof inhouseModel().company_name, 'string');
});
