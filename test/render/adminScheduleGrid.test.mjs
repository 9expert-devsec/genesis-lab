import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchedulesAdminClient } from '@/app/admin/schedules/_components/SchedulesAdminClient';
import { TRAINING_TYPE_COLOR } from '@/lib/schedule/trainingTypeColor';

/**
 * /admin/schedules RENDERS THE PUBLIC TABLE'S VISUAL LANGUAGE.
 *
 * Three things reach the markup here and are asserted directly:
 *
 *   1. the round LABEL is `formatRoundDays`, so non-consecutive days list and
 *      cross-month rounds print their months (the pure half is in
 *      test/pure/adminScheduleRoundLabel);
 *   2. the dot and the border are the TRAINING TYPE from the one shared
 *      palette, with the status moved to a word underneath;
 *   3. a cross-month round SPANS its columns via `colSpan` while a round inside
 *      one month stays aligned under it — lib/schedule/monthLanes' packing,
 *      reaching this grid for the first time.
 *
 * ── THE FIXTURE IS ON FIXED MONTHS, NOT THE CLOCK ───────────────────────────
 * Unlike the sibling /schedule render tests, which roll off `new Date()`
 * because nothing can move the clock for them, this component takes its month
 * columns straight from the `monthFrom`/`monthTo` PROPS —
 * `adminScheduleMonthCols` ignores its `now` argument entirely when both keys
 * are given (see src/lib/adminScheduleHorizon.js). The clock is read only for
 * the filter chrome (`defaultRange`, the from/to option list), which nothing
 * below asserts. So the grid is fully deterministic and the dates can be the
 * exact ones from the bug report.
 *
 * ── THE colSpan SPELLING TRAP ───────────────────────────────────────────────
 * React 18.3.1 emits `colSpan="2"` CAMEL-CASED from the `colSpan` prop while
 * emitting `rowspan="2"` LOWERCASE from `rowSpan`, in the same tag. An
 * extractor matching a literal lowercase `colspan` selects NOTHING here and the
 * failure reads as "the fixture moved". Every matcher below takes both
 * spellings, as test/render/scheduleMonthLanes already does.
 */

const MONTH_FROM = '2026-09';
const MONTH_TO = '2026-12';
/** ก.ย. ต.ค. พ.ย. ธ.ค. — four columns, and the arithmetic below depends on it. */
const COLUMNS = 4;
/** The four course columns: code, name, days, price. */
const COURSE_COLUMNS = 4;

const CLAUDE = { _id: 'p-claude', program_id: 'CLAUDE', program_name: 'Claude AI' };
const POWERBI = { _id: 'p-pbi', program_id: 'PBI', program_name: 'Power BI' };

const COURSES = [
  {
    _id: 'c-gap',
    course_id: 'GAP-101',
    course_name: 'Non consecutive course',
    course_price: 8500,
    course_trainingdays: 2,
    program: POWERBI,
  },
  {
    _id: 'c-cross',
    course_id: 'CROSS-101',
    course_name: 'Cross month course',
    course_price: 12000,
    course_trainingdays: 2,
    program: POWERBI,
  },
  {
    _id: 'c-full',
    course_id: 'FULL-101',
    course_name: 'Sold out course',
    course_price: 6000,
    course_trainingdays: 1,
    program: CLAUDE,
  },
];

/**
 * The rounds, chosen so the packing is FORCED rather than incidental.
 *
 *   r-gap     16 + 18 ก.ย.        the reported label bug, single month, col 0
 *   r-cross   30 ต.ค. + 2 พ.ย.    the other label bug AND a 2-column span
 *   r-inside  20 พ.ย.             overlaps r-cross's second column → lane 2
 *   r-full    10 ธ.ค., เต็ม, hybrid
 */
const SCHEDULES = [
  { _id: 'r-gap', course: 'c-gap', dates: ['2026-09-16', '2026-09-18'], type: 'classroom', status: 'open' },
  { _id: 'r-cross', course: 'c-cross', dates: ['2026-10-30', '2026-11-02'], type: 'classroom', status: 'open' },
  { _id: 'r-inside', course: 'c-cross', dates: ['2026-11-20'], type: 'classroom', status: 'nearly_full' },
  { _id: 'r-full', course: 'c-full', dates: ['2026-12-10'], type: 'hybrid', status: 'full' },
];

function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(SchedulesAdminClient, {
      schedules: SCHEDULES,
      courses: COURSES,
      // Power BI FIRST, deliberately out of Thai alphabetical order — see the
      // program-order test at the bottom.
      programs: [POWERBI, CLAUDE],
      scheduleLocals: [],
      instructors: [],
      search: '',
      filterProgram: '',
      filterStatus: '',
      monthFrom: MONTH_FROM,
      monthTo: MONTH_TO,
      ...overrides,
    }),
  );
}

const HTML = render();

/** Every `<tbody>`'s rows, across both program tables. */
function bodyRows(html) {
  return [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
    .flatMap((body) => [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)])
    .map((m) => m[0]);
}

/** One row's cells, as `{ attrs, span }`. Both colSpan spellings accepted. */
function cellsOf(row) {
  return [...row.matchAll(/<td\b([^>]*)>/g)].map((m) => ({
    attrs: m[1],
    span: Number(m[1].match(/col[Ss]pan="(\d+)"/)?.[1] ?? 1),
  }));
}

/** The `<tr>`s belonging to one course, found by its code cell. */
function rowsForCourse(html, courseId) {
  const rows = bodyRows(html);
  const start = rows.findIndex((r) => r.includes(`>${courseId}<`));
  assert.notEqual(start, -1, `no row carries the course code ${courseId}`);
  let end = start + 1;
  // A course owns every following row until the next one that carries a course
  // code cell — the `font-mono` code column is emitted exactly once per course.
  while (end < rows.length && !/font-mono/.test(rows[end])) end += 1;
  return rows.slice(start, end);
}

// ── the fixture is real ─────────────────────────────────────────────────────

test('CONTROL: the grid rendered, with both programs and all three courses', () => {
  /**
   * First, because every assertion below is a match against this string. A
   * component that threw, or a filter that emptied the table, would otherwise
   * satisfy several "does not contain" checks at once.
   */
  assert.ok(HTML.length > 2000, `the grid rendered only ${HTML.length} chars`);
  for (const code of ['GAP-101', 'CROSS-101', 'FULL-101']) {
    assert.ok(HTML.includes(code), `${code} is missing from the grid`);
  }
  assert.equal((HTML.match(/<tbody/g) ?? []).length, 2, 'one tbody per program group');
});

// ── 1. the label ────────────────────────────────────────────────────────────

test('a NON-CONSECUTIVE round lists its days — `16, 18`, never `16-18`', () => {
  assert.ok(HTML.includes('16, 18'), 'the listed label is not in the markup');
  assert.equal(
    HTML.includes('16-18'),
    false,
    'the retired first-to-last label is back — it advertises a 17th nobody scheduled',
  );
});

test('a CROSS-MONTH round prints both months — `30 ต.ค., 2 พ.ย.`, never `30-2`', () => {
  assert.ok(HTML.includes('30 ต.ค., 2 พ.ย.'), 'the cross-month label is not in the markup');
  assert.equal(HTML.includes('30-2'), false, 'the retired label is back — `30-2` is a date in no month');
});

test('a single-month round carries NO month and NO year — the header has both', () => {
  // The ก.ย. round. Its label must be the bare days; the month appears in this
  // markup only in the column header (and in the cross-month cell above).
  const gapRow = rowsForCourse(HTML, 'GAP-101').join('');
  assert.ok(gapRow.includes('16, 18'));
  assert.equal(/ก\.ย\./.test(gapRow), false, 'the ก.ย. round repeated its own month inside the cell');
});

// ── 2. the colours ──────────────────────────────────────────────────────────

test('the round box border AND its dot are the TRAINING TYPE, from the shared palette', () => {
  /**
   * Read as inline `style` rather than as a class, and that is not incidental:
   * these are hex values and Tailwind never evaluates a template literal, so
   * `border-[${color}]` would compile to no class at all and fail silently as
   * an unbordered box.
   */
  const classroom = TRAINING_TYPE_COLOR.classroom.toLowerCase();
  const hybrid = TRAINING_TYPE_COLOR.hybrid.toLowerCase();
  const html = HTML.toLowerCase();

  assert.ok(html.includes(`border-color:${classroom}`), 'no classroom border colour');
  assert.ok(html.includes(`background-color:${classroom}`), 'no classroom dot colour');
  assert.ok(html.includes(`border-color:${hybrid}`), 'no hybrid border colour');
  assert.ok(html.includes(`background-color:${hybrid}`), 'no hybrid dot colour');
});

test('and the STATUS dot classes are gone — the dot no longer means the status', () => {
  /**
   * The specific shape that was here: a local `STATUS_DOT` map of
   * green-500 / amber-500 / red-500 painting the dot. Naming the retired
   * classes rather than asserting "some class is absent" is what makes this
   * fire on the actual regression.
   */
  for (const cls of ['bg-green-500', 'bg-amber-500', 'bg-red-500']) {
    assert.equal(HTML.includes(cls), false, `the status dot class ${cls} is back on the admin grid`);
  }
});

test('the status is a WORD under the date, and it is the STATE not the call to action', () => {
  /**
   * `เปิดรับ`, not `ลงทะเบียน`. lib/scheduleStatus splits the two fields so each
   * surface names the one it means: nobody registers from /admin/schedules, so
   * an imperative to register would be the wrong word on this screen. `เต็ม` is
   * equal in both fields and proves nothing on its own, which is why the OPEN
   * round is the one asserted here.
   */
  assert.ok(HTML.includes('เปิดรับ'), 'the open round shows no status word');
  assert.ok(HTML.includes('ใกล้เต็ม'), 'the nearly-full round shows no status word');
  assert.ok(HTML.includes('เต็ม'), 'the full round shows no status word');
  assert.equal(HTML.includes('ลงทะเบียน'), false, 'the admin grid is telling an admin to register');
});

test('a FULL round is cursor-not-allowed — but แก้ไข and ลบ stay clickable', () => {
  /**
   * The exemption is the point. A sold-out round is the one most likely to need
   * its seats or its status corrected, so the public ruling's
   * `cursor-not-allowed` sits on the BOX while both buttons re-assert
   * `cursor-pointer` over it. A test that only checked for the class would pass
   * on a grid where the buttons had been disabled with it.
   */
  const fullRows = rowsForCourse(HTML, 'FULL-101').join('');
  assert.ok(/cursor-not-allowed/.test(fullRows), 'the full round box is not marked not-allowed');

  const editButton = /<button[^>]*class="([^"]*)"[^>]*>\s*แก้ไข/.exec(fullRows);
  assert.ok(editButton, 'the full round has no แก้ไข button at all');
  assert.ok(/cursor-pointer/.test(editButton[1]), 'แก้ไข lost its pointer on a full round');
  assert.equal(/disabled/.test(editButton[0]), false, 'แก้ไข is disabled on a full round');

  const deleteButton = /<button[^>]*class="([^"]*)"[^>]*>\s*ลบ/.exec(fullRows);
  assert.ok(deleteButton, 'the full round has no ลบ button at all');
  assert.ok(/cursor-pointer/.test(deleteButton[1]), 'ลบ lost its pointer on a full round');
  assert.equal(/\sdisabled(=|\s|>)/.test(deleteButton[0]), false, 'ลบ is disabled on a full round');
});

// ── 3. the lanes ────────────────────────────────────────────────────────────

test('the cross-month round SPANS its two columns', () => {
  const rows = rowsForCourse(HTML, 'CROSS-101');
  const spans = rows.flatMap((r) => cellsOf(r).map((c) => c.span));
  assert.ok(spans.includes(2), `no cell spans two columns: ${JSON.stringify(spans)}`);
});

test('EVERY row of the grid accounts for exactly the four month columns', () => {
  /**
   * THE ARITHMETIC IS THE POINT. A `colSpan` cell CONSUMES the columns it
   * covers, so the number of `<td>`s a row emits is not the number of columns
   * it occupies. Off by one and the whole grid shears sideways — every month
   * after the mistake shows the wrong month's rounds — and the table still
   * looks like a table, so no visual check catches it.
   *
   * The row carrying the course columns (found by the `font-mono` code cell)
   * accounts for four more, which are subtracted rather than special-cased, so
   * the assertion is the same sentence for every row.
   */
  const rows = bodyRows(HTML);
  assert.ok(rows.length >= 7, `only ${rows.length} body rows — the fixture is not exercising lanes`);

  for (const row of rows) {
    const total = cellsOf(row).reduce((sum, c) => sum + c.span, 0);
    const carriesCourse = /font-mono/.test(row);
    assert.equal(
      total - (carriesCourse ? COURSE_COLUMNS : 0),
      COLUMNS,
      `a row covers ${total} columns, not ${COLUMNS} (+${carriesCourse ? COURSE_COLUMNS : 0} course cells): ${row.slice(0, 200)}`,
    );
  }
});

test('the course columns are emitted ONCE and rowSpan across the course', () => {
  /**
   * They belong to the COURSE, not to a lane. `rowspan` is LOWERCASE in React's
   * output while `colSpan` is camel-cased two attributes away — see this file's
   * header.
   *
   * CROSS-101 packs into two lanes (the spanning round, and the พ.ย. round it
   * overlaps) plus the `+ รอบ` row, so three. GAP-101 has one lane plus that
   * row, so two.
   */
  const cross = rowsForCourse(HTML, 'CROSS-101');
  assert.equal(cross.length, 3, 'the overlapping round did not open a second lane');
  assert.equal(
    (cross[0].match(/row[Ss]pan="3"/g) ?? []).length,
    COURSE_COLUMNS,
    'the four course cells do not span all three of the course rows',
  );

  const gap = rowsForCourse(HTML, 'GAP-101');
  assert.equal(gap.length, 2, 'a single-lane course is its lane plus its + รอบ row');
  assert.equal((gap[0].match(/row[Ss]pan="2"/g) ?? []).length, COURSE_COLUMNS);
});

test('EVERY month keeps its own reachable `+ รอบ` button, spanning or not', () => {
  /**
   * The affordance a naive colSpan would have swallowed: a cell covering
   * ต.ค.+พ.ย. consumes both columns, and with the buttons inside the month
   * cells there would have been no way to add a round to either month. They
   * live in a lane of their own now — one `<td>` per column, on a row no
   * colSpan can reach.
   *
   * Asserted on the CROSS-101 course specifically, because that is the one
   * whose columns are consumed. Four buttons, one per month, plus the inline
   * shortcut beside the course name.
   */
  const rows = rowsForCourse(HTML, 'CROSS-101');
  const addRow = rows[rows.length - 1];
  const cells = cellsOf(addRow);
  assert.equal(cells.length, COLUMNS, `the + รอบ row has ${cells.length} cells, not ${COLUMNS}`);
  assert.ok(cells.every((c) => c.span === 1), 'a + รอบ cell is spanning — one month lost its button');
  assert.equal(
    (addRow.match(/\+ รอบ/g) ?? []).length,
    COLUMNS,
    'the + รอบ row does not carry one button per month',
  );

  // …and the whole course still offers exactly one inline shortcut too.
  assert.equal((rows.join('').match(/\+ รอบ/g) ?? []).length, COLUMNS + 1);
});

test('a course with NO round in the window still gets its full row of buttons', () => {
  /**
   * `laneLayout` returns zero lanes for a course with nothing visible, so the
   * course columns ride on the `+ รอบ` row instead of a lane. Without that
   * branch the course would render a row with no code, no name and no price —
   * or no row at all, silently dropping a manageable course from the screen.
   */
  const html = render({ schedules: [] });
  const rows = rowsForCourse(html, 'GAP-101');
  assert.equal(rows.length, 1, 'an empty course should be exactly its + รอบ row');
  assert.equal((rows[0].match(/\+ รอบ/g) ?? []).length, COLUMNS + 1);
  // rowSpan is OMITTED, not set to 1: `rowspan="1"` is a no-op that would
  // change the markup of every single-row course on the page.
  assert.equal(/row[Ss]pan/.test(rows[0]), false, 'a one-row course emitted a rowspan');
});

test('a round CLIPPED by the selected range is still shown, and says so', () => {
  /**
   * The window starts at ต.ค. here, so the 30 ก.ย. – 1 ต.ค. round begins before
   * the first column. It must not vanish — under the old first-date bucketing
   * it did, because its month had no column — and the fragment must announce
   * itself, or an admin widens the range hunting for a round already on screen.
   */
  const html = render({
    monthFrom: '2026-10',
    monthTo: '2026-12',
    schedules: [
      { _id: 'r-clip', course: 'c-gap', dates: ['2026-09-30', '2026-10-01'], type: 'classroom', status: 'open' },
    ],
  });
  assert.ok(html.includes('ต่อจาก'), 'the clipped round shows no continuation marker');
  assert.ok(html.includes('ก.ย.'), 'the continuation marker does not name the month it continues from');
});

// ── 4. the program order ────────────────────────────────────────────────────

test('program groups follow the `programs` prop, not the Thai alphabet', () => {
  /**
   * This grid used to sort its groups by `localeCompare` alone, which is why it
   * listed AI Builder, Canva, Claude AI while /schedule — reading the
   * admin-curated ProgramOrder through `getOrderedPrograms` — put Claude AI
   * above Power BI. page.jsx now makes that same call and hands the result
   * down; the client ranks by the array's order exactly as ScheduleClient does.
   *
   * The fixture passes Power BI FIRST precisely because the alphabet disagrees:
   * under the old sort Claude AI would lead, so this assertion can only pass if
   * the prop order is what governs.
   */
  const pbi = HTML.indexOf('Power BI');
  const claude = HTML.indexOf('Claude AI');
  assert.notEqual(pbi, -1);
  assert.notEqual(claude, -1);
  assert.ok(pbi < claude, 'the groups fell back to alphabetical order');
});

test('CONTROL: reversing the prop reverses the groups', () => {
  // Without this, the assertion above could be passing on incidental document
  // order — the courses happen to be listed Power BI first too.
  const flipped = render({ programs: [CLAUDE, POWERBI] });
  assert.ok(
    flipped.indexOf('Claude AI') < flipped.indexOf('Power BI'),
    'the prop order does not actually drive the grouping',
  );
});

test('a program the `programs` prop does NOT name still renders, last', () => {
  /**
   * The load-bearing half of page.jsx's decision to APPEND rather than drop
   * what `getOrderedPrograms` hides. A programme hidden from the website must
   * not become unmanageable on the screen where its rounds are edited — it
   * falls to `Infinity` in the rank lookup and sorts after every ranked group,
   * but it is still there.
   */
  const orphaned = render({ programs: [CLAUDE] });
  assert.ok(orphaned.includes('Power BI'), 'an unranked programme disappeared from the admin grid');
  assert.ok(
    orphaned.indexOf('Claude AI') < orphaned.indexOf('Power BI'),
    'the unranked programme did not sort after the ranked one',
  );
});
