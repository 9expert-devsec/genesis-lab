import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
// One source-level claim in this file — see "a copy control writes NO audit row".
import { readSource } from '../sourceScan.mjs';

/**
 * THE ผู้เข้าอบรม TAB: the summary row, the completeness chip, the per-row menu
 * and the read-only lock over all three.
 *
 * ── THE FIXTURE SET IS THE INSTRUMENT ──────────────────────────────────────
 * One registration per branch, because a chip with three states and a fixture
 * covering one proves the other two are unwritten rather than correct. The
 * attendee rows below are, in order: complete, missing one field, missing
 * everything, and a row with an email but no name — which is the case that
 * separates the roster count from the completeness count.
 *
 * ── NO REACT ROOT ──────────────────────────────────────────────────────────
 * renderToStaticMarkup only; `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run and once broke twenty-eight of them.
 * The row menus are in the DOM with the `hidden` attribute rather than behind a
 * click, exactly so that what they contain is assertable from here.
 *
 * ── THAI MATCHING ──────────────────────────────────────────────────────────
 * Thai negates by PREFIX: 'ข้อมูลไม่ครบ' contains neither 'ข้อมูลครบ' nor a
 * usable boundary against it, but 'ครบ' is a substring of both 'ข้อมูลครบ' and
 * 'ยังไม่ครบ'. Everything here matches ELEMENT TEXT BOUNDARIES or reads a
 * specific element, never a bare `includes`.
 */

const COMPLETE = { firstName: 'สมชาย', lastName: 'ใจดี',   email: 'somchai@example.com', phone: '0812345678' };
const PARTIAL  = { firstName: 'สมหญิง', lastName: 'ดีใจ',   email: 'somying@example.com', phone: '' };
const BLANK    = { firstName: '',       lastName: '',       email: '',                    phone: '' };
const NO_NAME  = { firstName: '',       lastName: '',       email: 'ghost@example.com',   phone: '' };

const BASE = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'classroom',
  attendanceMode: 'classroom',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678', isAttending: true },
  attendeesListProvided: true,
  attendeesCount: 4,
  attendees: [COMPLETE, PARTIAL, BLANK, NO_NAME],
  requestInvoice: false,
  invoice: null,
  notes: '',
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

const HISTORY = createElement('p', { id: 'history-slot' }, 'ประวัติ');

const render = (extra = {}) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc: { ...BASE, ...extra }, history: HISTORY })
);

const FULL      = render();
const CANCELLED = render({ status: 'cancelled' });
const OPTED_OUT = render({ attendeesListProvided: false, attendees: [], attendeesCount: 3 });

// ── Probes ──────────────────────────────────────────────────────────────────

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** The attendee table's `<tbody>` rows, in order. */
function attendeeRows(markup) {
  const at = markup.indexOf('<table');
  assert.notEqual(at, -1, 'no attendee table in the render');
  const table = markup.slice(at, markup.indexOf('</table>', at));
  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
  return body.split('<tr').slice(1);
}

/**
 * The `<td>`s of one row, in column order: #, name, contact, info, menu.
 *
 * SLICED FROM AFTER THE OPENING TAG, which is load-bearing. `split('<td')` leaves
 * each fragment starting with the cell's own ATTRIBUTES — `class="…" style="…">`
 * — and those have no `<` in front of them, so a tag-stripping `textOf` reads
 * them as visible text. The first draft compared `'ข้อมูลครบ'` against
 * `'class="align-middle" style="padding-right:10px">ข้อมูลครบ'` and failed on
 * correct markup. Same class of slicing defect as the `<thead>` probe on the
 * list tables, where it reported one phantom column.
 */
const cellsOf = (row) =>
  row.split('<td').slice(1).map((cell) => cell.slice(cell.indexOf('>') + 1));

/**
 * The three cells of the 75.85px summary row, by the padding class the geometry
 * fixes on them. Bounded to the row so the probe cannot wander into the card.
 */
function summaryCells(markup) {
  const start = markup.indexOf('h-[75.85px]');
  assert.notEqual(start, -1, 'no attendee summary row in the render — the marker class has changed');
  const end = markup.indexOf('</div></div></div>', start);
  const region = markup.slice(start, end === -1 ? undefined : end + 18);
  return [...region.matchAll(/<div class="[^"]*pt-\[15px\][^"]*">([\s\S]*?)(?=<div class="[^"]*pt-\[15px\]|$)/g)]
    .map((m) => m[1]);
}

/** Every `role="menuitem"` inside one row's markup. */
const rowMenuItems = (row) =>
  [...row.matchAll(/<button[^>]*role="menuitem"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textOf(m[1]));

/** Does this row render a "•••" trigger at all? */
const hasRowTrigger = (row) => /aria-haspopup="menu"/.test(row);

// ════════════════════════════════════════════════════════════════════════════
// 1. THE SUMMARY ROW
// ════════════════════════════════════════════════════════════════════════════

test('the summary row has TWO cells — ความครบถ้วน is DELETED, not re-labelled', () => {
  /**
   * ══ RE-POINTED IN ROUND 8 ═══════════════════════════════════════════════════
   *
   * This asserted THREE cells, the third being ความครบถ้วน reading
   * `ยังไม่ครบ 3/4`. That cell is gone — removed, not renamed — because once the
   * second cell reads `M/N` it stated the same fact a third time. The one thing
   * it added, a word for the opted-out case, moved into the second cell.
   *
   * The claim that survives is that both cells READ THE ROSTER rather than the
   * raw document, and it is unchanged. What is asserted additionally is the
   * ABSENCE, because a re-label would have satisfied a bare count of two.
   */
  const cells = summaryCells(FULL);
  assert.equal(cells.length, 2, `expected 2 summary cells, found ${cells.length}`);
  assert.ok(cells[0].includes('จำนวนที่สมัคร'), 'cell 0 is not จำนวนที่สมัคร');
  assert.ok(cells[0].includes('>4 คน<'), 'the declared count is wrong');
  assert.ok(cells[1].includes('เพิ่มรายชื่อแล้ว'), 'cell 1 is not เพิ่มรายชื่อแล้ว');
  // THREE named, not four: BLANK carries nothing, so it is a slot rather than a
  // person. NO_NAME has an email and IS counted — see the pure tier.
  assert.ok(cells[1].includes('>3/4 คน<'), 'the named cell does not read the roster as M/N');

  // The deleted cell is gone from the whole page, not merely from this row.
  assert.ok(!FULL.includes('ความครบถ้วน'), 'the ความครบถ้วน cell is still rendered somewhere');
  assert.ok(!FULL.includes('ยังไม่ครบ'), 'the ครบ / ยังไม่ครบ vocabulary survived the delete');
});

test('the summary cells are EQUAL width', () => {
  /**
   * The measurement: 359.46px each at 1080, exactly a third.
   *
   * ── THE COMPARISON IN THE TITLE IS GONE, THE MEASUREMENT IS NOT ───────────
   * This read "EQUAL width, unlike the dark strip", and the docstring explained
   * that `SummaryStrip` was content-width so a shared component with a flag
   * would have answered two measurements with one thing. The strip is deleted,
   * so that contrast has nothing to contrast with — but `flex-1` on each cell is
   * still the measured requirement and is still what this asserts. Only the
   * justification narrowed; nothing was dropped from the check itself.
   */
  const start = FULL.indexOf('h-[75.85px]');
  const region = FULL.slice(start, start + 1400);
  const cells = [...region.matchAll(/<div class="([^"]*pt-\[15px\][^"]*)"/g)].map((m) => m[1]);
  // TWO since round 8 — ความครบถ้วน was deleted. `flex-1` is what makes the
  // remaining pair equal, and it is the same requirement at any cell count; the
  // 359.46px figure in the docstring was the measurement at three.
  assert.equal(cells.length, 2);
  for (const classes of cells) {
    assert.ok(classes.split(/\s+/).includes('flex-1'),
      `a summary cell does not take an equal share: [${classes}]`);
  }
  assert.match(region, /divide-x/, 'the summary cells are not divided by a rule');
});

test('the ความครบถ้วน cell and the card sentence agree, in different words', () => {
  /**
   * ── RE-POINTED, AND IT IS WEAKER IN ONE NAMED RESPECT ─────────────────────
   *
   * This asserted that the ความครบถ้วน CELL and the DARK STRIP carried the same
   * roster state in different wordings — the point being that two surfaces three
   * inches apart on one page read ONE derivation, which is why `rosterState`
   * moved into lib/registrations/attendeeInfo at all.
   *
   * The strip is deleted. Its `rosterSub` phrasing went with it and had no other
   * reader, so THE SECOND SURFACE THIS TEST COMPARED AGAINST NO LONGER EXISTS.
   *
   * Rather than delete the test — which would drop the two-surface claim
   * entirely — it is re-pointed at the pair that is still on the page: the
   * summary cell (`ยังไม่ครบ 3/4`) and the attendee card's own second-row
   * SENTENCE (`ยังขาดอีก 1 ท่าน จากที่สมัครไว้ 4 ท่าน`). Both are built from
   * `roster` and both are in the ผู้เข้าอบรม tab.
   *
   * SAY PLAINLY WHAT SHRANK: the surviving pair sits in one tab panel rather
   * than spanning the page, so this no longer proves that a surface OUTSIDE the
   * tab agrees with one inside it. That cross-page claim has no subject any
   * more. It is not being quietly retained under a new name.
   */
  /**
   * ── RE-POINTED AGAIN IN ROUND 8, ONTO THE CELL THAT REPLACED IT ───────────
   * The pair is now the เพิ่มรายชื่อแล้ว CELL (`3/4 คน`) and the same card
   * SENTENCE. The claim is untouched — two surfaces, one derivation, different
   * wordings — and only the cell carrying one half moved. Note it is now
   * `cells[1]`, because the cell this test was originally written about is the
   * one that was deleted.
   */
  assert.ok(summaryCells(FULL)[1].includes('3/4 คน'), 'the tab cell does not carry the roster');
  assert.ok(FULL.includes('ยังขาดอีก 1 ท่าน จากที่สมัครไว้ 4 ท่าน'),
    'the card sentence does not carry the same roster');

  // And on the opted-out record BOTH say so, neither invents a denominator.
  assert.ok(summaryCells(OPTED_OUT)[1].includes('>ยังไม่แจ้ง<'), 'the cell claims a count on an opted-out roster');
  assert.ok(OPTED_OUT.includes('ผู้ประสานงานยังไม่ประสงค์แจ้งรายชื่อ'),
    'the card sentence claims a count on an opted-out roster');
  // No fraction, read from the cell's TEXT rather than its markup — the markup
  // is full of `/` from closing tags and the first draft of this line matched
  // every one of them.
  assert.ok(!/\d+\/\d+/.test(textOf(summaryCells(OPTED_OUT)[1])),
    'the opted-out cell rendered a fraction it has no denominator for');
});

test('an ALREADY-OVER roster shows M > N, and shows it as wrong', () => {
  /**
   * ── THE PRODUCTION SHAPE, AS A FIXTURE ────────────────────────────────────
   * One of 39 public registrations holds 2 attendees against a count of 1
   * (scripts/_probe-roster-over-capacity.mjs). It must render AS IT IS: nothing
   * truncates the roster, no attendee is deleted to satisfy a rule invented
   * after the data, and the numbers are shown disagreeing because they DO
   * disagree.
   *
   * The tone is the signal. `text-9e-accent` on that one cell is what separates
   * "2/1, which the reader must notice" from "2/1, rendered as calmly as 2/2" —
   * and it is the caller's, because EqualSummaryRow picks no colours.
   */
  const over = render({ attendeesCount: 1 });
  const cells = summaryCells(over);
  assert.equal(cells.length, 2);
  assert.ok(cells[0].includes('>1 คน<'), 'the declared count is not the stored one');
  // THREE named against one seat, not four: the fixture's BLANK row carries
  // nothing, so it is a slot rather than a person — `isNamedAttendee`, the same
  // member test the count has always used. The ROW count below is four, and the
  // two numbers differing is the distinction, not a discrepancy.
  assert.ok(cells[1].includes('>3/1 คน<'), 'the over-capacity roster is not shown as M/N');
  assert.match(cells[1], /text-9e-accent/, 'the over-capacity cell is not marked as wrong');

  // Every attendee is still on the page — the record is not truncated to fit.
  assert.equal(attendeeRows(over).length, 4, 'an over-capacity roster lost rows');

  // …and the card sentence says so in words rather than claiming completeness.
  assert.ok(over.includes('รายชื่อเกินจำนวนที่สมัคร'), 'the sentence does not report the breach');
});

// ── The seat lock, as the reader meets it ───────────────────────────────────

/** The read view's + button, by its measured width. */
function addButton(markup) {
  const m = /<button[^>]*w-\[92\.6px\][^>]*>[\s\S]*?<\/button>/.exec(markup);
  return m ? m[0] : null;
}

/**
 * IS THE BUTTON REALLY DISABLED?
 *
 * ── `/\bdisabled\b/` IS NOT THE TEST, AND IT REDDENED ON CORRECT MARKUP ────
 *
 * The button carries `disabled:cursor-not-allowed disabled:opacity-40
 * disabled:hover:bg-transparent` — Tailwind VARIANT classes, which contain the
 * word "disabled" and are present whether or not the control is disabled. A word
 * match therefore reported EVERY render as disabled, including the one with a
 * seat still free, and the "below capacity it is live" assertion failed on code
 * that was working.
 *
 * That is the vacuity pattern in its purest form: a probe that was true for a
 * reason unrelated to its name. It has to read the ATTRIBUTE — React emits a
 * true boolean attribute as `disabled=""` — which cannot appear inside a class
 * list.
 */
const isDisabled = (tag) => /\sdisabled=""/.test(tag);

test('at capacity the + button is DISABLED and states why — never hidden', () => {
  /**
   * "Disabled with a reason, never hidden." A control that VANISHES reads as a
   * bug: the admin looks for it, does not find it, and has no way to learn why.
   *
   * Both halves matter. `disabled` alone is a control that refuses silently;
   * `title` alone is a control that explains only to a pointer. The visible
   * sentence beside it carries the same words for everyone else.
   */
  const full = render({ attendeesCount: 3 }); // 3 named against 3 seats
  const btn = addButton(full);
  assert.ok(btn, 'the + button is gone at capacity — it must be disabled, not hidden');
  assert.ok(isDisabled(btn), 'the + button is still live at capacity');
  assert.match(btn, /title="เพิ่มรายชื่อครบตามจำนวนที่สมัครแล้ว"/, 'the disabled button does not say why');
  assert.ok(full.includes('เพิ่มรายชื่อครบตามจำนวนที่สมัครแล้ว'),
    'the reason is nowhere in the layout — a title alone reaches only a pointer');
});

test('below capacity the same button is live and carries no reason', () => {
  // Without this, "disabled at capacity" passes on a button disabled always.
  const btn = addButton(FULL); // 3 named against 4 seats
  assert.ok(btn, 'the + button is missing below capacity');
  assert.equal(isDisabled(btn), false, 'the + button is disabled with a seat still free');
  assert.equal(/title=/.test(btn), false, 'a live button carries a reason it does not need');
  assert.ok(!FULL.includes('เพิ่มรายชื่อครบตามจำนวนที่สมัครแล้ว'),
    'the at-capacity sentence renders below capacity');
});

test('CONTROL: the disabled probe is not fooled by the `disabled:` variant classes', () => {
  /**
   * The exact confusion that reddened a correct render. The button carries three
   * `disabled:*` Tailwind classes in EVERY state, so a word match reports every
   * render as disabled and the "it is live below capacity" claim becomes
   * unfalsifiable.
   */
  const variantsOnly = '<button type="button" class="disabled:opacity-40 disabled:cursor-not-allowed">x</button>';
  const reallyOff    = '<button type="button" disabled="" class="disabled:opacity-40">x</button>';
  assert.equal(isDisabled(variantsOnly), false, 'the probe is fooled by the variant classes');
  assert.equal(isDisabled(reallyOff), true, 'the probe cannot see a genuinely disabled control');
  // …and the naive form really would have been fooled, which is why this exists.
  assert.equal(/\bdisabled\b/.test(variantsOnly), true,
    'the control is inert — the naive matcher must fire here, or it was never the trap');
});

test('an ALREADY-OVER roster disables it too — it does not get more room', () => {
  const btn = addButton(render({ attendeesCount: 1 }));
  assert.ok(btn, 'the + button is gone on an over-capacity record');
  assert.ok(isDisabled(btn), 'an over-capacity roster can still be added to');
});

test('a CANCELLED record renders NO + button — a different question', () => {
  /**
   * Absence here is right, and it is not the seat lock: there is nothing to edit
   * rather than no room to edit it. The two gates are separate — `onEdit` and
   * `seatsAvailable` — and this is what keeps them from being confused.
   */
  assert.equal(addButton(CANCELLED), null, 'a cancelled record kept the + button');
  assert.ok(!CANCELLED.includes('เพิ่มรายชื่อครบตามจำนวนที่สมัครแล้ว'),
    'a cancelled record explains the seat lock, which is not why its button is gone');
});

test('CONTROL: the tone appears ONLY on the over-capacity cell', () => {
  // Otherwise `text-9e-accent` might be on every cell, or on none, and the
  // assertion above would pass for a reason unrelated to the roster.
  for (const cell of summaryCells(FULL)) {
    assert.ok(!/text-9e-accent/.test(cell), 'a within-capacity cell is marked as wrong');
  }
  for (const cell of summaryCells(OPTED_OUT)) {
    assert.ok(!/text-9e-accent/.test(cell), 'an opted-out cell is marked as wrong');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE COLUMNS — สถานะข้อมูล IS DELETED, PHONE IS ITS OWN
// ════════════════════════════════════════════════════════════════════════════
//
// FIVE TESTS WERE DELETED HERE, not re-pointed, because their subject is gone.
// Named with what happened to each claim:
//
//   · each of the three chip states renders on its own row
//   · CONTROL: the fixtures really are in three different states
//   · CONTROL: the chip extractor lands on the สถานะข้อมูล column
//   · the partial chip names the missing fields in its title
//   · the chip constrains its own width (w-fit, h-[21.5px])
//       → DELETED OUTRIGHT. All five are about the chip's own rendering. The
//         chip is gone, `attendeeInfoState` with it, and there is no surviving
//         surface that answers "is this row complete" — because after round 8
//         a two-field row IS complete. See lib/registrations/attendeeInfo.
//
//   · the chip colours are their own vocabulary, not the status module's
//       → THE COLOURS ARE GONE, THE RULING IS NOT. "A per-attendee vocabulary
//         may never join the status module" still binds SCHEDULE_BADGE on the
//         public list table, and its own test there is untouched. The ruling is
//         recorded in the client where INFO_BADGE used to be defined, so the
//         next person wanting a per-row chip finds it. Nothing is retained here
//         under a new name, because there is no per-attendee vocabulary left to
//         make the claim about.

test('the table has five columns: #, name, email, phone, menu', () => {
  /**
   * The header set, asserted by LABEL rather than by count alone — a count of
   * five was also true before this round, with ข้อมูลติดต่อ and สถานะข้อมูล in
   * place of อีเมล and เบอร์โทร. This is the assertion that can tell the two
   * five-column tables apart.
   */
  const table = FULL.slice(FULL.indexOf('<table'), FULL.indexOf('</table>'));
  const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
  const labels = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
  assert.deepEqual(labels, ['#', 'ชื่อ-นามสกุล', 'อีเมล', 'เบอร์โทร', 'การดำเนินการ']);

  // The deleted column is gone from the whole page, not merely from the header.
  assert.ok(!FULL.includes('สถานะข้อมูล'), 'the สถานะข้อมูล column is still rendered');
  assert.ok(!FULL.includes('ข้อมูลติดต่อ'), 'the merged contact column survived the split');
  for (const label of ['ข้อมูลครบ', 'ข้อมูลไม่ครบ', 'ยังไม่กรอก']) {
    assert.ok(!FULL.includes(label), `the chip vocabulary "${label}" is still on the page`);
  }
});

test('email and phone are separate cells, each falling back to its own dash', () => {
  /**
   * ── RE-POINTED FROM "ONE DASH" TO "TWO", AND THAT IS THE COLUMN SPLIT ─────
   * A name-only row used to show ONE dash, because email and phone shared a cell
   * that fell back once. They are two cells now, so it shows two — and that is
   * the change working rather than a regression. A TABLE CELL MAY NOT VANISH,
   * which is why each falls back rather than emptying.
   */
  const rows = attendeeRows(FULL);
  const cells = cellsOf(rows[0]);
  assert.equal(cells.length, 5, `expected 5 cells, found ${cells.length}`);
  assert.ok(cells[1].includes('สมชาย ใจดี'), 'cell 1 is not the name cell');
  assert.ok(cells[2].includes('somchai@example.com'), 'cell 2 is not the email cell');
  assert.ok(cells[2].includes('mailto:'), 'the email cell is not a mailto link');
  assert.ok(cells[3].includes('0812345678'), 'cell 3 is not the phone cell');
  assert.ok(!cells[3].includes('mailto:'), 'the phone cell links as an email');

  // The row with an email and no phone: one real value, one dash, in the right
  // cells — the ordering claim a page-wide dash count cannot make.
  const emailOnly = cellsOf(rows[3]);
  assert.ok(emailOnly[2].includes('@'), 'the email-only row lost its email');
  assert.equal(textOf(emailOnly[3]), '—', 'the missing phone did not fall back to a dash');
});

test('a row with NO contact details renders two dashes, one per column', () => {
  const blank = cellsOf(attendeeRows(FULL)[2]);
  assert.equal(textOf(blank[2]), '—', 'the missing email did not fall back');
  assert.equal(textOf(blank[3]), '—', 'the missing phone did not fall back');
  // And neither cell is EMPTY, which is the defect the dash exists to prevent.
  assert.ok(textOf(blank[2]).length > 0 && textOf(blank[3]).length > 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE PER-ROW "•••"
// ════════════════════════════════════════════════════════════════════════════

test('an editable row’s menu holds the edit and the two copies it has values for', () => {
  /**
   * ── RE-POINTED IN ROUND 8: A THIRD ITEM, AND TWO GATES, NOT ONE ──────────
   * `คัดลอกผู้เข้าอบรม` copies the whole row as name/email/phone. It is the one
   * MULTI-value copy on these screens, because a roster genuinely goes somewhere
   * as rows.
   *
   * THE TWO COPY ITEMS ARE GATED ON DIFFERENT THINGS, which is the point of
   * asserting the exact list rather than a count: `คัดลอกอีเมล` needs an EMAIL,
   * `คัดลอกผู้เข้าอบรม` needs ANY of the three fields. Row 2 is the case that
   * separates them — see below.
   */
  const rows = attendeeRows(FULL);
  assert.deepEqual(rowMenuItems(rows[0]), ['แก้ไขรายชื่อ', 'คัดลอกอีเมล', 'คัดลอกผู้เข้าอบรม']);
  assert.deepEqual(rowMenuItems(rows[1]), ['แก้ไขรายชื่อ', 'คัดลอกอีเมล', 'คัดลอกผู้เข้าอบรม']);

  // THE BLANK ROW — nothing in any field. NEITHER copy renders: there is no
  // email, and `attendeeCopyText` returns '' for a row with nothing in it, so
  // the row copy is absent too. A control that copies an empty string tells the
  // user nothing happened and reads as broken.
  assert.deepEqual(rowMenuItems(rows[2]), ['แก้ไขรายชื่อ']);

  // THE EMAIL-ONLY ROW — the case that proves the two gates are different. No
  // name, no phone, but an email: both copies render, and they copy different
  // things.
  assert.deepEqual(rowMenuItems(rows[3]), ['แก้ไขรายชื่อ', 'คัดลอกอีเมล', 'คัดลอกผู้เข้าอบรม']);
});

test('NO row menu is empty, and every item in every one has text', () => {
  /**
   * The third producer of menu items on this screen, and the defect it is
   * guarded against has been found by a control in rounds 1, 2 AND 4 — three
   * times, never by review.
   *
   * Swept over every fixture INCLUDING the cancelled one, because that is the
   * state where the item list is shortest and therefore where an empty sheet is
   * reachable.
   */
  for (const [name, markup] of Object.entries({ FULL, CANCELLED })) {
    for (const [i, row] of attendeeRows(markup).entries()) {
      const items = rowMenuItems(row);
      if (hasRowTrigger(row)) {
        assert.ok(items.length > 0, `${name} row ${i}: a "•••" trigger opens onto an empty menu`);
      }
      for (const item of items) {
        assert.ok(item.length > 0, `${name} row ${i}: a menu item rendered with no text`);
      }
    }
    assert.ok(!/<button[^>]*>\s*<\/button>/.test(markup), `${name}: a button rendered with no content`);
  }
});

test('the trigger is a FUNCTION of the item list — no items means no trigger', () => {
  /**
   * THE STRUCTURAL VERSION, and the one that matters. "Never empty" enforced by
   * hoping every branch keeps an item is a rule somebody eventually breaks; a
   * trigger that only exists when there is something behind it makes the empty
   * menu unrepresentable.
   *
   * The case that forces it: a CANCELLED record whose attendee row has no email
   * has neither an edit (the record is read-only) nor a copy (there is no
   * address). Every earlier version of this reasoning ended with a "•••" that
   * opened onto nothing.
   */
  for (const [name, markup] of Object.entries({ FULL, CANCELLED })) {
    for (const [i, row] of attendeeRows(markup).entries()) {
      assert.equal(hasRowTrigger(row), rowMenuItems(row).length > 0,
        `${name} row ${i}: the trigger and the item count disagree `
        + `(trigger: ${hasRowTrigger(row)}, items: ${rowMenuItems(row).length})`);
    }
  }
});

test('the "•••" trigger has an accessible name naming WHICH row it acts on', () => {
  // Its only child is an icon. Without screen-reader text it renders as
  // `<button …></button>` — the empty-button shape — and four identical
  // "การดำเนินการ" triggers in one table are announced indistinguishably.
  const row = attendeeRows(FULL)[0];
  const trigger = /<button[^>]*aria-haspopup="menu"[^>]*>([\s\S]*?)<\/button>/.exec(row);
  assert.ok(trigger, 'the row trigger is gone');
  assert.equal(textOf(trigger[1]), 'การดำเนินการสำหรับผู้เข้าอบรมท่านที่ 1');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE READ-ONLY LOCK REACHES THIS TAB
// ════════════════════════════════════════════════════════════════════════════

test('a cancelled record offers NO edit anywhere in the attendee tab', () => {
  /**
   * Round 1's ruling, carried onto two controls it has never covered before: the
   * + เพิ่มผู้เข้าอบรม button and the per-row menu. Both are edit affordances in
   * places the card-header scan does not look.
   */
  assert.equal((CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'a cancelled record kept a แก้ไข button');
  assert.ok(!CANCELLED.includes('เพิ่มผู้เข้าอบรม'), 'a cancelled record kept the + add button');
  for (const [i, row] of attendeeRows(CANCELLED).entries()) {
    assert.ok(!rowMenuItems(row).includes('แก้ไขรายชื่อ'),
      `cancelled row ${i}: the row menu still offers an edit`);
  }
});

test('the row menu still offers BOTH copies on a cancelled record', () => {
  /**
   * ══ COPYING IS NOT AN EDIT, AND THAT IS THE WHOLE CLAIM ═══════════════════
   *
   * A copy reads; the read-only lock is about writing. Neither copy item goes
   * near `onEditRow`, so neither can be removed by the cancellation gate — and
   * `แก้ไขรายชื่อ` is gone from every row, which is what shows the lock IS
   * working rather than simply absent.
   *
   * RE-POINTED for the new row copy, and it covers the same claim over a second
   * control: if `คัดลอกผู้เข้าอบรม` had been wired to the edit gate by mistake —
   * the easiest mistake to make, since it sits beside an item that IS gated —
   * this is what would say so.
   */
  const rows = attendeeRows(CANCELLED);
  assert.deepEqual(rowMenuItems(rows[0]), ['คัดลอกอีเมล', 'คัดลอกผู้เข้าอบรม']);
  assert.ok(!rowMenuItems(rows[0]).includes('แก้ไขรายชื่อ'),
    'the edit survived the lock — then the copies surviving proves nothing');

  // The blank row has nothing to copy and nothing to edit, so it has no menu at
  // all — and no trigger, which is the structural half.
  assert.deepEqual(rowMenuItems(rows[2]), []);
  assert.equal(hasRowTrigger(rows[2]), false, 'the blank row on a cancelled record kept its trigger');
});

test('a copy control writes NO audit row — there is no server call to write one', () => {
  /**
   * ══ ASSERTED STRUCTURALLY, BECAUSE THAT IS WHAT MAKES IT TRUE ═════════════
   *
   * The requirement is that a copy never files an audit row. The reason it holds
   * is not that somebody remembered to leave the call out — it is that copying
   * has NO server action at all: `navigator.clipboard.writeText` is a browser
   * call and nothing crosses the wire. There is no endpoint to add a
   * `recordAdminActionAfter` to.
   *
   * So what is pinned is the absence of a server import from the copy path, in
   * the module that owns it. A render assertion cannot see an audit write —
   * `recordAdminActionAfter` runs on the server, after the response — so this is
   * the honest form of the claim, and it is a SHAPE guard: stated, per the
   * standing rule, because it could not be made against behaviour here.
   */
  const shell = readSource('src/app/admin/registrations/_components/detailShell.jsx');
  const start = shell.code.indexOf('export function CopyButton');
  assert.notEqual(start, -1, 'the copy control is gone');
  const body = shell.code.slice(start, shell.code.indexOf('export function CopyAction'));
  assert.ok(body.length > 300, 'the copy body did not parse');

  assert.match(body, /navigator\.clipboard\?\.writeText/, 'the copy no longer uses the browser API');
  for (const forbidden of ['recordAdminAction', 'updateRegistration', 'await fetch', 'use server']) {
    assert.equal(body.includes(forbidden), false,
      `the copy control references \`${forbidden}\` — a read must not reach the server`);
  }
  // The whole shell imports no action module, so no copy path anywhere in it
  // could acquire one without this going red.
  assert.equal(/from '@\/lib\/actions\//.test(shell.withImports), false,
    'detailShell imported a server action — the copy controls live in this file');
});

test('CONTROL: an editable record DOES render both controls', () => {
  // Without this, every "no edit when cancelled" assertion above would pass on a
  // screen that never renders one at all.
  assert.ok(FULL.includes('เพิ่มผู้เข้าอบรม'), 'the + button is missing from an editable record');
  assert.ok(rowMenuItems(attendeeRows(FULL)[0]).includes('แก้ไขรายชื่อ'), 'the row edit is missing');
  assert.ok((FULL.match(/>แก้ไข</g) ?? []).length > 0, 'no card offers an edit at all');
});

test('the + เพิ่มผู้เข้าอบรม button is the measured 92.6x32.6', () => {
  const m = /class="([^"]*w-\[92\.6px\][^"]*)"/.exec(FULL);
  assert.ok(m, 'the + button is not at its measured width');
  assert.ok(m[1].split(/\s+/).includes('h-[32.6px]'), `the + button is not 32.6px tall: [${m[1]}]`);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. NO EMPTY ELEMENT, ON ANY OF THESE ROWS
// ════════════════════════════════════════════════════════════════════════════

const EMPTY_ELEMENT = /<(p|span|div|dl)\b(?![^>]*aria-hidden="true")[^>]*><\/\1>/;

test('no attendee row emits an empty element, in any state', () => {
  /**
   * The rows here are the sparse cases by construction: a row with no phone, a
   * row with nothing at all, a row with an email and no name. Each is a branch
   * where an optional line can be dropped, and a dropped line and a blank one
   * are indistinguishable to every assertion that reads for text.
   */
  for (const [name, markup] of Object.entries({ FULL, CANCELLED, OPTED_OUT })) {
    const m = EMPTY_ELEMENT.exec(markup);
    assert.equal(m, null, `${name} emits an empty element: ${m?.[0]}`);
  }
});

test('a row with an email and no phone renders ONE contact line, not one and a blank', () => {
  // The branch the blank row cannot reach: its cell takes the "everything
  // missing → dash" path and the per-line guards are never consulted. This is
  // the same hole the list tables' CoordinatorCell had, measured there first.
  const contact = cellsOf(attendeeRows(FULL)[1])[2];
  assert.ok(contact.includes('somying@example.com'), 'the email line did not render');
  assert.equal(EMPTY_ELEMENT.exec(contact), null, 'the missing phone left an empty element');
  assert.equal((contact.match(/<(a|span)\b/g) ?? []).length, 1,
    'the contact cell renders more than the one line it has content for');
});

test('the opted-out tab renders a sentence, not an empty table', () => {
  assert.ok(!OPTED_OUT.includes('<table'), 'an opted-out roster still drew a table');
  assert.ok(OPTED_OUT.includes('ยังไม่ได้ระบุรายชื่อ'), 'an opted-out roster says nothing at all');
  assert.ok(OPTED_OUT.includes('ผู้ประสานงานยังไม่ประสงค์แจ้งรายชื่อ'),
    'the card’s summary line does not cover the opted-out state');
});
