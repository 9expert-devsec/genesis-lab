import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCareerPathRegistrationModel,
  careerPathTrainingTypeLabel,
} from '@/lib/email/models/careerPathRegistrationModel';
import { scheduleTypeLabel } from '@/lib/email/models/labels';
import { NOT_SPECIFIED_LABEL } from '@/lib/orNotSpecified';
import { withTZ } from '../withTZ.mjs';

/**
 * THE CAREER-PATH TemplateModel — the fourth registration mail, and the first
 * with no price in it.
 *
 * ── WHAT A TemplateModel TEST HAS TO PROVE ─────────────────────────────────
 * A Postmark Template holds Subject + HTML + Text and a Mustachio renderer with
 * no conditionals beyond section blocks. So the model is the ONLY place a branch
 * can be decided, and there are exactly three ways it goes wrong, none of which
 * throws:
 *
 *   1. A KEY THAT SHOULD BE ABSENT IS PRESENT-BUT-EMPTY. `''` renders into the
 *      middle of a sentence; `null` renders a section as an empty block that is
 *      visually identical to a correct hide. Both look fine in a JSON dump and
 *      wrong in a mail.
 *   2. A LABEL IS RESOLVED WRONG. Mustachio cannot map a value to a label, so a
 *      mode chosen by the customer either arrives correct or arrives plausible.
 *   3. A DATE MOVES. The builder runs on Vercel, in UTC; the customer reads
 *      Bangkok. This repo has shipped a seven-hour error before.
 *
 * Every test below is one of those three. The exact-key-set assertions are the
 * first, and they are written as `deepEqual` on the sorted key list rather than
 * as a series of `ok(model.x)` — an extra key nobody reads is how a model and a
 * template drift apart, and only an exact set catches one.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/** TH corporate, coordinator attending, three people, everything filled in. */
const TH_CORPORATE = {
  careerName: 'Data Analyst Career Path',
  selectedCourses: [
    {
      courseName: 'Power BI Desktop',
      // The defect this whole phase exists for: three days, not a span.
      round: '8–12 ต.ค. 2569',
      dates: ['2026-10-08', '2026-10-10', '2026-10-12'],
      type: 'classroom',
    },
    {
      courseName: 'Advanced Excel for Data Analysis',
      round: '30 พ.ย. – 1 ธ.ค. 2569',
      dates: ['2026-11-30', '2026-12-01'],
      type: 'Hybrid (MS Teams)',
    },
    {
      // A document written before the day list was persisted.
      courseName: 'SQL for Analysts',
      round: '15–16 ธ.ค. 2569',
      dates: [],
      type: 'online',
    },
  ],
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.co.th',
  contactPhone: '0891112222',
  isCoordinator: true,
  attendeeCount: 3,
  skipAttendee: false,
  attendees: [
    { firstName: 'สมหญิง', lastName: 'รักเรียน', email: 'somying@example.co.th', phone: '0812223333' },
    { firstName: 'ปิติ', lastName: 'มานะ', email: '', phone: '' },
  ],
  taxType: 'company',
  companyName: 'บริษัท ตัวอย่าง จำกัด',
  companyTaxId: '0105551234567',
  personalTaxId: '',
  taxFirstName: '',
  taxLastName: '',
  companyBranch: '',
  branchType: 'branch',
  branchCode: '00012',
  branchFree: '',
  invoiceCountry: 'TH',
  countryName: '',
  taxAddress: '199/22 อาคารตัวอย่าง ชั้น 8',
  subdistrict: 'ลุมพินี',
  district: 'ปทุมวัน',
  province: 'กรุงเทพมหานคร',
  zipcode: '10330',
  note: 'ขอใบเสนอราคาในนามบริษัท',
};

/** International individual, names deferred, no tax id, no note. */
const INTL_INDIVIDUAL = {
  careerName: 'Data Engineer Career Path',
  selectedCourses: [
    {
      courseName: 'Python for Data Engineering',
      round: '5–6 ม.ค. 2570',
      dates: ['2027-01-05', '2027-01-06'],
      type: 'Hybrid (Classroom)',
    },
  ],
  contactFirstName: 'Alex',
  contactLastName: 'Tan',
  contactEmail: 'alex.tan@example.sg',
  contactPhone: '+6591234567',
  isCoordinator: false,
  attendeeCount: 4,
  skipAttendee: true,
  attendees: [],
  taxType: 'personal',
  companyName: '',
  companyTaxId: '',
  personalTaxId: '',
  taxFirstName: 'Alex',
  taxLastName: 'Tan',
  companyBranch: '',
  branchType: 'head_office',
  branchCode: '',
  branchFree: '',
  invoiceCountry: 'OTHER',
  countryName: 'Singapore',
  taxAddress: '10 Anson Road #12-05',
  subdistrict: 'Singapore',
  district: '',
  province: '',
  zipcode: '079903',
  note: '',
};

const build = (registration, coverImage = '') =>
  buildCareerPathRegistrationModel({ registration, coverImage });

const keys = (o) => Object.keys(o).sort();

// ── 1. The exact key set, in both directions ────────────────────────────────

test('the maximal document emits exactly the documented keys', () => {
  const m = build(TH_CORPORATE, 'https://cdn.example/banner.jpg');

  assert.deepEqual(keys(m), [
    'attendee_later',
    'attendee_list',
    'billing_company',
    'billing_notes',
    'billing_personal',
    'career_path_name',
    'coordinator_email',
    'coordinator_name',
    'coordinator_phone',
    'course_image',
    'courses',
    'total_participants',
  ]);
});

test('NO price key of any kind, and no ref_no', () => {
  /**
   * Named individually rather than left to the exact-set test above, because
   * this is a RULE about this mail and not an inventory: a Career Path quotation
   * is prepared by hand and there is no number on the document that could be
   * quoted without inventing it. The bundle model's keys are the ones that would
   * plausibly be copied across.
   */
  const m = build(TH_CORPORATE, 'https://cdn.example/banner.jpg');
  for (const banned of ['package_price', 'price', 'net_text', 'list_text', 'discount', 'ref_no']) {
    assert.equal(banned in m, false, `${banned} must not appear in a career-path mail`);
  }
});

test('the minimal document OMITS every optional key rather than emptying it', () => {
  const m = build(INTL_INDIVIDUAL);

  assert.deepEqual(keys(m), [
    'attendee_later',
    'billing_company',
    'billing_personal',
    'career_path_name',
    'coordinator_email',
    'coordinator_name',
    'coordinator_phone',
    'courses',
    'total_participants',
  ]);

  // Stated as absence, not as falsiness — `'course_image' in m` is the claim,
  // and `!m.course_image` would pass on an empty string, which renders src="".
  for (const omitted of ['course_image', 'attendee_list', 'billing_notes']) {
    assert.equal(omitted in m, false, `${omitted} must be ABSENT, not empty`);
  }
});

test('an absent cover omits the key; a present one is the bare string', () => {
  assert.equal('course_image' in build(TH_CORPORATE, ''), false);
  assert.equal('course_image' in build(TH_CORPORATE), false);
  assert.equal(build(TH_CORPORATE, 'https://cdn.example/x.jpg').course_image, 'https://cdn.example/x.jpg');
});

test('the four { text } blocks are omitted on blanks, never sent as empty strings', () => {
  const blank = {
    ...TH_CORPORATE,
    companyTaxId: '',
    branchType: 'head_office',
    branchCode: '',
    // Whitespace-only, because `textBlock` trims — a spaces-only note is blank.
    note: '   ',
    taxAddress: '',
    subdistrict: '',
    district: '',
    province: '',
    zipcode: '',
  };
  const m = build(blank);

  assert.equal('billing_notes' in m, false);
  assert.equal('billing_tax_id' in m.billing_company, false);
  assert.equal('billing_address' in m.billing_company, false);
  // head_office on a TH invoice is a real label, so THIS one is present — the
  // control that stops the assertions above passing for the wrong reason.
  assert.deepEqual(m.billing_company.billing_branch, { text: 'สำนักงานใหญ่' });
});

// ── 2. The three-state blocks ───────────────────────────────────────────────

test('attendee_later is { show: true } or false, and NEVER the boolean true', () => {
  /**
   * Mustachio enters `{{#attendee_later}}` with the value as its context. A bare
   * `true` gives it nothing to enter with, the block does not render, and the
   * "we will collect the names later" note goes missing on exactly the
   * registrations that need it — silently.
   */
  assert.deepEqual(build(INTL_INDIVIDUAL).attendee_later, { show: true });
  assert.equal(build(TH_CORPORATE).attendee_later, false);
  assert.notEqual(build(INTL_INDIVIDUAL).attendee_later, true);
});

test('billing_personal and billing_company are mutually exclusive, from taxType', () => {
  const corp = build(TH_CORPORATE);
  assert.equal(corp.billing_personal, false);
  assert.equal(typeof corp.billing_company, 'object');
  assert.equal(corp.billing_company.billing_company_name, 'บริษัท ตัวอย่าง จำกัด');

  const person = build(INTL_INDIVIDUAL);
  assert.equal(person.billing_company, false);
  assert.equal(person.billing_personal.billing_name, 'Alex Tan');

  // `false`, never null — Mustachio renders a null section as an empty one, so
  // a bug that blanks a live block is indistinguishable from a correct hide.
  for (const m of [corp, person]) {
    assert.notEqual(m.billing_personal, null);
    assert.notEqual(m.billing_company, null);
  }
});

// ── 3. The headcount, and who is in the table ───────────────────────────────

test('total_participants is attendeeCount — never attendees.length', () => {
  /**
   * The two disagree on every document. `attendees` excludes the coordinator and
   * is empty outright when the names were deferred: this fixture says 4 people
   * with an empty array, which is the case that makes the difference visible.
   */
  assert.equal(build(INTL_INDIVIDUAL).total_participants, 4);
  assert.equal(INTL_INDIVIDUAL.attendees.length, 0, 'the fixture must actually disagree');

  assert.equal(build(TH_CORPORATE).total_participants, 3);
  assert.equal(TH_CORPORATE.attendees.length, 2, 'the fixture must actually disagree');
});

test('the coordinator is reconstructed as index 1, and the table length equals the headcount', () => {
  const m = build(TH_CORPORATE);

  assert.deepEqual(m.attendee_list.items.map((a) => a.index), [1, 2, 3]);
  assert.equal(m.attendee_list.items.length, m.total_participants);
  assert.equal(m.attendee_list.items[0].name, 'สมชาย ใจดี', 'slot 1 is the coordinator');
  assert.equal(m.attendee_list.items[0].email, 'somchai@example.co.th');
  assert.equal(m.attendee_list.items[1].name, 'สมหญิง รักเรียน');
});

test('with the coordinator NOT attending the stored rows start at index 1', () => {
  const m = build({
    ...TH_CORPORATE,
    isCoordinator: false,
    attendeeCount: 2,
  });
  assert.deepEqual(m.attendee_list.items.map((a) => a.name), ['สมหญิง รักเรียน', 'ปิติ มานะ']);
  assert.deepEqual(m.attendee_list.items.map((a) => a.index), [1, 2]);
});

test('blank attendee contact reads as the shared NOT_SPECIFIED marker', () => {
  const m = build(TH_CORPORATE);
  const piti = m.attendee_list.items[2];
  assert.equal(piti.email, NOT_SPECIFIED_LABEL);
  assert.equal(piti.phone, NOT_SPECIFIED_LABEL);
  assert.notEqual(piti.email, '', 'an empty cell reads as a rendering fault, not as a fact');
});

// ── 3b. THE GHOST ROW ───────────────────────────────────────────────────────

/**
 * `attendees` can be LONGER than the slots it fills, and this is the document
 * shape that produced a sent mail with three rows over a "2 ท่าน" heading.
 *
 * The form registers `attendees.0` and `attendees.1` when จำนวนผู้สมัคร is 2
 * with the coordinator box unticked. Ticking the box re-renders one row, but the
 * form leaves react-hook-form at its default `shouldUnregister: false`, so index
 * 1 survives in form state and reaches Mongo. The builder then emitted the
 * coordinator plus BOTH stored rows, the third with an empty name and
 * ไม่ได้ระบุ in both contact columns.
 */
const GHOST = {
  ...TH_CORPORATE,
  isCoordinator: true,
  attendeeCount: 2,
  attendees: [
    { firstName: 'สมหญิง', lastName: 'รักเรียน', email: 'somying@example.co.th', phone: '0812223333' },
    { firstName: '', lastName: '', email: '', phone: '' },
  ],
};

test('(ghost) the table is capped at attendeeCount, ticked', () => {
  const m = build(GHOST);

  assert.equal(m.attendee_list.items.length, 2, 'the blank third row is back');
  assert.equal(m.attendee_list.items.length, m.total_participants);
  assert.deepEqual(m.attendee_list.items.map((a) => a.index), [1, 2]);
  assert.deepEqual(m.attendee_list.items.map((a) => a.name), ['สมชาย ใจดี', 'สมหญิง รักเรียน']);

  assert.equal(GHOST.attendees.length, 2, 'the fixture must actually carry a ghost');
});

test('(ghost) no row is ever empty-named with both contacts unspecified', () => {
  /**
   * The signature the customer saw. Asserted as a SHAPE rather than as a count,
   * because a future off-by-one that produces the same row by another route
   * should still be caught here.
   */
  for (const item of build(GHOST).attendee_list.items) {
    assert.notEqual(
      `${item.name}|${item.email}|${item.phone}`,
      `|${NOT_SPECIFIED_LABEL}|${NOT_SPECIFIED_LABEL}`,
      'a ghost row reached the mail'
    );
  }
});

test('(ghost) the table is capped at attendeeCount, UNticked', () => {
  // The unticked path was correct only by luck — three stored rows against a
  // count of 2 breaks it the same way.
  const m = build({
    ...GHOST,
    isCoordinator: false,
    attendees: [
      GHOST.attendees[0],
      { firstName: 'ปิติ', lastName: 'มานะ', email: 'piti@example.co.th', phone: '0823334444' },
      { firstName: '', lastName: '', email: '', phone: '' },
    ],
  });

  assert.equal(m.attendee_list.items.length, 2);
  assert.deepEqual(m.attendee_list.items.map((a) => a.name), ['สมหญิง รักเรียน', 'ปิติ มานะ']);
});

test('(ghost) the cap NEVER pads — a missing name stays missing', () => {
  /**
   * The other half, and the one that matters for not re-introducing the bug from
   * the opposite direction: three people requested, one name typed, coordinator
   * attending. Two rows, not three. Inventing the third IS the defect.
   */
  const m = build({ ...GHOST, attendeeCount: 3, attendees: [GHOST.attendees[0]] });
  assert.equal(m.attendee_list.items.length, 2);
  assert.equal(m.total_participants, 3, 'the headcount still states what was asked for');
});

test('(ghost) total_participants and the table read the SAME count', () => {
  /**
   * They were two expressions — `attendeeCount ?? 1` and `1 + attendees.length`
   * — and that is how they came to disagree. One helper now feeds both, so a
   * broken count moves them together rather than apart.
   */
  for (const broken of [undefined, null, 0, -3, 'two', NaN]) {
    const m = build({ ...GHOST, attendeeCount: broken, attendees: [GHOST.attendees[0]] });
    assert.equal(m.total_participants, 1, `attendeeCount ${String(broken)} must fall back to 1`);
    assert.equal(
      m.attendee_list.items.length,
      1,
      `attendeeCount ${String(broken)} must cap the table to match`
    );
    assert.equal(m.attendee_list.items[0].name, 'สมชาย ใจดี', 'the coordinator holds slot 1');
  }
});

test('(ghost) CONTROL: the pre-fix arithmetic really did produce three rows', () => {
  /**
   * Without this the count assertions above are vacuous — a fixture that never
   * had a ghost proves nothing about removing one. This is the old expression,
   * `1 + attendees.length`, run on the same fixture.
   */
  const preFix = (reg) => (reg.isCoordinator ? 1 : 0) + reg.attendees.length;
  assert.equal(preFix(GHOST), 3, 'the fixture must reproduce the defect');
  assert.equal(build(GHOST).attendee_list.items.length, 2, 'and the fix must remove it');

  // And the skip path is untouched by any of it.
  assert.equal('attendee_list' in build({ ...GHOST, skipAttendee: true }), false);
});

// ── 4. training_type_label — the trap this map exists for ───────────────────

test('the four stored values map to the mode the customer will attend in', () => {
  assert.equal(careerPathTrainingTypeLabel('classroom'), 'Classroom');
  assert.equal(careerPathTrainingTypeLabel('online'), 'Online ผ่าน Microsoft Teams');
  assert.equal(careerPathTrainingTypeLabel('Hybrid (Classroom)'), 'Classroom');
  assert.equal(careerPathTrainingTypeLabel('Hybrid (MS Teams)'), 'Online ผ่าน Microsoft Teams');
});

test('THE TRAP: scheduleTypeLabel gets the hybrid pair WRONG, and this map does not', () => {
  /**
   * The reason for a career-path-specific map, asserted against the function it
   * would otherwise have reused. `scheduleTypeLabel` tests `=== 'hybrid'`, which
   * neither stored string satisfies, so it falls through to Classroom for BOTH —
   * telling a customer who chose MS Teams to come to the training room.
   *
   * Asserted as a fact about the OTHER function, so that if it is ever fixed
   * this test says so instead of quietly agreeing.
   */
  assert.equal(scheduleTypeLabel('Hybrid (MS Teams)'), 'Classroom', 'the trap is still live');
  assert.notEqual(
    careerPathTrainingTypeLabel('Hybrid (MS Teams)'),
    scheduleTypeLabel('Hybrid (MS Teams)'),
    'this map must not agree with the function that gets it wrong'
  );
});

test('the label never says the word Hybrid back to the customer', () => {
  // They have finished choosing; repeating the offer answers a question they
  // have already answered. What they need is where to be.
  for (const stored of ['Hybrid (Classroom)', 'Hybrid (MS Teams)']) {
    assert.doesNotMatch(careerPathTrainingTypeLabel(stored), /Hybrid/i);
  }
});

test('an unrecognised mode is REPORTED, not guessed at', () => {
  // The raw value, which is visibly wrong and therefore reportable. Relabelling
  // an unknown mode as Classroom tells the customer something false.
  assert.equal(careerPathTrainingTypeLabel('teams-only'), 'teams-only');
  assert.equal(careerPathTrainingTypeLabel('hybrid'), 'hybrid', 'an UNRESOLVED pick must not read as Classroom');
  assert.equal(careerPathTrainingTypeLabel(''), '');
  assert.equal(careerPathTrainingTypeLabel(undefined), '');
});

test('the map is case- and whitespace-insensitive — the stored vocabulary is mixed', () => {
  // The form lower-cases the schedule type but writes the two hybrid strings in
  // title case, so both spellings are genuine stored data.
  assert.equal(careerPathTrainingTypeLabel('CLASSROOM'), 'Classroom');
  assert.equal(careerPathTrainingTypeLabel(' hybrid (ms teams) '), 'Online ผ่าน Microsoft Teams');
});

// ── 5. course_date — the days, and the day they must not move ──────────────

test('a gapped round renders its DAYS, not a span', () => {
  // 8, 10, 12 — nothing on the 9th or the 11th. "8–12" advertises training on
  // two days that do not exist, which is what the stored `round` still says.
  const m = build(TH_CORPORATE);
  assert.equal(m.courses.items[0].course_date, '8, 10, 12 ต.ค. 69');
  assert.equal(TH_CORPORATE.selectedCourses[0].round, '8–12 ต.ค. 2569', 'the fixture must disagree');
});

test('a round crossing a month keeps both months', () => {
  assert.equal(build(TH_CORPORATE).courses.items[1].course_date, '30 พ.ย. - 1 ธ.ค. 69');
});

test('a document with no day list falls back to its stored round string', () => {
  const m = build(TH_CORPORATE);
  assert.equal(m.courses.items[2].course_date, '15–16 ธ.ค. 2569');
  assert.deepEqual(TH_CORPORATE.selectedCourses[2].dates, [], 'the fixture must have no days');
});

test('with neither days nor a round the row still says something', () => {
  const m = build({
    ...TH_CORPORATE,
    selectedCourses: [{ courseName: 'X', dates: [], round: '', type: 'classroom' }],
  });
  assert.equal(m.courses.items[0].course_date, 'ตามรอบที่กำหนด');
});

test('THE DATE DOES NOT MOVE WITH THE RUNTIME ZONE', () => {
  /**
   * The constraint the whole `isoDaysToDates` helper exists for. `new Date(
   * '2026-10-08')` is UTC midnight and every calendar getter after it is LOCAL,
   * so on a zone behind UTC the label slides back a day. Vercel runs UTC and the
   * customer reads Bangkok; a mail is the one surface where nobody notices for a
   * week.
   *
   * Los Angeles is the load-bearing case (UTC-7/8 — the direction that breaks);
   * Bangkok and UTC are the two zones this actually runs in. Synchronous, per
   * withTZ's contract: the runner is isolation:'none' with concurrency.
   */
  const expected = ['8, 10, 12 ต.ค. 69', '30 พ.ย. - 1 ธ.ค. 69', '15–16 ธ.ค. 2569'];

  for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
    const dates = withTZ(tz, () => build(TH_CORPORATE).courses.items.map((c) => c.course_date));
    assert.deepEqual(dates, expected, `the label moved in ${tz}`);
  }
});

test('…and the DAY NUMBERS hold even at the extreme offsets', () => {
  /**
   * The sweep above stops at Los Angeles deliberately, and the reason is worth
   * writing down rather than rediscovering.
   *
   * `roundDateLabel` builds its two `Intl.DateTimeFormat` objects at MODULE LOAD,
   * so they capture the zone the process started in. `withTZ` mutates
   * `process.env.TZ` afterwards, which moves the calendar GETTERS but not those
   * already-constructed formatters. Past a large enough offset the two disagree
   * and the MONTH TEXT slides while the day numbers do not — at UTC+14,
   * `30 พ.ย. - 1 ธ.ค.` renders its second month as พ.ย.
   *
   * That is an artefact of mutating the zone mid-process, not a production
   * condition: a deployment has one zone for the life of the process and the
   * getters and the formatters agree. It is also not this builder's to fix —
   * those formatters belong to the shared module, and re-creating them per call
   * would be a change to every schedule surface in the repo.
   *
   * So the extreme zones assert the part this file IS responsible for: the DAY
   * NUMBERS, which are exactly what `isoDaysToDates` decides and exactly what a
   * `new Date(isoString)` parse would move.
   */
  const days = (tz) =>
    withTZ(tz, () =>
      build(TH_CORPORATE)
        .courses.items.map((c) => c.course_date.match(/\d+/g).join(','))
    );

  const atUtc = days('UTC');
  assert.deepEqual(atUtc[0].split(',').slice(0, 3), ['8', '10', '12'], 'the fixture days');

  for (const tz of ['Pacific/Kiritimati', 'Pacific/Niue', 'America/Los_Angeles', 'Asia/Bangkok']) {
    assert.deepEqual(days(tz), atUtc, `the day numbers moved in ${tz}`);
  }
});

test('a null or malformed day is dropped, never coerced to the epoch', () => {
  /**
   * `new Date(null)` is NOT an invalid date — null coerces to 0 and yields 1 Jan
   * 1970. A null in an array straight out of Mongo is entirely ordinary, so the
   * epoch would ship as a real training day fifty-six years in the past.
   */
  const m = build({
    ...TH_CORPORATE,
    selectedCourses: [
      { courseName: 'X', dates: [null, '2026-10-08', '', 'not-a-date', 0], round: 'r', type: 'classroom' },
    ],
  });
  assert.equal(m.courses.items[0].course_date, '8 ต.ค. 69');
  assert.doesNotMatch(m.courses.items[0].course_date, /13|1970/, 'the epoch leaked in');
});

// ── 6. Billing — the two formatters, neither of them re-implemented ────────

test('the branch label comes from branchLabel.js, in its Revenue-Department wording', () => {
  assert.deepEqual(build(TH_CORPORATE).billing_company.billing_branch, { text: 'สาขาที่ 00012' });
});

test('a head-office branch is omitted on an INTERNATIONAL invoice', () => {
  /**
   * สำนักงานใหญ่ is a Thai Revenue-Department concept and means nothing on a
   * Singapore invoice. `branchType` carries its schema default there regardless,
   * so reading it directly would print Thai tax wording onto a foreign document.
   * `formatInvoiceBranchLabel` answers '' for OTHER without a `branchFree`, and
   * an empty label omits the key.
   */
  const m = build(INTL_INDIVIDUAL);
  assert.equal(INTL_INDIVIDUAL.branchType, 'head_office', 'the fixture must carry the default');
  assert.equal('billing_branch' in m.billing_personal, false);
});

test('the legacy companyBranch cannot change the label — it is not consulted', () => {
  /**
   * The builder does not pass `branch` to `formatInvoiceBranchLabel`, and this
   * pins the consequence rather than the omission: a document carrying a legacy
   * free-text branch renders the SAME label as one without it, because
   * `branchType` always has its schema default and the structured pair answers
   * first. Recorded as behaviour so the reason survives a refactor of the call.
   */
  const withLegacy = build({ ...TH_CORPORATE, companyBranch: 'สาขาเก่า ไม่ควรแสดง' });
  assert.deepEqual(withLegacy.billing_company.billing_branch, { text: 'สาขาที่ 00012' });

  const intlWithLegacy = build({ ...INTL_INDIVIDUAL, companyBranch: 'Old HQ' });
  assert.equal('billing_branch' in intlWithLegacy.billing_personal, false);
});

test('the TH address goes through the shared formatter, prefixes and all', () => {
  // Bangkok takes แขวง/เขต; the adapter's only job is to hand the five flat
  // columns over in the shape that function already accepts.
  assert.deepEqual(build(TH_CORPORATE).billing_company.billing_address, {
    text: '199/22 อาคารตัวอย่าง ชั้น 8 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร 10330',
  });
});

test('a non-Bangkok TH address takes the ตำบล/อำเภอ/จังหวัด prefixes', () => {
  const m = build({
    ...TH_CORPORATE,
    subdistrict: 'สุเทพ',
    district: 'เมือง',
    province: 'เชียงใหม่',
    zipcode: '50200',
    taxAddress: '1 ถนนห้วยแก้ว',
  });
  assert.deepEqual(m.billing_company.billing_address, {
    text: '1 ถนนห้วยแก้ว ตำบลสุเทพ อำเภอเมือง จังหวัดเชียงใหม่ 50200',
  });
});

test('an international address carries countryName, LAST in the line', () => {
  /**
   * The country the customer typed had nowhere to go until it was persisted, and
   * an invoice address without its country cannot be posted. It lands at the end
   * of the comma-joined line, after the postal code — that is
   * `formatBillingAddress`'s field order and this adapter does not reorder it.
   */
  const text = build(INTL_INDIVIDUAL).billing_personal.billing_address.text;
  assert.equal(text, '10 Anson Road #12-05, Singapore, 079903, Singapore');
  assert.ok(text.endsWith('Singapore'), 'the country must close the line');
});

// ── 7. Purity ───────────────────────────────────────────────────────────────

test('the builder is a function of its arguments alone', () => {
  // Two calls, one document. A clock read, an env read or a cached mutable would
  // all show up here — and `course_date` is the value that would move.
  assert.deepEqual(build(TH_CORPORATE, 'x.jpg'), build(TH_CORPORATE, 'x.jpg'));
  assert.deepEqual(build(INTL_INDIVIDUAL), build(INTL_INDIVIDUAL));
});

test('it does not mutate the document it was given', () => {
  const doc = structuredClone(TH_CORPORATE);
  build(doc, 'x.jpg');
  assert.deepEqual(doc, TH_CORPORATE, 'the registration was written to');
});

test('a nearly-empty document produces a renderable model rather than throwing', () => {
  // The mail must not be what discovers a malformed record.
  const m = build({});
  assert.equal(m.career_path_name, '');
  assert.deepEqual(m.courses, { items: [] });
  assert.equal(m.total_participants, 1);
  assert.equal(m.attendee_later, false);
  assert.equal(m.billing_company, false);
  assert.equal(typeof m.billing_personal, 'object');
});

// ── 8. Controls ─────────────────────────────────────────────────────────────

test('CONTROL: the key-set assertions can FAIL — an extra key is caught', () => {
  /**
   * `deepEqual` on a sorted list is only as good as its ability to notice one
   * more entry. Without this, a builder that emitted `package_price` alongside
   * everything else would have to be caught by a human reading the list.
   */
  const real = keys(build(TH_CORPORATE, 'x.jpg'));
  assert.throws(() => assert.deepEqual([...real, 'package_price'].sort(), real));
  assert.throws(() => assert.deepEqual(real.slice(1), real));
});

test('CONTROL: withTZ really changes what a naive parse would say', () => {
  /**
   * The TZ sweep above proves the label does NOT move. That claim is worthless
   * if the zone was never actually applied — so this shows the mechanism the
   * builder deliberately avoids DOES move under the same harness.
   */
  const naive = (tz) => withTZ(tz, () => new Date('2026-10-08').getDate());
  assert.equal(naive('Asia/Bangkok'), 8);
  assert.equal(naive('America/Los_Angeles'), 7, 'the zone was not applied — the sweep proves nothing');
});

test('CONTROL: the fixtures exercise both billing branches and both date sources', () => {
  // Every "is absent" assertion above passes on a model built from junk. These
  // pin that the two fixtures really are the two cases they claim to be.
  assert.equal(TH_CORPORATE.taxType, 'company');
  assert.equal(INTL_INDIVIDUAL.taxType, 'personal');
  assert.equal(INTL_INDIVIDUAL.invoiceCountry, 'OTHER');
  assert.ok(TH_CORPORATE.selectedCourses.some((c) => c.dates.length > 0), 'no day-list course');
  assert.ok(TH_CORPORATE.selectedCourses.some((c) => c.dates.length === 0), 'no fallback course');
  assert.equal(build(TH_CORPORATE).courses.items.length, 3);
});
