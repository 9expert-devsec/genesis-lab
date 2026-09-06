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

/** The promotion page's `promotionCover`, as the route reads it off the page. */
const COVER = 'https://res.cloudinary.com/9expert/image/upload/promos/data-analyst.png';

const model = (over = {}) =>
  buildBundleRegistrationModel({
    referenceNumber: 'ABCD1234',
    bundleName: 'Data Analyst Starter',
    coverImage: COVER,
    courses: COURSES,
    discount: 20,
    // BARE, as the route now passes them: `formatBaht`, not `formatPrice`.
    // The mail writes บาท itself, so a ฿ here would be the unit twice.
    priceLabelNet: '32,640',
    priceLabelList: '40,800',
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
  assert.equal(m.courses.items.length, 2);
  assert.deepEqual(m.courses.items.map((c) => c.course_name), ['Excel Level 1', 'Power BI Level 1']);
  assert.deepEqual(m.courses.items.map((c) => c.course_date), ['20 – 21 ต.ค. 69', '3 พ.ย. 69']);
  assert.equal(m.courses.items[0].training_type_label, 'Classroom');
  assert.equal(m.courses.items[1].training_type_label, 'Online via Microsoft Teams');

  // The template writes the three cells in this order — Course / รอบอบรม /
  // รูปแบบการอบรม — and a row that carries them under other names, or grows a
  // fourth, is a row the template cannot render. Asserted as the exact key
  // list, not as a subset.
  for (const row of m.courses.items) {
    assert.deepEqual(Object.keys(row), ['course_name', 'course_date', 'training_type_label']);
  }
});

test('the labels are the SHARED ones — a bundle row and a course mail agree', () => {
  /**
   * Compared against the function rather than against literals: if the wording
   * ever changes, both mails must change together. This is the same vocabulary
   * the ordinary registration confirmation uses for the same fact.
   */
  for (const c of model().courses.items) {
    const src = COURSES.find((x) => x.courseName === c.course_name);
    assert.equal(c.training_type_label, scheduleTypeLabel(src.type));
  }
  // …and the course mail resolves the identical string for the identical type.
  assert.equal(
    buildPublicRegistrationModel({
      referenceNumber: 'X', data: { ...DATA, scheduleType: 'online' }, attendees: [],
    }).training_type_label,
    model().courses.items[1].training_type_label,
  );
});

test('the count travels WITH the rows — one idiom, not two', () => {
  /**
   * `attendee_list` is `{ count, items }`, and `courses` used to be a bare
   * array beside a separate top-level `course_count`. Two shapes for one job in
   * one model is a thing the next reader has to learn twice, so the count now
   * lives inside the block that owns the rows — which is also what lets the
   * heading say the number without a second key.
   */
  const m = model();
  assert.equal(m.courses.count, 2);
  assert.equal(m.courses.count, m.courses.items.length);
  // RETIRED, and its absence is asserted: a template still writing
  // `{{course_count}}` must render nothing rather than a stale number.
  assert.equal('course_count' in m, false, 'course_count is back — two idioms again');
});

test('no courses hides the whole block as FALSE — never an empty table', () => {
  // The heading goes with the table. An empty block would announce
  // "0 หลักสูตร" over nothing, which is the failure the flat billing shape was
  // introduced to fix, in a different section.
  assert.equal(model({ courses: [] }).courses, false);
  // The boolean, not a falsy stand-in: `null` renders as an empty section and
  // `[]` iterates zero times, both of which LOOK like a correct hide from the
  // outside and are reached by a different path.
  assert.equal(typeof model({ courses: [] }).courses, 'boolean');
});

test('CONTROL: the row probe discriminates — a one-course bundle yields one row', () => {
  const m = model({ courses: [COURSES[0]] });
  assert.equal(m.courses.items.length, 1);
  assert.equal(m.courses.count, 1);
  // …and the empty case above is a real hide, not this same block misread.
  assert.notEqual(m.courses, false);
});

// ── course_image: the promotion page's cover ──────────────────────────────
//
// The SAME three rules the course and in-house models are held to, ported
// rather than restated — see the course_image block in
// test/pure/emailTemplateModels.test.mjs. A fourth mail rendering a cover is a
// fourth chance to render `src=""`, and the contract only holds if every
// builder is checked against it.

test('course_image is the caller-supplied cover, as a plain string', () => {
  assert.equal(model().course_image, COVER);
  // A string, not a block. The template writes `{{course_image}}` into a `src`.
  assert.equal(typeof model().course_image, 'string');
});

test('course_image is EMPTY STRING when the page has no cover — never null', () => {
  // The template gates the <img> on {{#course_image}}. '' is falsy to Mustachio
  // so the whole tag disappears; null would too, but null is banned everywhere
  // in these models and undefined would come out as the string "undefined" in
  // some renderers. The empty case is the NORMAL one — `promotionCover`
  // defaults to '' and no publish rule demands an upload, the same storage-floor
  // reasoning that lets a bundle ship unnamed.
  for (const empty of ['', null]) {
    assert.equal(model({ coverImage: empty }).course_image, '');
  }
  // `undefined` goes through the BUILDER directly: passing it to the local
  // helper hits that helper's own `coverImage: COVER` and would silently test
  // the populated case instead. The course model's test file records hitting
  // exactly this trap once already.
  assert.equal(
    buildBundleRegistrationModel({ referenceNumber: 'A', data: DATA }).course_image,
    '',
  );
});

test('course_image never carries a src-breaking whitespace-only value', () => {
  // A `src="  "` renders a broken-image icon rather than nothing, which is the
  // exact failure the empty-string contract exists to avoid.
  assert.equal(model({ coverImage: '   ' }).course_image.trim(), '');
});

test('CONTROL: the empty-cover probe discriminates — a real cover is NOT empty', () => {
  // Without this, the three assertions above would all pass on a builder that
  // hardcoded `course_image: ''` and never read its argument at all.
  assert.notEqual(model().course_image, '');
  assert.equal(model().course_image.trim(), COVER);
});

// ── the price block ───────────────────────────────────────────────────────

test('the price block is TWO ROWS — net_text, and list_text as a block', () => {
  /**
   * `net_text` is a plain string and always present inside the block;
   * `list_text` is `textBlock`'s `{ text }`, exactly as `billing_tax_id` is, so
   * `{{#list_text}}…{{/list_text}}` hides the struck-through row rather than
   * rendering an empty cell in a row the template has already opened.
   */
  const m = model();
  assert.deepEqual(m.package_price, {
    net_text: '32,640',
    list_text: { text: '40,800' },
  });
});

test('list_text is FALSE when there is no list price — the row disappears', () => {
  // Not '' — an empty string inside an opened row renders an empty cell under a
  // heading. The block form is what removes the row itself.
  const m = model({ priceLabelList: '' });
  assert.equal(m.package_price.list_text, false);
  assert.equal(m.package_price.net_text, '32,640');
  // And that is the ONLY change: the net row is untouched by the list row going.
  assert.deepEqual(Object.keys(m.package_price), ['net_text', 'list_text']);
});

test('there is NO discount key, at any depth — the mail states two prices only', () => {
  /**
   * The ruling: the mail shows the full price struck through and the package
   * price, and nothing about a percentage or an amount saved. `discountPercent`
   * and `discountAmount` both still exist and are both still read BY THE SCREEN
   * — the promotion chip and the web quotation panel — and `discountAmount` in
   * particular must not leak in here merely because it is available.
   *
   * Asserted over the SERIALISED model rather than over a key list, so a
   * `discount` nested inside `package_price`, or renamed to `saved`/`percent`,
   * is caught too.
   */
  const serialised = JSON.stringify(model());
  for (const banned of ['discount', 'percent', 'saved', 'ลด ', 'ประหยัด']) {
    assert.equal(
      serialised.includes(banned),
      false,
      `the model carries "${banned}" — the mail is not supposed to compute a saving`,
    );
  }
  // The builder does not even ACCEPT one, which is what stops it being wired
  // back in as a one-line addition: passing it changes nothing.
  assert.deepEqual(model({ discount: 20 }).package_price, model().package_price);
});

test('CONTROL: the banned-token sweep would see a discount if one were there', () => {
  // Without this, the sweep above passes on a model that dropped the price
  // block entirely — or on a typo in every needle.
  const planted = JSON.stringify({ package_price: { net_text: 'x', discount_chip: { percent: '20' } } });
  for (const banned of ['discount', 'percent']) {
    assert.equal(planted.includes(banned), true, `the needle "${banned}" is misspelt`);
  }
});

test('no NET price hides the whole block as FALSE, even when a list price exists', () => {
  /**
   * Gated on the net price ALONE. A list price by itself is a number with
   * nothing to compare it to, and a table for it would put a struck-through
   * figure above an empty row — the "heading with nothing under it" the flat
   * billing shape exists to prevent.
   *
   * `false` is the only "hidden" spelling: a null would render as an empty
   * section, visually identical to a correct hide, so this asserts the value
   * identically rather than merely its falsiness.
   */
  assert.equal(model({ priceLabelNet: '', priceLabelList: '' }).package_price, false);
  assert.equal(model({ priceLabelNet: '', priceLabelList: '40,800' }).package_price, false);
  assert.equal(
    model({ priceLabelNet: '' }).package_price === null,
    false,
    'null renders as an empty section, not a hidden one',
  );
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
    priceLabelNet: '32,640',
    priceLabelList: '40,800',
  });
  for (const c of COURSES) {
    assert.ok(msg.html.includes(c.courseName), `HTML is missing ${c.courseName}`);
    assert.ok(msg.text.includes(c.courseName), `text is missing ${c.courseName}`);
    // The ROUND and the DELIVERY TYPE travel with the name, in both bodies —
    // a table listing the right courses against the wrong rounds is the same
    // class of failure as listing the wrong courses.
    assert.ok(msg.html.includes(c.dates), `HTML is missing the round ${c.dates}`);
    assert.ok(msg.text.includes(c.dates), `text is missing the round ${c.dates}`);
    const label = scheduleTypeLabel(c.type);
    assert.ok(msg.html.includes(label), `HTML is missing the type ${label}`);
    assert.ok(msg.text.includes(label), `text is missing the type ${label}`);
  }
  assert.ok(msg.html.includes('ABCD1234'));
  assert.ok(msg.text.includes('ABCD1234'));
  // The price, and the "no payment yet" sentence, in both.
  assert.ok(msg.html.includes('32,640') && msg.text.includes('32,640'));
  assert.ok(msg.html.includes('ยังไม่มีการชำระเงิน') && msg.text.includes('ยังไม่มีการชำระเงิน'));
});

// ── the fallback states what the TEMPLATE states ──────────────────────────
//
// The alias is unset, so the fallback is the mail customers actually receive.
// If it showed a different offer from the template, the mail would depend on
// which path it took — the one thing a fallback must never do.

test('the fallback draws the SAME three columns the model feeds the template', () => {
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'Excel Level 1', dates: '20 – 21 ต.ค. 69', typeLabel: 'Classroom' }],
  });
  for (const heading of ['หลักสูตร', 'รอบอบรม', 'รูปแบบการอบรม']) {
    assert.ok(msg.html.includes(heading), `the fallback table has no ${heading} column`);
  }
  // Three cells per row, not a name over a subline: the row must close after
  // exactly three <td>s.
  const bodyRow = msg.html.split('<tbody>')[1] ?? '';
  assert.equal((bodyRow.match(/<td/g) ?? []).length, 3, 'the row is not three cells');
});

test('the fallback price is ONE row, with บาท and no ฿', () => {
  /**
   * ราคา 32,640 บาท จากปกติ 40,800 บาท — one line, the struck-through styling
   * on the half it belongs to. It was two stacked table rows.
   *
   * The labels arrive BARE (`formatBaht`, not `formatPrice`), because the body
   * writes บาท itself and `฿32,640 บาท` said the unit twice.
   */
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '32,640',
    priceLabelList: '40,800',
  });
  assert.ok(msg.html.includes('<s>40,800 บาท</s>'), 'the full price is not struck through');
  assert.ok(msg.html.includes('32,640 บาท'));
  assert.ok(msg.html.includes('จากปกติ'), 'the one-row wording is gone');
  assert.equal(msg.text.includes('ราคา 32,640 บาท จากปกติ 40,800 บาท'), true);

  // NO ฿ ANYWHERE, in either body — the rule this round is about.
  assert.equal(msg.html.includes('฿'), false, 'the HTML body still prints ฿');
  assert.equal(msg.text.includes('฿'), false, 'the text body still prints ฿');

  // …and nothing about a saving, in EITHER body. The old fallback appended
  // "— ลด 20%" here; the template states no percentage, so neither does this.
  for (const banned of ['ลด ', '%', 'ประหยัด']) {
    assert.equal(msg.text.includes(banned), false, `the text body still says "${banned}"`);
  }
  assert.equal(msg.html.includes('ลด '), false, 'the HTML body still advertises a discount');
});

test('CONTROL: the ฿ probe fires when a symbol IS present', () => {
  // The two `includes('฿') === false` assertions above would pass on a body
  // that rendered nothing at all, or on a needle that could never match.
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '฿32,640',
  });
  assert.equal(msg.html.includes('฿'), true, 'the probe cannot see a ฿ that is there');
  assert.equal(msg.text.includes('฿'), true);
});

test('CONTROL: the struck-through row goes when there is no list price', () => {
  // Proves the assertion above reads the list row specifically, and that the
  // fallback gates it the same way the model gates `list_text`.
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '32,640',
  });
  assert.equal(msg.html.includes('<s>'), false, 'a struck-through row with nothing in it');
  assert.equal(msg.html.includes('จากปกติ'), false, 'the comparison half stayed behind');
  assert.ok(msg.html.includes('32,640'), 'the package price went with it');
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
  // The label is 'ราคา' now, not 'ราคาแพ็กเกจ' — the two rows became one.
  assert.equal(msg.html.includes('ราคา '), false);
  assert.equal(msg.text.includes('ราคา '), false);
  assert.equal(msg.html.includes('จากปกติ'), false, 'a dangling จากปกติ with no price');
});

test('CONTROL: the priced fallback DOES print it', () => {
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '1,000',
  });
  assert.ok(msg.html.includes('ราคา '));
  assert.ok(msg.text.includes('ราคา '));
});

test('a NET price with NO list price leaves no dangling จากปกติ', () => {
  /**
   * The requirement stated in the round: the row must read just the price. The
   * `จากปกติ` half goes with the figure it introduces — a preposition
   * pointing at nothing is worse than no comparison at all.
   */
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '1,000',
  });
  assert.equal(msg.text.trim().includes('ราคา 1,000 บาท'), true);
  assert.equal(msg.text.includes('จากปกติ'), false);
  assert.equal(msg.html.includes('จากปกติ'), false);
  assert.equal(msg.html.includes('<s>'), false, 'a struck-through span with nothing in it');
});

test('CONTROL: with a list price the จากปกติ half IS there', () => {
  // Without this, the three negatives above would pass on a body that never
  // renders the comparison at all.
  const msg = bundleConfirmationEmail({
    referenceNumber: 'X', firstName: 'ก', bundleName: 'B',
    courses: [{ courseName: 'C', dates: 'd', typeLabel: 'Classroom' }],
    priceLabelNet: '1,000',
    priceLabelList: '1,500',
  });
  assert.ok(msg.text.includes('จากปกติ 1,500 บาท'));
  assert.ok(msg.html.includes('<s>1,500 บาท</s>'));
});
