import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import { CopyAction } from '@/app/admin/registrations/_components/detailShell';

/**
 * THE COPY AFFORDANCE, ON BOTH SCREENS.
 *
 * ══ THE DECISION THIS FILE PINS ═════════════════════════════════════════════
 *
 * PER-VALUE on the field rows, plus ONE multi-value copy on the attendee row
 * menu. NOT a per-card "copy this card" control, and not both.
 *
 * The basis is what an admin actually re-types into another system: one value at
 * a time — an email into a mail client, a phone into a dialler, an address into
 * a quotation. Nobody pastes a card. A per-card control would produce a labelled
 * block that has to be edited down wherever it lands, and it still would not
 * give them the single field they came for.
 *
 * The attendee is the stated exception, because a roster genuinely does go
 * somewhere as ROWS — an attendance sheet, a certificate mail-merge.
 *
 * ══ THE THREE CONSTRAINTS ═══════════════════════════════════════════════════
 *   1. copying is NOT an edit and survives the cancellation lock
 *   2. a copy NEVER writes an audit row
 *   3. no control on a field with no value
 *
 * (2) is asserted in render/registrationAttendeeTab, structurally — there is no
 * server action to write one. Named here so a reader looking for all three
 * finds where the third lives.
 */

const PUBLIC_DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 2,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' }],
  requestInvoice: true,
  invoice: {
    type: 'corporate', country: 'TH',
    companyName: 'บริษัท ทดสอบ จำกัด', taxId: '0105551234567', branchType: 'head_office',
    thaiAddress: {
      addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน',
      district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
    },
  },
  createdAt: '2026-08-01T03:00:00.000Z',
};

/** Every optional value absent — the branch where a control must NOT render. */
const PUBLIC_BARE = {
  ...PUBLIC_DOC,
  _id: 'bbbbbbbbbbbbbbbbbbbb0002',
  coordinator: { firstName: 'ปรีชา', lastName: 'ตั้งใจ' }, // no email, no phone
  attendees: [{ firstName: 'ปรีชา', lastName: 'ตั้งใจ' }],
  requestInvoice: false,
  invoice: null,
};

const INHOUSE_DOC = {
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
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
};

const pub = (doc) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, history: null }));
const inh = (doc) => renderToStaticMarkup(
  createElement(InhouseDetailClient, { doc, courses: [], history: null }));

const PUB       = pub(PUBLIC_DOC);
const BARE      = pub(PUBLIC_BARE);
const CANCELLED = pub({ ...PUBLIC_DOC, status: 'cancelled' });
const INH       = inh(INHOUSE_DOC);
const INH_CANCELLED = inh({ ...INHOUSE_DOC, status: 'cancelled' });

/**
 * Every copy control's accessible label, in order.
 *
 * ── THIS SEES THE FIELD-ROW CONTROLS AND NOT THE ROW MENU'S ───────────────
 * `CopyButton` carries an `aria-label`; the attendee row menu's copy items are
 * `OverflowItem` buttons whose accessible name is their TEXT. So this probe is
 * about the per-value affordance only, and the row menu's two items are asserted
 * in render/registrationAttendeeTab instead.
 *
 * Measured rather than assumed: the `copy-gated` control, which wires the row
 * copy to the edit gate, reddens the attendee-tab test and leaves every
 * assertion in this file green. Stated so the next reader does not take this
 * file's cancellation test as covering the row menu.
 */
const copyLabels = (markup) =>
  [...markup.matchAll(/aria-label="คัดลอก([^"]*)"/g)].map((m) => m[1]);

// ════════════════════════════════════════════════════════════════════════════
// 1. PER-VALUE, ON BOTH SCREENS
// ════════════════════════════════════════════════════════════════════════════

test('the public screen offers a copy on each value worth re-typing', () => {
  const labels = copyLabels(PUB);
  for (const expected of ['ชื่อผู้ประสานงาน', 'อีเมลผู้ประสานงาน', 'เบอร์โทรผู้ประสานงาน', 'ที่อยู่ใบเสนอราคา']) {
    assert.ok(labels.includes(expected), `no copy control for ${expected}: [${labels.join(', ')}]`);
  }
});

test('the in-house screen offers one on its person and its addresses', () => {
  const labels = copyLabels(INH);
  for (const expected of ['ชื่อผู้ติดต่อ', 'ชื่อบริษัท', 'เลขผู้เสียภาษี']) {
    assert.ok(labels.includes(expected), `no copy control for ${expected}: [${labels.join(', ')}]`);
  }
});

test('EVERY copy control names WHAT it copies — none is a bare "คัดลอก"', () => {
  /**
   * There are several on a page. A screen reader announcing "คัดลอก" five times
   * has told the reader nothing about which is which, and the visible label is
   * the same word on all of them.
   */
  for (const [name, markup] of Object.entries({ PUB, INH })) {
    const labels = copyLabels(markup);
    assert.ok(labels.length >= 3, `${name}: only ${labels.length} copy controls — the fixture is too thin`);
    for (const label of labels) {
      assert.ok(label.trim().length > 0, `${name}: a copy control has no subject in its label`);
    }
    assert.equal(new Set(labels).size, labels.length,
      `${name}: two copy controls share a label — [${labels.join(', ')}]`);
  }
});

test('there is NO per-card copy control', () => {
  // The decision, asserted rather than left to the absence of code. A card-level
  // control would most plausibly arrive in the card header beside แก้ไข.
  for (const [name, markup] of Object.entries({ PUB, INH })) {
    assert.ok(!markup.includes('คัดลอกทั้งการ์ด'), `${name}: a per-card copy control appeared`);
    assert.ok(!markup.includes('คัดลอกข้อมูลทั้งหมด'), `${name}: a copy-everything control appeared`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ABSENT MEANS ABSENT
// ════════════════════════════════════════════════════════════════════════════

test('a dropped ROW takes its copy control with it', () => {
  /**
   * ══ WHAT THIS MEASURES, AND WHAT IT DOES NOT — FOUND BY A CONTROL ═════════
   *
   * The coordinator on the bare fixture has no email and no phone, and no
   * invoice at all. `DLRow` drops those rows ENTIRELY, so `CopyAction` is never
   * even reached — which means this test passes whether or not CopyAction has an
   * empty guard. The `copy-empty` control proved it: removing that guard leaves
   * this test GREEN.
   *
   * It is kept, renamed to what it actually checks, because the claim is still
   * worth having — a dropped row must not leave a stray control behind. But the
   * guard on the CONTROL itself is the test below, and the row that reaches it
   * is the one that renders WITHOUT a value: an `emptyHint` row.
   */
  const labels = copyLabels(BARE);
  assert.ok(!labels.includes('อีเมลผู้ประสานงาน'), 'a copy control rendered for an absent email');
  assert.ok(!labels.includes('เบอร์โทรผู้ประสานงาน'), 'a copy control rendered for an absent phone');
  assert.ok(!labels.includes('ที่อยู่ใบเสนอราคา'), 'a copy control rendered for an absent address');
  // …and the one value it DOES have keeps its control, so this is not passing
  // because the page rendered nothing.
  assert.ok(labels.includes('ชื่อผู้ประสานงาน'), 'the bare fixture lost the control it should have');
});

test('a row that renders WITHOUT a value offers no copy — the emptyHint case', () => {
  /**
   * THE ROW THAT ACTUALLY REACHES `CopyAction` WITH NOTHING. An onsite in-house
   * enquiry with no venue renders on purpose — the missing value IS the
   * information, work for a salesperson — so the row survives `DLRow`'s
   * absent-means-absent rule and the control has to make its own decision.
   *
   * Without this fixture, every "no control on an empty value" assertion in this
   * file is really an assertion about `DLRow`, and the control's own guard is
   * untested. The `copy-empty` control is what showed that.
   */
  const noVenue = inh({ ...INHOUSE_DOC, trainingFormat: 'onsite', onsiteVenue: null });
  assert.ok(noVenue.includes('ยังไม่ได้ระบุ — ต้องสอบถามลูกค้า'),
    'the venue row did not render its hint — the fixture does not reach the case');
  assert.ok(!copyLabels(noVenue).includes('สถานที่จัดอบรม'),
    'a copy control rendered beside a hint — it would put the hint on the clipboard');

  // CONTROL: the same row WITH a venue does offer one, so the absence above is
  // about the value rather than about the row never having a control.
  const withVenue = inh({
    ...INHOUSE_DOC,
    trainingFormat: 'onsite',
    onsiteVenue: { addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน', district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400' },
  });
  assert.ok(copyLabels(withVenue).includes('สถานที่จัดอบรม'),
    'the venue row never offers a copy at all — the assertion above proves nothing');
});

test('CopyAction renders NOTHING for an empty or whitespace-only text', () => {
  /**
   * Asserted at the component, over the shapes a caller can actually hand it.
   *
   * ── AND WHY THE TEST IS ON THE TEXT, NOT ON A NODE ───────────────────────
   * Round 5's wrapped-but-empty defeat came from asking "does this render" with
   * the answer to "is this truthy". `CopyAction` takes the STRING that would
   * reach the clipboard, so the question and the answer are the same one: a node
   * can render perfectly while the text derived from it is ''.
   */
  const render = (text) => renderToStaticMarkup(createElement(CopyAction, { text, label: 'x' }));
  for (const empty of ['', '   ', '\t', '\n', null, undefined, 0, false, {}, []]) {
    assert.equal(render(empty), '', `CopyAction rendered for ${JSON.stringify(empty)}`);
  }
});

test('CONTROL: CopyAction DOES render for a real value', () => {
  // Without this, a component returning null for everything would satisfy every
  // absence above and remove the feature entirely.
  const html = renderToStaticMarkup(createElement(CopyAction, { text: 'a@b.c', label: 'อีเมล' }));
  assert.ok(html.includes('<button'), 'CopyAction rendered no control for a real value');
  assert.match(html, /aria-label="คัดลอกอีเมล"/, 'the control lost its subject');
  // Trimmed, so a padded value does not put whitespace on the clipboard.
  const padded = renderToStaticMarkup(createElement(CopyAction, { text: '  a@b.c  ', label: 'อีเมล' }));
  assert.ok(padded.includes('<button'), 'a padded value rendered no control');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. COPYING IS NOT AN EDIT
// ════════════════════════════════════════════════════════════════════════════

test('every copy control survives the cancellation lock, on BOTH screens', () => {
  /**
   * The lock is about WRITING. A copy reads, and the field rows it sits on are
   * still rendered on a cancelled record — so removing the controls would take
   * away the one thing a reader can still usefully do with a frozen record.
   *
   * Asserted as SET EQUALITY against the editable render, not as "some remain":
   * a subset would mean one of them had been wired to the edit gate by mistake,
   * which is the easiest mistake to make and the hardest to see.
   */
  assert.deepEqual(copyLabels(CANCELLED), copyLabels(PUB),
    'the public screen lost or gained a copy control when cancelled');
  assert.deepEqual(copyLabels(INH_CANCELLED), copyLabels(INH),
    'the in-house screen lost or gained a copy control when cancelled');
});

test('CONTROL: the cancelled fixtures really ARE locked', () => {
  /**
   * The equality above would also hold on a record that was never locked at all.
   * These two lines are what make it a statement about the lock rather than
   * about two identical renders.
   */
  assert.equal((CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'the public fixture is not locked');
  assert.equal((INH_CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'the in-house fixture is not locked');
  assert.ok((PUB.match(/>แก้ไข</g) ?? []).length > 0, 'the editable public fixture offers no edit');
  assert.ok((INH.match(/>แก้ไข</g) ?? []).length > 0, 'the editable in-house fixture offers no edit');
  // …and both cancelled renders still carry their content, so the equality is
  // not between two empty pages.
  assert.ok(copyLabels(CANCELLED).length >= 3, 'the cancelled public render has almost no copy controls');
});
