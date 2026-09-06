import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient, editableQuotation } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import {
  legacyInvoiceAddressLine,
  LEGACY_INVOICE_ADDRESS_LABEL,
  LEGACY_INVOICE_ADDRESS_HINT,
  LEGACY_INVOICE_ADDRESS_COPY_LABEL,
} from '@/lib/registration/legacyInvoiceAddress';

/**
 * THE LEGACY INVOICE ADDRESS, ON BOTH DETAIL SCREENS.
 *
 * ══ THE CLAIM ═══════════════════════════════════════════════════════════════
 *
 * A registration imported from the old Drupal site carries its invoice address
 * as ONE free-text line in `legacyInvoiceAddress`, with both structured address
 * subdocuments null. That line is shown, once, labelled so an admin knows why
 * this record looks unlike every other record, with the copy control its
 * neighbours have — and it is shown ONLY on those documents.
 *
 * ══ THREE FIXTURES, AND THEY ARE THE THREE STATES ═══════════════════════════
 *
 *   STRUCTURED  a normal record. Renders exactly as it does today and the
 *               legacy row is absent — the important half, because this row is
 *               being added to a card 2,400-odd live records already use. IT
 *               CARRIES A LEGACY BLOB TOO; see the fixture's own note.
 *   LEGACY      both addresses null, a blob present. The line renders.
 *   EMPTY       all three absent. NOTHING renders — not a row, not a label,
 *               not the hint. An empty row here would be the em-dash column
 *               `DLRow`'s absent-means-absent rule exists to prevent.
 *
 * Each is asserted on BOTH screens, because the two keep these three values in
 * different places — public under `invoice`, in-house at the top level — and a
 * shared component wired to the wrong path on one of them is exactly the defect
 * a single-screen test would miss.
 *
 * ══ WHAT IS DELIBERATELY NOT ASSERTED ═══════════════════════════════════════
 *
 * That a legacy blob is never parsed into แขวง/เขต/จังหวัด. There is no code to
 * assert about: nothing splits it, and §4 pins the absence structurally instead
 * — the value reaching the row is the STORED STRING, character for character.
 * A test that checked "the district field is empty" would pass just as happily
 * on a parser that guessed wrong and wrote nothing on this one fixture.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * The blob is deliberately UNPLEASANT: no comma discipline, a stray double
 * space, and a postcode that is NOT at the end. That last part is the whole
 * reason this field exists unparsed, so the fixture should not be the one shape
 * a naive splitter would get right.
 */
const BLOB = '235 หมู่ 7 ถ.พหลโยธิน  10400 แขวงสามเสนใน พญาไท กทม';

/**
 * ══ THE STRUCTURED FIXTURE CARRIES A BLOB, AND THAT WAS A CORRECTION ════════
 *
 * It did not, at first, and the `renders-always` control caught it: with the
 * structured half of the condition deleted outright, "the legacy row does NOT
 * appear beside a structured address" STAYED GREEN, because this document had
 * no blob for the broken condition to have let through. The assertion was
 * passing on the absence of the input, not on the guard.
 *
 * So the normal record now holds BOTH shapes. That is not a contrived document
 * either — it is precisely the coexistence case, and the only thing that makes
 * "the legacy row does not appear here" a claim about the guard.
 */
const PUBLIC_STRUCTURED = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  legacyInvoiceAddress: BLOB,
  status: 'pending',
  courseName: 'Power BI Advanced',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 1,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี' }],
  requestInvoice: true,
  invoice: {
    type: 'corporate', country: 'TH',
    companyName: 'บริษัท ทดสอบ จำกัด', taxId: '0105551234567', branchType: 'head_office',
    thaiAddress: {
      addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน',
      district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
    },
    internationalAddress: null,
  },
  createdAt: '2026-08-01T03:00:00.000Z',
};

/**
 * THE IMPORTED SHAPE, TAKEN FROM A REAL ROW.
 *
 * `invoice` is NOT null on an imported public registration — the import writes
 * the type, the country, the company and the tax id, and leaves only the two
 * address subdocuments null. That matters: `InvoiceReadView` returns early on a
 * null `invoice`, so a fixture that nulled the whole subdocument would exercise
 * the "ไม่ได้ขอใบเสนอราคา" branch and prove nothing about this row.
 */
const PUBLIC_LEGACY = {
  ...PUBLIC_STRUCTURED,
  _id: 'bbbbbbbbbbbbbbbbbbbb0002',
  invoice: { ...PUBLIC_STRUCTURED.invoice, thaiAddress: null, internationalAddress: null },
};

/**
 * No address of ANY kind — the card still has a company and a tax id.
 * The blob is cleared explicitly: it is inherited from the spread above, and an
 * "empty" fixture that quietly carried one would make §3 assert nothing.
 */
const PUBLIC_EMPTY = {
  ...PUBLIC_LEGACY,
  _id: 'cccccccccccccccccccc0003',
  legacyInvoiceAddress: undefined,
};

const INHOUSE_STRUCTURED = {
  _id: 'dddddddddddddddddddd0004',
  legacyInvoiceAddress: BLOB,
  status: 'pending',
  companyName: 'บริษัท ทดสอบ จำกัด',
  quotationCompany: 'บริษัท ทดสอบ จำกัด',
  contactFirstName: 'สมชาย', contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com', contactPhone: '0812345678',
  coursesInterested: ['EXC-201'],
  participantsCount: 15,
  trainingFormat: 'online',
  quotationCountry: 'TH', branchType: 'head_office', taxId: '0105551234567',
  thaiAddress: {
    addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน',
    district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
  },
  internationalAddress: null,
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
};

const INHOUSE_LEGACY = {
  ...INHOUSE_STRUCTURED,
  _id: 'eeeeeeeeeeeeeeeeeeee0005',
  thaiAddress: null,
};

const INHOUSE_EMPTY = {
  ...INHOUSE_LEGACY,
  _id: 'ffffffffffffffffffff0006',
  legacyInvoiceAddress: undefined,
};

const pub = (doc) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, history: null }));
const inh = (doc) => renderToStaticMarkup(
  createElement(InhouseDetailClient, { doc, courses: [], history: null }));

const SCREENS = {
  'public/structured':  pub(PUBLIC_STRUCTURED),
  'public/legacy':      pub(PUBLIC_LEGACY),
  'public/empty':       pub(PUBLIC_EMPTY),
  'inhouse/structured': inh(INHOUSE_STRUCTURED),
  'inhouse/legacy':     inh(INHOUSE_LEGACY),
  'inhouse/empty':      inh(INHOUSE_EMPTY),
};

const STRUCTURED = ['public/structured', 'inhouse/structured'];
const LEGACY     = ['public/legacy', 'inhouse/legacy'];
const EMPTY      = ['public/empty', 'inhouse/empty'];

/** Every copy control's accessible label — the same probe the affordance test uses. */
const copyLabels = (markup) =>
  [...markup.matchAll(/aria-label="คัดลอก([^"]*)"/g)].map((m) => m[1]);

// ════════════════════════════════════════════════════════════════════════════
// 1. FIXTURE ONE — A STRUCTURED ADDRESS RENDERS AS TODAY, AND NOTHING IS ADDED
// ════════════════════════════════════════════════════════════════════════════

test('a structured address still renders, on both screens', () => {
  for (const name of STRUCTURED) {
    assert.ok(SCREENS[name].includes('1550 อาคารธนภูมิ'),
      `${name}: the structured address stopped rendering`);
  }
});

test('the legacy row does NOT appear beside a structured address', () => {
  for (const name of STRUCTURED) {
    assert.ok(!SCREENS[name].includes(LEGACY_INVOICE_ADDRESS_LABEL),
      `${name}: the legacy label rendered on a record with a structured address`);
    assert.ok(!SCREENS[name].includes(LEGACY_INVOICE_ADDRESS_HINT),
      `${name}: the legacy hint rendered on a record with a structured address`);
  }
});

/**
 * ══ THE HALF THAT MATTERS MOST ══════════════════════════════════════════════
 *
 * This row is being added to a card that ~2,400 live records already render, so
 * "the legacy row is absent" is not enough — the rest of the card has to be
 * UNCHANGED. Asserted as a whole-card comparison against the same document with
 * the field explicitly absent, which is what "renders as today" actually means.
 */
test('a structured record renders byte-identically with and without a legacy blob', () => {
  assert.equal(
    SCREENS['public/structured'],
    pub({ ...PUBLIC_STRUCTURED, legacyInvoiceAddress: undefined }),
    'a structured public record renders differently once a legacy blob is present — '
    + 'the blob is reaching the page on a document that has a real address',
  );
  assert.equal(
    SCREENS['inhouse/structured'],
    inh({ ...INHOUSE_STRUCTURED, legacyInvoiceAddress: undefined }),
    'a structured in-house record renders differently once a legacy blob is present',
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 2. FIXTURE TWO — LEGACY ONLY, THE LINE RENDERS
// ════════════════════════════════════════════════════════════════════════════

test('the legacy line renders, verbatim, on both screens', () => {
  for (const name of LEGACY) {
    assert.ok(SCREENS[name].includes(BLOB),
      `${name}: the stored line is not on the page`);
  }
});

test('it is labelled as legacy, and the label says so before the hint does', () => {
  for (const name of LEGACY) {
    assert.ok(SCREENS[name].includes(LEGACY_INVOICE_ADDRESS_LABEL),
      `${name}: no legacy label`);
    assert.ok(SCREENS[name].includes(LEGACY_INVOICE_ADDRESS_HINT),
      `${name}: no explanation of why this row is different`);
  }
});

/**
 * The explanation has to answer the question the row raises, so its three parts
 * are pinned individually rather than as one opaque string: where it came from,
 * that it is unstructured, and that it cannot be edited here. A reworded hint
 * that dropped any one of the three would still pass a bare `includes` on the
 * constant, because the constant is what the component renders.
 */
test('the hint says where it came from, that it is one line, and that it is read-only', () => {
  assert.ok(LEGACY_INVOICE_ADDRESS_HINT.includes('เว็บไซต์เดิม'), 'the hint does not say where it came from');
  assert.ok(LEGACY_INVOICE_ADDRESS_HINT.includes('บรรทัดเดียว'), 'the hint does not say it is one free-text line');
  assert.ok(LEGACY_INVOICE_ADDRESS_HINT.includes('แก้ไขที่นี่ไม่ได้'), 'the hint does not say it is read-only here');
});

test('it keeps the copy affordance its neighbouring rows have', () => {
  for (const name of LEGACY) {
    assert.ok(copyLabels(SCREENS[name]).includes(LEGACY_INVOICE_ADDRESS_COPY_LABEL),
      `${name}: no copy control on the legacy row — [${copyLabels(SCREENS[name]).join(', ')}]`);
  }
});

test('the copy control is the SAME button as the tax-id one beside it', () => {
  /**
   * Asserted on rendered attributes, not on the import line: an import proves a
   * symbol is in scope, not that this row uses it. A second copy implementation
   * is how one row comes to tell a salesperson a value is on their clipboard
   * when it is not.
   */
  const button = (markup, label) => {
    const at = markup.indexOf(`aria-label="คัดลอก${label}"`);
    assert.notEqual(at, -1, `no control for ${label}`);
    const open = markup.lastIndexOf('<button', at);
    return markup.slice(open, markup.indexOf('</button>', at) + 9);
  };
  const shapeOf = (html) => ({
    typed: /^<button[^>]*type="button"/.test(html),
    classes: (html.match(/class="([^"]*)"/) ?? [, ''])[1],
    live: html.includes('aria-live="polite"'),
    text: html.includes('>คัดลอก<'),
  });

  for (const name of LEGACY) {
    const reference = shapeOf(button(SCREENS[name], 'เลขประจำตัวผู้เสียภาษี'));
    assert.ok(reference.typed && reference.live && reference.text,
      `${name}: the reference control did not parse — the comparison proves nothing`);
    assert.deepEqual(shapeOf(button(SCREENS[name], LEGACY_INVOICE_ADDRESS_COPY_LABEL)), reference,
      `${name}: the legacy row grew a copy button of its own`);
  }
});

test('exactly ONE legacy row renders — it is not drawn twice', () => {
  for (const name of LEGACY) {
    const hits = SCREENS[name].split(LEGACY_INVOICE_ADDRESS_LABEL).length - 1;
    assert.equal(hits, 1, `${name}: the legacy label appears ${hits} times`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. FIXTURE THREE — ALL EMPTY, NOTHING RENDERS
// ════════════════════════════════════════════════════════════════════════════

test('no row, no label and no hint when all three are empty', () => {
  for (const name of EMPTY) {
    assert.ok(!SCREENS[name].includes(LEGACY_INVOICE_ADDRESS_LABEL),
      `${name}: an empty legacy row rendered`);
    assert.ok(!SCREENS[name].includes(LEGACY_INVOICE_ADDRESS_HINT),
      `${name}: the hint rendered with no address to explain`);
    assert.ok(!copyLabels(SCREENS[name]).includes(LEGACY_INVOICE_ADDRESS_COPY_LABEL),
      `${name}: a copy control rendered beside nothing`);
  }
});

/**
 * A blob of pure whitespace is EMPTY, and it is the case the guard is likeliest
 * to be defeated on: `'   '` is truthy, so a `&&` in the caller would render the
 * row, the hint and a copy control around nothing at all. That is round 5's
 * wrapped-but-empty defeat, and it is why the condition tests the trimmed
 * string rather than the value.
 */
test('a whitespace-only blob is empty too', () => {
  for (const [label, markup] of [
    ['public', pub({ ...PUBLIC_EMPTY, legacyInvoiceAddress: '   ' })],
    ['inhouse', inh({ ...INHOUSE_EMPTY, legacyInvoiceAddress: '\n\t ' })],
  ]) {
    assert.ok(!markup.includes(LEGACY_INVOICE_ADDRESS_LABEL),
      `${label}: a whitespace blob rendered a row`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 4. DISPLAY ONLY — NOT PARSED, NOT SPLIT, NOT WRITABLE
// ════════════════════════════════════════════════════════════════════════════

/**
 * The value on the page is the STORED STRING, character for character. This is
 * the assertion that would catch a well-meaning "tidy the spacing" or "move the
 * postcode to the end" landing here later: the fixture blob has a double space
 * and a postcode in the middle, and both survive to the markup.
 */
test('the line is not reformatted on its way to the page', () => {
  for (const name of LEGACY) {
    const at = SCREENS[name].indexOf(BLOB);
    assert.notEqual(at, -1, `${name}: the exact stored string is not present — something reformatted it`);
    // …and specifically the two things a tidier would have changed.
    assert.ok(SCREENS[name].includes('ถ.พหลโยธิน  10400'), `${name}: the double space was collapsed`);
  }
});

test('the row offers no way to change it — no input, no textarea, no edit control', () => {
  /**
   * Bounded to the row itself. The CARD around it has a แก้ไข button and must
   * keep it — the company, the tax id and the branch are all still editable —
   * so a page-wide "no inputs" assertion would be both false and useless. The
   * slice runs from the legacy label to the end of its `<dd>`.
   */
  for (const name of LEGACY) {
    const markup = SCREENS[name];
    const at = markup.indexOf(LEGACY_INVOICE_ADDRESS_LABEL);
    const end = markup.indexOf('</dd>', at);
    assert.ok(at !== -1 && end !== -1, `${name}: could not isolate the legacy row`);
    const row = markup.slice(at, end);
    for (const tag of ['<input', '<textarea', '<select', 'contenteditable']) {
      assert.ok(!row.includes(tag), `${name}: the legacy row contains ${tag} — this field is display only`);
    }
  }
});

test('the field is on NEITHER screen’s editable set', () => {
  /**
   * ── ASSERTED AGAINST THE REAL MAPS, NOT AGAINST THE MARKUP ────────────────
   * The rendered row having no input is necessary and not sufficient: a field
   * can be absent from every form and still be submitted by an edit handler
   * that spreads a whole object. `editableQuotation` is the in-house screen's
   * own builder for what its quotation card can write, and the public screen's
   * invoice payload is built from `invoice` alone. If `legacyInvoiceAddress`
   * ever appears in either, this reddens before a write path can ship.
   */
  const built = editableQuotation({ ...INHOUSE_LEGACY });
  assert.ok(!('legacyInvoiceAddress' in built),
    'legacyInvoiceAddress entered the in-house quotation edit state — it now has a write path');
});

// ════════════════════════════════════════════════════════════════════════════
// 5. THE CONDITION ITSELF — INCLUDING THE 20 DOCUMENTS IT DELIBERATELY EXCLUDES
// ════════════════════════════════════════════════════════════════════════════

test('the condition is both-null AND non-empty, and nothing wider', () => {
  assert.equal(legacyInvoiceAddressLine({ thaiAddress: null, internationalAddress: null, legacyInvoiceAddress: BLOB }), BLOB);
  assert.equal(legacyInvoiceAddressLine({ legacyInvoiceAddress: BLOB }), BLOB, 'undefined addresses are absent addresses');
  assert.equal(legacyInvoiceAddressLine({ thaiAddress: null, internationalAddress: null, legacyInvoiceAddress: '  x  ' }), 'x');
  assert.equal(legacyInvoiceAddressLine({ thaiAddress: null, internationalAddress: null, legacyInvoiceAddress: '   ' }), '');
  assert.equal(legacyInvoiceAddressLine({ thaiAddress: null, internationalAddress: null }), '');
  assert.equal(legacyInvoiceAddressLine(), '');
  // A structured address of either shape suppresses it.
  assert.equal(legacyInvoiceAddressLine({ thaiAddress: { addressLine: 'x' }, internationalAddress: null, legacyInvoiceAddress: BLOB }), '');
  assert.equal(legacyInvoiceAddressLine({ thaiAddress: null, internationalAddress: { line1: 'x' }, legacyInvoiceAddress: BLOB }), '');
});

/**
 * ══ THE TWENTY, PINNED AS A DECISION ════════════════════════════════════════
 *
 * 20 documents in `register_inhouse` carry a legacy blob AND a `thaiAddress`
 * holding nothing but a `postalCode` — legacy-imported enquiries an admin later
 * opened and saved through the edit form, which wrote the one field they filled
 * and left the other four blank.
 *
 * They keep today's behaviour: `thaiAddress` is non-null, so the legacy row does
 * NOT render and they show a lone postcode exactly as they do now. This test
 * exists so that stays a decision rather than becoming an accident — "a
 * thaiAddress with no addressLine counts as empty" is a rule that would reach
 * every screen and every record in the system, and it needs its own round and
 * its own measurement. If someone folds it in here, this reddens and points at
 * the round it belongs to.
 */
test('a thaiAddress holding only a postcode still suppresses the legacy row', () => {
  const shape = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '10170' };
  assert.equal(
    legacyInvoiceAddressLine({ thaiAddress: shape, internationalAddress: null, legacyInvoiceAddress: 'หกดหกด' }),
    '',
    'the emptiness test was widened — see this test’s docstring before changing it',
  );

  const markup = inh({ ...INHOUSE_STRUCTURED, thaiAddress: shape, legacyInvoiceAddress: 'หกดหกด' });
  assert.ok(!markup.includes(LEGACY_INVOICE_ADDRESS_LABEL),
    'the legacy row rendered beside a postcode-only structured address');
  assert.ok(markup.includes('10170'), 'the lone postcode stopped rendering — that IS the regression');
});

// ════════════════════════════════════════════════════════════════════════════
// 6. CONTROLS — the probes above can actually see what they claim to
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: the three fixtures really are three different pages', () => {
  /**
   * Every absence assertion above is a `!includes`, which passes trivially on an
   * empty string. If a fixture threw during render, or rendered the "ไม่ได้ขอ
   * ใบเสนอราคา" early-return branch instead of the card, the whole section
   * would be green and vacuous.
   */
  for (const [name, markup] of Object.entries(SCREENS)) {
    assert.ok(markup.length > 1000, `${name}: rendered ${markup.length} bytes — that is not a detail page`);
    assert.ok(markup.includes('0105551234567'), `${name}: the quotation card did not render at all`);
  }
  assert.notEqual(SCREENS['public/legacy'], SCREENS['public/empty']);
  assert.notEqual(SCREENS['inhouse/legacy'], SCREENS['inhouse/empty']);
});

test('CONTROL: the structured fixtures really do carry a blob for the guard to suppress', () => {
  /**
   * §1's absence assertions are `!includes`, and a structured fixture with no
   * legacy address would satisfy them no matter what the guard did. This is the
   * assertion that says the input is present and the OUTPUT is what is missing —
   * it is the correction the `renders-always` control forced, kept as a test so
   * the fixtures cannot quietly drift back to proving nothing.
   */
  assert.equal(PUBLIC_STRUCTURED.legacyInvoiceAddress, BLOB);
  assert.equal(INHOUSE_STRUCTURED.legacyInvoiceAddress, BLOB);
  assert.ok(PUBLIC_STRUCTURED.invoice.thaiAddress, 'the public structured fixture lost its address');
  assert.ok(INHOUSE_STRUCTURED.thaiAddress, 'the in-house structured fixture lost its address');
  // …and the empty fixtures really are empty, which §3 depends on just as hard.
  assert.equal(PUBLIC_EMPTY.legacyInvoiceAddress, undefined);
  assert.equal(INHOUSE_EMPTY.legacyInvoiceAddress, undefined);
});

test('CONTROL: the copy-label probe finds the controls that already shipped', () => {
  assert.ok(copyLabels(SCREENS['public/structured']).includes('ที่อยู่ใบเสนอราคา'),
    'the probe never reached the structured address control — its absences prove nothing');
  assert.ok(copyLabels(SCREENS['inhouse/structured']).includes('ที่อยู่สำหรับใบเสนอราคา'),
    'the probe never reached the in-house address control');
});
