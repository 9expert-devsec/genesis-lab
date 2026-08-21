import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import { InternalNotesBody } from '@/app/admin/registrations/_components/detailShell';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 13 ON THE DETAIL SCREENS: NO LINKS, A COMPANY ON THE QUOTATION CARD,
 * AND A BYLINE THAT RENDERS NOTHING RATHER THAN A DASH.
 *
 * ══ NO REACT ROOT ═══════════════════════════════════════════════════════════
 * renderToStaticMarkup only. `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none').
 *
 * ══ THE CONTROLS ARE IN A SCRIPT ════════════════════════════════════════════
 * `node scripts/_control-round13.mjs list` names every break this file claims to
 * catch; `apply <name>` edits the real source and prints the diff; `revert` puts
 * it back. Two are expected to redden nothing, and what that measures is
 * recorded with them.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const PUBLIC_DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  courseCode: 'PBI-301',
  coordinator: {
    firstName: 'สมชาย', lastName: 'ใจดี',
    email: 'somchai@example.com', phone: '0812345678', isAttending: true,
  },
  attendeesListProvided: true,
  attendeesCount: 2,
  attendees: [
    { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
    { firstName: 'ปรีชา', lastName: 'ตั้งใจ' }, // no email — the dash branch
  ],
  createdAt: '2026-08-01T03:00:00.000Z',
};

/**
 * The IN-HOUSE fixture deliberately has `companyName` EQUAL to
 * `quotationCompany`, which is the normal case and the exact case the old
 * `companyDiverges` gate hid the company on. A fixture where they diverged
 * would have passed against the defect.
 */
const INHOUSE_SAME = {
  _id: 'cccccccccccccccccccc0003',
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
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
};

/** The legacy case: the two company names disagree. */
const INHOUSE_DIVERGES = {
  ...INHOUSE_SAME,
  _id: 'cccccccccccccccccccc0004',
  quotationCompany: 'บริษัท ทดสอบสำหรับใบเสนอราคา จำกัด',
};

/** A pre-split enquiry that never had `quotationCompany` written at all. */
const INHOUSE_NO_QUOTATION_COMPANY = {
  ...INHOUSE_SAME,
  _id: 'cccccccccccccccccccc0005',
  quotationCompany: undefined,
};

const pub = (doc) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, history: null }));
const inh = (doc) => renderToStaticMarkup(
  createElement(InhouseDetailClient, { doc, courses: [{ code: 'EXC-201', name: 'Excel Advanced' }], history: null }));

const PUB = pub(PUBLIC_DOC);
const PUB_CANCELLED = pub({ ...PUBLIC_DOC, status: 'cancelled' });
const INH = inh(INHOUSE_SAME);
const INH_CANCELLED = inh({ ...INHOUSE_SAME, status: 'cancelled' });
const INH_DIVERGES = inh(INHOUSE_DIVERGES);
const INH_NO_QC = inh(INHOUSE_NO_QUOTATION_COMPANY);

const SCREENS = { PUB, PUB_CANCELLED, INH, INH_CANCELLED, INH_DIVERGES, INH_NO_QC };

const copyLabels = (markup) =>
  [...markup.matchAll(/aria-label="คัดลอก([^"]*)"/g)].map((m) => m[1]);

// ════════════════════════════════════════════════════════════════════════════
// 1. NO mailto: OR tel:, ANYWHERE
// ════════════════════════════════════════════════════════════════════════════

test('NO mailto: or tel: href is rendered by either detail screen', () => {
  /**
   * ══ THE RENDER HALF ═══════════════════════════════════════════════════════
   *
   * Swept over every fixture including the cancelled ones, because a link that
   * only appears on one status branch is invisible to a render of the other —
   * the blind spot the list-screen harvest hit with a single `scheduleType`.
   */
  for (const [name, markup] of Object.entries(SCREENS)) {
    assert.ok(!markup.includes('mailto:'), `${name}: a mailto: link is back`);
    assert.ok(!markup.includes('tel:'), `${name}: a tel: link is back`);
    assert.ok(!/href="(mailto|tel):/.test(markup), `${name}: a contact href is back`);
  }
});

test('…and NO mailto:/tel: literal survives in either client’s CODE', () => {
  /**
   * The source half, and it is not redundant with the render one. A link on a
   * branch no fixture reaches renders nowhere and still ships — and the round-13
   * docstrings QUOTE `mailto:` while explaining why it is gone, so this must
   * read `.code` with comments stripped or it fails on correct source.
   */
  for (const rel of [
    'src/app/admin/registrations/_components/RegistrationDetailClient.jsx',
    'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx',
    'src/app/admin/registrations/_components/detailShell.jsx',
    'src/app/admin/registrations/_components/tableParts.jsx',
  ]) {
    const src = readSource(rel);
    assert.ok(!src.code.includes('mailto:'), `${rel} still builds a mailto: href`);
    assert.ok(!src.code.includes('tel:'), `${rel} still builds a tel: href`);
  }
});

test('CONTROL: the comment stripper is why the source half passes', () => {
  // The two clients' docstrings name `mailto:` and `tel:` in prose. Against RAW
  // source the assertion above would redden on correct code — face two, and the
  // control that says the probe is reading code rather than text.
  const inhouse = readSource('src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx');
  assert.ok(inhouse.raw.includes('mailto:'), 'the prose no longer mentions it — this control proves nothing');
  assert.ok(!inhouse.code.includes('mailto:'), 'the stripper is not running');
});

test('the values a link used to carry are still ON SCREEN, in plain text', () => {
  // The absence assertions above are all satisfied by a screen that dropped the
  // email and phone entirely. This is what makes them about the LINK.
  assert.ok(INH.includes('somchai@example.com'), 'the in-house contact email vanished with its link');
  assert.ok(INH.includes('0812345678'), 'the in-house contact phone vanished with its link');
  assert.ok(PUB.includes('somchai@example.com'), 'the attendee email vanished with its link');
});

test('each de-linked value gained a copy control', () => {
  for (const expected of ['อีเมลผู้ติดต่อ', 'เบอร์โทรผู้ติดต่อ']) {
    assert.ok(copyLabels(INH).includes(expected), `no copy control for ${expected}`);
  }
  assert.ok(copyLabels(PUB).includes('อีเมลผู้เข้าอบรมท่านที่ 1'),
    'the attendee email cell has no copy control');
  // The attendee with NO email gets neither a control nor an empty one.
  assert.ok(!copyLabels(PUB).includes('อีเมลผู้เข้าอบรมท่านที่ 2'),
    'a copy control rendered for an attendee with no email');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE QUOTATION CARD NAMES ITS SUBJECT
// ════════════════════════════════════════════════════════════════════════════

test('the quotation card shows the company when the two names are the SAME', () => {
  /**
   * ══ THE DEFECT, AS THE CASE THAT USED TO FAIL ═════════════════════════════
   *
   * The row was wrapped in `{companyDiverges && …}`, so it appeared ONLY on
   * legacy documents where the contact company and the quotation company
   * disagree. On every document written since the form was split — this fixture
   * — the card named no company at all.
   */
  assert.ok(INH.includes('>ชื่อบริษัท (ใบเสนอราคา)<'),
    'the quotation card still has no company row when the two names agree');
  assert.ok(copyLabels(INH).includes('ชื่อบริษัทสำหรับใบเสนอราคา'),
    'the company row has no copy control');
});

test('it shows the QUOTATION company, never the contact one', () => {
  /**
   * The field is the claim. `RegisterInhouse` carries both `companyName` — which
   * the model calls a legacy-compat MIRROR — and `quotationCompany`, and this
   * card must never show the contact one. The diverging fixture is the only
   * document shape where the two can be told apart.
   */
  const card = INH_DIVERGES.slice(
    INH_DIVERGES.indexOf('>ข้อมูลสำหรับออกใบเสนอราคา<'),
    INH_DIVERGES.indexOf('>หมายเหตุจากลูกค้า<'),
  );
  assert.ok(card.length > 200, 'the quotation-card slice is empty — the bounds moved, not the code');
  assert.ok(card.includes('บริษัท ทดสอบสำหรับใบเสนอราคา จำกัด'),
    'the quotation card does not show the quotation company');
  assert.ok(!card.includes('>บริษัท ทดสอบ จำกัด<'),
    'the quotation card shows the CONTACT company — the wrong field');
  // …and the contact card upstairs still shows the contact one, so the two are
  // genuinely reading different fields rather than one being empty.
  assert.ok(INH_DIVERGES.includes('บริษัท ทดสอบ จำกัด'),
    'the contact company vanished from the page entirely');
});

test('a pre-split enquiry falls back to the contact company rather than dropping the row', () => {
  // `quotationCompany` was never written. The row still renders, because the
  // contact company IS what a quotation would have been addressed to — a
  // read-time fallback, and nothing here writes anything.
  assert.ok(INH_NO_QC.includes('>ชื่อบริษัท (ใบเสนอราคา)<'),
    'a pre-split enquiry lost its company row');
  assert.ok(copyLabels(INH_NO_QC).includes('ชื่อบริษัทสำหรับใบเสนอราคา'),
    'the fallback row has no copy control');
});

test('the company sits ABOVE the tax id, the branch and the address', () => {
  /**
   * The order is a claim about what the card is: the company is its SUBJECT and
   * those three are attributes of it. A card whose subject appears below its own
   * attributes reads as a list of facts about nothing.
   */
  const card = INH.slice(
    INH.indexOf('>ข้อมูลสำหรับออกใบเสนอราคา<'),
    INH.indexOf('>หมายเหตุจากลูกค้า<'),
  );
  const at = (label) => card.indexOf(`>${label}<`);
  for (const label of ['ประเทศ', 'ชื่อบริษัท (ใบเสนอราคา)', 'เลขประจำตัวผู้เสียภาษี', 'สาขา', 'ที่อยู่']) {
    assert.notEqual(at(label), -1, `the ${label} row is missing from the quotation card`);
  }
  assert.ok(at('ประเทศ') < at('ชื่อบริษัท (ใบเสนอราคา)'), 'ประเทศ is no longer the first row');
  for (const attribute of ['เลขประจำตัวผู้เสียภาษี', 'สาขา', 'ที่อยู่']) {
    assert.ok(at('ชื่อบริษัท (ใบเสนอราคา)') < at(attribute),
      `${attribute} now precedes the company it belongs to`);
  }
});

test('สาขา gained a copy control, and it is the same shared component', () => {
  assert.ok(copyLabels(INH).includes('สาขาสำหรับใบเสนอราคา'), 'สาขา has no copy control');
  // Same button as the address one that already shipped — compared field by
  // field, so a second implementation would show up here.
  const button = (markup, label) => {
    const at = markup.indexOf(`aria-label="คัดลอก${label}"`);
    assert.notEqual(at, -1, `no control for ${label}`);
    return markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at) + 9);
  };
  const shapeOf = (html) => ({
    typed: /^<button[^>]*type="button"/.test(html),
    classes: (html.match(/class="([^"]*)"/) ?? [, ''])[1],
    live: html.includes('aria-live="polite"'),
    text: html.includes('>คัดลอก<'),
  });
  const reference = shapeOf(button(INH, 'ที่อยู่สำหรับใบเสนอราคา'));
  assert.ok(reference.typed && reference.live && reference.text, 'the reference control did not parse');
  for (const label of ['สาขาสำหรับใบเสนอราคา', 'ชื่อบริษัทสำหรับใบเสนอราคา', 'อีเมลผู้ติดต่อ', 'เบอร์โทรผู้ติดต่อ']) {
    assert.deepEqual(shapeOf(button(INH, label)), reference,
      `the ${label} control is not the same button as the address one`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE NEW CONTROLS OBEY THE THREE STANDING CONSTRAINTS
// ════════════════════════════════════════════════════════════════════════════

test('every new control is ABSENT when its value is empty', () => {
  /**
   * `DLRow` drops a row whose value is empty and takes the control with it; a
   * foreign quotation has no Thai branch at all, so `branchLabel` is '' and the
   * สาขา row is the live case for this on the quotation card.
   */
  const bare = inh({
    ...INHOUSE_SAME,
    _id: 'cccccccccccccccccccc0006',
    contactEmail: '', contactPhone: '',
    quotationCountry: 'OTHER', branchType: undefined, branchCode: '',
    thaiAddress: null,
    internationalAddress: { line1: '1 Main St', city: 'London', country: 'UK' },
  });
  const labels = copyLabels(bare);
  for (const gone of ['อีเมลผู้ติดต่อ', 'เบอร์โทรผู้ติดต่อ', 'สาขาสำหรับใบเสนอราคา']) {
    assert.ok(!labels.includes(gone), `${gone}: a copy control rendered beside no value`);
  }
  // …and the controls whose values ARE present survived, so the absences above
  // are about the values rather than about an empty render.
  assert.ok(labels.includes('ชื่อบริษัทสำหรับใบเสนอราคา'), 'the bare fixture rendered no controls at all');
});

test('every new control SURVIVES the cancellation lock, on both screens', () => {
  /**
   * Copying reads; the lock is about writing. Asserted as SET EQUALITY against
   * the editable render — a subset would mean one had been wired to the edit
   * gate, which is the easiest mistake to make and the hardest to see.
   */
  assert.deepEqual(copyLabels(INH_CANCELLED), copyLabels(INH),
    'the in-house screen lost or gained a copy control when cancelled');
  assert.deepEqual(copyLabels(PUB_CANCELLED), copyLabels(PUB),
    'the public screen lost or gained a copy control when cancelled');
  // …and the fixtures really ARE locked, or the equality is between two
  // identical unlocked renders.
  assert.equal((INH_CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'the in-house fixture is not locked');
  assert.ok((INH.match(/>แก้ไข</g) ?? []).length > 0, 'the editable fixture offers no edit');
});

test('no new control names a label another already uses', () => {
  // A screen reader announcing two different controls identically has told the
  // reader nothing. Asserted per screen, because the labels only collide within
  // one page.
  for (const [name, markup] of Object.entries({ PUB, INH })) {
    const labels = copyLabels(markup);
    assert.ok(labels.length >= 4, `${name}: only ${labels.length} controls — the fixture is too thin`);
    assert.equal(new Set(labels).size, labels.length,
      `${name}: two copy controls share a label — [${labels.join(', ')}]`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE BYLINE RENDERS NO ELEMENT, NOT A DASH
// ════════════════════════════════════════════════════════════════════════════

/** One note entry, rendered through the real component. */
const notesMarkup = (notes) => renderToStaticMarkup(createElement(InternalNotesBody, {
  notes,
  draft: '',
  onDraftChange: () => {},
  onAdd: undefined,
  adding: false,
  formatDate: (d) => `[${String(d).slice(0, 10)}]`,
  emptyLabel: 'ยังไม่มีบันทึกภายใน',
}));

test('a note with an author and a time renders ONE byline, reading WHO · WHEN', () => {
  const html = notesMarkup([
    { body: 'test note', authorId: 'x', authorName: 'Yanisa P.', createdAt: '2026-08-21T07:36:14.339Z' },
  ]);
  assert.ok(html.includes('test note'), 'the body did not render');
  assert.ok(html.includes('Yanisa P. · [2026-08-21]'), 'the byline is not who-then-when');
});

test('a note with NEITHER renders the body and NO byline element at all', () => {
  /**
   * ══ THE CLAIM, AND WHY IT IS COUNTED RATHER THAN SEARCHED ═════════════════
   *
   * The old markup was `{note.authorName || '—'}` and its comment defended the
   * dash on the grounds that "a byline that collapses to nothing is invisible to
   * every text assertion". That is true of a text search and it is not true of a
   * COUNT: the entry's `<p>` elements are countable, and an absent byline is one
   * fewer of them. So the rule and the assertability are not in tension — the
   * first draft of the assertion just asked the wrong question.
   */
  const withBoth = notesMarkup([
    { body: 'a', authorId: '', authorName: 'Y', createdAt: '2026-08-21T00:00:00.000Z' },
  ]);
  const withNeither = notesMarkup([
    { body: 'a', authorId: '', authorName: '', createdAt: null },
  ]);
  const pCount = (h) => (h.match(/<p\b/g) ?? []).length;

  assert.equal(pCount(withBoth), 2, 'a complete note is not body + byline');
  assert.equal(pCount(withNeither), 1, 'an unattributed note still emits a byline element');
  assert.ok(!withNeither.includes('—'), 'the em dash is back on an empty byline');
  assert.ok(withNeither.includes('>a<'), 'the note body vanished with its byline');
});

test('a partial byline renders what it has, with no dangling separator', () => {
  const nameOnly = notesMarkup([{ body: 'a', authorId: '', authorName: 'Y', createdAt: null }]);
  const timeOnly = notesMarkup([{ body: 'a', authorId: '', authorName: '', createdAt: '2026-08-21T00:00:00.000Z' }]);
  assert.ok(nameOnly.includes('>Y<'), 'the name-only byline did not render');
  assert.ok(!nameOnly.includes('·'), 'the name-only byline kept its separator');
  assert.ok(timeOnly.includes('[2026-08-21]'), 'the time-only byline did not render');
  assert.ok(!timeOnly.includes('·'), 'the time-only byline kept its separator');
});

test('CONTROL: the <p> count DOES move, so the assertion above is a real constraint', () => {
  // Two notes, one attributed and one not: 3 paragraphs, not 4 and not 2. If the
  // count could not distinguish them, every assertion in this section would be
  // satisfied by any markup at all.
  const mixed = notesMarkup([
    { body: 'a', authorId: '', authorName: 'Y', createdAt: '2026-08-21T00:00:00.000Z' },
    { body: 'b', authorId: '', authorName: '', createdAt: null },
  ]);
  assert.equal((mixed.match(/<p\b/g) ?? []).length, 3);
  assert.ok(mixed.includes('>a<') && mixed.includes('>b<'), 'a note body went missing');
});
