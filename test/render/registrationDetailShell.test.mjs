import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import { NEUTRAL_STATUS_BADGE, statusBadge, statusLabel } from '@/lib/registrations/statuses';

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

/**
 * The dark strip's cells, by the padding class the geometry fixes on them.
 *
 * Keyed on `pt-[14px]` — the "label 14px from the cell top" measurement — which
 * appears on nothing else in either render, so the probe follows the measured
 * cell rather than a wrapper somebody might add.
 */
function stripCells(markup) {
  const start = markup.indexOf('h-[93px]');
  assert.notEqual(start, -1, 'no dark strip in the render — the marker class has changed');
  const end = markup.indexOf('role="tablist"', start);
  assert.notEqual(end, -1, 'the strip is not followed by the tab list — the probe would over-read');
  const region = markup.slice(start, end);
  return [...region.matchAll(/<div class="[^"]*pt-\[14px\][^"]*">([\s\S]*?)(?=<div class="[^"]*pt-\[14px\]|$)/g)]
    .map((m) => m[1]);
}

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
// 2. THE DARK SUMMARY STRIP
// ════════════════════════════════════════════════════════════════════════════

test('public has THREE strip cells and in-house has FOUR', () => {
  assert.equal(stripCells(PUB_FULL).length, 3);
  assert.equal(stripCells(INH_FULL).length, 4);
});

test('the strip cells are CONTENT-WIDTH, divided by rules rather than by gaps', () => {
  /**
   * The measurement, and it is not decoration: equal-fraction cells would make a
   * course name and "3 ท่าน" the same width and the strip would read as a row of
   * tiles rather than as one band.
   *
   * A cell must therefore carry no width and no flex-grow of its own, and the
   * separation must come from a divider on the parent. Both halves, because
   * either alone is satisfiable — content-width cells with a gap, or equal cells
   * with a rule.
   */
  for (const [name, markup] of Object.entries({ PUB_FULL, INH_FULL })) {
    const region = markup.slice(markup.indexOf('h-[93px]'), markup.indexOf('role="tablist"'));
    for (const m of region.matchAll(/<div class="([^"]*pt-\[14px\][^"]*)"/g)) {
      const classes = m[1].split(/\s+/);
      assert.ok(!classes.some((c) => /^flex-1$|^basis-|^w-\[/.test(c)),
        `${name}: a strip cell sizes itself instead of its content: [${m[1]}]`);
    }
    assert.match(region, /divide-x/, `${name}: the strip cells are not divided by a rule`);
    assert.ok(!/gap-\[/.test(region.slice(0, region.indexOf('pt-[14px]'))),
      `${name}: the strip has a gap between cells — they must sit flush`);
  }
});

test('the public ผู้เข้าอบรม cell carries the ครบ / ยังไม่ครบ sub-line', () => {
  /**
   * RULED OUT on the LIST and ALLOWED HERE, and the difference is measurable:
   * the derivation needs `attendeesListProvided` and the `attendees` ARRAY, the
   * list projection carries neither, and `getRegistrationById` is
   * `findById(id).lean()` with no projection at all. Nothing is widened.
   *
   * All three branches, because a fixture that only reaches one proves the
   * others are unwritten rather than correct.
   */
  assert.ok(stripCells(PUB_FULL)[1].includes('รายชื่อครบ 2/2'), 'a complete roster does not say so');
  assert.ok(stripCells(PUB_SPARSE)[1].includes('ยังไม่ครบ 1/3'), 'an incomplete roster does not say so');

  const optedOut = pub({ ...PUBLIC_FULL, attendeesListProvided: false });
  assert.ok(stripCells(optedOut)[1].includes('ยังไม่แจ้งรายชื่อ'),
    'an opt-out roster is reported as a count');
  assert.ok(!stripCells(optedOut)[1].includes('ครบ'),
    'an opt-out roster claims a completeness it cannot have');
});

test('the ยอดสุทธิ sub-line is DROPPED without pricing, not rendered blank', () => {
  /**
   * The branch that decides whether an optional line is absent or empty. A
   * quotation-path registration has no `pricing`, and a 16.5px empty paragraph
   * under a dash is the exact defect that shipped twice on the list screen and
   * which text matching cannot see.
   */
  const full = stripCells(PUB_FULL)[2];
  const sparse = stripCells(PUB_SPARSE)[2];
  assert.ok(full.includes('2 ที่นั่ง'), 'the priced cell lost its sub-line');
  assert.equal((sparse.match(/<p\b/g) ?? []).length, 2,
    `the unpriced ยอดสุทธิ cell renders ${(sparse.match(/<p\b/g) ?? []).length} lines; `
    + 'expected the label and the value only — the sub-line must be ABSENT, not blank');
  assert.ok(sparse.includes('>—<'), 'the unpriced cell shows nothing at all where a total would be');
});

test('the in-house strip says "15 ท่าน" and never "ประมาณ"', () => {
  /**
   * THE CALL, STATED. The design's รูปแบบการอบรม cell reads "ประมาณ 15 คน", and
   * a summary strip MAY hedge where a data table may not — so the width and
   * scanning arguments that ruled the word out of the list's 5% จำนวน column do
   * not reach here.
   *
   * It is still not built, for the reason that survives the change of surface:
   * `participantsCount` is a STORED NUMBER and nothing flags it as an estimate.
   * The schema gives it a minimum of 15 and no `isEstimate`, no min/max pair.
   * "ประมาณ" would be the screen asserting an imprecision the record does not
   * record — the same rule the list keeps for its format and status chips.
   *
   * Kept consistent with the list's จำนวน column, which was the instruction.
   */
  assert.ok(stripCells(INH_FULL)[1].includes('15 ท่าน'), 'the headcount sub-line is gone');
  for (const [name, markup] of Object.entries({ INH_FULL, INH_SPARSE })) {
    assert.ok(!markup.includes('ประมาณ'), `${name}: the strip hedges a stored number`);
  }
});

test('CONTROL: the strip probe lands on the strip and finds its cells', () => {
  // Off-by-one here would assert the shape of some other row of divs. Each probe
  // result must be a cell of the strip it claims to be.
  const cells = stripCells(PUB_FULL);
  assert.ok(cells[0].includes('รอบอบรม'),    'cell 0 is not the round cell');
  assert.ok(cells[1].includes('ผู้เข้าอบรม'), 'cell 1 is not the attendee cell');
  assert.ok(cells[2].includes('ยอดสุทธิ'),    'cell 2 is not the total cell');
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
 *   <thead>  ATTENDEE_COLUMNS.map(...)   derived
 *   <tbody>  four hand-written <td>s     NOT derived
 *
 * so the guard applies unchanged and is ported.
 *
 * ── AND WHAT DIFFERS, SO THE REST IS NOT PORTED UNEXAMINED ─────────────────
 * The list tables are `table-fixed` with a `<colgroup>` carrying measured
 * proportions, and three of their assertions read that colgroup: the `<col>`
 * count, the ratio test, and the สถานะ width floor. THIS TABLE HAS NO COLGROUP
 * AND NO SPECIFIED PROPORTIONS — four columns of ordinary content, sized by the
 * browser — so those three have nothing to read and are deliberately absent
 * rather than adapted into assertions about numbers nobody measured.
 *
 * The empty-state row is absent for the same kind of reason: this table only
 * renders when `attendees.length > 0`, and the two other cases (opted out, no
 * data) are sentences rather than a table with a colSpan.
 */
test('the attendee table’s body rows have exactly as many cells as its header', () => {
  const table = PUB_FULL.slice(PUB_FULL.indexOf('<table'), PUB_FULL.indexOf('</table>'));
  assert.ok(table.includes('ชื่อ-นามสกุล'), 'the attendee table did not render');

  const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
  const headers = (head.match(/<th\b/g) ?? []).length;
  assert.equal(headers, 4, `expected 4 header cells, found ${headers}`);

  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  assert.equal(rows.length, PUBLIC_FULL.attendees.length,
    `expected ${PUBLIC_FULL.attendees.length} body rows, found ${rows.length}`);
  rows.forEach((row, i) => {
    const cells = (row.match(/<td\b/g) ?? []).length;
    assert.equal(cells, headers,
      `attendee row ${i} has ${cells} cells against ${headers} header cells. The header is derived from `
      + 'ATTENDEE_COLUMNS and the body cells are hand-written, so they do not follow.');
  });
});

test('an attendee with a name and nothing else renders dashes, not empty cells', () => {
  // A table CELL may not simply vanish — the column would misalign — so the
  // attendee table is the one place on these screens where a dash is right, and
  // this pins that it is a dash rather than a blank.
  const table = PUB_SPARSE.slice(PUB_SPARSE.indexOf('<table'), PUB_SPARSE.indexOf('</table>'));
  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
  assert.ok(body.includes('ปรีชา ตั้งใจ'), 'the attendee name did not render');
  assert.equal((body.match(/>—</g) ?? []).length, 2, 'the missing email and phone did not render a dash each');
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

test('the public การเงินและเอกสาร card carries NO quotation number', () => {
  /**
   * RULED OUT. No such field exists on RegisterPublic and none is being added —
   * quotation numbers are produced outside the system today, so a row here would
   * be blank on every record or would invent one.
   *
   * The card itself IS present, so this is not passing because the card is gone.
   */
  for (const [name, markup] of Object.entries({ PUB_FULL, PUB_SPARSE })) {
    assert.ok(markup.includes('การเงินและเอกสาร'), `${name}: the finance card is gone`);
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
