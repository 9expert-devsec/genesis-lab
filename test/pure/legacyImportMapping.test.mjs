import { test } from 'node:test';
import assert from 'node:assert/strict';

import RegisterPublic from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import {
  classifyBranch,
  mapInhouseRow,
  mapPublicRow,
  mapStatus,
  parseClassDate,
  parseParticipants,
} from '../../scripts/lib/legacy-registration-map.mjs';

/**
 * THE LEGACY IMPORT'S MAPPING RULES, ON FIXTURES.
 *
 * ══ WHY FIXTURES AND NOT THE EXPORT ═════════════════════════════════════════
 * The real export is 2,427 rows of customer names, emails, phone numbers and
 * tax IDs. It is gitignored and must never reach a commit, so it cannot be a
 * test fixture — and a test that needed it would be a test nobody else could
 * run. Every shape below was MEASURED in the export first and then written out
 * by hand with invented people in it; the counts in the comments are the real
 * ones, the data is not.
 *
 * The three controls the round asked for are marked CONTROL. The rest are the
 * companions that stop them passing vacuously.
 */

const NOW = new Date('2026-09-06T00:00:00.000Z');
const COURSE_MAP = {
  2188: { courseId: 'MSE-L2', courseCode: 'MSE-L2', courseName: 'Microsoft Excel Advanced' },
};

/** A minimal public row that maps cleanly, for overriding one field at a time. */
const publicRow = (data = {}, top = {}) => ({
  sid: 1001,
  serial: 7,
  webform_id: 'registration_public',
  created: 1_756_000_000,
  completed: 1_756_000_000,
  remote_addr: '203.0.113.9',
  course_title: 'Microsoft Excel Advanced',
  class_title: 'Microsoft Excel Advanced (May 18-19)',
  data: {
    course: '2188', class: '3344', t: 'classroom', type: 'company',
    firstname: 'Somchai', lastname: 'Prasert', e_mail: 'Somchai@Example.com',
    telephone: '021234567', quantity: '1', not_name: '0',
    admin_status: 'confirm', tax_id: '0105500000000',
    invoice_company: 'Example Co', invoice_branch: 'สำนักงานใหญ่',
    invoice_address: '99 Rama IV, Bangkok 10500',
    ...data,
  },
  ...top,
});

const inhouseRow = (data = {}, top = {}) => ({
  sid: 2001,
  serial: 3,
  webform_id: 'inhouse_registration',
  created: 1_756_000_000,
  completed: 1_756_000_000,
  remote_addr: '203.0.113.9',
  course_title: 'Microsoft Excel Advanced',
  province_postcode: null,
  invoice_province_postcode: null,
  data: {
    course: '2188', firstname: 'Ananya', lastname: 'Wong',
    e_mail: 'ananya@example.com', telephone: '029876543',
    company: 'Example Co', status: 'confirm', format: 'onsite',
    month: '7', participants: '30', tax_id: '0105500000000',
    invoice_company: 'Example Co', invoice_branch: 'สำนักงานใหญ่',
    invoice_address: '99 Rama IV, Bangkok 10500',
    ...data,
  },
  ...top,
});

// ════════════════════════════════════════════════════════════════════════════
// CONTROL 1 — a row already imported inserts nothing on a second pass
// ════════════════════════════════════════════════════════════════════════════

/**
 * The dedup as the script performs it: the set of `legacy.sid` values already in
 * the collection is read FIRST, and a row whose sid is in it is skipped before
 * it is ever mapped.
 *
 * Modelled here rather than imported because the script's own loop is welded to
 * a Mongo connection. The PROPERTY under test is the one that matters — a second
 * pass over the same rows, with the first pass's sids now present, plans zero
 * inserts — and the control below shows it can fail.
 */
function planPass(rows, existingSids, { dedup = true } = {}) {
  const inserts = [];
  let skippedImported = 0;
  for (const row of rows) {
    if (dedup && existingSids.has(row.sid)) { skippedImported++; continue; }
    const { doc, skip } = mapPublicRow(row, { courseMap: COURSE_MAP, now: NOW });
    if (skip) continue;
    inserts.push(doc);
  }
  return { inserts, skippedImported };
}

test('CONTROL: a sid already present inserts nothing on the second pass', () => {
  const rows = [publicRow({}, { sid: 5001 }), publicRow({}, { sid: 5002 })];

  const first = planPass(rows, new Set());
  assert.equal(first.inserts.length, 2, 'the first pass did not plan both rows');
  assert.equal(first.skippedImported, 0);

  // The cutover-night run: the same export, with the first run's sids stored.
  const stored = new Set(first.inserts.map((d) => d.legacy.sid));
  assert.deepEqual([...stored].sort(), [5001, 5002], 'legacy.sid is not carried onto the document');

  const second = planPass(rows, stored);
  assert.equal(second.inserts.length, 0,
    'THE CATCH-UP RUN WOULD RE-INSERT — every row it re-reads becomes a duplicate customer');
  assert.equal(second.skippedImported, 2);

  // A genuinely new row still gets in, so the skip is about the sid and not
  // about the second pass refusing everything.
  const third = planPass([...rows, publicRow({}, { sid: 5003 })], stored);
  assert.equal(third.inserts.length, 1, 'a NEW row was skipped too — the dedup is too broad');
  assert.equal(third.inserts[0].legacy.sid, 5003);
});

test('CONTROL (red): with the sid check removed, the second pass re-inserts everything', () => {
  /**
   * THE SAME FIXTURE, THE SAME TWO PASSES, ONE RULE TAKEN OUT. Without this the
   * assertion above passes for a planner that returns nothing on any second
   * call, and for a mapper that silently fails on the second row.
   */
  const rows = [publicRow({}, { sid: 5001 }), publicRow({}, { sid: 5002 })];
  const stored = new Set([5001, 5002]);

  const withRule = planPass(rows, stored);
  const withoutRule = planPass(rows, stored, { dedup: false });

  assert.equal(withRule.inserts.length, 0);
  assert.equal(withoutRule.inserts.length, 2,
    'removing the dedup changed nothing — then the fixture never had a stored sid to match '
    + 'and the control above is proving nothing');
  assert.notEqual(withRule.inserts.length, withoutRule.inserts.length);
});

// ════════════════════════════════════════════════════════════════════════════
// CONTROL 2 — the four malformed class_title shapes, and the missing-parens case
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: every malformed class_title shape yields the right classDate', () => {
  /**
   * The four shapes, with the count each has in the real export:
   *   1,715  well formed
   *      86  leading space
   *      39  no space before '('
   *       1  en dash U+2013
   * plus single-day rounds, and the 202 titles whose COURSE NAME contains
   * parentheses — which is the shape that breaks a naive first-match.
   */
  const cases = [
    ['Microsoft Excel Advanced (May 18-19)', 'May 18-19', 'well formed'],
    [' Canva AI for Business Accelerator (Apr 2-3)', 'Apr 2-3', 'leading space'],
    ['Agentic AI Development With Google ADK And Python(May 28)', 'May 28', 'no space before ('],
    ['Python Programming (Oct 27–29)', 'Oct 27–29', 'en dash, preserved as written'],
    ['Microsoft Excel Business Intelligence (Jun 24)', 'Jun 24', 'single-day round'],
    ['Power Automate (Cloud) for Business Automation (May 11-12)', 'May 11-12', 'parens in the course NAME'],
    ['Data Analysis Expression (DAX) for Power BI (May 25-26)', 'May 25-26', 'parens in the course NAME'],
    ['  Advanced Power Automate (Cloud) (Jun 22-23)  ', 'Jun 22-23', 'both, plus trailing space'],
  ];
  for (const [title, expected, why] of cases) {
    assert.equal(parseClassDate(title), expected, `${why}: ${JSON.stringify(title)}`);
  }
});

test('CONTROL: a title with NO parentheses yields null rather than throwing', () => {
  for (const title of ['Microsoft Excel Advanced', '', '   ', null, undefined]) {
    assert.doesNotThrow(() => parseClassDate(title), `threw on ${JSON.stringify(title)}`);
    assert.equal(parseClassDate(title), null, `${JSON.stringify(title)} did not yield null`);
  }
  // An empty pair is not a date either.
  assert.equal(parseClassDate('Some Course ()'), null);

  // …and the row still maps, with classDate null and a note naming it.
  const { doc, skip, notes } = mapPublicRow(
    publicRow({}, { class_title: 'Microsoft Excel Advanced' }),
    { courseMap: COURSE_MAP, now: NOW },
  );
  assert.equal(skip, null, 'a missing class date must not drop the row');
  assert.equal(doc.classDate, null);
  assert.ok(notes.some((n) => n.includes('no parenthesised date')), 'the row is not reported');
});

test('CONTROL (red): a first-match rule gets 202 real titles wrong', () => {
  /**
   * The discrimination form. `parseClassDate` takes the LAST balanced pair; the
   * obvious alternative takes the first. Both agree on the 1,639 simple titles,
   * so only a title with parentheses in its COURSE NAME can tell them apart —
   * and there are 202 of those.
   */
  const naive = (s) => (/\(([^)]*)\)/.exec(String(s ?? ''))?.[1] ?? null);
  const title = 'Power Automate (Cloud) for Business Automation (May 11-12)';

  assert.equal(naive(title), 'Cloud', 'the naive probe does not reproduce the defect');
  assert.equal(parseClassDate(title), 'May 11-12');
  assert.notEqual(parseClassDate(title), naive(title));

  // And on a simple title the two agree, so the difference above is the rule and
  // not an accident of this fixture.
  assert.equal(parseClassDate('Microsoft Excel Advanced (May 18-19)'), naive('Microsoft Excel Advanced (May 18-19)'));
});

// ════════════════════════════════════════════════════════════════════════════
// CONTROL 3 — a phone number in the participants box
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: participants "026893233" leaves participantsCount UNSET and keeps the raw string', () => {
  /**
   * Four rows in the real export hold something that is not a participant count:
   * '026893233' and '0819946054' are PHONE NUMBERS typed into the wrong box,
   * '100000000000' and '1200' are beyond any real class.
   *
   * The schema declares `min: 15, default: 15`. Writing 15 would assert a number
   * nobody stated; writing 26,893,233 would be worse. So the field is OMITTED —
   * `'participantsCount' in doc` is false, not `doc.participantsCount == null` —
   * and the default applies at insert.
   */
  const { doc, skip, notes } = mapInhouseRow(
    inhouseRow({ participants: '026893233' }),
    { courseMap: COURSE_MAP, now: NOW },
  );

  assert.equal(skip, null, 'a junk participants value must not drop the row');
  assert.equal('participantsCount' in doc, false,
    'participantsCount was written — a phone number would become a class size, or 15 would be '
    + 'invented for an enquiry nobody sized');
  assert.equal(doc.legacy.raw.participants, '026893233',
    'the raw string was not kept — the phone number is then lost with no way to recover it');
  assert.ok(notes.some((n) => n.includes('not 1..500')), 'the row is not reported');

  // The other three real offenders behave the same way.
  for (const raw of ['0819946054', '100000000000', '1200']) {
    assert.equal(parseParticipants(raw), null, `${raw} was accepted as a participant count`);
  }
});

test('CONTROL (red): without the range check the phone number becomes the class size', () => {
  const lenient = (raw) => {
    const s = String(raw ?? '').trim();
    return /^\d+$/.test(s) ? Number(s) : null; // the 1..500 gate removed
  };
  assert.equal(lenient('026893233'), 26_893_233, 'the lenient probe does not reproduce the defect');
  assert.equal(parseParticipants('026893233'), null);
  assert.notEqual(parseParticipants('026893233'), lenient('026893233'));

  // A REAL value is still accepted, so the rule is a range and not a refusal.
  assert.equal(parseParticipants('30'), 30);
  assert.equal(parseParticipants('30'), lenient('30'));
  // Below the schema's min: 15 floor and carried across as-is, never rounded up.
  assert.equal(parseParticipants('8'), 8, 'a real enquiry under 15 was rejected or clamped');
});

// ════════════════════════════════════════════════════════════════════════════
// The companions — rules the three controls above lean on
// ════════════════════════════════════════════════════════════════════════════

test('createdAt comes from `created` seconds, and never from a date-shaped string field', () => {
  /**
   * The ruling. `wanthiilngthaebiiyn` carries 162 distinct date strings on the
   * public form and is exactly what a careless import would have read. It is
   * unconsumed, so it rides into legacy.raw untouched — kept, never parsed.
   */
  const row = publicRow({ wanthiilngthaebiiyn: '2099-12-31' }, { created: 1_756_000_000 });
  const { doc } = mapPublicRow(row, { courseMap: COURSE_MAP, now: NOW });

  assert.deepEqual(doc.createdAt, new Date(1_756_000_000 * 1000));
  assert.deepEqual(doc.updatedAt, doc.createdAt, 'updatedAt must equal createdAt on an imported row');
  assert.equal(doc.createdAt.getUTCFullYear(), 2025, 'the 2099 string reached createdAt');
  assert.equal(doc.legacy.raw.wanthiilngthaebiiyn, '2099-12-31', 'the unmapped date string was dropped');
});

test('an unrecognised status SKIPS the row — it is never guessed into pending', () => {
  for (const source of ['public', 'inhouse']) {
    assert.equal(mapStatus('wait', source), 'pending');
    assert.equal(mapStatus('cancel', source), 'cancelled');
    assert.equal(mapStatus('closed-won', source), null);
    assert.equal(mapStatus('', source), null);
  }

  const { doc, skip } = mapPublicRow(publicRow({ admin_status: 'closed-won' }), { courseMap: COURSE_MAP, now: NOW });
  assert.equal(doc, null);
  assert.match(skip, /unrecognised admin_status/);

  const inh = mapInhouseRow(inhouseRow({ status: 'closed-won' }), { courseMap: COURSE_MAP, now: NOW });
  assert.equal(inh.doc, null);
  assert.match(inh.skip, /unrecognised status/);

  // `source` is required. A caller that forgot which collection it was mapping
  // is exactly how a `confirmed` reaches register_inhouse, so it throws rather
  // than defaulting to one of the two.
  assert.throws(() => mapStatus('confirm'), /needs a source/);
  assert.throws(() => mapStatus('confirm', 'masterclass'), /needs a source/);
});

// ════════════════════════════════════════════════════════════════════════════
// THE STATUS VOCABULARIES — THE CHECK WHOSE ABSENCE LET A BAD VALUE THROUGH
// ════════════════════════════════════════════════════════════════════════════

test('`confirm` becomes `confirmed` on public and `quoted` on in-house', () => {
  /**
   * THE TWO COLLECTIONS SPELL THE SAME STEP DIFFERENTLY, and that is the reason
   * — not a workaround for an enum that would not fit.
   *
   * In lib/registrations/statuses.js the public `confirmed` and the in-house
   * `quoted` carry the IDENTICAL label, 'ส่งใบเสนอราคาแล้ว', with the same
   * accent and badge; that file's own note says "`confirmed` and `paid` are
   * public only; `quoted` is in-house only… they are the same states". Public's
   * `confirmed` was relabelled in round 1 precisely because what the admin does
   * at that step is SEND THE QUOTATION.
   */
  assert.equal(mapStatus('confirm', 'public'), 'confirmed');
  assert.equal(mapStatus('confirm', 'inhouse'), 'quoted');

  const pub = mapPublicRow(publicRow({ admin_status: 'confirm' }), { courseMap: COURSE_MAP, now: NOW }).doc;
  assert.equal(pub.status, 'confirmed', 'the public arm was changed — it must not be');

  const inh = mapInhouseRow(inhouseRow({ status: 'confirm' }), { courseMap: COURSE_MAP, now: NOW }).doc;
  assert.equal(inh.status, 'quoted',
    'in-house `confirm` became a value RegisterInhouse.status cannot hold — invisible on read, '
    + 'then unreachable by every status chip and uncounted by every summary card');
});

test('the ORIGINAL legacy status survives verbatim in legacy.raw.status, on both', () => {
  /**
   * THE LEGACY SERVER IS BEING SWITCHED OFF and the .b64 export is a gitignored
   * working file full of PII that will be deleted. If the `confirm → quoted`
   * reading is ever overturned, the correction has to be derivable FROM THE
   * DATABASE — `{'legacy.raw.status': 'confirm'}` finds every affected document
   * forever. Both fields are CONSUMED by their mapper, so neither would reach
   * `raw` on its own; both are put back deliberately.
   */
  for (const [label, doc, expected] of [
    ['public', mapPublicRow(publicRow({ admin_status: 'confirm' }), { courseMap: COURSE_MAP, now: NOW }).doc, 'confirm'],
    ['public/wait', mapPublicRow(publicRow({ admin_status: 'wait' }), { courseMap: COURSE_MAP, now: NOW }).doc, 'wait'],
    ['inhouse', mapInhouseRow(inhouseRow({ status: 'confirm' }), { courseMap: COURSE_MAP, now: NOW }).doc, 'confirm'],
    ['inhouse/cancel', mapInhouseRow(inhouseRow({ status: 'cancel' }), { courseMap: COURSE_MAP, now: NOW }).doc, 'cancel'],
  ]) {
    assert.equal(doc.legacy.raw.status, expected,
      `${label}: the source status word was not kept — a correction would need the deleted export`);
  }

  // And it is the SOURCE word, not the mapped one. Without this the assertion
  // above would pass for a mapper that wrote its own output into raw.
  const inh = mapInhouseRow(inhouseRow({ status: 'confirm' }), { courseMap: COURSE_MAP, now: NOW }).doc;
  assert.equal(inh.status, 'quoted');
  assert.notEqual(inh.legacy.raw.status, inh.status,
    'legacy.raw.status holds the MAPPED value — then it records the decision, not what it was made from');
});

test('every produced status is a member of its OWN collection enum', () => {
  /**
   * ══ THE CHECK WHOSE ABSENCE LET `confirmed` REACH register_inhouse ═════════
   *
   * The dry run's validateSync pass caught it, but only as one line among many
   * and only once the whole export had been mapped. This asserts the property
   * directly, on fixtures, for EVERY legacy status word — so a future edit to
   * either arm of the map cannot produce a value its collection cannot hold
   * without going red here first.
   *
   * The enums are READ OFF THE MODELS, never restated. A copy of the vocabulary
   * in this file would be a second place to forget, which is the shape of the
   * defect this test exists for.
   */
  const enums = {
    public: RegisterPublic.schema.path('status').enumValues,
    inhouse: RegisterInhouse.schema.path('status').enumValues,
  };
  assert.ok(enums.public.length >= 3 && enums.inhouse.length >= 3, 'an enum read back empty — the probe is blind');
  assert.equal(enums.inhouse.includes('confirmed'), false,
    'RegisterInhouse gained `confirmed` — if that was deliberate this whole mapping decision is reopened');

  for (const word of ['wait', 'confirm', 'cancel']) {
    const pub = mapPublicRow(publicRow({ admin_status: word }), { courseMap: COURSE_MAP, now: NOW }).doc;
    assert.ok(enums.public.includes(pub.status),
      `public '${word}' → '${pub.status}', which is not in [${enums.public.join(' | ')}]`);

    const inh = mapInhouseRow(inhouseRow({ status: word }), { courseMap: COURSE_MAP, now: NOW }).doc;
    assert.ok(enums.inhouse.includes(inh.status),
      `in-house '${word}' → '${inh.status}', which is not in [${enums.inhouse.join(' | ')}]`);
  }
});

test('CONTROL (red): reverting the in-house arm to `confirmed` breaks the enum check', () => {
  /**
   * The discrimination form. The assertion above passes for a mapper that
   * returns 'pending' for everything, and for an `includes` that is always true.
   * Pointed at the exact revert — in-house `confirm → confirmed`, the value this
   * round removed — and shown to fail the same membership test the real mapper
   * passes.
   */
  const enums = { inhouse: RegisterInhouse.schema.path('status').enumValues };
  const reverted = { wait: 'pending', confirm: 'confirmed', cancel: 'cancelled' };

  assert.equal(enums.inhouse.includes(reverted.confirm), false,
    'the probe cannot see the bad value — RegisterInhouse.status now admits `confirmed`');
  assert.ok(enums.inhouse.includes(mapStatus('confirm', 'inhouse')),
    'the real in-house mapping is ALSO outside the enum');
  assert.notEqual(mapStatus('confirm', 'inhouse'), reverted.confirm);

  // The other two words are unaffected by the revert, so the failure above is
  // this decision and not a wholesale vocabulary mismatch.
  for (const word of ['wait', 'cancel']) {
    assert.equal(mapStatus(word, 'inhouse'), reverted[word]);
  }
});

test('invoice_branch: head office, digits, and the 61 values that are neither', () => {
  assert.deepEqual(classifyBranch('สำนักงานใหญ่'), { kind: 'head_office', raw: 'สำนักงานใหญ่' });
  assert.deepEqual(classifyBranch('Head Office'), { kind: 'head_office', raw: 'Head Office' });
  assert.deepEqual(classifyBranch('head office'), { kind: 'head_office', raw: 'head office' });
  assert.deepEqual(classifyBranch('00001'), { kind: 'branch', code: '00001', raw: '00001' });
  assert.equal(classifyBranch('').kind, 'empty');

  // Real unmatched values from the export. None becomes a branch code by guess.
  for (const raw of ['-', 'ไม่มี', 'ลำพูน', 'Branch No.00001', 'Technology Center (Branch No. 00001)', 'dog']) {
    assert.equal(classifyBranch(raw).kind, 'unmatched', `${raw} was classified`);
  }

  const { doc } = mapPublicRow(publicRow({ invoice_branch: 'Branch No.00001' }), { courseMap: COURSE_MAP, now: NOW });
  assert.equal(doc.invoice.branchCode, undefined, 'a branch code was invented from free text');
  assert.equal(doc.invoice.branchType, undefined, 'the schema default was overwritten');
  assert.equal(doc.legacy.raw.invoiceBranch, 'Branch No.00001', 'the raw value was not kept');
});

test('an unmatched course nid keeps the legacy title and empties the id', () => {
  const pub = mapPublicRow(publicRow({ course: '2256' }), { courseMap: COURSE_MAP, now: NOW });
  assert.equal(pub.doc.courseId, null);
  assert.equal(pub.doc.courseCode, null);
  assert.equal(pub.doc.courseName, 'Microsoft Excel Advanced', 'the legacy course_title was not used as the fallback');

  // In-house has no scalar course field — it is an array of interests, and an
  // unmatched nid makes it empty rather than holding a fabricated code.
  const inh = mapInhouseRow(inhouseRow({ course: '8' }), { courseMap: COURSE_MAP, now: NOW });
  assert.deepEqual(inh.doc.coursesInterested, []);
  assert.equal(inh.doc.legacy.raw.courseNid, '8');
  assert.ok(inh.notes.some((n) => n.includes('not in the match map')));
});

test('the coordinator counts as an attendee only when all four fields match', () => {
  const same = publicRow({
    a1_firstname: 'Somchai', a1_lastname: 'Prasert',
    a1_e_mail: 'SOMCHAI@example.com', a1_telephone: '021234567',
  });
  assert.equal(mapPublicRow(same, { courseMap: COURSE_MAP, now: NOW }).doc.coordinator.isAttending, true,
    'the email comparison is not case-insensitive');

  const differentPhone = publicRow({
    a1_firstname: 'Somchai', a1_lastname: 'Prasert',
    a1_e_mail: 'somchai@example.com', a1_telephone: '0999999999',
  });
  assert.equal(mapPublicRow(differentPhone, { courseMap: COURSE_MAP, now: NOW }).doc.coordinator.isAttending, false,
    'three of four fields matching was treated as the same person');

  // No a1_* at all — the 456 "names to follow" rows.
  const none = publicRow({ not_name: '1' });
  const { doc } = mapPublicRow(none, { courseMap: COURSE_MAP, now: NOW });
  assert.equal(doc.coordinator.isAttending, false);
  assert.deepEqual(doc.attendees, []);
  assert.equal(doc.attendeesListProvided, false, "not_name '1' means the list was NOT provided");
  assert.equal(doc.attendeesCount, 1, 'quantity 1 with no names must still be a count of 1');
});

test('the in-house postcode never lands in a province field', () => {
  const withCode = mapInhouseRow(
    inhouseRow({ province: '10242', invoice_province: '6946' }, { invoice_province_postcode: '10200' }),
    { courseMap: COURSE_MAP, now: NOW },
  ).doc;
  assert.deepEqual(withCode.thaiAddress, { postalCode: '10200' });
  assert.equal(withCode.thaiAddress.province, undefined,
    'a taxonomy term id was written into จังหวัด');
  assert.equal(withCode.legacy.raw.province, '10242', 'the raw term id was dropped');

  const withoutCode = mapInhouseRow(inhouseRow(), { courseMap: COURSE_MAP, now: NOW }).doc;
  assert.equal(withoutCode.thaiAddress, null, '566 of 586 rows have no postcode and must get null');
});

test('the legacy address blob goes to legacyInvoiceAddress and NOT into the customer text', () => {
  const pub = mapPublicRow(publicRow({ remark: 'Please invoice monthly.' }), { courseMap: COURSE_MAP, now: NOW }).doc;
  assert.equal(pub.legacyInvoiceAddress, '99 Rama IV, Bangkok 10500');
  assert.equal(pub.notes, 'Please invoice monthly.', 'the address leaked into the customer note');
  assert.equal(pub.invoice.thaiAddress, null);

  const inh = mapInhouseRow(inhouseRow({ remark: 'Prefer mornings.' }), { courseMap: COURSE_MAP, now: NOW }).doc;
  assert.equal(inh.legacyInvoiceAddress, '99 Rama IV, Bangkok 10500');
  assert.equal(inh.message, 'Prefer mornings.', 'the address leaked into the customer message');
});

test('in-house: month is kept raw and preferredMonth is left unset', () => {
  const { doc } = mapInhouseRow(inhouseRow({ month: '7' }), { courseMap: COURSE_MAP, now: NOW });
  assert.equal('preferredMonth' in doc, false,
    'a month label was written from a bare 1–12 with no year — that is a derived year');
  assert.equal(doc.legacy.raw.month, '7');
  assert.equal(doc.trainingFormat, 'onsite');
  assert.equal(mapInhouseRow(inhouseRow({ format: 'msteam' }), { courseMap: COURSE_MAP, now: NOW }).doc.trainingFormat, 'online');
});

test('the legacy stamp is complete, and no money record is invented', () => {
  const { doc } = mapPublicRow(publicRow(), { courseMap: COURSE_MAP, now: NOW });
  assert.equal(doc.legacy.sid, 1001);
  assert.equal(doc.legacy.serial, 7);
  assert.equal(doc.legacy.webformId, 'registration_public');
  assert.deepEqual(doc.legacy.importedAt, NOW);
  assert.equal(doc.legacy.raw.classTitle, 'Microsoft Excel Advanced (May 18-19)');
  assert.equal(doc.legacy.raw.courseNid, '2188');
  assert.equal(doc.legacy.raw.classNid, '3344');
  assert.equal(doc.classId, '3344', 'classId must be the Drupal node id, unresolved');

  assert.equal(doc.pricing, null);
  assert.equal(doc.payment, null);
  assert.equal(doc.consent, null);
  assert.equal(doc.source, 'web');
  assert.equal(doc.requestInvoice, true);
});
