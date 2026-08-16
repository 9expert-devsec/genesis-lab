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

const ROWS = [FULL, MULTI, UNRESOLVED, NO_NAME_NO_MONTH, FOREIGN, BARE];

const html = renderToStaticMarkup(createElement(InhouseTable, {
  items: ROWS,
  lastEdited: { [FULL._id]: { createdAt: '2026-08-13T09:00:00.000Z', actorName: 'ฝ่ายขาย' } },
  courseNames: COURSE_NAMES,
}));

const empty = renderToStaticMarkup(createElement(InhouseTable, {
  items: [], lastEdited: {}, courseNames: {},
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

test('the header has exactly seven columns: six labelled plus the chevron', () => {
  const cells = headerCells(html);
  assert.equal(cells.length, 7, `expected 7 header cells, found ${cells.length}`);
});

test('the in-house headings are the measured set', () => {
  const cells = headerCells(html).join('|');
  for (const h of ['วันที่ส่งคำขอ', 'บริษัท', 'หลักสูตรที่สนใจ', 'ผู้ประสานงาน', 'รูปแบบ / จำนวน', 'สถานะ']) {
    assert.ok(cells.includes(`>${h}<`), `in-house header missing: ${h}`);
  }
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
    items: [], lastEdited: {}, detailHref: (id) => `/admin/registrations/${id}`,
  }));
  const cells = headerCells(publik).join('|');
  for (const h of ['วันที่ส่งคำขอ', 'บริษัท', 'หลักสูตรที่สนใจ', 'รูปแบบ / จำนวน']) {
    assert.ok(!cells.includes(`>${h}<`), `an in-house header leaked onto the public table: ${h}`);
  }
});

test('the removed in-house columns are gone, header and body', () => {
  const cells = headerCells(html).join('|');
  for (const h of ['เลขอ้างอิง', 'เดือนที่สนใจ', 'รูปแบบ']) {
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
  assert.equal(anchors.length, 7, `expected one anchor per cell, found ${anchors.length}`);
  for (const a of anchors) {
    assert.ok(a.includes(`href="/admin/registrations/inhouse/${FULL._id}"`),
      `an anchor points somewhere else: ${a}`);
  }
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

test('an unresolved code WITH a month keeps the row, showing the month alone', () => {
  // The other half of the same fork. The code is the headline and is NOT
  // repeated underneath — repeating it under itself says nothing.
  const row = rowFor(html, UNRESOLVED._id);
  assert.ok(row.includes('>GONE-FROM-UPSTREAM<'), 'the code did not become the headline');
  assert.ok(row.includes('>พ.ย. 2569<'), 'the preferred month did not render');
  assert.equal(row.split('>GONE-FROM-UPSTREAM<').length - 1, 1,
    'the code is repeated under itself');
});

test('a resolved course shows the NAME over the code, with the month beside it', () => {
  const row = rowFor(html, FULL._id);
  assert.ok(row.includes('>SQL Performance Query Tuning<'), 'the course name did not resolve');
  assert.ok(row.includes('>SQL-PG-Query<'), 'the code line is missing under the name');
  assert.ok(row.includes('>พ.ย. 2569<'), 'the preferred month did not render');
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

test('the audit hint renders on the row that has one and NOT on the rows that do not', () => {
  assert.ok(rowFor(html, FULL._id).includes('ฝ่ายขาย'), 'the audit hint did not render where there is an entry');
  assert.ok(!rowFor(html, BARE._id).includes('ฝ่ายขาย'), 'the hint leaked onto a row with no entry');
});

// ── 4. รูปแบบ / จำนวน, and contactPhone ─────────────────────────────────────

test('the mode cell renders the format chip over the participant count', () => {
  const row = rowFor(html, FULL._id);
  assert.ok(row.includes('>Onsite<'), 'the training-format chip did not render');
  assert.ok(row.includes('>25<'), 'the participant count did not render');
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
    lastEdited: {}, courseNames: COURSE_NAMES,
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
    const cell = rowFor(html, row._id).split('<td').slice(1)[5];
    assert.ok(cell, 'the status cell did not render');
    const elements = cell.match(/<(p|span|div)\b/g) ?? [];
    assert.equal(elements.length, 1,
      `the สถานะ cell renders ${elements.length} elements, expected only the chip. `
      + 'A second line under the chip is ruled out — including as "—" or any other placeholder.');
  }
});

test('CONTROL: the cell extractor lands on the สถานะ column', () => {
  const cells = rowFor(html, FULL._id).split('<td').slice(1);
  assert.ok(cells[5].includes(statusLabel('quoted')), 'cell 5 is not the status cell');
  assert.ok(cells[4].includes('>25<'), 'cell 4 is not the mode cell — the indices have shifted');
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
  assert.equal(cols.length, 7, `expected 7 <col> elements, found ${cols.length}`);
  const widths = cols.map((c) => /width:([^"]*)/.exec(c)[1]);
  for (const w of widths.slice(0, 6)) {
    assert.ok(w.includes('calc(') && w.includes('100%'), `a content column is not proportional: ${w}`);
  }
  assert.match(widths[6], /^\d+px$/, `the chevron column is not fixed: ${widths[6]}`);
});

/**
 * The in-house สถานะ column, held to the same derived floor as the public one —
 * and it is the TIGHTER of the two.
 *
 * 10.0% of 89.4 against a 151px chrome gives the chip 144.2px, where public's
 * 10.9% gives 154.8px. Both clear the 135px floor (the widest live label at a
 * stated 0.65em advance plus 18px of padding), but in-house does so by ~9px.
 * That margin is recorded in the report and is the first thing to eyeball on the
 * click-test; if it turns out to overflow, 11.0% here — taking 1.0% back from
 * หลักสูตรที่สนใจ — gives ~158.6px and clears even a pessimistic 0.75em.
 */
test('the สถานะ column clears the widest live label at a stated 0.65em advance', () => {
  const CONTAINER = 1440;
  const widths = (html.match(/<col style="width:([^"]*)"/g) ?? [])
    .map((c) => /width:([^"]*)/.exec(c)[1]);

  const m = /^calc\(\(100% - ([\d.]+)px\) \* ([\d.]+) \+ ([\d.]+)px\)$/.exec(widths[5]);
  assert.ok(m, `the สถานะ width is not a calc this test can evaluate: ${widths[5]}`);
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
  const ratios = widths.slice(0, 6).map((w) => Number(/\*\s*([\d.]+)/.exec(w)[1]));

  /**
   * REVISED after the click-test: สถานะ 12.2 → 10.0, and the 2.2% goes to
   * หลักสูตรที่สนใจ 20.8 → 23.0 — the in-house column most likely to truncate,
   * since it carries a full course NAME over its code and preferred month. The
   * total is unchanged at 89.4%, so the chrome stays 151px.
   */
  const shares = [11.2, 17.2, 23.0, 16.5, 11.5, 10.0];
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
