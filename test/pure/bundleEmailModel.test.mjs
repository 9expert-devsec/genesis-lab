import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBundleRegistrationModel } from '@/lib/email/models/bundleRegistrationModel';
import { bundleConfirmationEmail } from '@/lib/email/templates/registration-bundle-user';
import { buildPublicRegistrationModel } from '@/lib/email/models/publicRegistrationModel';
import { scheduleTypeLabel } from '@/lib/email/models/labels';

/**
 * The bundle confirmation's TemplateModel and its HTML fallback.
 *
 * The governing convention is `labels.js`': every conditional block is an
 * OBJECT or the boolean `false`, never null and never undefined, because
 * Mustachio renders a null section as an empty one — visually identical to a
 * correctly-hidden block, reached by a different path. So a bug that turns a
 * real block into null looks exactly like a correct hide, and only a field-by-
 * field assertion can tell them apart.
 */

const DATA = {
  coordinator: {
    firstName: 'สมหญิง', lastName: 'ดีใจ',
    email: 'somying@example.com', phone: '081-234-5678', isAttending: true,
  },
  attendeesCount: 2,
  attendeesListProvided: true,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: 'ขอใบเสนอราคาในนามบริษัท',
};

const COURSES = [
  { courseName: 'Excel Level 1', courseId: 'MSE-L1', dates: '20 – 21 ต.ค. 69', type: 'classroom' },
  { courseName: 'Power BI Level 1', courseId: 'PBI-L1', dates: '3 พ.ย. 69', type: 'online' },
];

const model = (over = {}) =>
  buildBundleRegistrationModel({
    referenceNumber: 'ABCD1234',
    bundleName: 'Data Analyst Starter',
    courses: COURSES,
    discount: 20,
    priceLabelNet: '฿32,640',
    priceLabelList: '฿40,800',
    data: DATA,
    attendees: [{ firstName: 'สมหญิง', lastName: 'ดีใจ', email: '', phone: '' }],
    ...over,
  });

// ── the repeating section, which is the whole reason for a new template ───

test('every course is a row, in order, each fully resolved', () => {
  /**
   * Mustachio cannot map a value to a label, so `training_type_label` must
   * arrive as a STRING rather than as an enum for the template to branch on.
   * That is the rule the whole labels module exists for.
   */
  const m = model();
  assert.equal(m.courses.length, 2);
  assert.deepEqual(m.courses.map((c) => c.course_name), ['Excel Level 1', 'Power BI Level 1']);
  assert.deepEqual(m.courses.map((c) => c.course_date), ['20 – 21 ต.ค. 69', '3 พ.ย. 69']);
  assert.equal(m.courses[0].training_type_label, 'Classroom');
  assert.equal(m.courses[1].training_type_label, 'Online via Microsoft Teams');
});

test('the labels are the SHARED ones — a bundle row and a course mail agree', () => {
  /**
   * Compared against the function rather than against literals: if the wording
   * ever changes, both mails must change together. This is the same vocabulary
   * the ordinary registration confirmation uses for the same fact.
   */
  for (const c of model().courses) {
    const src = COURSES.find((x) => x.courseName === c.course_name);
    assert.equal(c.training_type_label, scheduleTypeLabel(src.type));
  }
  // …and the course mail resolves the identical string for the identical type.
  assert.equal(
    buildPublicRegistrationModel({
      referenceNumber: 'X', data: { ...DATA, scheduleType: 'online' }, attendees: [],
    }).training_type_label,
    model().courses[1].training_type_label,
  );
});

test('course_count is resolved here — Mustachio cannot count a section', () => {
  assert.equal(model().course_count, 2);
  assert.equal(model({ courses: [] }).course_count, 0);
});

test('CONTROL: the row probe discriminates — a one-course bundle yields one row', () => {
  const m = model({ courses: [COURSES[0]] });
  assert.equal(m.courses.length, 1);
  assert.equal(m.course_count, 1);
});

// ── the price block ───────────────────────────────────────────────────────

test('the price block carries both prices and the discount chip', () => {
  const m = model();
  assert.equal(m.package_price.net_price, '฿32,640');
  assert.deepEqual(m.package_price.list_price, { text: '฿40,800' });
  assert.deepEqual(m.package_price.discount_chip, { percent: '20' });
});

test('a 0% discount draws NO chip, and the block is still there', () => {
  // A bundle sold at its list price is honest; "ลด 0%" advertises nothing. The
  // same `> 0` rule the section's own chip applies.
  const m = model({ discount: 0 });
  assert.equal(m.package_price.discount_chip, false);
  assert.equal(m.package_price.net_price, '฿32,640');
});

test('an unpriced bundle hides the whole block as FALSE, never null', () => {
  /**
   * `false` is the only "hidden" spelling. A null here would render as an empty
   * section — visually identical to a correct hide — so this asserts the value
   * identically, not merely its falsiness.
   */
  const m = model({ priceLabelNet: '', priceLabelList: '', discount: null });
  assert.equal(m.package_price, false);
  assert.equal(m.package_price === null, false, 'null renders as an empty section, not a hidden one');
});

test('CONTROL: the strict-false probe would catch a null', () => {
  const planted = { package_price: null };
  assert.equal(planted.package_price === false, false);
  assert.equal(model().package_price === false, false, 'the populated case is an object, as it must be');
});

// ── the shared blocks ─────────────────────────────────────────────────────

test('billing is FLAT and hidden when no invoice was asked for', () => {
  const m = model();
  assert.equal(m.document_requested, false);
  assert.equal(m.billing_personal, false);
  assert.equal(m.billing_company, false);
});

test('a corporate invoice fills the company block and leaves the personal one false', () => {
  const m = model({
    data: {
      ...DATA,
      requestInvoice: true,
      invoice: { type: 'corporate', country: 'TH', companyName: 'บริษัท ทดสอบ จำกัด', taxId: '0105500000001' },
    },
  });
  assert.deepEqual(m.document_requested, { show: true });
  assert.equal(m.billing_personal, false);
  assert.equal(m.billing_company.billing_company_name, 'บริษัท ทดสอบ จำกัด');
  assert.deepEqual(m.billing_company.billing_tax_id, { text: '0105500000001' });
});

test('the customer’s note is a block, and an empty one is false', () => {
  assert.deepEqual(model().billing_notes, { text: 'ขอใบเสนอราคาในนามบริษัท' });
  assert.equal(model({ data: { ...DATA, notes: '' } }).billing_notes, false);
});

test('an unnamed bundle still names something', () => {
  // An author may ship an unnamed bundle; a mail whose subject line and heading
  // are blank is worse than a generic word.
  assert.equal(model({ bundleName: '' }).bundle_name, 'แพ็กเกจอบรม');
});

// ── the HTML fallback lists the same courses as the text ─────────────────

test('the fallback’s HTML and TEXT list identical courses', () => {
  /**
   * Both are built from ONE array, which is the point: a hand-written pair is
   * exactly how a customer ends up with two bodies naming different courses,
   * and nothing would ever report it.
   */
  const msg = bundleConfirmationEmail({
    referenceNumber: 'ABCD1234',
    firstName: 'สมหญิง',
    bundleName: 'Data Analyst Starter',
    courses: COURSES.map((c) => ({ courseName: c.courseName, dates: c.dates, typeLabel: scheduleTypeLabel(c.type) })),
    priceLabelNet: '฿32,640',
    priceLabelList: '฿40,800',
    discount: 20,
  });
  for (const c of COURSES) {
    assert.ok(msg.html.includes(c.courseName), `HTML is missing ${c.courseName}`);
    assert.ok(msg.text.includes(c.courseName), `text is missing ${c.courseName}`);
  }
  assert.ok(msg.html.includes('ABCD1234'));
  assert.ok(msg.text.includes('ABCD1234'));
  // The price, and the "no payment yet" sentence, in both.
  assert.ok(msg.html.includes('฿32,640') && msg.text.includes('฿32,640'));
  assert.ok(msg.html.includes('ยังไม่มีการชำระเงิน') && msg.text.includes('ยังไม่มีการชำระเงิน'));
});

test('CONTROL: the fallback probe can miss — a course NOT in the list is absent', () => {
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'Excel Level 1', dates: 'x', typeLabel: 'Classroom' }],
  });
  assert.equal(msg.html.includes('Power BI Level 1'), false);
  assert.equal(msg.text.includes('Power BI Level 1'), false);
});

test('the fallback escapes HTML in values that reach the body', () => {
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก',
    bundleName: '<script>alert(1)</script>',
    courses: [{ courseName: '<b>x</b>', dates: 'd', typeLabel: 'Classroom' }],
  });
  assert.equal(msg.html.includes('<script>'), false, 'an unescaped script tag reached the mail body');
  assert.ok(msg.html.includes('&lt;script&gt;'));
  assert.ok(msg.html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('an unpriced fallback omits the price line rather than printing an empty one', () => {
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
  });
  assert.equal(msg.html.includes('ราคาแพ็กเกจ'), false);
  assert.equal(msg.text.includes('ราคาแพ็กเกจ'), false);
});

test('CONTROL: the priced fallback DOES print it', () => {
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '฿1,000',
  });
  assert.ok(msg.html.includes('ราคาแพ็กเกจ'));
  assert.ok(msg.text.includes('ราคาแพ็กเกจ'));
});
