import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { attendeeInfoState } from '@/lib/registrations/attendeeInfo';

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

test('the summary row has THREE equal cells, and they read the roster', () => {
  const cells = summaryCells(FULL);
  assert.equal(cells.length, 3, `expected 3 summary cells, found ${cells.length}`);
  assert.ok(cells[0].includes('จำนวนที่สมัคร'), 'cell 0 is not จำนวนที่สมัคร');
  assert.ok(cells[0].includes('>4 ท่าน<'), 'the declared count is wrong');
  assert.ok(cells[1].includes('แจ้งรายชื่อแล้ว'), 'cell 1 is not แจ้งรายชื่อแล้ว');
  // THREE named, not four: BLANK carries nothing, so it is a slot rather than a
  // person. NO_NAME has an email and IS counted — see the pure tier.
  assert.ok(cells[1].includes('>3 ท่าน<'), 'the named count does not follow isNamedAttendee');
  assert.ok(cells[2].includes('ความครบถ้วน'), 'cell 2 is not ความครบถ้วน');
  assert.ok(cells[2].includes('>ยังไม่ครบ 3/4<'), 'the completeness cell does not read the roster');
});

test('the summary cells are EQUAL width, unlike the dark strip', () => {
  /**
   * The measurement: 359.46px each at 1080, exactly a third. `SummaryStrip`
   * above the tabs is the opposite — content-width, because its values are a
   * course name beside "3 ท่าน" — so a shared component with a flag would have
   * one thing answering two different measurements.
   */
  const start = FULL.indexOf('h-[75.85px]');
  const region = FULL.slice(start, start + 1400);
  const cells = [...region.matchAll(/<div class="([^"]*pt-\[15px\][^"]*)"/g)].map((m) => m[1]);
  assert.equal(cells.length, 3);
  for (const classes of cells) {
    assert.ok(classes.split(/\s+/).includes('flex-1'),
      `a summary cell does not take an equal share: [${classes}]`);
  }
  assert.match(region, /divide-x/, 'the summary cells are not divided by a rule');
});

test('the ความครบถ้วน cell and the dark strip agree, in different words', () => {
  /**
   * THE REASON THE DERIVATION MOVED INTO A MODULE. Both surfaces are on this one
   * page, three inches apart. They may WORD it differently — the strip has room
   * for `รายชื่อครบ`, the cell shows `ครบ` — but the STATE and the two numbers
   * are one derivation, and this is what says so.
   */
  const strip = FULL.slice(FULL.indexOf('h-[93px]'), FULL.indexOf('role="tablist"'));
  assert.ok(strip.includes('ยังไม่ครบ 3/4'), 'the dark strip does not carry the roster');
  assert.ok(summaryCells(FULL)[2].includes('ยังไม่ครบ 3/4'), 'the tab cell does not carry the same roster');

  // And on the opted-out record BOTH say so, neither invents a denominator.
  const stripOut = OPTED_OUT.slice(OPTED_OUT.indexOf('h-[93px]'), OPTED_OUT.indexOf('role="tablist"'));
  assert.ok(stripOut.includes('ยังไม่แจ้งรายชื่อ'), 'the strip claims a count on an opted-out roster');
  assert.ok(summaryCells(OPTED_OUT)[2].includes('>ยังไม่แจ้ง<'), 'the cell claims a count on an opted-out roster');
  // No fraction, read from the cell's TEXT rather than its markup — the markup
  // is full of `/` from closing tags and the first draft of this line matched
  // every one of them.
  assert.ok(!/\d+\/\d+/.test(textOf(summaryCells(OPTED_OUT)[2])),
    'the opted-out cell rendered a fraction it has no denominator for');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE สถานะข้อมูล CHIP — every branch, with a fixture each
// ════════════════════════════════════════════════════════════════════════════

test('each of the three states renders its own chip, on its own row', () => {
  const rows = attendeeRows(FULL);
  assert.equal(rows.length, 4, `expected 4 attendee rows, found ${rows.length}`);

  const chip = (i) => textOf(cellsOf(rows[i])[3]);
  assert.equal(chip(0), 'ข้อมูลครบ',   'the complete row is not labelled complete');
  assert.equal(chip(1), 'ข้อมูลไม่ครบ', 'the row missing a phone is not labelled incomplete');
  assert.equal(chip(2), 'ยังไม่กรอก',   'the entirely empty row is not labelled unfilled');
  assert.equal(chip(3), 'ข้อมูลไม่ครบ', 'the email-only row is not labelled incomplete');
});

test('CONTROL: the fixtures really are in three different states', () => {
  // If two of them collapsed to one state, the assertion above would be checking
  // one branch three times and the other two would be untested.
  const states = [COMPLETE, PARTIAL, BLANK, NO_NAME].map(attendeeInfoState);
  assert.deepEqual(states, ['complete', 'partial', 'empty', 'partial']);
  assert.equal(new Set(states).size, 3, 'the fixtures do not cover three distinct states');
});

test('CONTROL: the chip extractor lands on the สถานะข้อมูล column', () => {
  // Off-by-one would assert the shape of a different cell — and the contact cell
  // next door also holds one element on a sparse row, so the count would pass
  // while proving nothing.
  const cells = cellsOf(attendeeRows(FULL)[0]);
  assert.equal(cells.length, 5, `expected 5 cells, found ${cells.length}`);
  assert.ok(cells[1].includes('สมชาย ใจดี'), 'cell 1 is not the name cell');
  assert.ok(cells[2].includes('somchai@example.com'), 'cell 2 is not the contact cell');
  assert.ok(cells[3].includes('rounded-full'), 'cell 3 does not hold a chip');
});

test('the partial chip names the missing fields where a reader can reach them', () => {
  // The chip is 21.5px in a 22% column and cannot hold a list of field names, so
  // they go in the title. "ข้อมูลไม่ครบ" with no way to learn WHAT is missing is a
  // chip that reports a problem and hides it.
  const row = attendeeRows(FULL)[1];
  assert.match(row, /title="ยังขาด: เบอร์โทร"/, 'the partial chip does not say what is missing');
  // And the complete row carries no title at all — an empty one would be a
  // tooltip that opens onto nothing.
  assert.ok(!/title="/.test(cellsOf(attendeeRows(FULL)[0])[3]), 'the complete chip carries a title');
});

test('the chip colours are their own vocabulary, not the status module’s', () => {
  /**
   * `complete` / `partial` / `empty` describe ONE ATTENDEE'S FIELDS;
   * lib/registrations/statuses describes what stage a REGISTRATION is at. They
   * share no value and answer no common question, so an entry for one in the
   * other would be a category error — the same ruling the public list table's
   * SCHEDULE_BADGE already carries.
   */
  const rows = attendeeRows(FULL);
  const chipClasses = (i) => /class="([^"]*rounded-full[^"]*)"/.exec(cellsOf(rows[i])[3])[1];
  assert.match(chipClasses(0), /bg-emerald-100/, 'the complete chip lost its colour');
  assert.match(chipClasses(1), /bg-amber-100/,   'the partial chip lost its colour');
  assert.match(chipClasses(2), /bg-slate-100/,   'the empty chip lost its colour');
  // Every chip has a background: a chip with none is invisible against the row
  // and would read as an empty cell rather than as an unstyled state.
  for (let i = 0; i < rows.length; i += 1) {
    assert.match(chipClasses(i), /\bbg-/, `row ${i}'s chip has no background`);
  }
});

test('the chip constrains its own width', () => {
  // It is a direct child of a `<td>` rather than a flex column, so it is not
  // blockified the way the list tables' chips were — but `w-fit` is what makes
  // that independent of the cell, and the compiled-CSS sweep in the fs tier is
  // what proves the class paints.
  const classes = /class="([^"]*rounded-full[^"]*)"/.exec(cellsOf(attendeeRows(FULL)[0])[3])[1];
  assert.ok(classes.split(/\s+/).includes('w-fit'), `the chip does not size to its content: [${classes}]`);
  assert.ok(classes.split(/\s+/).includes('h-[21.5px]'), 'the chip is not the measured 21.5px');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE PER-ROW "•••"
// ════════════════════════════════════════════════════════════════════════════

test('an editable row’s menu holds the edit and, when there is one, the email copy', () => {
  const rows = attendeeRows(FULL);
  assert.deepEqual(rowMenuItems(rows[0]), ['แก้ไขรายชื่อ', 'คัดลอกอีเมล']);
  assert.deepEqual(rowMenuItems(rows[1]), ['แก้ไขรายชื่อ', 'คัดลอกอีเมล']);
  // The blank row has no email, so the copy item is ABSENT rather than a
  // control that copies an empty string.
  assert.deepEqual(rowMenuItems(rows[2]), ['แก้ไขรายชื่อ']);
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

test('the row menu still offers the COPY on a cancelled record', () => {
  // Copying is not an edit and does not go through the write gate, so the
  // read-only lock has no business removing it. The rows that have an email keep
  // it; the one that does not has no menu at all.
  const rows = attendeeRows(CANCELLED);
  assert.deepEqual(rowMenuItems(rows[0]), ['คัดลอกอีเมล']);
  assert.deepEqual(rowMenuItems(rows[2]), []);
  assert.equal(hasRowTrigger(rows[2]), false, 'the blank row on a cancelled record kept its trigger');
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
