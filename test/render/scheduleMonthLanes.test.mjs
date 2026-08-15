import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  addMonths,
  monthLabel,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts } from '@/lib/articlePublishTime';
import { FROZEN_COLUMNS } from '@/lib/schedule/scheduleTableLayout';

/**
 * CROSS-MONTH ROUNDS SPAN THEIR MONTHS, and the table grows lanes to allow it.
 *
 * ── THE TWO REQUIREMENTS ────────────────────────────────────────────────────
 * A round crossing months is displayed SPANNING them; a round inside one month
 * stays ALIGNED under it. One `<tr>` cannot do both when they overlap — there is
 * nowhere to put a `<td>` at ต.ค. in a row that already has a `colSpan={2}`
 * covering ก.ย.+ต.ค. So a course row becomes one or more LANES and the frozen
 * columns `rowSpan` across them. The packing itself is pure and tested in
 * test/pure/monthLanes; what is tested HERE is that the packing reaches the
 * markup — the spans, the rowSpan, the gaps, and the column arithmetic.
 *
 * ── THE ARITHMETIC IS THE POINT ─────────────────────────────────────────────
 * A `colSpan` cell CONSUMES the columns it covers, so the number of `<td>`s a
 * row emits is not the number of columns it occupies. Get that wrong by one and
 * the whole table shears sideways — every month column after the mistake shows
 * the wrong month's rounds — and no visual check catches it reliably, because
 * the table still looks like a table. So the total is asserted directly.
 *
 * Dates roll off the real clock for the same reason as the sibling /schedule
 * render tests: nothing here can move it, and a fixture in a fixed month renders
 * no rounds for most of the year.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
const OPTIONS = rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON);
const DEFAULTS = defaultScheduleFilters(now);
const CURRENT_YEAR = siteDateParts(now).year;

/** The month immediately BEFORE the window — where the clipped round starts. */
const BEFORE = addMonths(WINDOW[0], -1);

const lastDayOf = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const dayIn = (key, day) => `${key}-${String(day).padStart(2, '0')}`;

/**
 * One course carrying every case §4 has to render, chosen so the packing is
 * forced rather than incidental:
 *
 *   r-clip    BEFORE → WINDOW[0]   clipped by the window's left edge, col 0
 *   r-alone   WINDOW[1] → [2]      a cross-month round with nothing overlapping
 *   r-overlap WINDOW[2]            overlaps r-alone, so it is pushed to lane 2
 *   r-plain   WINDOW[4]            an ordinary single-month round
 *
 * Which packs as:
 *   lane 1  [0-0] [1-2] gap(3) [4-4] gap(5)
 *   lane 2  gap(0) gap(1) [2-2] gap(3) gap(4) gap(5)
 */
const COURSE = {
  _id: 'c1',
  course_id: 'POWER-BI',
  course_name: 'Power BI',
  course_price: 8500,
  course_trainingdays: 2,
  program: { program_name: 'Data' },
  schedules: [
    { _id: 'r-clip', dates: [dayIn(BEFORE, lastDayOf(BEFORE)), dayIn(WINDOW[0], 1)], type: 'classroom', status: 'open' },
    { _id: 'r-alone', dates: [dayIn(WINDOW[1], lastDayOf(WINDOW[1])), dayIn(WINDOW[2], 2)], type: 'hybrid', status: 'open' },
    { _id: 'r-overlap', dates: [dayIn(WINDOW[2], 20)], type: 'classroom', status: 'open' },
    { _id: 'r-plain', dates: [dayIn(WINDOW[4], 12)], type: 'classroom', status: 'open' },
  ],
};

const render = (overrides = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: [COURSE],
      programs: [{ _id: 'p1', program_name: 'Data' }],
      schedulePDF: null,
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      currentYear: CURRENT_YEAR,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: false,
      onSheetOpenChange() {},
      ...overrides,
    }),
  );

const tableRegion = (html) => (html.match(/<table[\s\S]*?<\/table>/g) ?? []).join('');
const bodyRows = (html) =>
  (tableRegion(html).match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '')
    .match(/<tr[\s\S]*?<\/tr>/g) ?? [];

/**
 * Every `<td>` of a row as `{ span, html }`.
 *
 * `col[Ss]pan` is matched in BOTH spellings. React 18.3.1 emits `colSpan="2"`
 * camel-cased from the `colSpan` prop while emitting `rowspan="2"` lowercase
 * from `rowSpan` — its own attribute table, verified by rendering a bare `<td>`
 * with each. Both are correct HTML (attribute names are ASCII case-insensitive)
 * and a React upgrade that normalises it must not silently empty this parser.
 */
const cellsOf = (row) =>
  [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((m) => ({
    span: Number(m[1].match(/col[Ss]pan="(\d+)"/)?.[1] ?? 1),
    rowSpan: Number(m[1].match(/rowspan="(\d+)"/i)?.[1] ?? 1),
    attrs: m[1],
    html: m[2],
  }));

const idsIn = (s) => [...s.matchAll(/&amp;class=([^"&]+)/g)].map((m) => m[1]);

// ── The lanes exist, and the frozen block spans them ────────────────────────

test('a course with an overlapping cross-month round renders TWO lanes', () => {
  const rows = bodyRows(render());
  assert.equal(rows.length, 2, 'one <tr> per lane');
});

test('the frozen columns are rendered ONCE and rowSpan the lanes', () => {
  /**
   * They belong to the COURSE, not to a lane. Repeating them per lane would
   * print the course code and name twice; omitting them from lane 2 without a
   * rowSpan would leave that row four columns short and shear it left.
   */
  const [lane1, lane2] = bodyRows(render());
  const frozen1 = cellsOf(lane1).filter((c) => c.attrs.includes('sticky'));
  assert.equal(frozen1.length, FROZEN_COLUMNS.length, 'lane 1 carries the whole frozen block');
  assert.ok(frozen1.every((c) => c.rowSpan === 2), 'and each cell spans both lanes');
  assert.equal(
    cellsOf(lane2).filter((c) => c.attrs.includes('sticky')).length,
    0,
    'lane 2 must not repeat them',
  );
});

test('the sticky offsets and the last-column border are untouched by the rowSpan', () => {
  const frozen = cellsOf(bodyRows(render())[0]).filter((c) => c.attrs.includes('sticky'));
  const offsets = frozen.map((c) => c.attrs.match(/left:(\d+)(?:px)?/)?.[1]);
  assert.deepEqual(offsets, ['0', '120', '480', '540'], 'the cumulative offsets moved');
  assert.ok(frozen[3].attrs.includes('border-r'), 'the last frozen column keeps its edge');
  assert.equal(frozen[0].attrs.includes('border-r'), false);
});

// ── The column arithmetic ───────────────────────────────────────────────────

test('THE ARITHMETIC: every lane accounts for exactly the columns it must', () => {
  /**
   * Lane 1 spans the frozen block plus every month; lanes 2+ span the months
   * only, because the frozen block is rowSpanned down into them. An off-by-one
   * here shears the table.
   */
  const html = render();
  const monthCount = WINDOW.length;
  const [lane1, ...rest] = bodyRows(html);

  const total = (row) => cellsOf(row).reduce((n, c) => n + c.span, 0);
  assert.equal(
    total(lane1),
    FROZEN_COLUMNS.length + monthCount,
    'lane 1 must cover the frozen columns and every month',
  );
  for (const [i, row] of rest.entries()) {
    assert.equal(total(row), monthCount, `lane ${i + 2} must cover every month and nothing more`);
  }
});

test('CONTROL: the arithmetic probe DOES catch a short row', () => {
  /**
   * The assertion above is a sum, and a sum is satisfied by any number of cells
   * — including zero, if `cellsOf` were broken. So: the parser must find real
   * cells, and a row with one dropped must come out different.
   */
  const [lane1] = bodyRows(render());
  const cells = cellsOf(lane1);
  assert.ok(cells.length >= 5, 'the parser found almost no cells — it is broken');
  const short = cells.slice(0, -1).reduce((n, c) => n + c.span, 0);
  assert.notEqual(short, FROZEN_COLUMNS.length + WINDOW.length, 'dropping a cell must change the total');
  // And a colSpan really is being read, not defaulted to 1 everywhere.
  assert.ok(cells.some((c) => c.span === 2), 'no spanning cell was parsed');
});

// ── The three cases ─────────────────────────────────────────────────────────

test('a cross-month round SPANS its two months', () => {
  const cells = cellsOf(bodyRows(render())[0]);
  const alone = cells.find((c) => idsIn(c.html).includes('r-alone'));
  assert.ok(alone, 'the cross-month round did not render');
  assert.equal(alone.span, 2, 'it must cover both of its months');
});

test('a single-month round stays ALIGNED under its one month', () => {
  const html = render();
  const plain = cellsOf(bodyRows(html)[0]).find((c) => idsIn(c.html).includes('r-plain'));
  assert.ok(plain, 'the single-month round did not render');
  assert.equal(plain.span, 1, 'it must not span');
  assert.equal(
    plain.attrs.includes('colSpan') || plain.attrs.includes('colspan'),
    false,
    'and must emit NO colspan at all — colspan="1" is a no-op that would change every cell',
  );
});

test('the overlapping round is pushed to lane 2, at its own column', () => {
  const [lane1, lane2] = bodyRows(render());
  assert.equal(idsIn(lane1).includes('r-overlap'), false, 'it cannot share lane 1 with the span');

  // Parsed ONCE. `cellsOf` builds a fresh array of fresh objects each call, so
  // `find`ing in one and `indexOf`-ing in another compares different objects and
  // silently returns -1 — which reads as "column 5" rather than as an error.
  const cells = cellsOf(lane2);
  const at = cells.findIndex((c) => idsIn(c.html).includes('r-overlap'));
  assert.notEqual(at, -1, 'the overlapping round vanished');
  assert.equal(cells[at].span, 1);
  // It sits under WINDOW[2] — the third month — which is what "aligned" means.
  const before = cells.slice(0, at).reduce((n, c) => n + c.span, 0);
  assert.equal(before, 2, 'the round must start at column index 2');
});

test('EVERY round is rendered exactly once across the lanes', () => {
  /**
   * Lanes are the one place a round could be duplicated — it is placed by a
   * greedy pack, and a pack that fell through to "put it everywhere" would look
   * fine on any single row.
   */
  const all = bodyRows(render()).flatMap((r) => idsIn(r));
  assert.deepEqual(
    all.slice().sort(),
    ['r-alone', 'r-clip', 'r-overlap', 'r-plain'],
    'every round exactly once',
  );
});

// ── Gaps ────────────────────────────────────────────────────────────────────

test('an empty column in LANE 1 renders the dash it always did', () => {
  const cells = cellsOf(bodyRows(render())[0]).filter((c) => !c.attrs.includes('sticky'));
  const gaps = cells.filter((c) => !c.html.includes('<a '));
  assert.ok(gaps.length > 0, 'the fixture has no empty month in lane 1');
  for (const gap of gaps) {
    assert.match(gap.html, /—/, 'a lane-1 gap means "no round this month"');
  }
});

test('an empty column in LANE 2 renders NOTHING', () => {
  /**
   * A wall of dashes underneath a spanned round reads as missing data rather
   * than as empty space — the course does have rounds those months, they are
   * just on the row above.
   */
  const gaps = cellsOf(bodyRows(render())[1]).filter((c) => !c.html.includes('<a '));
  assert.ok(gaps.length > 0, 'the fixture has no empty column in lane 2');
  for (const gap of gaps) {
    assert.equal(gap.html, '', 'a lane-2 gap must be empty');
    assert.equal(gap.html.includes('—'), false);
  }
});

test('CONTROL: the dash probe can tell the two gap treatments apart', () => {
  // Both assertions above are about the same `<td>` shape; if the probe could
  // not distinguish them one of the two would be vacuous.
  const rows = bodyRows(render());
  const lane1Gaps = cellsOf(rows[0]).filter((c) => !c.attrs.includes('sticky') && !c.html.includes('<a '));
  const lane2Gaps = cellsOf(rows[1]).filter((c) => !c.html.includes('<a '));
  assert.notEqual(lane1Gaps[0].html, lane2Gaps[0].html, 'the two gap treatments must differ');
  assert.ok(lane1Gaps[0].html.length > 0 && lane2Gaps[0].html.length === 0);
});

// ── The clipped round ───────────────────────────────────────────────────────

test('a round clipped by the window edge is still SHOWN', () => {
  /**
   * §4d. The round runs from the month before the window into its first month —
   * real training that the visitor can book, in a month they are looking at.
   * Hiding it because part of it is off-screen is the bucketing defect in a new
   * costume.
   */
  const html = render();
  assert.ok(bodyRows(html).flatMap(idsIn).includes('r-clip'), 'the clipped round vanished');
  const clip = cellsOf(bodyRows(html)[0]).find((c) => idsIn(c.html).includes('r-clip'));
  assert.equal(clip.span, 1, 'clipped to the one visible month');
});

test('the clipped round carries a continuation marker naming its real month', () => {
  const clip = cellsOf(bodyRows(render())[0]).find((c) => idsIn(c.html).includes('r-clip'));
  assert.ok(
    clip.html.includes(`← ต่อจาก ${monthLabel(BEFORE)}`),
    `expected "← ต่อจาก ${monthLabel(BEFORE)}" in the clipped cell`,
  );
});

test('the clipped round’s LABEL is not clipped — it prints the invisible days too', () => {
  /**
   * The marker says the round continues; the label still states every day of it,
   * including the one in the month that is off-screen. Shortening the label to
   * the visible portion would be a second, quieter version of the same defect —
   * the page would understate a round it is showing.
   */
  const clip = cellsOf(bodyRows(render())[0]).find((c) => idsIn(c.html).includes('r-clip'));
  assert.ok(
    clip.html.includes(monthLabel(BEFORE)),
    'the off-window month must appear in the label',
  );
  assert.ok(
    clip.html.includes(String(lastDayOf(BEFORE))),
    'and so must its day, which is not in any visible column',
  );
});

test('a round NOT clipped carries no marker', () => {
  const cells = cellsOf(bodyRows(render())[0]);
  const alone = cells.find((c) => idsIn(c.html).includes('r-alone'));
  assert.equal(alone.html.includes('ต่อจาก'), false);
  assert.equal(alone.html.includes('ต่อ '), false, 'nor the forward marker');
});

// ── The common case must not regress ────────────────────────────────────────

test('THE PROPERTY: a course with no crossing round renders ONE lane and no spans', () => {
  /**
   * Almost every row on the page looks like this, and it must render exactly as
   * it always did: one `<tr>`, no rowSpan on the frozen block, no colSpan on any
   * month cell.
   */
  const flat = {
    ...COURSE,
    schedules: [
      { _id: 'p1', dates: [dayIn(WINDOW[0], 3), dayIn(WINDOW[0], 4)], type: 'classroom', status: 'open' },
      { _id: 'p2', dates: [dayIn(WINDOW[2], 9)], type: 'classroom', status: 'open' },
    ],
  };
  const rows = bodyRows(render({ courses: [flat] }));
  assert.equal(rows.length, 1, 'one row');

  const cells = cellsOf(rows[0]);
  assert.equal(cells.length, FROZEN_COLUMNS.length + WINDOW.length, 'one <td> per column');
  assert.ok(cells.every((c) => c.span === 1), 'no colspan anywhere');
  assert.equal(
    rows[0].includes('rowspan'),
    false,
    'and no rowspan — React would emit rowspan="1", changing every row on the page',
  );
  assert.equal(
    /col[Ss]pan/.test(rows[0]),
    false,
    'nor colspan="1"',
  );
});

test('the single-lane row carries the same border classes it always did', () => {
  const flat = {
    ...COURSE,
    schedules: [{ _id: 'p1', dates: [dayIn(WINDOW[0], 3)], type: 'classroom', status: 'open' }],
  };
  const row = bodyRows(render({ courses: [flat] }))[0];
  assert.match(
    row,
    /<tr class="border-b border-gray-100 last:border-0 dark:border-\[#1e3a5f\] bg-white dark:bg-\[#111d2c\]">/,
    'the one-lane class string must be byte-identical to the shipped one',
  );
});

test('only the LAST lane carries the row’s bottom border', () => {
  /**
   * An internal lane boundary is not a row boundary. A border between lane 1 and
   * lane 2 would read as two courses.
   */
  const [lane1, lane2] = bodyRows(render());
  const classesOf = (row) => row.match(/^<tr class="([^"]*)"/)?.[1] ?? '';
  assert.equal(/\bborder-b\b/.test(classesOf(lane1)), false, 'lane 1 must not close the row');
  assert.match(classesOf(lane2), /\bborder-b\b/, 'the last lane closes it');
  // Both keep the stripe fill, so the two lanes read as one band.
  assert.match(classesOf(lane1), /bg-white/);
  assert.match(classesOf(lane2), /bg-white/);
});

// ── The colgroup still governs the widths ───────────────────────────────────

test('the colgroup is unchanged — colSpan does not disturb the column widths', () => {
  /**
   * `table-fixed` plus a `<colgroup>` means the widths come from the colgroup,
   * so a `colSpan` cell covers columns without resizing them and the frozen
   * columns keep indices 0-3 in every row. CONFIRMED BY RENDERING rather than by
   * reasoning: the `<col>` count and their widths are read out of the markup.
   */
  const html = render();
  // `(?![a-z])` because `<col[^>]*>` also matches `<colgroup>` — the wrapper
  // would be counted as an eleventh column and every index below shifted by one.
  const cols = tableRegion(html).match(/<col(?![a-z])[^>]*>/g) ?? [];
  assert.equal(cols.length, FROZEN_COLUMNS.length + WINDOW.length, 'one <col> per column');
  assert.deepEqual(
    cols.slice(0, FROZEN_COLUMNS.length).map((c) => c.match(/width:(\d+)/)?.[1]),
    FROZEN_COLUMNS.map((c) => String(c.width)),
    'the frozen widths come from the colgroup',
  );
  assert.ok(
    cols.slice(FROZEN_COLUMNS.length).every((c) => !/width/.test(c)),
    'and the month cols carry no width, so they divide the slack',
  );
  assert.match(tableRegion(html), /class="w-full table-fixed/, 'table-fixed is what makes that true');
});

// ── THE BUCKETING DEFECT, end to end ────────────────────────────────────────

/** The window narrowed to a single month. */
const onlyMonth = (key) => ({ filters: { ...DEFAULTS, monthFrom: key, monthTo: key } });

const cardRegion = (html) => (html.match(/<article[\s\S]*?<\/article>/g) ?? []).join('');

test('THE DEFECT: filtering to the round’s SECOND month still shows it', () => {
  /**
   * `scheduleMonthKey` filed a round under the month of its FIRST DATE only, and
   * both the table's cell filter and `filteredCourses` asked whether that one
   * bucket was visible. So narrowing the window to "เฉพาะ <second month>" made a
   * cross-month round vanish — and took the whole course row with it, because
   * no visible bucket held anything. The course really is running on the 2nd of
   * that month.
   */
  const html = render(onlyMonth(WINDOW[2]));
  assert.ok(bodyRows(html).length > 0, 'the whole course row disappeared — the shipped defect');
  assert.ok(
    bodyRows(html).flatMap(idsIn).includes('r-alone'),
    'the cross-month round must be visible from its second month',
  );
});

test('…and from its FIRST month, which is the case that always worked', () => {
  const html = render(onlyMonth(WINDOW[1]));
  assert.ok(bodyRows(html).flatMap(idsIn).includes('r-alone'));
});

test('CONTROL: a round in NEITHER month is still excluded', () => {
  /**
   * The other half. A span-based predicate that returned true for everything
   * would satisfy both assertions above and quietly show every round in every
   * window — which is a worse defect than the one being fixed.
   */
  const html = render(onlyMonth(WINDOW[4]));
  const shown = bodyRows(html).flatMap(idsIn);
  assert.ok(shown.includes('r-plain'), 'the round that IS in this month must show');
  assert.equal(shown.includes('r-alone'), false, 'the round two months away must not');
  assert.equal(shown.includes('r-clip'), false);
  assert.equal(shown.includes('r-overlap'), false);
});

test('THE DEDUPE: the card lists a cross-month round exactly ONCE', () => {
  /**
   * The easy way to get this wrong. Under a span-based rule a round is visible
   * from every month it touches, so a card built by walking months and
   * collecting whatever each one shows emits the cross-month round twice —
   * "27–30 ก.ย." listed as two separate rounds a visitor might try to book.
   *
   * `courseRounds` filters a FLAT list instead, which makes the duplicate
   * unrepresentable rather than merely absent.
   */
  const card = cardRegion(render());
  const occurrences = idsIn(card).filter((id) => id === 'r-alone');
  assert.equal(occurrences.length, 1, `the card lists r-alone ${occurrences.length} times`);

  // Every round exactly once, and the same set the table shows.
  assert.deepEqual(
    idsIn(card).slice().sort(),
    ['r-alone', 'r-clip', 'r-overlap', 'r-plain'],
  );
});

test('the card and the table agree, round for round, with a spanning round in play', () => {
  const html = render();
  assert.deepEqual(
    idsIn(cardRegion(html)).slice().sort(),
    bodyRows(html).flatMap(idsIn).sort(),
    'the two layouts must show the same rounds — no viewport shows both at once',
  );
});

test('CONTROL: the card probe DOES count duplicates when there are any', () => {
  // `filter(...).length === 1` passes for free against an empty list, so the
  // probe is shown to count, and to see the round at all.
  const card = cardRegion(render());
  assert.ok(idsIn(card).length >= 4, 'the card rendered almost nothing');
  const doubled = ['r-alone', 'r-alone', 'r-plain'];
  assert.equal(doubled.filter((id) => id === 'r-alone').length, 2, 'the probe can see a duplicate');
});

// ── The fixture is doing its job ────────────────────────────────────────────

test('CONTROL: the fixture really produces the three cases it claims', () => {
  /**
   * Half this file would pass vacuously against a fixture whose rounds quietly
   * stopped crossing months — every "no marker" and "span === 1" assertion would
   * hold for the wrong reason. So the shape is asserted outright.
   */
  const rows = bodyRows(render());
  assert.equal(rows.length, 2, 'the fixture must force a second lane');
  const spans = rows.flatMap((r) => cellsOf(r).map((c) => c.span));
  assert.ok(spans.includes(2), 'and must produce at least one spanning cell');
  assert.ok(
    rows[0].includes('ต่อจาก'),
    'and one clipped cell with a continuation marker',
  );
  assert.equal(WINDOW.length, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
});
