import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inhouseRegistrationSchema,
  inhouseRegistrationDefaults,
} from '@/lib/schemas/register-inhouse';
import { thaiAddressSchema as publicThaiAddressSchema } from '@/lib/schemas/register-public';

/**
 * The in-house quotation block, Thailand: EVERY field is required.
 *
 * The schema used to accept an empty quotation section wholesale — its own
 * `thaiAddressSchema` was all-optional — so a request could reach sales with a
 * company name and nothing to raise a quotation against.
 */

const TH_ADDRESS = {
  addressLine: '318 อาคารเอเวอร์กรีน เพลส',
  subDistrict: 'ถนนพญาไท',
  district:    'ราชเทวี',
  province:    'กรุงเทพมหานคร',
  postalCode:  '10400',
};

const VENUE = {
  addressLine: '99 ถนนสุขุมวิท',
  subDistrict: 'คลองตัน',
  district:    'วัฒนา',
  province:    'กรุงเทพมหานคร',
  postalCode:  '10110',
};

/** A COMPLETE, valid Thai submission. Every test below removes one thing. */
const TH = {
  coursesInterested: ['COPILOT-STU'],
  participantsCount: 15,
  contentMode:       'standard',
  preferredMonth:    '2026-09',
  trainingFormat:    'online',
  contactFirstName:  'สมชาย',
  contactLastName:   'ใจดี',
  contactEmail:      'somchai@acme.co.th',
  contactPhone:      '0812345678',
  quotationCountry:  'TH',
  quotationCompany:  'บริษัท ตัวอย่าง จำกัด',
  taxId:             '0105556012345',
  branchType:        'head_office',
  branchCode:        '',
  thaiAddress:       TH_ADDRESS,
};

const parse = (o) => inhouseRegistrationSchema.safeParse(o);
const paths = (r) => r.error.issues.map((i) => i.path.join('.')).sort();
const messageAt = (r, path) =>
  r.error.issues.find((i) => i.path.join('.') === path)?.message;

test('the full Thai submission passes', () => {
  const r = parse(TH);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

// ── One missing quotation field at a time ───────────────────────────────────

const REQUIRED_TH = [
  ['quotationCompany',        { quotationCompany: '' }],
  ['taxId',                   { taxId: '' }],
  ['thaiAddress.addressLine', { thaiAddress: { ...TH_ADDRESS, addressLine: '' } }],
  ['thaiAddress.subDistrict', { thaiAddress: { ...TH_ADDRESS, subDistrict: '' } }],
  ['thaiAddress.district',    { thaiAddress: { ...TH_ADDRESS, district: '' } }],
  ['thaiAddress.province',    { thaiAddress: { ...TH_ADDRESS, province: '' } }],
  ['thaiAddress.postalCode',  { thaiAddress: { ...TH_ADDRESS, postalCode: '' } }],
];

for (const [path, override] of REQUIRED_TH) {
  test(`TH: a submission missing ${path} fails`, () => {
    const r = parse({ ...TH, ...override });
    assert.equal(r.success, false, `${path} should be required`);
    assert.ok(paths(r).includes(path), `expected an issue at ${path}, got ${JSON.stringify(paths(r))}`);
  });
}

test('TH: no address object at all is a single, readable failure', () => {
  const r = parse({ ...TH, thaiAddress: null });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'thaiAddress'), 'กรุณากรอกที่อยู่');
});

test("the in-house address messages are the SAME STRINGS as the public flow's", () => {
  /**
   * The two schema files declare this shape SEPARATELY — deliberately, so a
   * message approved for one flow does not ship in the other by accident. What
   * is not acceptable is silent drift, so the pairs are asserted equal here.
   * If a message is intentionally changed on one side, this test is where that
   * decision gets made rather than discovered.
   */
  const blank = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };
  const mine  = inhouseRegistrationSchema.safeParse({ ...TH, thaiAddress: blank });
  const yours = publicThaiAddressSchema.safeParse(blank);
  assert.equal(mine.success, false);
  assert.equal(yours.success, false);

  const mineByField = Object.fromEntries(
    mine.error.issues
      .filter((i) => i.path[0] === 'thaiAddress')
      .map((i) => [i.path[1], i.message])
  );
  const yoursByField = Object.fromEntries(yours.error.issues.map((i) => [i.path[0], i.message]));
  assert.deepEqual(mineByField, yoursByField);
});

// ── Tax ID: exactly 13 digits ───────────────────────────────────────────────

test('a 12-digit and a 14-digit tax id both fail', () => {
  for (const taxId of ['010555601234', '01055560123456']) {
    const r = parse({ ...TH, taxId });
    assert.equal(r.success, false, `${taxId} (${taxId.length} digits) should fail`);
    assert.equal(messageAt(r, 'taxId'), 'เลขประจำตัวผู้เสียภาษี 13 หลัก');
  }
});

test('13 NON-digits fail — the rule is digits, not length', () => {
  const r = parse({ ...TH, taxId: '01055560123AB' });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'taxId'), 'เลขประจำตัวผู้เสียภาษี 13 หลัก');
});

// ── Branch: the structured pair ─────────────────────────────────────────────

test('a 4-digit and a 6-digit branch code both fail', () => {
  for (const branchCode of ['0001', '000001']) {
    const r = parse({ ...TH, branchType: 'branch', branchCode });
    assert.equal(r.success, false, `${branchCode} should fail`);
    assert.equal(messageAt(r, 'branchCode'), 'เลขที่สาขา 5 หลัก');
  }
});

test('a sub-branch with NO code fails', () => {
  const r = parse({ ...TH, branchType: 'branch', branchCode: '' });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'branchCode'), 'เลขที่สาขา 5 หลัก');
});

test('a sub-branch with exactly 5 digits passes', () => {
  const r = parse({ ...TH, branchType: 'branch', branchCode: '00001' });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
  assert.equal(r.data.branchCode, '00001');
});

test('THE RULING: head_office + a leftover code NORMALISES to empty, it does not reject', () => {
  /**
   * A DECISION, pinned. The alternative — rejecting the pair — dead-ends the
   * form: the code input is HIDDEN whenever the type is head office, so the
   * user would be shown an error about a field they can neither see nor clear.
   * The only outcome that is both consistent in the database and escapable in
   * the UI is to blank it.
   */
  const r = parse({ ...TH, branchType: 'head_office', branchCode: '00042' });
  assert.equal(r.success, true, 'must NOT reject');
  assert.equal(r.data.branchCode, '', 'and must not store the orphaned code either');
});

test('NOTHING writes a derived `branch` string', () => {
  // One value under two names is how the wrong one reaches a template. The path
  // survives on the Mongoose schema for old documents; zod is in strip mode, so
  // a client that still sends it has it dropped here.
  const r = parse({ ...TH, branchType: 'branch', branchCode: '00001', branch: 'สาขาที่ 00001' });
  assert.equal(r.success, true);
  assert.equal('branch' in r.data, false);
});

// ── trainingFormat: no preselection, and required ───────────────────────────

test('trainingFormat is REQUIRED and has no default', () => {
  // The old default was 'flexible', which no longer exists as an option.
  // Defaulting to 'onsite' instead would put a venue form in front of every
  // customer and record a preference nobody expressed.
  assert.equal(inhouseRegistrationDefaults.trainingFormat, '');
  for (const trainingFormat of ['', undefined, 'flexible']) {
    const r = parse({ ...TH, trainingFormat });
    assert.equal(r.success, false, `${JSON.stringify(trainingFormat)} must not pass`);
    assert.equal(messageAt(r, 'trainingFormat'), 'กรุณาเลือกรูปแบบการอบรม');
  }
});

// ── The onsite venue ────────────────────────────────────────────────────────

test('onsite requires the venue in FULL, with the address messages', () => {
  const r = parse({ ...TH, trainingFormat: 'onsite', onsiteVenue: { ...VENUE, province: '', postalCode: '' } });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'onsiteVenue.province'), 'กรุณาเลือกจังหวัด');
  assert.equal(messageAt(r, 'onsiteVenue.postalCode'), 'รหัสไปรษณีย์ 5 หลัก');
});

test('onsite with a complete venue passes; ONLINE does not need one at all', () => {
  assert.equal(parse({ ...TH, trainingFormat: 'onsite', onsiteVenue: VENUE }).success, true);
  assert.equal(parse({ ...TH, trainingFormat: 'online', onsiteVenue: null }).success, true);
  // …and an online enquiry carrying a blank venue object is not punished for it.
  const blank = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };
  assert.equal(parse({ ...TH, trainingFormat: 'online', onsiteVenue: blank }).success, true);
});

test('the venue is NOT written to the legacy onsiteAddress path', () => {
  const r = parse({ ...TH, trainingFormat: 'onsite', onsiteVenue: VENUE, onsiteAddress: '99 ถนนสุขุมวิท' });
  assert.equal(r.success, true);
  assert.equal('onsiteAddress' in r.data, false, 'a String path must never receive a subdocument');
  assert.deepEqual(r.data.onsiteVenue, VENUE);
});

// ── The removed fields ──────────────────────────────────────────────────────

test('the removed fields are STRIPPED, not merely optional', () => {
  // Sent by a stale client or a leftover sessionStorage draft. Zod's strip mode
  // means they never reach RegisterInhouse.create — which is what keeps the
  // legacy Mongoose paths genuinely write-free.
  const r = parse({
    ...TH,
    skillLevel: 'mixed',
    objective: 'ยกระดับทักษะ',
    onsiteEquipment: ['Projector / Display'],
    scheduleMode: 'dateRange',
    preferredDateFrom: '2026-09-01',
    preferredDateTo: '2026-09-03',
    companyName: 'ACME (Thailand)',
  });
  assert.equal(r.success, true);
  for (const gone of ['skillLevel', 'objective', 'onsiteEquipment', 'scheduleMode', 'preferredDateFrom', 'preferredDateTo', 'companyName']) {
    assert.equal(gone in r.data, false, `${gone} must not survive parsing`);
  }
});

// ── participantsCount: a FLOOR of 15 ────────────────────────────────────────

test('14 is rejected, 15 and 16 are accepted', () => {
  // In-house is sold in rounds of 15. The disabled minus button is the
  // affordance; THIS is the rule, and it is the one a hand-crafted POST or an
  // admin allowlist write has to get past.
  const r14 = parse({ ...TH, participantsCount: 14 });
  assert.equal(r14.success, false, '14 is below the floor');
  assert.equal(messageAt(r14, 'participantsCount'), 'จำนวนผู้เข้าอบรมขั้นต่ำ 15 ท่าน');

  assert.equal(parse({ ...TH, participantsCount: 15 }).success, true, '15 is the floor, not below it');
  assert.equal(parse({ ...TH, participantsCount: 16 }).success, true);
});

test('the floor holds all the way down, and the message names the number', () => {
  // A single boundary test passes against `min(14)` too. These do not.
  for (const n of [0, 1, 3, 13]) {
    const r = parse({ ...TH, participantsCount: n });
    assert.equal(r.success, false, `${n} must fail`);
    assert.equal(messageAt(r, 'participantsCount'), 'จำนวนผู้เข้าอบรมขั้นต่ำ 15 ท่าน');
  }
});

test('the default is 15 and survives an omitted key', () => {
  // `.default(15)` and `.min(15)` have to agree: a default below the floor
  // would make an omitted field fail with a message about a value the client
  // never sent.
  assert.equal(inhouseRegistrationDefaults.participantsCount, 15);
  const { participantsCount, ...noCount } = TH;
  const r = parse(noCount);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
  assert.equal(r.data.participantsCount, 15);
});

test('the floor does not swallow the integer rule', () => {
  // 15.5 is above the floor and still invalid. Without this, replacing
  // `.int().min(15)` with a bare `.min(15)` would go unnoticed.
  assert.equal(parse({ ...TH, participantsCount: 15.5 }).success, false);
  assert.equal(parse({ ...TH, participantsCount: '15' }).success, false, 'and it is a number, not a numeric string');
});

test('CONTROL: the floor probes DO pass on a value above it', () => {
  // Without this, a rule that rejected every count would satisfy all four
  // rejection tests above.
  assert.equal(parse({ ...TH, participantsCount: 200 }).success, true);
});

test('the UPPER bound is still UI-only — the schema does not cap it', () => {
  /**
   * Stated rather than discovered. The stepper's 999 is a UI clamp and always
   * was; nothing in the schema enforces it, so a hand-crafted POST for 5000
   * people is accepted today exactly as it was before the floor landed. Pinned
   * so that if a ceiling is ever wanted, this test is where the decision
   * happens instead of a surprise rejection in production.
   */
  assert.equal(parse({ ...TH, participantsCount: 5000 }).success, true);
});

test('preferredMonth is required unconditionally — there is no mode to escape through', () => {
  const r = parse({ ...TH, preferredMonth: '' });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'preferredMonth'), 'กรุณาเลือกเดือนที่สนใจ');
});

test("contentMode's third option is gone", () => {
  assert.equal(parse({ ...TH, contentMode: 'custom' }).success, true);
  assert.equal(parse({ ...TH, contentMode: 'consult' }).success, false, "'consult' was removed");
});

// ── 'Other country': English only ───────────────────────────────────────────

const OTHER = {
  ...TH,
  quotationCountry: 'OTHER',
  quotationCompany: 'ACME Pte. Ltd.',
  taxId: '',
  thaiAddress: null,
  internationalAddress: {
    line1: '1 Raffles Place',
    line2: '#12-04',
    city: 'Singapore',
    state: '',
    postalCode: '048616',
    country: 'Singapore',
  },
};

test('a complete foreign submission passes, punctuation and all', () => {
  const r = parse(OTHER);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

test("a foreign address accepts `Côte d'Ivoire` — an allowlist would not", () => {
  const r = parse({
    ...OTHER,
    internationalAddress: { ...OTHER.internationalAddress, country: "Côte d'Ivoire", city: 'Abidjan' },
  });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

test('EVERY text field in the foreign branch rejects Thai characters', () => {
  const FIELDS = [
    ['quotationCompany', { quotationCompany: 'บริษัท ตัวอย่าง จำกัด' }],
    ['taxId',            { taxId: 'ภาษี123' }],
    ['internationalAddress.line1',      { internationalAddress: { ...OTHER.internationalAddress, line1: '1 ถนนสุขุมวิท' } }],
    ['internationalAddress.line2',      { internationalAddress: { ...OTHER.internationalAddress, line2: 'ชั้น 12' } }],
    ['internationalAddress.city',       { internationalAddress: { ...OTHER.internationalAddress, city: 'กรุงเทพฯ' } }],
    ['internationalAddress.state',      { internationalAddress: { ...OTHER.internationalAddress, state: 'ภาคกลาง' } }],
    ['internationalAddress.postalCode', { internationalAddress: { ...OTHER.internationalAddress, postalCode: '๑๐๑๑๐' } }],
    ['internationalAddress.country',    { internationalAddress: { ...OTHER.internationalAddress, country: 'ไทย' } }],
  ];
  for (const [path, override] of FIELDS) {
    const r = parse({ ...OTHER, ...override });
    assert.equal(r.success, false, `${path} must reject Thai`);
    assert.equal(messageAt(r, path), 'กรุณากรอกเป็นภาษาอังกฤษ', `wrong message at ${path}`);
  }
});

test('the foreign branch still requires line1, city and country', () => {
  const r = parse({
    ...OTHER,
    internationalAddress: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
  });
  assert.equal(r.success, false);
  assert.equal(messageAt(r, 'internationalAddress.line1'), 'กรุณากรอกที่อยู่');
  assert.equal(messageAt(r, 'internationalAddress.city'), 'กรุณากรอกเมือง');
  assert.equal(messageAt(r, 'internationalAddress.country'), 'กรุณากรอกประเทศ');
  assert.equal(paths(r).includes('internationalAddress.state'), false, 'state stays optional');
  assert.equal(paths(r).includes('internationalAddress.postalCode'), false, 'postal code stays optional');
});

test('a foreign submission is NOT held to the Thai tax-id or branch rules', () => {
  // The 13-digit rule and the branch dropdown are Thai Revenue-Department
  // concepts. Applying them abroad would make a foreign quotation impossible.
  const r = parse({ ...OTHER, taxId: 'SG-198765432W', branchType: 'branch', branchCode: '' });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(paths(r)));
});

test('CONTROL: the Thai-character probes DO pass when the same fields are English', () => {
  // Without this, a rule that rejected everything would satisfy every
  // assertion above.
  assert.equal(parse({ ...OTHER, quotationCompany: 'ACME Pte. Ltd.' }).success, true);
  assert.equal(parse({ ...OTHER, taxId: 'VAT-123' }).success, true);
});
