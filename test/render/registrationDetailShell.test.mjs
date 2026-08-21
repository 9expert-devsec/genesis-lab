import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import { NEUTRAL_STATUS_BADGE, statusBadge, statusLabel } from '@/lib/registrations/statuses';
import { DETAIL_HEADING_LABEL } from '@/lib/registrations/detailHeading';
import { refNo } from '@/lib/refNo';

/**
 * THE RESTYLED DETAIL SCREENS: the tabs, the dark strip, the status bar and the
 * attendee table.
 *
 * ── THE FIXTURES ARE DELIBERATELY SPARSE, AND THAT IS THE INSTRUMENT ────────
 * Each screen is rendered twice — once from a full document and once from one
 * where every optional field is absent. A page only emits an empty element on
 * the branch where an optional line was dropped, so a fixture with everything
 * populated proves nothing about the branch that matters.
 *
 * That defect got through TWICE on the list screen, in rounds 1 and 2, because
 * it is invisible to text matching: the string an `includes()` assertion looks
 * for is absent in both the correct and the broken version. Everything about it
 * here asserts on ELEMENTS.
 *
 * ── NO REACT ROOT ──────────────────────────────────────────────────────────
 * renderToStaticMarkup only — `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none') and once broke
 * twenty-eight of them. So what is asserted is which affordances and which
 * panels RENDER, which is exactly the claim; the tab that is open on load is a
 * property of the markup and needs no click.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const HISTORY = createElement('p', { id: 'history-slot-sentinel' }, 'ประวัติจากเซิร์ฟเวอร์');

const PUBLIC_FULL = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  courseCode: 'PBI-301',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678', isAttending: true },
  attendeesListProvided: true,
  attendeesCount: 2,
  attendees: [
    { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
    { firstName: 'สมหญิง', lastName: 'ดีใจ', email: 'somying@example.com', phone: '0899999999' },
  ],
  requestInvoice: false,
  invoice: null,
  notes: 'โทรยืนยันแล้ว',
  pricing: { pricePerSeat: 10000, seats: 2, subtotal: 20000, vatAmount: 1400, total: 21400 },
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

/**
 * Everything optional, absent — and every one of these is a real document shape.
 *
 * NO `pricing`: a registration taken through the quotation path has none, which
 * is the branch that decides whether the ยอดสุทธิ cell's sub-line is DROPPED or
 * merely blank. NO `classDate`, no phone, no notes, an attendee row with a name
 * and nothing else.
 */
const PUBLIC_SPARSE = {
  _id: 'bbbbbbbbbbbbbbbbbbbb0002',
  status: 'pending',
  courseName: 'SQL Fundamentals',
  courseCode: '',
  classId: '',
  classDate: '',
  scheduleType: '',
  attendanceMode: '',
  coordinator: { firstName: 'ปรีชา', lastName: 'ตั้งใจ' },
  attendeesListProvided: true,
  attendeesCount: 3,
  attendees: [{ firstName: 'ปรีชา', lastName: 'ตั้งใจ' }],
  requestInvoice: false,
  invoice: null,
  notes: '',
  createdAt: '2026-08-05T03:00:00.000Z',
  updatedAt: '2026-08-05T03:00:00.000Z',
};

const INHOUSE_FULL = {
  _id: 'cccccccccccccccccccc0003',
  status: 'pending',
  companyName: 'บริษัท ทดสอบ จำกัด',
  quotationCompany: 'บริษัท ทดสอบ จำกัด',
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com',
  contactPhone: '0812345678',
  coursesInterested: ['EXC-201'],
  participantsCount: 15,
  contentMode: 'standard',
  contentDetails: 'เน้น Power Query',
  trainingFormat: 'onsite',
  preferredMonth: '2026-09',
  scheduleNote: 'ช่วงบ่าย',
  quotationCountry: 'TH',
  branchType: 'head_office',
  branchCode: '',
  taxId: '0105551234567',
  adminNotes: 'คุยกับลูกค้าแล้ว',
  message: 'อยากได้ workshop',
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

/** Everything optional, absent. No note, no message, no schedule note, no tax id. */
const INHOUSE_SPARSE = {
  _id: 'dddddddddddddddddddd0004',
  status: 'pending',
  companyName: 'บริษัท ว่าง จำกัด',
  quotationCompany: '',
  contactFirstName: 'ปรีชา',
  contactLastName: '',
  contactEmail: '',
  contactPhone: '',
  coursesInterested: [],
  participantsCount: 15,
  contentMode: '',
  contentDetails: '',
  trainingFormat: 'online',
  preferredMonth: '',
  scheduleNote: '',
  quotationCountry: 'TH',
  branchType: '',
  branchCode: '',
  taxId: '',
  adminNotes: '',
  message: '',
  source: 'inhouse',
  createdAt: '2026-08-06T03:00:00.000Z',
  updatedAt: '2026-08-06T03:00:00.000Z',
};

const pub = (doc, extra = {}) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, history: HISTORY, ...extra })
);
const inh = (doc, extra = {}) => renderToStaticMarkup(
  createElement(InhouseDetailClient, {
    doc, courses: doc.coursesInterested?.length ? [{ code: 'EXC-201', name: 'Excel Advanced' }] : [],
    history: HISTORY, ...extra,
  })
);

const PUB_FULL   = pub(PUBLIC_FULL);
const PUB_SPARSE = pub(PUBLIC_SPARSE);
const INH_FULL   = inh(INHOUSE_FULL);
const INH_SPARSE = inh(INHOUSE_SPARSE);

const ALL = { PUB_FULL, PUB_SPARSE, INH_FULL, INH_SPARSE };

// ── Probes ──────────────────────────────────────────────────────────────────

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Every `<button role="tab">` open tag, in order. */
function tabTriggers(markup) {
  return [...markup.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => ({ open: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[1] }));
}

/** Every `role="tabpanel"` element's open tag. */
function tabPanels(markup) {
  return [...markup.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);
}

/*
 * `stripCells` IS DELETED. It located the dark strip by `h-[93px]` and its cells
 * by `pt-[14px]`, and both classes are gone from the tree with the component.
 * A probe kept alive against markup that no longer exists would fail its own
 * `notEqual(start, -1)` guard, which is the honest outcome — but every
 * assertion built on it has been deleted or re-pointed instead, so there is
 * nothing left to locate.
 */

/** The class list of the first element carrying `marker` as a whole token. */
function classesOfElementWith(markup, marker) {
  for (const m of markup.matchAll(/\sclass="([^"]*)"/g)) {
    const classes = m[1].split(/\s+/).filter(Boolean);
    if (classes.includes(marker)) return classes;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. THE TABS
// ════════════════════════════════════════════════════════════════════════════

test('public has three tabs and in-house has two, in the specified order', () => {
  assert.deepEqual(
    tabTriggers(PUB_FULL).map((t) => textOf(t.inner)),
    ['ข้อมูลการสมัคร', 'ผู้เข้าอบรม2', 'ประวัติการดำเนินการ'],
  );
  assert.deepEqual(
    tabTriggers(INH_FULL).map((t) => textOf(t.inner)),
    ['ข้อมูลการสมัคร', 'ประวัติการดำเนินการ'],
  );
});

test('there is no ผู้เข้าอบรม tab on the in-house screen', () => {
  // An in-house enquiry has no roster. A tab that opens on "ไม่มีข้อมูล" is a
  // control that says nothing, and the count badge would have nothing to count.
  assert.ok(!tabTriggers(INH_FULL).some((t) => textOf(t.inner).startsWith('ผู้เข้าอบรม')),
    'the in-house screen grew an attendee tab');
});

test('the count badge is on ผู้เข้าอบรม and on nothing else', () => {
  const badges = (t) => (t.inner.match(/w-\[21px\]/g) ?? []).length;
  const triggers = tabTriggers(PUB_FULL);
  assert.equal(badges(triggers[0]), 0, 'ข้อมูลการสมัคร grew a count badge');
  assert.equal(badges(triggers[1]), 1, 'ผู้เข้าอบรม lost its count badge');
  assert.equal(badges(triggers[2]), 0, 'ประวัติการดำเนินการ grew a count badge');
  for (const t of tabTriggers(INH_FULL)) {
    assert.equal(badges(t), 0, 'an in-house tab grew a count badge');
  }
});

/**
 * EXACTLY ONE PANEL IS VISIBLE — asserted over the RENDERED SET.
 *
 * "There is one panel" would be satisfied by a screen that lost the other two.
 * Every panel is in the markup and the inactive ones carry the `hidden`
 * attribute, so the claim is: as many panels as tabs, exactly one of them
 * without `hidden`, and it is the one the selected tab points at.
 */
test('every screen renders one panel per tab, with exactly one visible', () => {
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    const tabs = tabTriggers(markup);
    const panels = tabPanels(markup);
    assert.equal(panels.length, tabs.length, `${name}: ${panels.length} panels against ${tabs.length} tabs`);
    const visible = panels.filter((p) => !/\bhidden\b/.test(p));
    assert.equal(visible.length, 1, `${name}: ${visible.length} panels are visible at once`);
  }
});

test('the visible panel is the one the selected tab controls', () => {
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    const selected = [...markup.matchAll(/<button[^>]*role="tab"[^>]*>/g)]
      .find((m) => m[0].includes('aria-selected="true"'));
    assert.ok(selected, `${name}: no tab is selected`);
    const controls = /aria-controls="([^"]*)"/.exec(selected[0])[1];
    const visible = tabPanels(markup).find((p) => !/\bhidden\b/.test(p));
    assert.ok(visible.includes(`id="${controls}"`),
      `${name}: the selected tab controls ${controls} but a different panel is visible`);
  }
});

test('exactly ONE tab is aria-selected', () => {
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    const selected = (markup.match(/aria-selected="true"/g) ?? []).length;
    assert.equal(selected, 1, `${name}: ${selected} tabs claim to be selected`);
  }
});

// ── The history slot ────────────────────────────────────────────────────────

test('the history panel renders WHAT THE PAGE HANDED IN — the client fetches nothing', () => {
  /**
   * `RecordHistory` is a SERVER component and cannot be mounted from a client
   * tab panel. page.jsx renders it and passes the NODE down, so switching to the
   * history tab costs no round trip.
   *
   * The sentinel is a node the client could not possibly have produced. If the
   * client ever grew its own fetch, the sentinel would be gone and this would
   * say so — which no assertion about the panel's CHROME could.
   */
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    assert.ok(markup.includes('id="history-slot-sentinel"'),
      `${name}: the history slot did not render what the page passed in`);
  }
});

test('no history slot means NO history tab, not an empty one', () => {
  /**
   * `RecordHistory` renders nothing when the viewer may not read the audit trail
   * — a panel saying "you may not see this" confirms the record HAS history,
   * which is the thing being withheld. Under a tab that would become a tab
   * opening onto blank space, saying the same thing one click later.
   */
  const noHistory = pub(PUBLIC_FULL, { history: null });
  const labels = tabTriggers(noHistory).map((t) => textOf(t.inner));
  assert.deepEqual(labels, ['ข้อมูลการสมัคร', 'ผู้เข้าอบรม2']);
  assert.equal(tabPanels(noHistory).length, 2, 'an empty history panel is still in the markup');

  const noHistoryInh = inh(INHOUSE_FULL, { history: null });
  assert.deepEqual(tabTriggers(noHistoryInh).map((t) => textOf(t.inner)), ['ข้อมูลการสมัคร']);
  assert.equal(tabPanels(noHistoryInh).length, 1);
});

test('CONTROL: the panel probe would see a panel that had leaked visible', () => {
  // Every panel assertion counts `hidden`. Point the probe at markup with a
  // known answer, so "exactly one visible" cannot be passing because the probe
  // reports one for the wrong reason.
  const two = '<div role="tabpanel" hidden></div><div role="tabpanel"></div><div role="tabpanel"></div>';
  assert.equal(tabPanels(two).length, 3);
  assert.equal(tabPanels(two).filter((p) => !/\bhidden\b/.test(p)).length, 2);
});

// ════════════════════════════════════════════════════════════════════════════
// 1b. THE PAGE HEADING, AND WHERE THE REFERENCE NUMBER WENT
// ════════════════════════════════════════════════════════════════════════════

/** The `<h1>`'s text content. The heading is the claim; the badge above is not. */
function headingText(markup) {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(markup);
  assert.ok(m, 'no <h1> in the render');
  return textOf(m[1]);
}

test('both screens head with ข้อมูลการลงทะเบียน and their identifying field', () => {
  assert.equal(headingText(PUB_FULL), `${DETAIL_HEADING_LABEL} : สมชาย ใจดี`);
  assert.equal(headingText(INH_FULL), `${DETAIL_HEADING_LABEL} : บริษัท ทดสอบ จำกัด`);
});

test('THE IN-HOUSE CHOICE: the company heads the page, not the contact', () => {
  /**
   * Stated as an assertion rather than left to the docstring, because both
   * fields are on the fixture and either would have produced a heading that
   * looks perfectly reasonable. See lib/registrations/detailHeading for the
   * three reasons; this pins the outcome.
   *
   * The contact has NOT been dropped — it is the subtitle — so the second half
   * asserts it is still on the page, in the block below the heading.
   */
  assert.ok(!headingText(INH_FULL).includes('สมชาย'), 'the contact name is in the heading');
  assert.ok(INH_FULL.includes('>สมชาย ใจดี<'), 'the contact name is nowhere on the page');
});

test('THE MISSING-FIELD FIXTURE: no bare colon on either screen', () => {
  /**
   * The heading now depends on a field that can be absent, so a record without
   * it is rendered rather than reasoned about. `ข้อมูลการลงทะเบียน : ` at 40px
   * reads as data that failed to load.
   *
   * Both directions of "absent": a coordinator whose name fields are EMPTY, and
   * one that is whitespace-only — which is truthy and is how the defect would
   * come back past a naive `if (name)`.
   */
  const noName = pub({ ...PUBLIC_FULL, coordinator: { ...PUBLIC_FULL.coordinator, firstName: '', lastName: '' } });
  const blankName = pub({ ...PUBLIC_FULL, coordinator: { ...PUBLIC_FULL.coordinator, firstName: '  ', lastName: ' ' } });
  const noCompany = inh({ ...INHOUSE_FULL, companyName: '', quotationCompany: '' });

  for (const [name, markup] of Object.entries({ noName, blankName, noCompany })) {
    assert.equal(headingText(markup), DETAIL_HEADING_LABEL,
      `${name}: the heading is not the bare label`);
    assert.ok(!headingText(markup).includes(':'), `${name}: THE BARE COLON IS BACK`);
  }
});

test('refNo is in ข้อมูลระบบ and NOWHERE in the heading', () => {
  /**
   * ── THE CONSEQUENCE CHAIN THIS CLOSES ─────────────────────────────────────
   * Round 3 deleted the เลขอ้างอิง column from BOTH list tables, and the reason
   * recorded then was that the detail heading carried the number. The heading no
   * longer does. If this row were ever dropped the reference number would exist
   * NOWHERE in the UI except a confirm dialog, and nothing else in the suite
   * would notice.
   *
   * Both halves matter: present in the system card, and absent from the heading.
   * Asserting only the first would pass on a screen that shows it twice.
   */
  for (const [name, markup, id] of [
    ['PUB_FULL', PUB_FULL, PUBLIC_FULL._id],
    ['INH_FULL', INH_FULL, INHOUSE_FULL._id],
  ]) {
    const ref = refNo(id);
    assert.ok(ref.length === 8, 'the fixture id is not ObjectId-shaped');
    assert.ok(markup.includes('>เลขอ้างอิง<'), `${name}: the เลขอ้างอิง row is missing`);
    assert.ok(markup.includes(`>${ref}<`), `${name}: the reference number ${ref} is not rendered`);
    assert.ok(!headingText(markup).includes(ref), `${name}: the reference number is still in the heading`);

    // …and it is in the ข้อมูลระบบ card specifically, not merely somewhere.
    const card = markup.slice(markup.indexOf('>ข้อมูลระบบ<'));
    assert.ok(card.includes(`>${ref}<`), `${name}: the reference number is not in ข้อมูลระบบ`);
  }
});

test('the BackLink carries NO top padding — the hand removal is deliberate', () => {
  /**
   * The Figma read puts this block 30px down and it shipped as `pt-[30px]`. It
   * was removed BY HAND and that supersedes the measurement — the admin layout
   * already supplies the space, so the 30px was applied twice.
   *
   * NOTHING PINNED THIS IN EITHER DIRECTION BEFORE, which is exactly how a hand
   * edit gets undone by the next person reading the design file. It is pinned
   * now, in the direction the decision went.
   */
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    const upToBack = markup.slice(0, markup.indexOf('h-[40.5px]'));
    assert.ok(!upToBack.includes('pt-[30px]'),
      `${name}: the back-link block's 30px top padding is back — see the note on BackLink`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE DARK SUMMARY STRIP IS GONE
//
// Five assertions and one probe were deleted here rather than left green over
// markup that no longer renders. Named, with what happened to each claim:
//
//   · public has THREE strip cells and in-house has FOUR
//   · the strip cells are CONTENT-WIDTH, divided by rules rather than by gaps
//   · CONTROL: the strip probe lands on the strip and finds its cells
//       → DELETED OUTRIGHT. All three are about the strip's own geometry. There
//         is no surviving claim: the thing they measured does not exist.
//
//   · the ยอดสุทธิ sub-line is DROPPED without pricing, not rendered blank
//       → DELETED, AND THE DEFECT WITH IT. This asserted the strip degraded
//         gracefully on a quotation-path registration; the ruling is that
//         rendering `—` for a total that does not exist was itself the defect,
//         and it is not ported. `PaymentInfoCard` is the surviving surface and
//         it is absent — not dashed — on that path, because `pricing` and
//         `payment` are written by one object literal in build-public.js.
//         `DLRow`'s absent-means-absent rule is separately asserted in §5.
//
//   · the public ผู้เข้าอบรม cell carries the ครบ / ยังไม่ครบ sub-line
//   · the in-house strip says "15 ท่าน" and never "ประมาณ"
//       → RE-POINTED, below. Both carried a claim that outlives the strip.
// ════════════════════════════════════════════════════════════════════════════

test('all three roster branches still render — on the surface that survived', () => {
  /**
   * RE-POINTED from the dark strip's ผู้เข้าอบรม cell to the ผู้เข้าอบรม TAB's
   * summary row, which reads the same `rosterState`.
   *
   * ── NOT WEAKER, AND HERE IS THE COMPARISON ────────────────────────────────
   * The claim was never about the strip. It is that the roster derivation has
   * THREE branches and every one is reachable and worded — a fixture that only
   * reaches one proves the others are unwritten rather than correct. That claim
   * is unchanged; only the element carrying it moved.
   *
   * The wording differs because the room does: the 16.5px sub-line said
   * `รายชื่อครบ 2/2` and the 359px cell says `ครบ 2/2`. Asserting the cell's
   * text rather than the strip's is what makes this an assertion about the
   * screen as it now is.
   *
   * RULED OUT on the LIST and ALLOWED HERE for the unchanged measured reason:
   * the derivation needs `attendeesListProvided` and the `attendees` ARRAY, the
   * list projection carries neither, and `getRegistrationById` is
   * `findById(id).lean()` with no projection at all. Nothing is widened.
   */
  /**
   * ── RE-POINTED AGAIN IN ROUND 8, ONTO เพิ่มรายชื่อแล้ว ─────────────────────
   *
   * Round 6 moved this off the deleted dark strip and onto the summary row's
   * THIRD cell, ความครบถ้วน. Round 8 deletes that cell — once the second cell
   * reads `M/N` the third stated the same fact again — so the claim moves to
   * cell 1, which is the one that now carries both numbers.
   *
   * THE CLAIM IS STILL THE SAME ONE AND IS STILL NOT WEAKER: the roster
   * derivation has branches, every one is reachable, and every one is worded.
   * Only the element carrying it moved, for the second time.
   *
   * It is STRONGER by one branch: round 8 adds `over`, which round 6 could not
   * have asserted because the derivation did not distinguish it — an
   * over-capacity roster reported `complete`.
   */
  const cellOf = (markup) => {
    const start = markup.indexOf('h-[75.85px]');
    assert.notEqual(start, -1, 'no attendee summary row in the render');
    const region = markup.slice(start, start + 1800);
    const cells = [...region.matchAll(/<div class="[^"]*pt-\[15px\][^"]*">([\s\S]*?)(?=<div class="[^"]*pt-\[15px\]|$)/g)]
      .map((m) => m[1]);
    assert.equal(cells.length, 2, 'the summary row does not have two cells');
    assert.ok(cells[1].includes('เพิ่มรายชื่อแล้ว'), 'cell 1 is not the named-count cell');
    return cells[1];
  };

  assert.ok(cellOf(PUB_FULL).includes('>2/2 คน<'), 'a complete roster does not say so');
  assert.ok(cellOf(PUB_SPARSE).includes('>1/3 คน<'), 'an incomplete roster does not say so');

  const optedOut = pub({ ...PUBLIC_FULL, attendeesListProvided: false });
  assert.ok(cellOf(optedOut).includes('>ยังไม่แจ้ง<'), 'an opt-out roster is reported as a count');
  // An opted-out roster has no denominator to be complete against, so it must
  // carry no fraction at all.
  assert.ok(!/\d+\/\d+/.test(cellOf(optedOut).replace(/<[^>]*>/g, ' ')),
    'an opt-out roster claims a completeness it cannot have');

  /**
   * THE FOURTH BRANCH, which round 6 could not reach.
   *
   * ── AND A VACUITY THE CONTROL FOUND, RECORDED RATHER THAN PATCHED OVER ────
   * The first version of this asserted only `>2/1 คน<`. The `flatten-over`
   * control — which reverts the derivation to `named >= count`, so an
   * over-capacity roster reports `complete` again — LEFT IT GREEN. The cell
   * renders `${named}/${count}` straight from the two numbers, so the fraction
   * is right whether or not the derivation distinguishes the state at all.
   *
   * The fraction alone is therefore not a test of the `over` branch. The TONE
   * is: it is the only thing on this cell that reads `roster.state`.
   */
  const over = pub({ ...PUBLIC_FULL, attendeesCount: 1 });
  assert.ok(cellOf(over).includes('>2/1 คน<'),
    'an over-capacity roster does not show its two numbers');
  assert.match(cellOf(over), /text-9e-accent/,
    'the over-capacity cell is not marked as wrong — the fraction alone passes even when '
    + 'the derivation has been flattened back to `named >= count`');
});

test('the in-house headcount reads "15 ท่าน" and never "ประมาณ"', () => {
  /**
   * RE-POINTED from the strip's รูปแบบการอบรม sub-line to the Training
   * Requirement card's จำนวนผู้เข้าอบรม row.
   *
   * ── THE ARGUMENT SHRANK, AND SAYING SO IS THE POINT ──────────────────────
   * It used to read: "a summary strip MAY hedge where a data table may not, so
   * the width argument that ruled ประมาณ out of the list's จำนวน column does
   * not reach here — and it is STILL not built, because nothing flags the number
   * as an estimate." THE FIRST CLAUSE IS NOW MOOT. There is no summary strip, so
   * the concession it granted has nothing to apply to.
   *
   * The second clause is the one that was load-bearing all along and it is
   * untouched: `participantsCount` is a STORED NUMBER and the Mongoose schema
   * gives it a minimum of 15 and no `isEstimate`, no min/max pair. "ประมาณ"
   * would be the screen asserting an imprecision the record does not record.
   *
   * The page-wide half of the assertion is BYTE-IDENTICAL to what it was — it
   * never depended on the strip, only on the whole render.
   */
  assert.ok(INH_FULL.includes('>15 ท่าน<'),
    'the จำนวนผู้เข้าอบรม row is gone or no longer phrased as the list phrases it');
  for (const [name, markup] of Object.entries({ INH_FULL, INH_SPARSE })) {
    assert.ok(!markup.includes('ประมาณ'), `${name}: the screen hedges a stored number`);
  }
});

test('nothing on either screen still renders the strip', () => {
  /**
   * The delete, asserted rather than assumed. A component left mounted behind a
   * falsy guard would satisfy every re-pointed assertion above while still being
   * in the tree, and the ยอดสุทธิ defect would come back with it.
   *
   * ── TWO PROBES, AND TWO EARLIER DRAFTS WITHDRAWN AS WRONG ─────────────────
   * `h-[93px]` is the strip's height and is on nothing else. The second probe is
   * the strip's CONTAINER SHAPE — an element carrying both `rounded-9e-lg` and
   * `bg-9e-navy` — which no surviving element has.
   *
   * Draft 1 asserted `!markup.includes('pt-[14px]')` on the grounds that the
   * class marked a strip CELL. It does not: `SystemCard` carries `pt-[14px]`
   * twice. Draft 2 asserted no `bg-9e-navy` between the status bar and the tab
   * list; that region CONTAINS the status bar's own contents, and `PrimaryAction`
   * is `bg-9e-navy`. Both reddened on a perfectly correct render.
   *
   * Recording both is the point rather than tidying them away: a class believed
   * unique to a deleted component and actually shared with a live one is how a
   * delete-check becomes a permanent false alarm, and it took two tries to find
   * a probe that is actually specific to the thing that was removed. The strip's
   * container was `rounded-9e-lg bg-9e-navy`; the two navy BUTTONS are
   * `rounded-9e-md`, which is what separates them.
   */
  const darkCards = (markup) =>
    [...markup.matchAll(/\sclass="([^"]*)"/g)]
      .map((m) => m[1].split(/\s+/))
      .filter((cs) => cs.includes('bg-9e-navy') && cs.includes('rounded-9e-lg'));

  for (const [name, markup] of Object.entries({ PUB_FULL, PUB_SPARSE, INH_FULL, INH_SPARSE })) {
    assert.ok(!markup.includes('h-[93px]'), `${name}: the 93px strip is still rendered`);
    assert.deepEqual(darkCards(markup), [],
      `${name}: a large dark card is still rendered — the strip is back`);
  }
});

test('CONTROL: the dark-card probe DOES find a strip-shaped element', () => {
  // Without this, the assertion above passes on any markup at all — including an
  // empty string — and would have gone on passing if the probe were misspelled.
  const fake = '<div class="mt-[16px] flex h-[93px] rounded-9e-lg bg-9e-navy px-[4px]"></div>';
  const found = [...fake.matchAll(/\sclass="([^"]*)"/g)]
    .map((m) => m[1].split(/\s+/))
    .filter((cs) => cs.includes('bg-9e-navy') && cs.includes('rounded-9e-lg'));
  assert.equal(found.length, 1, 'the probe cannot see a strip even when one is there');

  // …and it does NOT fire on the navy BUTTONS that legitimately remain.
  const button = '<button class="h-[38px] w-[100px] rounded-9e-md bg-9e-navy"></button>';
  const falsePositives = [...button.matchAll(/\sclass="([^"]*)"/g)]
    .map((m) => m[1].split(/\s+/))
    .filter((cs) => cs.includes('bg-9e-navy') && cs.includes('rounded-9e-lg'));
  assert.equal(falsePositives.length, 0, 'the probe cannot tell the strip from a primary button');
});

test('the tab list moved up under the status bar, keeping the 16px', () => {
  /**
   * The rhythm the removal had to preserve. `mt-[16px]` was the gap between the
   * strip and the tabs; with the strip gone it is the gap between the STATUS BAR
   * and the tabs, and the two blocks are still 16px apart.
   *
   * Asserted as ADJACENCY, not merely as the class surviving: the class alone
   * would still be there if something else had been left between them.
   */
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    const bar = markup.indexOf('h-[87px]');
    const tabs = markup.indexOf('role="tablist"');
    assert.notEqual(bar, -1, `${name}: no status bar`);
    assert.notEqual(tabs, -1, `${name}: no tab list`);
    assert.ok(bar < tabs, `${name}: the tab list is not below the status bar`);

    const between = markup.slice(bar, tabs);
    // The tab list's own opening tag is the next SIBLING BLOCK. Only the status
    // card's own contents and the (absent) error line may lie between them.
    assert.ok(!between.includes('rounded-9e-lg bg-9e-navy'),
      `${name}: a dark block still sits between the status bar and the tabs`);
    const tablistTag = /<div[^>]*role="tablist"[^>]*>/.exec(markup)[0];
    assert.match(tablistTag, /mt-\[16px\]/, `${name}: the tab list lost its 16px offset`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE STATUS BAR
// ════════════════════════════════════════════════════════════════════════════

test('the status dot takes the vocabulary’s colour and no new map exists', () => {
  /**
   * ── THE MERGE IS THE ASSERTION ────────────────────────────────────────────
   * The dot is `cn(statusBadge(status), '… bg-current')`. `statusBadge` returns
   * `bg-amber-100 text-amber-700`, so `cn` — which is twMerge — has to resolve
   * two background classes and keep the later one; the disc then paints in the
   * badge's TEXT colour and the vocabulary supplies both.
   *
   * If twMerge failed to resolve them BOTH would be in the markup and the winner
   * would be whichever Tailwind emitted last, which is an accident of how the
   * classes are spelled rather than a decision. This suite has already paid for
   * exactly that once, on `rounded-9e-*`, which twMerge does NOT merge because
   * they are custom scale keys — these two are stock and it does.
   */
  const dot = classesOfElementWith(PUB_FULL, 'bg-current');
  assert.ok(dot, 'no status dot in the render — the marker class has changed');
  assert.ok(dot.includes('h-[11px]') && dot.includes('w-[11px]'), 'the dot is not the measured 11px');
  assert.ok(dot.includes('text-amber-700'),
    `the dot did not take the vocabulary's colour: [${dot.join(' ')}]`);
  assert.ok(!dot.some((c) => /^bg-amber/.test(c)),
    `twMerge left BOTH backgrounds on the dot: [${dot.join(' ')}] — the winner is now emission order`);
});

test('CONTROL: the dot’s colour really does come from the module', () => {
  // Otherwise the assertion above could be passing on a hard-coded amber. Two
  // different statuses must produce two different colours, and each must be the
  // module's own.
  const paid = pub({ ...PUBLIC_FULL, status: 'paid' });
  const dotPaid = classesOfElementWith(paid, 'bg-current');
  assert.ok(statusBadge('paid').split(' ').every((c) => statusBadge('pending').includes(c) === false),
    'the two statuses share a class — pick two that differ or the control is inert');
  assert.ok(dotPaid.includes('text-emerald-700'), `a paid dot is not emerald: [${dotPaid.join(' ')}]`);
});

/**
 * THE STATUS BAR IS DRIVEN BY THE MODULE, PROVED WITH A FABRICATED STATUS.
 *
 * A document carrying a real status proves the bar renders SOMETHING. It cannot
 * tell a lookup through the shared module from a private map that happens to
 * agree — and a private map is exactly what four files carried until round 3.
 *
 * An invented value separates them: the module returns the value UNCHANGED as
 * its own label and the NEUTRAL chip as its colour, and the transition table has
 * no row for it, so a screen reading a local map renders the wrong name, the
 * wrong colour, or a button for a move that does not exist.
 */
const FABRICATED = 'zzz-not-a-real-status';

test('an unrecognised status renders its raw value, the neutral colour and NO action', () => {
  const markup = pub({ ...PUBLIC_FULL, status: FABRICATED });
  assert.ok(markup.includes(`>${FABRICATED}<`),
    'the status bar hid an unknown status instead of showing what the record holds');
  const dot = classesOfElementWith(markup, 'bg-current');
  assert.ok(NEUTRAL_STATUS_BADGE.split(' ').some((c) => dot.includes(c)),
    `the dot did not fall back to the neutral colour: [${dot.join(' ')}]`);
  assert.equal(/<button[^>]*w-\[100px\]/.test(markup), false,
    'a fabricated status offered a primary action — the table has no row for it');
  // The menu still holds delete: it is not a status action.
  assert.ok(markup.includes('ลบใบสมัครนี้'), 'delete disappeared with the unknown status');
});

test('CONTROL: the fabricated status is genuinely unknown to the module', () => {
  // If the module had an entry for it, the assertions above would be testing the
  // ordinary path and the fallback would be untested.
  assert.equal(statusLabel(FABRICATED), FABRICATED,
    'the fabricated value has a real label — pick one the module does not know');
});

test('the status description is DERIVED, and differs by state for derived reasons', () => {
  /**
   * A `{ pending: '…', paid: '…' }` literal would be a hand-written status list
   * in a detail client, which this round forbids outright. The three branches
   * are questions asked OF the vocabulary: the read-only flag, `isSystemSet`
   * (which reads the transition table), and the next permitted step named
   * through `statusLabel`.
   */
  assert.ok(PUB_FULL.includes(`ขั้นตอนถัดไป: ${statusLabel('confirmed')}`),
    'a pending record does not name its next step, or names it by hand');

  const paid = pub({ ...PUBLIC_FULL, status: 'paid' });
  assert.match(paid, /ระบบบันทึกจากการชำระเงินจริง/,
    'a system-set status does not say the admin cannot choose it');

  const cancelled = pub({ ...PUBLIC_FULL, status: 'cancelled' });
  assert.match(cancelled, /ใบสมัครนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้ \(ยังลบได้\)/,
    'the read-only copy — including the (ยังลบได้) clause — is not the status bar’s description');

  const confirmed = pub({ ...PUBLIC_FULL, status: 'confirmed' });
  assert.match(confirmed, /ไม่มีขั้นตอนถัดไปในระบบ/,
    'a state whose only move is terminal does not say so');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. NO EMPTY ELEMENT WHERE AN OPTIONAL LINE WAS DROPPED
// ════════════════════════════════════════════════════════════════════════════

/**
 * `dl` joins the usual three. A card whose every field is absent would otherwise
 * render a heading over an empty definition list — the same defect one container
 * up, and the in-house sparse fixture really can produce it.
 *
 * `aria-hidden` elements are exempt: a decorative rule has no content by
 * definition.
 */
const EMPTY_ELEMENT = /<(p|span|div|dl)\b(?![^>]*aria-hidden="true")[^>]*><\/\1>/;

test('no screen emits an empty element, on a full OR a sparse document', () => {
  for (const [name, markup] of Object.entries(ALL)) {
    const m = EMPTY_ELEMENT.exec(markup);
    assert.equal(m, null,
      `${name} emits an empty element: ${m?.[0]}. Every optional line must be absent, not blank — `
      + 'text matching cannot see the difference, which is why it shipped twice on the list screen.');
  }
});

test('the sparse screens still render their REQUIRED content', () => {
  // The negative above is satisfied by a page that renders nothing at all.
  assert.ok(PUB_SPARSE.includes('SQL Fundamentals'), 'the sparse public page lost its course name');
  assert.ok(PUB_SPARSE.includes('>ปรีชา ตั้งใจ<'), 'the sparse public page lost its coordinator');
  assert.ok(PUB_SPARSE.includes('>Classroom<'), 'a falsy scheduleType must still render an arrangement');
  assert.ok(INH_SPARSE.includes('บริษัท ว่าง จำกัด'), 'the sparse in-house page lost its company');
  assert.ok(INH_SPARSE.length > 4000 && PUB_SPARSE.length > 4000, 'a sparse page collapsed to near-nothing');
});

test('a note with no content renders a sentence, not an empty quoted block', () => {
  // An accent rule beside empty space asserts there is a quotation there.
  assert.ok(PUB_FULL.includes('<blockquote'), 'a note that exists is not quoted');
  assert.ok(!PUB_SPARSE.includes('<blockquote'), 'an absent note still drew a quoted block');
  assert.ok(PUB_SPARSE.includes('ไม่มีหมายเหตุ'), 'an absent note says nothing at all');
  assert.ok(!INH_SPARSE.includes('<blockquote'), 'an absent in-house note still drew a quoted block');
  assert.ok(INH_SPARSE.includes('ยังไม่มีบันทึกจากทีมขาย'));
});

// ════════════════════════════════════════════════════════════════════════════
// 5. THE ATTENDEE TABLE — the list tables' guard, ported because the shape matches
// ════════════════════════════════════════════════════════════════════════════

/**
 * ── WHAT WAS CHECKED BEFORE PORTING, RATHER THAN ASSUMED ───────────────────
 *
 * The list tables carry a guard that every body row has as many cells as the
 * header, because there the header is derived from a COLUMNS array and the body
 * cells are hand-written, so a column added to the array grows the header and
 * leaves the body one cell short.
 *
 * The attendee table has THE SAME SHAPE and it was read rather than assumed:
 *
 *   <colgroup>  ATTENDEE_COLUMNS.map(...)   derived
 *   <thead>     ATTENDEE_COLUMNS.map(...)   derived
 *   <tbody>     FIVE hand-written <td>s     NOT derived
 *
 * so the guard applies unchanged and is ported.
 *
 * ── RE-POINTED FROM FOUR COLUMNS TO FIVE, WHICH IS THE GUARD WORKING ──────
 * Round 4's table was ท่านที่ / ชื่อ / อีเมล / เบอร์โทร. The measured set is
 * # / ชื่อ-นามสกุล / ข้อมูลติดต่อ / สถานะข้อมูล / •••, and this assertion is what
 * went red when the body was rebuilt — which is the whole reason it exists. The
 * number is exact rather than a floor, for the reason the list tables state: a
 * floor is satisfied by adding a column back.
 *
 * ── AND WHAT CHANGED ABOUT WHAT IS PORTABLE ──────────────────────────────
 * Round 4 recorded that this table had NO colgroup and no specified proportions,
 * so the list tables' `<col>`-count and ratio assertions had nothing to read.
 * The measured column set gives it a colgroup, so the `<col>` COUNT is now
 * readable and is asserted below.
 *
 * The RATIO test is still NOT ported, and that is a live distinction rather than
 * an omission: the list tables pin six and seven specified shares against the
 * design's own total, where this table has three shares (88%) plus two FIXED
 * columns. That is a different arithmetic and the width assertion below makes
 * the claim directly instead of borrowing a test written for another shape.
 *
 * The empty-state row is absent for the same kind of reason as before: this
 * table only renders when `attendees.length > 0`, and the two other cases
 * (opted out, no data) are sentences rather than a table with a colSpan.
 */
test('the attendee table’s body rows have exactly as many cells as its header', () => {
  const table = PUB_FULL.slice(PUB_FULL.indexOf('<table'), PUB_FULL.indexOf('</table>'));
  assert.ok(table.includes('ชื่อ-นามสกุล'), 'the attendee table did not render');

  const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
  const headers = (head.match(/<th\b/g) ?? []).length;
  assert.equal(headers, 5, `expected 5 header cells, found ${headers}`);

  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  assert.equal(rows.length, PUBLIC_FULL.attendees.length,
    `expected ${PUBLIC_FULL.attendees.length} body rows, found ${rows.length}`);
  rows.forEach((row, i) => {
    const cells = (row.match(/<td\b/g) ?? []).length;
    assert.equal(cells, headers,
      `attendee row ${i} has ${cells} cells against ${headers} header cells. The colgroup and the header `
      + 'are derived from ATTENDEE_COLUMNS and the body cells are hand-written, so they do not follow.');
  });
});

test('the colgroup has one <col> per header cell', () => {
  // The third half of the same disagreement. A column added to ATTENDEE_COLUMNS
  // grows BOTH of these together, so on its own this proves little — its value
  // is that it fails LOUDLY if somebody hand-writes a `<col>` to fix a width.
  const table = PUB_FULL.slice(PUB_FULL.indexOf('<table'), PUB_FULL.indexOf('</table>'));
  const cols = (table.match(/<col\b/g) ?? []).length;
  const headers = (table.slice(table.indexOf('<thead'), table.indexOf('</thead>')).match(/<th\b/g) ?? []).length;
  assert.equal(cols, headers, `${cols} <col> elements against ${headers} header cells`);
});

test('only the two FIXED columns are px; the three content columns are proportions', () => {
  /**
   * The requirement is that the layout survives the admin sidebar collapsing, so
   * a px width on a CONTENT column is the defect. The row number and the menu
   * are fixed by the measurement (30px and 32px) and must stay so — a `#` column
   * that grew with the table would be 100px of nothing.
   */
  const table = PUB_FULL.slice(PUB_FULL.indexOf('<table'), PUB_FULL.indexOf('</table>'));
  const widths = [...table.matchAll(/<col style="width:([^"]*)"/g)].map((m) => m[1]);
  assert.equal(widths.length, 5, `expected 5 <col> widths, found ${widths.length}`);

  assert.match(widths[0], /^30px$/, `the # column is not fixed at 30px: ${widths[0]}`);
  assert.match(widths[4], /^32px$/, `the menu column is not fixed at 32px: ${widths[4]}`);
  for (const w of widths.slice(1, 4)) {
    assert.ok(w.includes('calc(') && w.includes('100%'),
      `a content column is not a proportion of the table: ${w}`);
  }

  // And the three ratios sum to 1, or the content columns do not fill the row.
  const ratios = widths.slice(1, 4).map((w) => Number(/\*\s*([\d.]+)/.exec(w)[1]));
  assert.ok(Math.abs(ratios.reduce((a, b) => a + b, 0) - 1) < 1e-5,
    `the content ratios sum to ${ratios.reduce((a, b) => a + b, 0)}, not 1`);

  /**
   * ── THE NUMBERS DID NOT MOVE IN ROUND 8; WHAT THEY DESCRIBE DID ───────────
   *
   * This array is the SECOND of the two places the shares live (the first is
   * `ATTENDEE_COLUMNS` in the client). สถานะข้อมูล was deleted and the phone
   * became its own column, taking the 22.0 that สถานะข้อมูล had — so the totals
   * and the normalisation are untouched and THIS TEST WENT ON PASSING through a
   * column change.
   *
   * That is exactly the vacuity mechanism this suite keeps meeting: the
   * assertion still binds — it really does check the emitted widths — but a
   * reader would have taken the old comment as evidence the columns were
   * unchanged. The shares are now NAMED, so the next change to the column set
   * has to touch this line even when the arithmetic survives.
   */
  const SHARES = [
    ['ชื่อ-นามสกุล', 30.8],
    ['อีเมล',        35.2],
    ['เบอร์โทร',      22.0], // round 8: was สถานะข้อมูล, same share
  ];
  SHARES.forEach(([label, share], i) => {
    assert.ok(Math.abs(ratios[i] - share / 88) < 1e-5,
      `the ${label} column has ratio ${ratios[i]}, expected ${(share / 88).toFixed(6)}`);
  });

  // …and the names are the ones the table actually renders, so this array cannot
  // drift into describing a column set that no longer exists.
  const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
  const labels = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, '').trim());
  assert.deepEqual(labels.slice(1, 4), SHARES.map(([label]) => label),
    'the shares above name different columns than the header renders');
});

test('an attendee with a name and no contact details renders TWO dashes, not empty cells', () => {
  /**
   * A table CELL may not simply vanish — the column would misalign — so the
   * attendee table is the one place on these screens where a dash is right, and
   * this pins that it is a dash rather than a blank.
   *
   * ── RE-POINTED TWICE NOW, AND THE NUMBER IS THE COLUMN SET ───────────────
   * Round 4's table had separate อีเมล and เบอร์โทร columns → two dashes. The
   * measured set merged them into one ข้อมูลติดต่อ cell → one dash. Round 8
   * SPLITS THEM AGAIN, with the phone as its own column → two.
   *
   * The claim has never changed: each cell falls back rather than emptying. The
   * count follows the columns, which is why it is asserted exactly rather than
   * as a floor — a floor would have survived both changes without noticing
   * either, and the number is the only thing that tells this table's shape from
   * the previous one.
   *
   * The empty-element guard over the whole page is what proves the fallback is a
   * dash rather than a blank element.
   */
  const table = PUB_SPARSE.slice(PUB_SPARSE.indexOf('<table'), PUB_SPARSE.indexOf('</table>'));
  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
  assert.ok(body.includes('ปรีชา ตั้งใจ'), 'the attendee name did not render');
  assert.equal((body.match(/>—</g) ?? []).length, 2,
    'the missing email and phone did not render exactly one dash each');
});

test('the coordinator marker is a suffix inside the name cell, not a line of its own', () => {
  // A second element would be EMPTY on every row but one, which is precisely the
  // shape the empty-element guard exists for.
  const table = PUB_FULL.slice(PUB_FULL.indexOf('<table'), PUB_FULL.indexOf('</table>'));
  assert.ok(table.includes('(ผู้ประสานงาน)'), 'the coordinator marker is gone');
  assert.equal((table.match(/\(ผู้ประสานงาน\)/g) ?? []).length, 1, 'the marker is on more than one row');
});

// ════════════════════════════════════════════════════════════════════════════
// 6. THE TWO THINGS THE FIGMA FILE SHOWS THAT ARE RULED OUT
// ════════════════════════════════════════════════════════════════════════════

test('the public ข้อมูลสำหรับออกใบเสนอราคา card carries NO quotation number', () => {
  /**
   * RULED OUT. No such field exists on RegisterPublic and none is being added —
   * quotation numbers are produced outside the system today, so a row here would
   * be blank on every record or would invent one.
   *
   * The card itself IS present, so this is not passing because the card is gone.
   */
  for (const [name, markup] of Object.entries({ PUB_FULL, PUB_SPARSE })) {
    /*
      ── RE-POINTED IN ROUND 11, AND THE `>…<` IS NOT DECORATION ────────────
      This read `markup.includes('การเงินและเอกสาร')`, a bare substring, which
      was safe only because no other string on the page contained it. The new
      name does NOT have that property: `ข้อมูลสำหรับออกใบเสนอราคา` and the row
      this test forbids, `เลขที่ใบเสนอราคา`, share the tail `ใบเสนอราคา`, and the
      in-house screen has a `ชื่อบริษัท (ใบเสนอราคา)` label besides. So the
      presence half is anchored on the HEADING ELEMENT — `>…<` — which is the
      same anchor `coordinatorCardRows` uses, and is STRICTER than what it
      replaced rather than looser.

      The absence half is left as a bare substring on purpose: it must fire
      wherever a quotation-number row appears, heading or not.
    */
    assert.ok(markup.includes('>ข้อมูลสำหรับออกใบเสนอราคา<'), `${name}: the quotation card is gone`);
    assert.ok(!markup.includes('การเงินและเอกสาร'), `${name}: the old card name is back`);
    assert.ok(!markup.includes('เลขที่ใบเสนอราคา'), `${name}: a quotation-number row is back`);
    assert.ok(!/QT-\d{4}-\d{4}/.test(markup), `${name}: a quotation number is rendered`);
  }
});

test('the public course card carries NO venue', () => {
  // RULED OUT: a public registration holds no venue. The in-house screen DOES
  // have one — it has `onsiteVenue` — and that is the control that says this
  // assertion is about the public document rather than about the string.
  for (const [name, markup] of Object.entries({ PUB_FULL, PUB_SPARSE })) {
    assert.ok(!markup.includes('สถานที่'), `${name}: a venue row is back on a public registration`);
    assert.ok(!markup.includes('9Expert Training Center'), `${name}: a hard-coded venue is back`);
  }
  const onsite = inh(INHOUSE_FULL);
  assert.ok(onsite.includes('สถานที่จัดอบรม'),
    'the in-house venue row is gone — then the assertion above proves nothing about the DOCUMENT');
});
