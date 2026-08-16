import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InhouseTable } from '@/app/admin/registrations/_components/InhouseTable';
import { PublicTable } from '@/app/admin/registrations/_components/PublicTable';
import { refNo } from '@/lib/refNo';
import { NEUTRAL_STATUS_BADGE, statusLabel } from '@/lib/registrations/statuses';

/**
 * THE IN-HOUSE TABLE AS IT RENDERS.
 *
 * Same discipline as test/render/registrationsPublicTable: sparse fixtures that
 * reach the branches a fully-populated row cannot, assertions on ELEMENTS rather
 * than on text, and `>label<` boundaries throughout because Thai negates by
 * prefix and compounds by suffix with no separator.
 *
 * The fixture set is chosen from the branches this table actually has, and one
 * of those branches was found by a control rather than by reading the code — see
 * NO_NAME_NO_MONTH.
 */

const COURSE_NAMES = { 'sql-pg-query': 'SQL Performance Query Tuning' };

const FULL = {
  _id: 'aaaaaaaaaaaaaaaaaaaa1001',
  companyName: 'บมจ. ตัวอย่าง จำกัด',
  coursesInterested: ['SQL-PG-Query'],
  contactFirstName: 'สมหญิง',
  contactLastName: 'มั่นคง',
  contactEmail: 'somying@example.co.th',
  contactPhone: '081-234-5678',
  participantsCount: 25,
  trainingFormat: 'onsite',
  preferredMonth: '2026-11',
  status: 'quoted',
  createdAt: '2026-08-10T09:00:00.000Z',
};

/** Two courses, so the +N affordance renders. */
const MULTI = {
  ...FULL,
  _id: 'bbbbbbbbbbbbbbbbbbbb1002',
  coursesInterested: ['SQL-PG-Query', 'PWR-BI-ADV'],
};

/**
 * A code that does not resolve, WITH a preferred month.
 *
 * The miss path: the code becomes the headline and is not repeated underneath,
 * so the second row holds the month alone.
 */
const UNRESOLVED = {
  ...FULL,
  _id: 'cccccccccccccccccccc1003',
  coursesInterested: ['GONE-FROM-UPSTREAM'],
  contactPhone: '',
};

/**
 * A code that does not resolve and NO preferred month.
 *
 * ── THE BRANCH THAT EXISTS ONLY BECAUSE A CONTROL LOOKED FOR IT ────────────
 * With the code as the headline and no month, the course cell's second row has
 * NOTHING to put in it. That is the one input this cell can actually receive
 * that produces an empty 32px element — and it is reachable in production: a
 * legacy enquiry naming a withdrawn course, with the month left blank.
 *
 * Every other fixture has either a resolved name (so the code fills the row) or
 * a month (so the month does). Without this row the `hasSecondRow` guard was
 * covered by nothing, which is the same redundancy trap the public table's
 * coordinator cell sprang one commit ago.
 */
const NO_NAME_NO_MONTH = {
  ...FULL,
  _id: 'dddddddddddddddddddd1004',
  coursesInterested: ['ALSO-GONE'],
  preferredMonth: '',
};

/** A status the module has never heard of — see the public table's note. */
const FABRICATED_STATUS = 'zzz-not-a-real-status';
const FOREIGN = { ...FULL, _id: 'eeeeeeeeeeeeeeeeeeee1005', status: FABRICATED_STATUS };

/** Everything optional gone: no company, no courses, no contact, no format. */
const BARE = {
  _id: 'ffffffffffffffffffff1006',
  companyName: '',
  coursesInterested: [],
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  contactPhone: '',
  participantsCount: undefined,
  trainingFormat: '',
  preferredMonth: '',
  status: 'pending',
  createdAt: '2026-05-13T09:00:00.000Z',
};

/**
 * A course that DOES resolve, with no preferred month.
 *
 * ── NEWLY REACHABLE, AND THAT IS THE POINT ────────────────────────────────
 * While the course cell's second row also held the CODE, a resolved course
 * always had something to put in it — so "resolved, no month" could not produce
 * an empty row and no fixture covered it. Removing the code line makes the month
 * that row's only content, so this branch exists for the first time.
 *
 * The same lesson as the public table's coordinator cell one round ago: a guard
 * is only real if a fixture can reach the branch it guards.
 */
const RESOLVED_NO_MONTH = {
  ...FULL,
  _id: 'aaaaaaaaaaaaaaaaaaaa1007',
  preferredMonth: '',
};

const ROWS = [FULL, MULTI, UNRESOLVED, NO_NAME_NO_MONTH, RESOLVED_NO_MONTH, FOREIGN, BARE];

/**
 * NO `lastEdited` — the table no longer accepts one. The audit hint was ruled
 * out for this table; the both-directions guard below renders the PUBLIC table
 * with a real entry to prove the ruling did not sweep across both.
 */
const html = renderToStaticMarkup(createElement(InhouseTable, {
  items: ROWS,
  courseNames: COURSE_NAMES,
}));

const empty = renderToStaticMarkup(createElement(InhouseTable, {
  items: [], courseNames: {},
}));

/** Sliced from AFTER the opening tag — `<thead>` itself starts with `<th`. */
function headerCells(markup) {
  const start = markup.indexOf('<thead');
  assert.notEqual(start, -1, 'no <thead> — the table did not render');
  const open = markup.indexOf('>', start);
  const end = markup.indexOf('</thead>', open);
  assert.notEqual(end, -1, 'unterminated <thead>');
  return markup.slice(open + 1, end).split('<th').slice(1);
}

function rowFor(markup, id) {
  const body = markup.slice(markup.indexOf('<tbody'), markup.indexOf('</tbody>'));
  const row = body.split('<tr').slice(1).find((r) => r.includes(`/inhouse/${id}`));
  assert.ok(row, `no row rendered for ${id}`);
  return row;
}

const EMPTY_ELEMENT = /<(p|span|div)\b(?![^>]*aria-hidden="true")[^>]*><\/\1>/;

// ── 1. The column set ───────────────────────────────────────────────────────

test('the header has exactly eight columns: seven labelled plus the chevron', () => {
  // WAS 7. รูปแบบ / จำนวน split into two columns, mirroring the public table's
  // รูปแบบ extraction. Re-pointed, not relaxed to a floor.
  const cells = headerCells(html);
  assert.equal(cells.length, 8, `expected 8 header cells, found ${cells.length}`);
});

test('the in-house headings are the measured set', () => {
  // WAS one 'รูปแบบ / จำนวน' heading; now two.
  const cells = headerCells(html).join('|');
  for (const h of ['วันที่ส่งคำขอ', 'บริษัท', 'หลักสูตรที่สนใจ', 'ผู้ประสานงาน', 'รูปแบบ', 'จำนวน', 'สถานะ']) {
    assert.ok(cells.includes(`>${h}<`), `in-house header missing: ${h}`);
  }
  // The merged heading is gone, element-bounded so 'รูปแบบ' above cannot satisfy it.
  assert.equal(cells.includes('>รูปแบบ / จำนวน<'), false, 'the merged heading is back');
});

/**
 * AN IN-HOUSE ROW CARRIES NO PUBLIC HEADER, AND VICE VERSA — asserted from the
 * two real components rather than by reading one and trusting the other.
 *
 * The defect this guards is a document rendered through the other collection's
 * cells: it produced a row of em-dashes and a สถานะ of `confirmed`, which is not
 * a value an in-house enquiry can hold.
 */
test('the in-house table emits none of the public headings', () => {
  const cells = headerCells(html).join('|');
  for (const h of ['หลักสูตร / รอบอบรม', 'วันที่สมัคร', 'ผู้เข้าอบรม']) {
    assert.ok(!cells.includes(`>${h}<`), `a public header leaked onto the in-house table: ${h}`);
  }
});

test('the public table emits none of the in-house headings', () => {
  const publik = renderToStaticMarkup(createElement(PublicTable, {
    items: [], detailHref: (id) => `/admin/registrations/${id}`,
  }));
  /**
   * `รูปแบบ` IS DELIBERATELY NOT IN THIS LIST — it is now a heading on BOTH
   * tables, so asserting its absence from public would be red on correct code.
   * `จำนวน` takes its place as the in-house-only half of the split; public calls
   * the same quantity ผู้เข้าอบรม.
   */
  const cells = headerCells(publik).join('|');
  for (const h of ['วันที่ส่งคำขอ', 'บริษัท', 'หลักสูตรที่สนใจ', 'จำนวน']) {
    assert.ok(!cells.includes(`>${h}<`), `an in-house header leaked onto the public table: ${h}`);
  }
});

test('the removed in-house columns are gone, header and body', () => {
  const cells = headerCells(html).join('|');
  /**
   * `รูปแบบ` LEFT THIS LIST. It was "removed" only in the sense that it had been
   * merged into รูปแบบ / จำนวน; it is a real column now, on both tables. The two
   * that remain are genuinely folded into cells — the reference number is gone
   * entirely, and the month is the course cell's second line.
   */
  for (const h of ['เลขอ้างอิง', 'เดือนที่สนใจ']) {
    assert.ok(!cells.includes(`>${h}<`), `a removed column is back: ${h}`);
  }
  assert.ok(!html.includes(refNo(FULL._id)), 'the row still prints a reference number');
});

test('the empty-state colSpan matches the header width', () => {
  assert.match(empty, /ไม่พบรายการที่ตรงกับเงื่อนไข/, 'the empty state must be what rendered');
  const m = empty.match(/<td[^>]*colspan="(\d+)"/i);
  assert.ok(m, 'the empty-state cell carries no colSpan');
  assert.equal(Number(m[1]), headerCells(empty).length, 'the empty row spans the wrong number of columns');
});

// ── 2. The row is a real link ───────────────────────────────────────────────

test('every cell of a row is an anchor to the IN-HOUSE detail route', () => {
  /**
   * The route matters as much as the anchor. `register_public` and
   * `register_inhouse` are separate collections, so an in-house `_id` sent to
   * `/admin/registrations/[id]` finds nothing and the page calls `notFound()` —
   * a 404 on a record that exists, with a working page one segment away.
   */
  const row = rowFor(html, FULL._id);
  const anchors = row.match(/<a\b[^>]*>/g) ?? [];
  // WAS 7. Eight cells since the รูปแบบ / จำนวน split.
  assert.equal(anchors.length, 8, `expected one anchor per cell, found ${anchors.length}`);
  for (const a of anchors) {
    assert.ok(a.includes(`href="/admin/registrations/inhouse/${FULL._id}"`),
      `an anchor points somewhere else: ${a}`);
  }
});

/**
 * ── THE BODY HAS AS MANY CELLS AS THE HEADER, AND NOTHING ELSE ASSERTED IT ──
 *
 * FOUND BY A CONTROL. Adding an entry to `COLUMNS` adds a `<th>` and a `<col>`,
 * because the header and the colgroup are DERIVED from that array — but the
 * body's `<td>`s are hand-written one per column in the JSX and do not follow.
 * So a column can be added to the header with no cell beneath it, and the
 * existing guards all survive it: the anchor count is about the body alone, the
 * ratio test about the colgroup alone, and the empty-state `colSpan` is derived
 * from the same array as the header so those two agree with each other while
 * both disagree with the body.
 *
 * The rehearsal's eighth-column case reddened three structural tests and none of
 * them was this one, which is how the gap surfaced. Every row is checked, not
 * just the first, since a per-row conditional could desynchronise one of them.
 */
test('every body row has exactly as many cells as the header', () => {
  const headers = headerCells(html).length;
  const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  assert.equal(rows.length, ROWS.length, `expected ${ROWS.length} body rows, found ${rows.length}`);

  rows.forEach((row, i) => {
    const cells = (row.match(/<td\b/g) ?? []).length;
    assert.equal(cells, headers,
      `body row ${i} has ${cells} cells against ${headers} header cells. The header and the `
      + 'colgroup are derived from COLUMNS; the body cells are hand-written and do not follow.');
  });
});

test('a row has exactly ONE keyboard tab stop', () => {
  const anchors = rowFor(html, FULL._id).match(/<a\b[^>]*>/g) ?? [];
  const stops = anchors.filter((a) => !a.includes('tabindex="-1"'));
  assert.equal(stops.length, 1, `expected 1 tab stop per row, found ${stops.length}`);
  assert.ok(anchors[0] === stops[0], 'the tab stop is not the first cell — tab order would jump');
});

// ── 3. No empty element where an optional line was dropped ──────────────────

test('no row emits an empty element', () => {
  const m = EMPTY_ELEMENT.exec(html);
  assert.equal(m, null,
    `an empty element rendered: ${m?.[0]}. Every optional line must be absent, not blank.`);
});

test('an unresolved code with NO month drops the second row entirely', () => {
  /**
   * The branch a control had to go looking for. With the code as the headline
   * and no month, the 32px second row has nothing to hold — so it must not
   * render at all rather than render empty.
   */
  const row = rowFor(html, NO_NAME_NO_MONTH._id);
  const m = EMPTY_ELEMENT.exec(row);
  assert.equal(m, null, `the second row rendered empty: ${m?.[0]}`);
  assert.ok(row.includes('>ALSO-GONE<'), 'the code did not become the headline');
});

/**
 * ── AN UNRESOLVED COURSE SHOWS ITS CODE, AND THAT IS THE CHOSEN FALLBACK ───
 *
 * The lookup can miss — upstream down, a course withdrawn, an id that no longer
 * exists — and in-house requests reference courses by code, so this is a real
 * data state rather than a hypothetical. The CODE takes the name slot.
 *
 * Chosen over a placeholder because the record genuinely holds the code and
 * nothing else identifies the course; "—" would replace the only identifying
 * string on the row with a word.
 */
test('an unresolved course renders its CODE in the name slot, never empty', () => {
  const row = rowFor(html, UNRESOLVED._id);
  assert.ok(row.includes('>GONE-FROM-UPSTREAM<'), 'the code did not become the headline');
  assert.ok(row.includes('>พ.ย. 2569<'), 'the preferred month did not render');

  // The cell is not empty and not a dash — the fallback is the code itself.
  const cell = row.split('<td').slice(1)[2];
  assert.ok(cell.includes('>GONE-FROM-UPSTREAM<'), 'the course cell does not hold the code');
  assert.equal(EMPTY_ELEMENT.exec(cell), null, 'the course cell emitted an empty element');
});

/**
 * ── NO COURSE CODE LINE ANYWHERE, AND THIS REPLACES A GUARD THAT WENT VACUOUS
 *
 * This slot used to hold `the code is repeated under itself` — an assertion that
 * the headline code did not ALSO appear as the second line. Removing the code
 * line made that unfalsifiable: with no code element left, no row can duplicate
 * one, so it would have passed forever while asserting nothing.
 *
 * The claim that is still worth making is the inverse and it is stronger: a
 * RESOLVED course shows no code at all. Element boundaries, not substrings —
 * the code is deliberately still in the cell's `title` attribute so a reader can
 * hover for it, and a bare `includes()` would match that and pass for the wrong
 * reason.
 */
test('a resolved course shows NO code element — the code line is gone', () => {
  const row = rowFor(html, FULL._id);
  assert.ok(row.includes('>SQL Performance Query Tuning<'), 'the course name did not resolve');
  assert.equal(row.includes('>SQL-PG-Query<'), false, 'the course code line is back');
  assert.ok(row.includes('>พ.ย. 2569<'), 'the preferred month did not render');

  // …and it IS still reachable on hover, which is why the assertion above has to
  // be element-bounded rather than a substring scan.
  assert.ok(row.includes('SQL-PG-Query'), 'the code left the title attribute too');
});

test('the course cell is bold name over the month — two lines, not one shared line', () => {
  /**
   * WHAT THE MARKUP ACTUALLY DID BEFORE: the code and the month sat SIDE BY SIDE
   * in one `flex … gap-[7px]` row, which is what the screenshot showed and is not
   * the two-line shape the round-3 brief described. Verified in the markup rather
   * than taken from the commit message.
   *
   * AFTER: the second row holds one element. Asserted as a COUNT, because "the
   * month renders" is equally true of the old shape.
   */
  const cell = rowFor(html, FULL._id).split('<td').slice(1)[2];
  const rows = cell.match(/<div class="flex h-\[32px\][^"]*"/g) ?? [];
  assert.equal(rows.length, 1, `expected one 32px row in the course cell, found ${rows.length}`);

  const second = cell.slice(cell.indexOf('h-[32px]'));
  const spans = second.match(/<span\b/g) ?? [];
  assert.equal(spans.length, 1,
    `the course cell's second row holds ${spans.length} elements, expected only the month`);
  assert.ok(second.includes('>พ.ย. 2569<'), 'the one element is not the month');
});

test('a resolved course with NO month drops the second row entirely', () => {
  // NEWLY REACHABLE. While the code line existed, a resolved course always had
  // something for that row; now the month is its only content, so this branch
  // exists for the first time and must be absent rather than empty.
  const row = rowFor(html, RESOLVED_NO_MONTH._id);
  assert.ok(row.includes('>SQL Performance Query Tuning<'), 'the course name did not resolve');
  assert.equal(EMPTY_ELEMENT.exec(row), null, 'the missing month left an empty 32px row');
  assert.equal(row.includes('h-[32px]'), false, 'the second row rendered with nothing in it');
});

test('เดือนที่สนใจ has a home — it did not leave with its column', () => {
  /**
   * The field was ASKED ABOUT rather than inferred away: it renders today, it
   * was not on the removal list, and the geometry simply gave it no column. It
   * now shares the course cell's second row with the code, mirroring the public
   * course cell where that slot holds the round date.
   *
   * Asserted as a claim of its own so the decision is greppable, not just a side
   * effect of the course-cell tests above.
   */
  assert.ok(html.includes('>พ.ย. 2569<'), 'preferredMonth is not rendered anywhere');
  assert.ok(!headerCells(html).join('|').includes('เดือนที่สนใจ'), 'it also kept a column');
});

test('the multi-course row counts its extras rather than truncating silently', () => {
  const row = rowFor(html, MULTI._id);
  assert.ok(row.includes('>+1<'), 'a second course was dropped with no trace');
  // Every code is still reachable on hover.
  assert.ok(row.includes('PWR-BI-ADV'), 'the extra code is not in the title attribute');
});

test('the bare row renders dashes, not blanks, and still no empty element', () => {
  const row = rowFor(html, BARE._id);
  const m = EMPTY_ELEMENT.exec(row);
  assert.equal(m, null, `the bare row emits an empty element: ${m?.[0]}`);
  // Company, courses, contact, format and count are all missing; each must say
  // so rather than render nothing.
  assert.ok(row.split('>—<').length - 1 >= 4, 'the bare row rendered fewer dashes than it has empty cells');
  assert.ok(row.includes('>13 พ.ค. 2569<'), 'the bare row lost its request date');
});

/**
 * ── THE AUDIT HINT IS IN-HOUSE-OUT AND PUBLIC-IN, BOTH DIRECTIONS ──────────
 *
 * Round 3 moved `LastEditedHint` INTO the in-house วันที่ส่งคำขอ cell to mirror
 * public. Seen in place, it was ruled back out — "13 ชม. ที่แล้ว · Yanisa P."
 * under every request date is a second timestamp competing with the one the
 * column exists for. PUBLIC KEEPS IT.
 *
 * Asserted in BOTH directions on purpose. A one-sided test ("in-house has no
 * hint") is satisfied by a sweep that deleted it from both tables, which is the
 * likelier mistake here than a re-add: the two tables share `DateCell`, so the
 * hint lives one call site away from a change that looks table-agnostic.
 *
 * The fixture DOES carry an audit entry for the public row, so the public half
 * cannot pass merely because no entry was supplied.
 */
test('the in-house row carries NO audit hint, and the public row still does', () => {
  const entry = { createdAt: '2026-08-13T09:00:00.000Z', actorName: 'ฝ่ายขาย' };

  /**
   * ── THE IN-HOUSE HALF IS RENDERED *WITH* AN AUDIT MAP, DELIBERATELY ───────
   *
   * MEASURED: the first version of this asserted against the module-level
   * `html`, which supplies no `lastEdited` at all. Restoring the prop AND the
   * `entry={…}` argument to DateCell left it GREEN — the component was wired to
   * render the hint again and there was simply no data to render, so the absence
   * proved nothing about the component.
   *
   * It also carried `assert.equal(/lastEdited/.test(html), false)`, which was
   * pure decoration: `lastEdited` is a PROP NAME and can never appear in markup,
   * so that line was true of every possible render.
   *
   * Handing the table a map it does not accept is the point. React drops unknown
   * props on a component, so this is harmless — and it turns the claim from
   * "no hint rendered" into "no hint rendered EVEN WHEN THE DATA IS THERE",
   * which is the one a re-add can fail.
   */
  const withMap = renderToStaticMarkup(createElement(InhouseTable, {
    items: [FULL],
    courseNames: COURSE_NAMES,
    lastEdited: { [FULL._id]: entry },
  }));
  assert.equal(withMap.includes('ฝ่ายขาย'), false,
    'the audit hint is back on the in-house table — it renders when handed an entry');
  assert.equal(html.includes('ฝ่ายขาย'), false, 'the audit hint is back on the in-house table');

  // Public: still renders, from the same shared DateCell.
  const publik = renderToStaticMarkup(createElement(PublicTable, {
    items: [{
      _id: 'aaaaaaaaaaaaaaaaaaaa0001', courseName: 'x', status: 'confirmed',
      createdAt: '2026-08-01T00:00:00.000Z', coordinator: {},
    }],
    lastEdited: { aaaaaaaaaaaaaaaaaaaa0001: entry },
    detailHref: (id) => `/admin/registrations/${id}`,
  }));
  assert.ok(publik.includes('ฝ่ายขาย'),
    'the PUBLIC table lost its audit hint too — this was an in-house-only ruling');
});

// ── 4. รูปแบบ / จำนวน, and contactPhone ─────────────────────────────────────

/**
 * ── รูปแบบ AND จำนวน ARE SEPARATE COLUMNS, EACH HOLDING ONE ELEMENT ────────
 *
 * WAS `the mode cell renders the format chip over the participant count`, which
 * asserted both things were in ONE cell. That test could not tell a stacked pair
 * from a split pair — both render the chip and the number somewhere in the row —
 * so it is replaced by a per-CELL claim rather than merely re-pointed.
 *
 * Cells in column order: requested, company, course, coordinator, format, count,
 * status, chevron.
 */
test('รูปแบบ and จำนวน are separate cells, each with exactly one element', () => {
  const cells = rowFor(html, FULL._id).split('<td').slice(1);

  const format = cells[4];
  assert.ok(format.includes('>Onsite<'), 'the รูปแบบ cell does not hold the format chip');
  assert.equal(format.includes('>25<'), false, 'the count is still in the รูปแบบ cell');
  assert.equal((format.match(/<(p|span|div)\b/g) ?? []).length, 1,
    'the รูปแบบ cell holds more than the chip');

  const count = cells[5];
  assert.ok(count.includes('>25<'), 'the จำนวน cell does not hold the count');
  assert.equal(count.includes('Onsite'), false, 'the chip is still in the จำนวน cell');
  assert.equal((count.match(/<(p|span|div)\b/g) ?? []).length, 1,
    'the จำนวน cell holds more than the number');
});

/**
 * THE HEADCOUNT IS A BARE NUMBER, PHRASED AS THE PUBLIC TABLE PHRASES ITS OWN.
 *
 * The design's dark strip elsewhere reads "ประมาณ 15 คน". Not used here, and the
 * deciding reason is not consistency (though that was the instruction) — it is
 * that "ประมาณ" is a claim about the DATA which the field does not make.
 * `participantsCount` is a stored number with a schema minimum of 15 and is not
 * flagged as an estimate anywhere. A summary strip may hedge; a data table
 * stating "approximately" would assert an imprecision the record does not
 * record, which is the rule this table already keeps for its format and status
 * chips.
 *
 * Asserted against the PUBLIC cell's own classes, derived from a real public
 * render, so the two cannot drift into phrasing a headcount two ways.
 */
test('จำนวน renders a bare number, with the same treatment as public ผู้เข้าอบรม', () => {
  const inhouseCount = rowFor(html, FULL._id).split('<td').slice(1)[5];
  for (const word of ['ประมาณ', 'คน']) {
    assert.equal(inhouseCount.includes(word), false,
      `the จำนวน cell phrases its number with "${word}" — public renders a bare count`);
  }

  const publik = renderToStaticMarkup(createElement(PublicTable, {
    items: [{
      _id: 'aaaaaaaaaaaaaaaaaaaa0001', courseName: 'x', status: 'confirmed',
      createdAt: '2026-08-01T00:00:00.000Z', coordinator: {}, attendeesCount: 25,
    }],
    lastEdited: {}, detailHref: (id) => `/admin/registrations/${id}`,
  }));
  const publicCount = publik.slice(publik.indexOf('<tbody')).split('<td').slice(1)[4];
  assert.ok(publicCount.includes('>25<'), 'the public attendee cell did not render its number');

  // The same classes on both, read off the two renders rather than typed here.
  const classOf = (cell) => /<p class="([^"]*)"/.exec(cell)?.[1];
  assert.equal(classOf(inhouseCount), classOf(publicCount),
    `the two headcounts are styled differently:\n  in-house: ${classOf(inhouseCount)}\n  public:   ${classOf(publicCount)}`);
});

test('an unknown training format renders ITSELF, never a substituted default', () => {
  /**
   * The rule this chip exists to keep: no branch may substitute a value the
   * document does not hold. ScheduleBadge treats a falsy type as "Classroom",
   * which is correct for a public class and is a lie about an in-house enquiry —
   * that is how the pre-split table asserted a schedule type on every row.
   */
  const odd = renderToStaticMarkup(createElement(InhouseTable, {
    items: [{ ...FULL, _id: 'aaaaaaaaaaaaaaaaaaaa9999', trainingFormat: 'hologram' }],
    courseNames: COURSE_NAMES,
  }));
  assert.ok(odd.includes('>hologram<'), 'an unrecognised format was replaced rather than shown');
  assert.ok(!odd.includes('Classroom'), 'the in-house table invented a schedule type');
});

test('a missing training format renders a dash, and the count still renders', () => {
  const row = rowFor(html, BARE._id);
  assert.ok(row.includes('>—<'), 'the absent format rendered nothing at all');
});

test('contactPhone stays — it is the third line of the coordinator cell', () => {
  // Kept by ruling. This is the one place the table deliberately exceeds the
  // geometry, which draws two lines for that cell.
  assert.ok(rowFor(html, FULL._id).includes('>081-234-5678<'), 'the contact phone is gone');
  // And a row without one renders two lines, not two and a blank.
  const noPhone = rowFor(html, UNRESOLVED._id);
  assert.ok(!noPhone.includes('081-234-5678'), 'the phone leaked onto a row without one');
  assert.equal(EMPTY_ELEMENT.exec(noPhone), null, 'the missing phone left an empty element');
});

// ── 5. The status cell ──────────────────────────────────────────────────────

test('the สถานะ cell contains exactly one element: the chip', () => {
  for (const row of ROWS) {
    // Column order: requested, company, course, coordinator, mode, status, chevron.
    const cell = rowFor(html, row._id).split('<td').slice(1)[6];
    assert.ok(cell, 'the status cell did not render');
    const elements = cell.match(/<(p|span|div)\b/g) ?? [];
    assert.equal(elements.length, 1,
      `the สถานะ cell renders ${elements.length} elements, expected only the chip. `
      + 'A second line under the chip is ruled out — including as "—" or any other placeholder.');
  }
});

test('CONTROL: the cell extractor lands on the สถานะ column', () => {
  const cells = rowFor(html, FULL._id).split('<td').slice(1);
  // Column order after the split: requested, company, course, coordinator,
  // format, count, status, chevron. All three anchors, so a shift of any size
  // is caught rather than only a shift past the status cell.
  assert.ok(cells[6].includes(statusLabel('quoted')), 'cell 6 is not the status cell');
  assert.ok(cells[5].includes('>25<'), 'cell 5 is not the จำนวน cell — the indices have shifted');
  assert.ok(cells[4].includes('>Onsite<'), 'cell 4 is not the รูปแบบ cell — the indices have shifted');
});

test('an unrecognised status renders its raw value and the NEUTRAL chip', () => {
  const row = rowFor(html, FOREIGN._id);
  assert.ok(row.includes(`>${FABRICATED_STATUS}<`),
    'the cell hid an unknown status instead of showing what the record holds');
  assert.ok(row.includes(NEUTRAL_STATUS_BADGE),
    'the cell did not fall back to the neutral chip — it is reading a local colour map');
});

test('the in-house table never renders ชำระแล้ว — `paid` is not in its vocabulary', () => {
  // The round-2 ruling, asserted where a reader would look for it. An in-house
  // engagement is settled off-platform with no Omise charge, so nothing in the
  // system ever observes the money arriving.
  assert.ok(!html.includes(statusLabel('paid')), '`paid` reached the in-house table');
  assert.ok(!html.includes('🔒'), 'a lock glyph is welded into a status label');
});

// ── 6. The widths are proportions ───────────────────────────────────────────

test('every content column is a proportion, and only the chevron is fixed', () => {
  const cols = html.match(/<col style="width:([^"]*)"/g) ?? [];
  assert.equal(cols.length, 8, `expected 8 <col> elements, found ${cols.length}`);
  const widths = cols.map((c) => /width:([^"]*)/.exec(c)[1]);
  for (const w of widths.slice(0, 7)) {
    assert.ok(w.includes('calc(') && w.includes('100%'), `a content column is not proportional: ${w}`);
  }
  assert.match(widths[7], /^\d+px$/, `the chevron column is not fixed: ${widths[7]}`);
});

/**
 * The in-house สถานะ column, held to the same derived floor as the public one —
 * and it is the TIGHTER of the two.
 *
 * RE-MEASURED AFTER THE รูปแบบ / จำนวน SPLIT. The extra column added a seventh
 * 16px gap, so chrome went 151px → 167px and this cell went 144.2px → 142.4px
 * WITHOUT its share changing. Against the 135px floor — the widest live label at
 * a stated 0.65em advance plus 18px of padding — the headroom is 7.4px, down
 * from 9.2px. Public, at 10.9% and 163px of chrome, has 154.8px and 19.8px.
 *
 * Still positive, so สถานะ stays at 10.0%. It was NOT raised to 11.0%: that
 * remains the standing proposal if the click-test shows the chip overflowing,
 * taking the 1.0% back from หลักสูตรที่สนใจ for ~158px.
 *
 * A column added to this table narrows สถานะ again without anyone editing its
 * share, which is exactly why this floor is asserted rather than assumed.
 */
test('the สถานะ column clears the widest live label at a stated 0.65em advance', () => {
  const CONTAINER = 1440;
  const widths = (html.match(/<col style="width:([^"]*)"/g) ?? [])
    .map((c) => /width:([^"]*)/.exec(c)[1]);

  const m = /^calc\(\(100% - ([\d.]+)px\) \* ([\d.]+) \+ ([\d.]+)px\)$/.exec(widths[6]);
  assert.ok(m, `the สถานะ width is not a calc this test can evaluate: ${widths[6]}`);
  const [, chrome, ratio] = m.map(Number);
  const content = (CONTAINER - chrome) * ratio;

  const label = statusLabel('quoted');
  const advancing = [...label].filter((ch) => !/[ัิ-ฺ็-๎]/.test(ch)).length;
  const floor = advancing * 12 * 0.65 + 18;

  assert.ok(
    content >= floor,
    `the in-house สถานะ column gives the chip ${content.toFixed(1)}px but the widest live label `
    + `(${JSON.stringify(label)}) needs about ${floor.toFixed(1)}px at a 0.65em advance.`,
  );
});

test('the column ratios are the measured in-house shares, normalised', () => {
  const widths = (html.match(/<col style="width:([^"]*)"/g) ?? [])
    .map((c) => /width:([^"]*)/.exec(c)[1]);
  const ratios = widths.slice(0, 7).map((w) => Number(/\*\s*([\d.]+)/.exec(w)[1]));

  /**
   * REVISED after the click-test: สถานะ 12.2 → 10.0, and the 2.2% goes to
   * หลักสูตรที่สนใจ 20.8 → 23.0 — the in-house column most likely to truncate,
   * since it carries a full course NAME over its code and preferred month. The
   * total is unchanged at 89.4%, so the chrome stays 151px.
   */
  const shares = [10.0, 17.2, 24.2, 16.5, 6.5, 5.0, 10.0];
  const total  = shares.reduce((a, b) => a + b, 0);
  ratios.forEach((r, i) => {
    assert.ok(Math.abs(r - shares[i] / total) < 1e-5,
      `column ${i} has ratio ${r}, expected ${(shares[i] / total).toFixed(6)}`);
  });
  assert.ok(Math.abs(ratios.reduce((a, b) => a + b, 0) - 1) < 1e-5, 'the ratios do not sum to 1');
});

test('CONTROL: the in-house gap is 16px, not the public 18px', () => {
  /**
   * The two tables use different gaps — seven columns against six — and the gap
   * feeds the chrome constant that the ratios are calculated against. If both
   * used one number the width tests here and in the public file would be the
   * same test written twice.
   *
   * Read off the rendered padding rather than the source, so it is the value the
   * browser gets.
   */
  assert.ok(html.includes('padding-right:16px'), 'the in-house gap is not 16px');
  assert.ok(!html.includes('padding-right:18px'), 'an 18px gap leaked in from the public table');
});
