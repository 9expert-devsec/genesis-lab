import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PublicTable } from '@/app/admin/registrations/_components/PublicTable';
import { InhouseTable } from '@/app/admin/registrations/_components/InhouseTable';
import { refNo } from '@/lib/refNo';
import { NEUTRAL_STATUS_BADGE, statusLabel } from '@/lib/registrations/statuses';

/**
 * THE PUBLIC TABLE AS IT RENDERS: its columns, its optional lines, and the link
 * that makes a row clickable.
 *
 * ── THE FIXTURES ARE DELIBERATELY SPARSE ────────────────────────────────────
 * The second and third rows are missing most of what the first one has — no
 * class date, no email, no attendee count, no audit entry, an unrecognised
 * status. That is the point: a table only emits an empty element on the row
 * where an optional line was dropped, so a fixture where every field is
 * populated proves nothing about the branch that matters.
 *
 * This is the defect that got through TWICE, in rounds 1 and 2, because it is
 * invisible to text matching: the text a `includes()` assertion looks for is
 * absent in both the correct and the broken version. Everything here asserts on
 * ELEMENTS.
 */

const FULL = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  courseName: 'Power BI Advanced',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com' },
  attendeesCount: 12,
  status: 'confirmed',
  createdAt: '2026-08-01T03:00:00.000Z',
};

/** Everything optional, absent. The row that produces empty elements. */
const SPARSE = {
  _id: 'bbbbbbbbbbbbbbbbbbbb0002',
  courseName: 'SQL Fundamentals',
  classDate: '',
  scheduleType: '',
  attendanceMode: '',
  coordinator: {},
  attendeesCount: undefined,
  status: 'pending',
  createdAt: '2026-08-05T03:00:00.000Z',
};

/**
 * A coordinator with a NAME but NO EMAIL — and this fixture exists because a
 * control fired nothing without it.
 *
 * ── THE MEASUREMENT ─────────────────────────────────────────────────────────
 * The rehearsal deleted the `{email ? … : null}` guard in CoordinatorCell,
 * expecting an empty `<p>`. The suite stayed GREEN. The reason was not a weak
 * assertion — it was REDUNDANCY IN THE CODE, which is explanation (3) in the
 * header of test/run.mjs and the one that gets missed because it looks exactly
 * like a weak test.
 *
 * `SPARSE` has no name, no email and no phone, so the cell's early
 * "everything is missing → render a dash" branch answers first and the broken
 * guard is never reached. Every row in the fixture set was covered by one of the
 * two branches, so the second branch was untested.
 *
 * This row reaches it: a name renders, the early return does not fire, and the
 * email guard is the only thing standing between the render and an empty
 * element. The control reddens now.
 */
const NAME_ONLY = {
  ...SPARSE,
  _id: 'dddddddddddddddddddd0004',
  coordinator: { firstName: 'ปรีชา', lastName: 'ตั้งใจ' },
};

/**
 * A status the module has never heard of.
 *
 * ── DRIVING THE CELL WITH A FABRICATED VOCABULARY ───────────────────────────
 * A row carrying a real status proves the cell renders SOMETHING. It cannot
 * tell a lookup through the shared module from a private map that happens to
 * agree — and a private map is exactly what four files carried until commit 1.
 *
 * An invented value separates them: the module returns the value UNCHANGED as
 * its own label and the NEUTRAL chip as its colour, so if the cell is reading a
 * local map it renders nothing, or a blank chip, or the wrong colour.
 */
const FABRICATED_STATUS = 'zzz-not-a-real-status';
const FOREIGN = { ...SPARSE, _id: 'cccccccccccccccccccc0003', status: FABRICATED_STATUS };

const href = (id) => `/admin/registrations/${id}`;

/**
 * Named so the body-vs-header guard below can assert every fixture row rendered,
 * rather than checking whichever rows happened to survive. The in-house file has
 * the same const for the same reason.
 */
const ROWS = [FULL, SPARSE, NAME_ONLY, FOREIGN];

const html = renderToStaticMarkup(createElement(PublicTable, {
  items: ROWS,
  lastEdited: { [FULL._id]: { createdAt: '2026-08-10T03:00:00.000Z', actorName: 'แอดมิน' } },
  detailHref: href,
}));

const empty = renderToStaticMarkup(createElement(PublicTable, {
  items: [], lastEdited: {}, detailHref: href,
}));

/**
 * The `<th>` cells of the header row. Throws rather than returning [].
 *
 * ── SLICED FROM AFTER THE OPENING TAG, WHICH IS LOAD-BEARING ────────────────
 * `<thead>` itself begins with `<th`, so splitting a slice that starts at the
 * `<thead` index reports ONE PHANTOM COLUMN. The count assertion below caught it
 * immediately — 7 against a header that really has 6 — which is the same way it
 * was caught in test/render/adminListColumns, where the fix is recorded.
 *
 * Written out again here rather than imported: the two files' helpers differ in
 * what they tolerate, and a shared extractor that one of them outgrows is how a
 * subtly wrong slice spreads to both.
 */
function headerCells(markup) {
  const start = markup.indexOf('<thead');
  assert.notEqual(start, -1, 'no <thead> — the table did not render');
  const open = markup.indexOf('>', start);
  assert.notEqual(open, -1, 'unterminated <thead> open tag');
  const end = markup.indexOf('</thead>', open);
  assert.notEqual(end, -1, 'unterminated <thead>');
  return markup.slice(open + 1, end).split('<th').slice(1);
}

/** One `<tr>` of the body, by the id its links point at. */
function rowFor(markup, id) {
  const body = markup.slice(markup.indexOf('<tbody'), markup.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  const row = rows.find((r) => r.includes(href(id)));
  assert.ok(row, `no row rendered for ${id}`);
  return row;
}

// ── 1. The column set is the public one, and only the public one ────────────

test('the header has exactly seven columns: six labelled plus the chevron', () => {
  // Exact, not a floor: a floor is satisfied by adding a column back. The empty
  // state's colSpan is derived from the same array and is pinned below.
  //
  // WAS 6 (five labelled). รูปแบบ became a column of its own after the
  // click-test, so this is 7 — re-pointed rather than relaxed to `>= 6`, which
  // is what would have made the next added column invisible.
  const cells = headerCells(html);
  assert.equal(cells.length, 7, `expected 7 header cells, found ${cells.length}`);
});

test('the public headings are the measured set', () => {
  // WAS the same five minus รูปแบบ, which was a chip inside the course cell.
  const cells = headerCells(html).join('|');
  for (const heading of ['วันที่สมัคร', 'หลักสูตร / รอบอบรม', 'รูปแบบ', 'ผู้ประสานงาน', 'ผู้เข้าอบรม', 'สถานะ']) {
    assert.ok(cells.includes(`>${heading}<`), `public header missing: ${heading}`);
  }
});

/**
 * รูปแบบ IS A COLUMN, AND THE COURSE CELL NO LONGER HOLDS THE CHIP.
 *
 * Both halves, because either alone is satisfiable by a half-done move: a
 * header with no chip under it, or a chip rendered twice.
 *
 * The move is also the fix for a truncation nobody had raised — the course name
 * clipped on the first row ("Data Analysis Expression (D…") because the chip
 * competed for that cell's width on the same 32px line as the round dates.
 */
test('the schedule chip is in its OWN cell, not in the course cell', () => {
  const cells = rowFor(html, FULL._id).split('<td').slice(1);
  // Column order: date, course, format, coordinator, attendees, status, chevron.
  assert.ok(cells[2].includes('>Hybrid · Teams<'), 'the รูปแบบ cell does not hold the schedule chip');
  assert.ok(!cells[1].includes('Hybrid'), 'the course cell still holds a schedule chip');
  // Exactly once in the whole row — not moved-and-also-left-behind.
  assert.equal(rowFor(html, FULL._id).split('>Hybrid · Teams<').length - 1, 1,
    'the schedule chip renders more than once in the row');
});

test('the course cell keeps its two-line shape: bold name over the round dates', () => {
  const cell = rowFor(html, FULL._id).split('<td').slice(1)[1];
  assert.ok(cell.includes('>Power BI Advanced<'), 'the course name is gone');
  assert.ok(cell.includes('>12 - 13 ส.ค. 2569<'), 'the round dates are gone from the course cell');
});

/**
 * A PUBLIC ROW CARRIES NO IN-HOUSE HEADER, AND VICE VERSA.
 *
 * The two tables are separate components precisely so that this cannot happen —
 * the defect it guards is an in-house document rendered through public cells,
 * which produced a row of em-dashes and a สถานะ of `confirmed`, a value no
 * in-house enquiry can hold. Asserted in BOTH directions, from the two real
 * components, rather than by reading one and trusting the other.
 */
test('the public table emits none of the in-house headings', () => {
  const cells = headerCells(html).join('|');
  for (const heading of ['บริษัท', 'หลักสูตรที่สนใจ', 'รูปแบบ / จำนวน', 'วันที่ส่งคำขอ']) {
    assert.ok(!cells.includes(heading), `an in-house header leaked onto the public table: ${heading}`);
  }
});

test('the in-house table emits none of the public-only headings', () => {
  /**
   * `ผู้เข้าอบรม` joined this list when the in-house body was rebuilt and merged
   * it into `รูปแบบ / จำนวน`. Until then it was a heading on BOTH tables and was
   * deliberately excluded, because asserting it early would have made this test
   * red on correct code — the measured trap this suite keeps rediscovering.
   */
  const inhouse = renderToStaticMarkup(createElement(InhouseTable, {
    items: [], lastEdited: {}, courseNames: {},
  }));
  const cells = headerCells(inhouse).join('|');
  for (const heading of ['หลักสูตร / รอบอบรม', 'วันที่สมัคร', 'ผู้เข้าอบรม']) {
    assert.ok(!cells.includes(`>${heading}<`), `a public header leaked onto the in-house table: ${heading}`);
  }
});

test('the removed columns are gone, header and body', () => {
  /**
   * `รูปแบบ` LEFT THIS LIST after the click-test, and that is a real change of
   * claim rather than a relaxation: it was never removed by ruling, it was
   * FOLDED into the course cell in the round-3 rebuild and has now been
   * un-folded into a column of its own. The four that remain were removed by
   * ruling and are not coming back.
   *
   * `วันอบรม` stays removed and is NOT the same thing as รูปแบบ returning:
   * `classDate` is still the course cell's second line, not a column.
   */
  const cells = headerCells(html).join('|');
  for (const heading of ['เลขอ้างอิง', 'วันอบรม', 'ใบเสนอราคา', 'ชำระเงิน']) {
    assert.ok(!cells.includes(`>${heading}<`), `a removed column is back: ${heading}`);
  }
  // The reference number is not merely unlabelled — it is not rendered at all.
  // Computed from the fixture id through the one canonical implementation, so
  // this cannot pass because the test's idea of a reference number went stale.
  assert.ok(!html.includes(refNo(FULL._id)), 'the row still prints a reference number');
});

test('the empty-state colSpan matches the header width', () => {
  // Two numbers that must agree, with nothing in the framework forcing them to.
  assert.match(empty, /ไม่พบรายการที่ตรงกับเงื่อนไข/, 'the empty state must be what rendered');
  const m = empty.match(/<td[^>]*colspan="(\d+)"/i);
  assert.ok(m, 'the empty-state cell carries no colSpan');
  assert.equal(Number(m[1]), headerCells(empty).length, 'the empty row spans the wrong number of columns');
});

// ── 2. The row is a REAL LINK ───────────────────────────────────────────────

/**
 * ── WHAT ONLY A CLICK-TEST CAN SETTLE, AND WHAT THIS CAN ────────────────────
 *
 * Middle-click and cmd-click are BROWSER behaviours of an `<a href>`; no
 * server-rendered assertion can exercise them. What this proves is the thing
 * they depend on: every cell is an anchor with a real `href`, and the row
 * carries no click handler standing in for one. Given a genuine `<a href>`, the
 * browser behaviours follow.
 *
 * `renderToStaticMarkup` also strips event handlers, so "no onClick" cannot be
 * asserted from the markup at all — it is asserted at source level in
 * test/fs/registrationsRowLink.
 */
test('every cell of a row is an anchor pointing at that row’s detail page', () => {
  const row = rowFor(html, FULL._id);
  const anchors = row.match(/<a\b[^>]*>/g) ?? [];
  // WAS 6. Seven cells now that รูปแบบ has its own column.
  assert.equal(anchors.length, 7, `expected one anchor per cell, found ${anchors.length}`);
  for (const a of anchors) {
    assert.ok(a.includes(`href="${href(FULL._id)}"`), `an anchor points somewhere else: ${a}`);
  }
});

/**
 * ── THE BODY HAS AS MANY CELLS AS THE HEADER ────────────────────────────────
 *
 * THE HOLE WAS FOUND ON THE IN-HOUSE TABLE AND VERIFIED HERE BEFORE PORTING.
 * The two tables have the SAME shape, and it is worth stating what was checked
 * rather than assuming the symmetry:
 *
 *   · `<colgroup>` — `COLUMNS.map(...)`, derived
 *   · `<thead>`    — `COLUMNS.map(...)`, derived
 *   · empty-state  — `colSpan={COLUMNS.length + 1}`, derived
 *   · `<tbody>`    — SEVEN hand-written `<td>`s (six cells plus ChevronCell),
 *                    NOT derived
 *
 * So a column added to `COLUMNS` grows the header, the colgroup and the
 * empty-state span, and leaves the body one cell short — and the three guards
 * that look adjacent to this all miss it, exactly as they did on in-house:
 *
 *   · the anchor count reads ONE BODY ROW and a hard-coded number, so it is
 *     body-only and never compares against the header;
 *   · the `<col>` count and the ratio test read the COLGROUP only;
 *   · the empty-state `colSpan` test compares two numbers that are BOTH derived
 *     from `COLUMNS`, so they agree with each other while both disagree with
 *     the body.
 *
 * Three assertions in the same file, none of which spans the two halves. That is
 * why this exists on BOTH tables rather than only where the mutation happened to
 * be run — a guard present on one table and absent on the other reads as
 * coverage and is not.
 *
 * Every row is checked, not just the first: a per-row conditional could
 * desynchronise one of them.
 */
test('every body row has exactly as many cells as the header', () => {
  const headers = headerCells(html).length;
  const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  assert.equal(rows.length, ROWS.length, `expected ${ROWS.length} body rows, found ${rows.length}`);

  rows.forEach((row, i) => {
    const cells = (row.match(/<td\b/g) ?? []).length;
    assert.equal(cells, headers,
      `body row ${i} has ${cells} cells against ${headers} header cells. The header, the colgroup `
      + 'and the empty-state colSpan are all derived from COLUMNS; the body cells are hand-written '
      + 'and do not follow.');
  });
});

test('a row has exactly ONE keyboard tab stop', () => {
  /**
   * Six anchors per row would be six tab stops — 120 on a page of twenty — so
   * all but the first are removed from the tab order while staying clickable.
   * The FIRST is the one left in, so tab order follows reading order.
   */
  const row = rowFor(html, FULL._id);
  const anchors = row.match(/<a\b[^>]*>/g) ?? [];
  const stops = anchors.filter((a) => !a.includes('tabindex="-1"'));
  assert.equal(stops.length, 1, `expected 1 tab stop per row, found ${stops.length}`);
  assert.ok(anchors[0] === stops[0], 'the tab stop is not the first cell — tab order would jump');
});

test('CONTROL: the anchor probe would see a row that had no links at all', () => {
  // Every assertion above counts anchors. If the probe were wrong it would
  // report 0 and the counts would fail loudly — but a probe that matched
  // something else could report 6 for the wrong reason. Point it at markup with
  // a known number of anchors, and at markup with none.
  assert.equal(('<td><a href="/x">a</a></td><td><a href="/x">b</a></td>'.match(/<a\b[^>]*>/g) ?? []).length, 2);
  assert.equal(('<td><span>no link here</span></td>'.match(/<a\b[^>]*>/g) ?? []).length, 0);
});

// ── 3. No empty element where an optional line was dropped ──────────────────

const EMPTY_ELEMENT = /<(p|span|div)\b(?![^>]*aria-hidden="true")[^>]*><\/\1>/;

test('the sparse row emits no empty element', () => {
  const m = EMPTY_ELEMENT.exec(rowFor(html, SPARSE._id));
  assert.equal(m, null,
    `the sparse row emits an empty element: ${m?.[0]}. Every optional line must be absent, `
    + 'not blank — text matching cannot see the difference, which is why it shipped twice.');
});

test('no row in the whole table emits an empty element', () => {
  const m = EMPTY_ELEMENT.exec(html);
  assert.equal(m, null, `an empty element rendered: ${m?.[0]}`);
});

test('a coordinator with a name and no email renders ONE line, not one and a blank', () => {
  /**
   * The branch SPARSE cannot reach. See the fixture's note: the cell's
   * "everything missing → dash" early return answers first for SPARSE, so
   * without this row the email guard was covered by nothing and deleting it
   * reddened no test at all.
   */
  const row = rowFor(html, NAME_ONLY._id);
  assert.ok(row.includes('>ปรีชา ตั้งใจ<'), 'the name line did not render');
  const m = EMPTY_ELEMENT.exec(row);
  assert.equal(m, null, `the missing email left an empty element: ${m?.[0]}`);
});

test('the sparse row still renders its REQUIRED lines', () => {
  // The negative above is satisfied by a row that renders nothing at all. The
  // course name, the date and the chip are not optional and must be there.
  const row = rowFor(html, SPARSE._id);
  assert.ok(row.includes('>SQL Fundamentals<'), 'the sparse row lost its course name');
  assert.ok(row.includes('>5 ส.ค. 2569<'), 'the sparse row lost its created date');
  assert.ok(row.includes('>Classroom<'), 'the sparse row lost its schedule chip');
  // And the coordinator cell falls back to a dash rather than to nothing.
  assert.ok(row.includes('>—<'), 'the empty coordinator cell rendered neither a line nor a dash');
});

test('the audit hint renders on the row that has one and NOT on the rows that do not', () => {
  // The hint is the date cell's sub-line, moved here from the deleted เลขอ้างอิง
  // column. Most rows predate the audit log, so "absent means absent" is the
  // normal case rather than the edge case.
  assert.ok(rowFor(html, FULL._id).includes('แอดมิน'), 'the audit hint did not render where there is an entry');
  assert.ok(!rowFor(html, SPARSE._id).includes('แอดมิน'), 'the hint leaked onto a row with no entry');
});

// ── 4. The two ruled-out mockup elements ────────────────────────────────────

test('the attendee cell is the NUMBER ONLY — no ครบ / ยังไม่ครบ / แจ้งภายหลัง chip', () => {
  for (const word of ['ครบ', 'ยังไม่ครบ', 'แจ้งภายหลัง']) {
    assert.ok(!html.includes(word), `the attendee completeness chip is back: ${word}`);
  }
  // The number itself IS there, so this is not passing because the cell is empty.
  assert.ok(rowFor(html, FULL._id).includes('>12<'), 'the attendee count did not render');
});

test('a missing attendee count renders a dash, not a blank cell', () => {
  assert.ok(rowFor(html, SPARSE._id).includes('>—<'), 'the absent count rendered nothing at all');
});

test('the status cell is the CHIP ONLY — no second line, and no placeholder for one', () => {
  /**
   * The design puts a line under the chip. Ruled out, and deliberately NOT
   * replaced by '—': an em-dash in every row is a column that says nothing, in a
   * table this round is shortening.
   *
   * The honest reason is in the data — records exist whose status is `paid`
   * while payment.omiseStatus reads pending and payment.paidAt is absent — so
   * the line would have needed a rule for a case that does not hold.
   */
  for (const line of ['รอตรวจสอบข้อมูล', 'ส่งเอกสารแล้ว', 'รอจัดส่งเอกสาร', 'ดูข้อมูลได้อย่างเดียว']) {
    assert.ok(!html.includes(line), `the status sub-line is back: ${line}`);
  }
  assert.ok(!/ชำระ \d/.test(html), 'a "ชำระ <date>" line is back under the status chip');
});

/**
 * THE STRUCTURAL VERSION OF "CHIP ONLY", AND THE ONE THAT MATTERS.
 *
 * The test above names the five sub-lines the design shows. It is worth having —
 * a reader greps for those strings — but on its own it is exactly the guard the
 * brief warns about: it does not catch the sub-line coming back as '—', or as a
 * non-breaking space, or as any other placeholder nobody thought to list. A ban
 * on known strings only ever bans the strings somebody remembered.
 *
 * So this asserts the SHAPE: the สถานะ cell's link contains exactly one element,
 * and that element is the chip. Anything added under it — a dash, a date, an
 * empty paragraph reserving the space — makes it two.
 */
test('the สถานะ cell contains exactly one element: the chip', () => {
  for (const id of [FULL._id, SPARSE._id, NAME_ONLY._id, FOREIGN._id]) {
    // Cells in column order: date, course, coordinator, attendees, status, chevron.
    const cell = rowFor(html, id).split('<td').slice(1)[5];
    assert.ok(cell, 'the status cell did not render');

    const elements = cell.match(/<(p|span|div)\b/g) ?? [];
    assert.equal(elements.length, 1,
      `the สถานะ cell renders ${elements.length} elements (${elements.join(', ')}), expected only the chip. `
      + 'A second line under the chip is ruled out — including as "—" or any other placeholder, '
      + 'which is the form a string-matching guard would miss.');
    assert.ok(/<span\b/.test(cell), 'the one element is not the chip span');
  }
});

test('CONTROL: the cell extractor lands on the สถานะ column', () => {
  // Off-by-one here would silently assert the shape of a DIFFERENT cell — and
  // the attendees cell next door also holds exactly one element, so the count
  // above would pass while proving nothing about the status chip.
  const cell = rowFor(html, FULL._id).split('<td').slice(1)[5];
  assert.ok(cell.includes(statusLabel('confirmed')), 'cell 4 is not the status cell');
  const attendees = rowFor(html, FULL._id).split('<td').slice(1)[4];
  assert.ok(attendees.includes('>12<'), 'cell 3 is not the attendees cell — the indices have shifted');
});

test('the status label carries no lock glyph — the lock belongs to the overview card', () => {
  assert.ok(!html.includes('🔒'), 'a lock glyph is welded into the status label');
  assert.ok(!html.includes('lucide-lock'), 'a lock icon rendered inside the table');
  // The label element's ENTIRE text is the label, which is what proves nothing
  // was appended to it.
  assert.ok(html.includes(`>${statusLabel('confirmed')}<`), 'the status label is not an element of its own');
});

// ── 5. The status cell is driven by the module ──────────────────────────────

test('an unrecognised status renders its raw value and the NEUTRAL chip', () => {
  const row = rowFor(html, FOREIGN._id);
  assert.ok(row.includes(`>${FABRICATED_STATUS}<`),
    'the cell hid an unknown status instead of showing what the record holds');
  assert.ok(row.includes(NEUTRAL_STATUS_BADGE),
    'the cell did not fall back to the neutral chip — it is reading a local colour map');
});

test('CONTROL: the fabricated status is genuinely unknown to the module', () => {
  // If the module had an entry for it, the assertions above would be testing the
  // ordinary path and the fallback would be untested.
  assert.equal(statusLabel(FABRICATED_STATUS), FABRICATED_STATUS,
    'the fabricated value has a real label — pick one the module does not know');
});

// ── 6. The widths are proportions, not pixels ───────────────────────────────

test('every content column is a proportion of the table, and only the chevron is fixed', () => {
  /**
   * The requirement is that the layout survives the admin sidebar collapsing, so
   * a px width on a content column is the defect. Read off the `<colgroup>`,
   * which is where the widths are stated.
   */
  const cols = html.match(/<col style="width:([^"]*)"/g) ?? [];
  assert.equal(cols.length, 7, `expected 7 <col> elements, found ${cols.length}`);

  const widths = cols.map((c) => /width:([^"]*)/.exec(c)[1]);
  for (const w of widths.slice(0, 6)) {
    assert.ok(w.includes('calc('), `a content column is not a calc(): ${w}`);
    assert.ok(w.includes('100%'), `a content column has no proportional term: ${w}`);
  }
  // The chevron is the ONE fixed column, by design.
  assert.match(widths[6], /^\d+px$/, `the chevron column is not a fixed px width: ${widths[6]}`);
});

/**
 * THE สถานะ COLUMN STAYS WIDE ENOUGH FOR ITS WIDEST LIVE LABEL.
 *
 * ── THE ASSUMPTION IS STATED, BECAUSE IT CANNOT BE MEASURED HERE ───────────
 * The chip is `whitespace-nowrap`, so if the column is ever narrowed past the
 * label the chip OVERFLOWS rather than wraps. Whether it overflows depends on
 * glyph advances, which need a font and a layout engine — this suite has
 * neither, and an assertion that pretended to measure text would be exactly the
 * kind this round has already caught three times.
 *
 * So the floor is DERIVED and its assumption is named: the widest live label,
 * counted in ADVANCING glyphs (Thai combining marks take zero advance), at a
 * mid-range 0.65em advance, plus the chip's 18px of padding. That is 135px.
 *
 * This does not prove the chip fits. It proves nobody has narrowed the column
 * below the width that assumption requires — which is the regression worth
 * catching, since สถานะ has now been narrowed once already (14.6% -> 10.9%).
 * The eyeball is on the click-test list.
 */
test('the สถานะ column clears the widest live label at a stated 0.65em advance', () => {
  const CONTAINER = 1440;
  const widths = (html.match(/<col style="width:([^"]*)"/g) ?? [])
    .map((c) => /width:([^"]*)/.exec(c)[1]);

  const m = /^calc\(\(100% - ([\d.]+)px\) \* ([\d.]+) \+ ([\d.]+)px\)$/.exec(widths[5]);
  assert.ok(m, `the สถานะ width is not a calc this test can evaluate: ${widths[5]}`);
  // The `+ pad` term in the calc is the cell's own padding, so the CONTENT the
  // chip gets is the box minus it — which is just the proportional term.
  const [, chrome, ratio] = m.map(Number);
  const content = (CONTAINER - chrome) * ratio;

  const label = statusLabel('confirmed');
  const advancing = [...label].filter((ch) => !/[ัิ-ฺ็-๎]/.test(ch)).length;
  const floor = advancing * 12 * 0.65 + 18;

  assert.ok(
    content >= floor,
    `the สถานะ column gives the chip ${content.toFixed(1)}px but the widest live label `
    + `(${JSON.stringify(label)}, ${advancing} advancing glyphs) needs about ${floor.toFixed(1)}px `
    + 'at a 0.65em advance. The chip is whitespace-nowrap, so it will overflow rather than wrap.',
  );
});

test('the column ratios are the measured shares, normalised', () => {
  /**
   * The percentages still sum to 89.9%, the rest being gaps, edges and the
   * chevron. What must be preserved is the RATIO between columns — pinned here
   * so a "tidy up the numbers" edit cannot quietly change the layout.
   *
   * REVISED after the click-test. WAS [13.3, 30.0, 20.3, 11.7, 14.6] over five
   * columns; now six, with รูปแบบ inserted at index 2 and the total unchanged:
   *
   *   วันที่สมัคร  13.3 → 13.0    ผู้ประสานงาน 20.3 → 20.0
   *   หลักสูตร     30.0 → 32.0    ผู้เข้าอบรม  11.7 →  5.5
   *   รูปแบบ       new    8.5     สถานะ       14.6 → 10.9
   *
   * This array is one of SIX places the proportions are written down; the others
   * are the two COLUMNS arrays, the in-house sibling of this test, and the
   * worked arithmetic in tableParts' columnWidths docstring. All updated
   * together.
   */
  const widths = (html.match(/<col style="width:([^"]*)"/g) ?? [])
    .map((c) => /width:([^"]*)/.exec(c)[1]);
  const ratios = widths.slice(0, 6).map((w) => Number(/\*\s*([\d.]+)/.exec(w)[1]));

  const shares = [13.0, 32.0, 8.5, 20.0, 5.5, 10.9];
  const total  = shares.reduce((a, b) => a + b, 0);
  ratios.forEach((r, i) => {
    assert.ok(Math.abs(r - shares[i] / total) < 1e-5,
      `column ${i} has ratio ${r}, expected ${(shares[i] / total).toFixed(6)}`);
  });
  // And they sum to 1, or the columns do not fill the table.
  assert.ok(Math.abs(ratios.reduce((a, b) => a + b, 0) - 1) < 1e-5, 'the ratios do not sum to 1');
});

// ── 8. A bundle leg says so, and an ordinary row does not ───────────────────

/**
 * ── WHY THESE ROWS RENDER THEIR OWN TABLE ──────────────────────────────────
 * The fixtures above are shared by roughly thirty assertions — the column
 * count, the anchor sweep, the empty-element sweep, the ratio arithmetic — and
 * adding a fifth row to `ROWS` would perturb every one of them for the sake of
 * two. These get their own render, and the empty-element sweep is repeated over
 * it rather than assumed, because a chip with no text is exactly the failure
 * that sweep exists to catch.
 */
const BUNDLE_LEG = {
  _id: 'cccccccccccccccccccc0005',
  courseName: 'Excel Level 1',
  classDate: '20 - 21 ต.ค. 2569',
  scheduleType: 'classroom',
  attendanceMode: 'classroom',
  coordinator: { firstName: 'สมหญิง', lastName: 'ดีใจ', email: 'somying@example.com' },
  attendeesCount: 1,
  status: 'pending',
  createdAt: '2026-09-01T03:00:00.000Z',
  bundle: {
    pageId: '6500000000000000000000aa',
    sectionId: 'sec-1',
    requestId: 'cccccccccccccccccccc0005',
    name: 'Data Analyst Starter',
  },
};

/** The same request's second leg: same requestId, a different course. */
const BUNDLE_LEG_2 = {
  ...BUNDLE_LEG,
  _id: 'dddddddddddddddddddd0006',
  courseName: 'Power BI Level 1',
  classDate: '3 - 4 พ.ย. 2569',
};

/** A bundle an author never named — the storage floor accepts it. */
const UNNAMED_LEG = {
  ...BUNDLE_LEG,
  _id: 'eeeeeeeeeeeeeeeeeeee0007',
  bundle: { ...BUNDLE_LEG.bundle, name: '' },
};

const bundleHtml = renderToStaticMarkup(createElement(PublicTable, {
  items: [BUNDLE_LEG, BUNDLE_LEG_2, UNNAMED_LEG, FULL],
  lastEdited: {},
  detailHref: href,
}));

test('a bundle leg carries the Bundle chip, which names NO package', () => {
  /**
   * Three rows, one coordinator, three courses, three minutes apart. Without
   * this chip they read as three unrelated people who happened to book on the
   * same afternoon — and nothing else on the row could tell you otherwise.
   *
   * THE CHIP NO LONGER CARRIES THE PACKAGE NAME. It read
   * `แพ็กเกจ: <bundle.name>`; it now reads `Bundle`. The package name is on the
   * DETAIL screen — its own แพ็กเกจ row and the header subtitle — and those
   * were deliberately left alone.
   */
  const row = rowFor(bundleHtml, BUNDLE_LEG._id);
  assert.match(row, /data-testid="bundle-leg-chip"/);
  assert.match(row, /Bundle/);
  // The name is GONE, not merely unasserted — and the fixture really does carry
  // one, so this is the chip dropping it rather than there being none to show.
  assert.equal(/Data Analyst Starter/.test(row), false, 'the package name is still on the chip');
  assert.equal(BUNDLE_LEG.bundle.name, 'Data Analyst Starter');
  assert.equal(/แพ็กเกจ:/.test(row), false);
});

test('CONTROL: an ordinary registration carries NO chip', () => {
  // Discrimination, not existence: without this the assertion above is
  // satisfied by a table that chips every row.
  const row = rowFor(bundleHtml, FULL._id);
  assert.equal(/data-testid="bundle-leg-chip"/.test(row), false);
  // …and the chip really is in the markup somewhere, so the false above is the
  // row lacking it rather than the feature being absent.
  assert.match(bundleHtml, /data-testid="bundle-leg-chip"/);
});

test('both legs of one request are chipped — the grouping is visible, not implied', () => {
  for (const id of [BUNDLE_LEG._id, BUNDLE_LEG_2._id]) {
    assert.match(rowFor(bundleHtml, id), /data-testid="bundle-leg-chip"/, `leg ${id} is unmarked`);
  }
});

test('a NAMED and an UNNAMED bundle now chip identically', () => {
  /**
   * `promotion_bundle.name` defaults to '' and no publish rule demands one, so
   * an unnamed bundle is a state an author can ship. This test used to be about
   * the FALLBACK: `แพ็กเกจ: <name>` when there was a name, bare `แพ็กเกจ` when
   * there was not, so that a chip never read "แพ็กเกจ: " like a value that
   * failed to load.
   *
   * THAT BRANCH IS GONE. The chip reads `Bundle` either way, so the named and
   * unnamed cases are now the same string — which is the property worth pinning,
   * because it is what makes the old fallback unnecessary rather than merely
   * unused.
   */
  const unnamed = rowFor(bundleHtml, UNNAMED_LEG._id);
  const named = rowFor(bundleHtml, BUNDLE_LEG._id);

  const chipOf = (row) => /<span[^>]*data-testid="bundle-leg-chip"[^>]*>([\s\S]*?)<\/span>/.exec(row)?.[1];
  assert.ok(chipOf(unnamed), 'the unnamed leg has no chip');
  assert.ok(chipOf(named), 'the named leg has no chip');
  assert.equal(chipOf(unnamed), chipOf(named), 'the two chips differ');
  assert.match(chipOf(unnamed), /Bundle/);
  // No colon-with-nothing-after-it can survive, because there is no colon.
  assert.equal(/แพ็กเกจ:/.test(unnamed), false);

  // CONTROL: the two fixtures really do differ in the underlying data, so the
  // equality above is the CHIP collapsing them and not two identical rows.
  assert.equal(String(UNNAMED_LEG.bundle.name ?? ''), '');
  assert.equal(BUNDLE_LEG.bundle.name, 'Data Analyst Starter');
  assert.notEqual(unnamed, named);
});

test('no bundle row emits an empty element either', () => {
  // The sweep from section 3, over the rows that carry the new element. A chip
  // rendered with no text is precisely what it is for.
  const m = EMPTY_ELEMENT.exec(bundleHtml);
  assert.equal(m, null, `an empty element rendered: ${m?.[0]}`);
});

test('the chip does not add a cell — the bundle row still matches the header', () => {
  // It lives INSIDE the course cell. A seventh column would break the colSpan
  // and the ratio arithmetic pinned above.
  const headerCount = headerCells(bundleHtml).length;
  const row = rowFor(bundleHtml, BUNDLE_LEG._id);
  assert.equal((row.match(/<td\b/g) ?? []).length, headerCount);
});

/**
 * ══ THE FOLDED ROW: ONE REQUEST, N COURSES ═════════════════════════════════
 *
 * The fixtures above are the UNFOLDED shape — a row per leg, no `legs` array —
 * and they still render, because a one-course row must be byte-identical to
 * what this table drew before the fold. 41 of the 46 records this collection
 * last held were exactly that.
 *
 * These are the other case. They get their own render for the reason the bundle
 * fixtures above give: adding rows to `ROWS` would perturb every geometry
 * assertion in the file for the sake of a few.
 */
const FOLD_REQ = 'ffffffffffffffffffff0010';

const FOLDED = {
  _id: FOLD_REQ,
  courseName: 'Claude AI',
  classDate: '16-17 ก.ย. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  coordinator: { firstName: 'ยานิสา', lastName: 'พงศ์เมธา', email: 'yanisa@example.com' },
  attendeesCount: 2,
  status: 'pending',
  createdAt: '2026-09-05T15:11:29.857Z',
  bundle: { pageId: 'p1', sectionId: 's1', requestId: FOLD_REQ, name: 'Claude AI ครบลูป' },
  legs: [
    { _id: FOLD_REQ, courseName: 'Claude AI', classDate: '16-17 ก.ย. 2569', scheduleType: 'hybrid', attendanceMode: 'teams', status: 'pending' },
    { _id: 'ffffffffffffffffffff0011', courseName: 'Vibe Code L1', classDate: '19-20 ต.ค. 2569', scheduleType: 'classroom', attendanceMode: 'classroom', status: 'pending' },
    { _id: 'ffffffffffffffffffff0012', courseName: 'Vibe Code L2', classDate: '24-25 ก.ย. 2569', scheduleType: 'online', attendanceMode: 'classroom', status: 'pending' },
  ],
  legCount: 3,
  mixedStatus: false,
  statuses: ['pending'],
};

/** The same request with one course cancelled — the divergence case. */
const FOLDED_MIXED = {
  ...FOLDED,
  _id: 'ffffffffffffffffffff0020',
  legs: [
    { ...FOLDED.legs[0], _id: 'ffffffffffffffffffff0020' },
    { ...FOLDED.legs[1], status: 'cancelled' },
    FOLDED.legs[2],
  ],
  mixedStatus: true,
  statuses: ['pending', 'cancelled'],
};

const foldedHtml = renderToStaticMarkup(createElement(PublicTable, {
  items: [FOLDED, FOLDED_MIXED, FULL],
  lastEdited: {},
  detailHref: href,
}));

test('a three-course request is ONE row, and it names all three courses', () => {
  const row = rowFor(foldedHtml, FOLD_REQ);
  for (const name of ['Claude AI', 'Vibe Code L1', 'Vibe Code L2']) {
    assert.ok(row.includes(name), `the folded row does not name ${name}`);
  }
  for (const date of ['16-17 ก.ย. 2569', '19-20 ต.ค. 2569', '24-25 ก.ย. 2569']) {
    assert.ok(row.includes(date), `the folded row does not carry the round ${date}`);
  }
});

test('the chip says HOW MANY courses, which the table could not say before', () => {
  /**
   * A reader could previously see that a row belonged to a package and not how
   * big the package was — so a two-leg wreck of a three-course bundle read as
   * an ordinary two-course bundle. See
   * docs/ticket-bundle-request-completeness-unqueryable.md.
   */
  const row = rowFor(foldedHtml, FOLD_REQ);
  // The COUNT survived the chip losing its package name — a different fact,
  // added to close that ticket, and nothing about dropping the name argued for
  // dropping it.
  assert.match(row, /Bundle · 3 หลักสูตร/);
  // CONTROL: the count is real rather than a constant in the markup — the
  // fixture has three legs, and the name it no longer shows is in the data.
  assert.equal(/Claude AI ครบลูป/.test(row), false, 'the package name is still on the chip');
  assert.equal(/Bundle · 2 หลักสูตร/.test(row), false);
  // …and the fixture DOES carry that name, so the absence above is the chip
  // dropping it rather than an assertion that could never have matched.
  assert.equal(FOLDED.bundle.name, 'Claude AI ครบลูป');
  assert.equal(FOLDED.legs.length, 3);
});

test('one schedule chip per course, so the two columns line up', () => {
  const row = rowFor(foldedHtml, FOLD_REQ);
  // hybrid+teams, classroom, online — three distinct arrangements, all drawn.
  assert.ok(row.includes('Hybrid · Teams'), 'the hybrid leg lost its mode');
  assert.ok(row.includes('Classroom'), 'the classroom leg has no chip');
  assert.ok(row.includes('Online'), 'the online leg has no chip');
});

test('the folded row is TALLER, by exactly one leg-row per extra course', () => {
  /**
   * 82 + 2 × 34 = 150. An inline height, not an assembled `h-[150px]` class,
   * which would compile to no CSS at all — see the note on CellLink.
   */
  const row = rowFor(foldedHtml, FOLD_REQ);
  assert.ok(row.includes('height:150px'), `no computed 150px height on the folded row: ${row.slice(0, 300)}`);
  assert.ok(!row.includes('h-[150px]'), 'the height is an assembled Tailwind class — it emits no CSS');
});

test('CONTROL: a single-course row keeps the fixed 82px class and no inline height', () => {
  // The property that makes every pre-fold assertion in this file still binding.
  const row = rowFor(foldedHtml, FULL._id);
  assert.ok(row.includes('h-[82px]'), 'an unfolded row lost its fixed height class');
  assert.ok(!row.includes('height:'), 'an unfolded row gained an inline height it should not have');
});

test('EVERY cell of the folded row shares the row height', () => {
  // A cell left at 82px would sit against the top of a 150px row and break the
  // line the whole table reads along. Six columns plus the chevron.
  const row = rowFor(foldedHtml, FOLD_REQ);
  const heights = (row.match(/height:150px/g) ?? []).length;
  assert.equal(heights, headerCells(foldedHtml).length,
    `${heights} cells carry the row height, expected ${headerCells(foldedHtml).length}`);
});

test('legs that AGREE draw no divergence note', () => {
  const row = rowFor(foldedHtml, FOLD_REQ);
  assert.ok(!row.includes('data-testid="mixed-status-note"'),
    'an unmixed request is flagged as mixed');
});

test('legs that DISAGREE say so, naming every status present', () => {
  /**
   * The one thing a folded row must not hide. The request is filed under
   * รอดำเนินการ — one cancelled leg does not cancel a request — and the row has
   * to say that a course was cancelled, or it looks like a request whose legs
   * agree.
   */
  const row = rowFor(foldedHtml, FOLDED_MIXED._id);
  assert.ok(row.includes('data-testid="mixed-status-note"'), 'the divergence note is gone');
  assert.match(row, /หลายสถานะ/);
  assert.ok(row.includes('รอดำเนินการ'), 'the note does not name the pending legs');
  assert.ok(row.includes('ยกเลิก'), 'the note does not name the cancelled leg');
});

test('CONTROL: the divergence probe distinguishes the two rows', () => {
  // Without this, "the note is gone" passes for a table that renders no rows.
  const mixed = rowFor(foldedHtml, FOLDED_MIXED._id);
  const clean = rowFor(foldedHtml, FOLD_REQ);
  assert.notEqual(mixed.includes('mixed-status-note'), clean.includes('mixed-status-note'));
});

test('no folded row emits an empty element', () => {
  // Including the aria-hidden spacer that aligns the chip column, which the
  // sweep deliberately tolerates and everything else it does not.
  const m = EMPTY_ELEMENT.exec(foldedHtml);
  assert.equal(m, null, `an empty element rendered: ${m?.[0]}`);
});

test('the folded row still has exactly as many cells as the header', () => {
  const headerCount = headerCells(foldedHtml).length;
  for (const id of [FOLD_REQ, FOLDED_MIXED._id, FULL._id]) {
    const row = rowFor(foldedHtml, id);
    assert.equal((row.match(/<td\b/g) ?? []).length, headerCount, `row ${id} has the wrong cell count`);
  }
});
