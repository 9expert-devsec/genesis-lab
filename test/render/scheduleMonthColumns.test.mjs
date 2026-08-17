import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleClient } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  monthColumns,
  monthKey,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import { FROZEN_TOTAL, MONTH_MIN_WIDTH, tableMinWidth } from '@/lib/schedule/scheduleTableLayout';

/**
 * /schedule's month window and column sizing, rendered.
 *
 * ── WHY THESE ASSERTIONS ARE PHRASED AGAINST "TODAY" AND NOT A FIXED DATE ───
 * ScheduleClient reads `new Date()` in a lazy state initialiser, and nothing in
 * this suite can move the clock. So the tests below assert an INVARIANT that
 * holds in every month rather than a literal that holds in August — which is
 * the stronger claim anyway, because the defect being fixed was precisely a
 * behaviour that changed with the calendar:
 *
 *     old: columns rendered = 12 - today.getMonth()   (12 in Jan → 1 in Dec)
 *     new: columns rendered = PUBLIC_SCHEDULE_DEFAULT_MONTHS, always
 *
 * The year-crossing arithmetic itself is pinned on FIXED dates in
 * test/pure/scheduleMonthWindow.test.mjs. What this tier adds is that
 * ScheduleClient actually consumes it — a component that kept its own 0–11 loop
 * passes every pure test in the repo.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);

/** A `YYYY-MM-15` date inside the Nth month of the default window. */
const dayIn = (key) => `${key}-15`;

const courseWithSchedulesIn = (keys) => ({
  _id: 'c1',
  course_id: 'MSE-AI',
  course_name: 'AI course',
  course_price: 9000,
  course_trainingdays: 2,
  program: { program_name: 'AI' },
  schedules: keys.map((key, i) => ({
    _id: `s-${key}`,
    dates: [dayIn(key)],
    type: 'classroom',
    status: 'open',
  })),
});

const render = (keys) =>
  renderToStaticMarkup(
    createElement(ScheduleClient, {
      courses: [courseWithSchedulesIn(keys)],
      programs: [{ _id: 'p1', program_name: 'AI' }],
      schedulePDF: null,
      earlyBirdMap: {},
    }),
  );

/** The rendered cell for one schedule — the link carries its _id. */
const hasCellFor = (html, key) => html.includes(`&amp;class=s-${key}`);

// ── THE REGRESSION — a session in the next calendar year ────────────────────

test('EVERY month of the default window renders a cell, including across a year', () => {
  /**
   * THE TEST THIS BATCH EXISTS FOR. Under the old year-blind window, a schedule
   * in a month whose index was BELOW the current month was unreachable: no
   * column, and the course itself removed from `filteredCourses` because
   * `visibleMonths.some(...)` matched nothing. From August that meant January
   * onwards; in December it meant everything but December.
   */
  const html = render(WINDOW);
  const missing = WINDOW.filter((key) => !hasCellFor(html, key));
  assert.deepEqual(
    missing,
    [],
    `these months of the default window rendered no cell: ${missing.join(', ')}`,
  );
});

test('the window really does span the months it claims to', () => {
  // Fixture guard. If `WINDOW` ever degenerated to one entry the test above
  // would pass while asserting almost nothing.
  assert.equal(WINDOW.length, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
  assert.equal(WINDOW[0], monthKey(now), 'starts at the current month, inclusive');
  assert.equal(new Set(WINDOW).size, WINDOW.length, 'no duplicates');
});

test('CONTROL: the OLD year-blind rule DOES drop the crossing months', () => {
  /**
   * Replays the shipped implementation — `for (m = monthFrom; m <= 11; m++)`
   * over bare `getMonth()` indices — against the same fixture, on FIXED months
   * so the control means the same thing in July as in December.
   *
   * Without this the test above is only as strong as today's date: in March the
   * default window does not cross a year at all and the old code would have
   * passed it too.
   */
  const oldVisible = (startMonth) => {
    const arr = [];
    for (let m = startMonth; m <= 11; m++) arr.push(m);
    return arr;
  };
  const oldDrops = (startMonth) =>
    rollingWindow(`2026-${String(startMonth + 1).padStart(2, '0')}`, PUBLIC_SCHEDULE_DEFAULT_MONTHS)
      .filter((key) => !oldVisible(startMonth).includes(Number(key.slice(5)) - 1));

  assert.deepEqual(oldDrops(0), [], 'January: the old rule happened to be right');
  assert.deepEqual(oldDrops(7), ['2027-01'], 'August: one month lost');
  assert.deepEqual(
    oldDrops(11),
    ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05'],
    'December: five of six lost, and the ถึง select could not reach them either',
  );
});

test('a course whose ONLY session is in the last window month still appears', () => {
  // Not just uncolumned — the old code removed the whole course from
  // `filteredCourses`, so the row and its price vanished from the table.
  const lastMonth = WINDOW[WINDOW.length - 1];
  const html = render([lastMonth]);
  assert.ok(html.includes('AI course'), 'the course row must render');
  assert.ok(hasCellFor(html, lastMonth), 'and its session must have a column to sit in');
  assert.ok(html.includes('>1</span>'), 'and the result count must say 1');
});

// ── Column count and header labels ──────────────────────────────────────────

/** The month `<th>`s, in order, with their inner markup. */
const monthHeaderCells = (html) =>
  (html.match(/<th class="px-2 py-3[^"]*">[\s\S]*?<\/th>/g) ?? []);

test('the header renders exactly PUBLIC_SCHEDULE_DEFAULT_MONTHS month columns', () => {
  const html = render(WINDOW);
  const headers = monthColumns(WINDOW);
  assert.equal(headers.length, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
  assert.equal(monthHeaderCells(html).length, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
});

test('EVERY month header emits both lines — month, then year', () => {
  /**
   * The rule that replaced the conditional one: each column head is
   * independently readable, because the table SCROLLS and a label explaining
   * its neighbours stops explaining anything once it leaves the viewport.
   *
   * Asserted per cell, in order, so a header that rendered six months and one
   * year cannot pass on a whole-document substring search.
   */
  const html = render(WINDOW);
  const cells = monthHeaderCells(html);
  const headers = monthColumns(WINDOW);
  assert.equal(cells.length, headers.length, 'one cell per window month');

  cells.forEach((cell, i) => {
    const h = headers[i];
    assert.ok(cell.includes(`>${h.label}<`), `cell ${i}: month line "${h.label}" missing`);
    assert.ok(cell.includes(`>${h.yearLabel}\n`) || cell.includes(`>${h.yearLabel}<`),
      `cell ${i}: year line "${h.yearLabel}" missing`);
    assert.match(h.yearLabel, /^\d{2}$/, `cell ${i}: the year is 2 Buddhist digits`);
  });
});

test('no column in the window lacks a year, whatever the window is', () => {
  // The user-facing claim, stated once and cheaply: not "the crossing column
  // has a year" but "no column does not".
  const html = render(WINDOW);
  const yearless = monthColumns(WINDOW)
    .filter((h, i) => !monthHeaderCells(html)[i]?.includes(`>${h.yearLabel}`))
    .map((h) => h.key);
  assert.deepEqual(yearless, []);
});

test('the year line is muted and smaller, using a token already in this file', () => {
  // Reused, not introduced — the same muted pair the filter bar and the result
  // count already use. A new colour here would be a design decision smuggled in
  // as a bug fix.
  const cell = monthHeaderCells(render(WINDOW))[0];
  assert.match(cell, /text-\[11px\]/, 'the year is smaller than the month');
  assert.match(cell, /text-9e-slate-dp-50 dark:text-\[#94a3b8\]/, 'and muted');
  assert.ok(
    render(WINDOW).includes('text-9e-slate-dp-50 dark:text-[#94a3b8]'),
    'which is the pair already in use elsewhere on the page',
  );
});

test('the year never reaches the header via a hand-added 543', () => {
  // Kept from the previous rule. th-TH gives the Buddhist era natively; the two
  // wrong answers are the Gregorian year and a doubly-shifted one.
  const html = render(WINDOW);
  for (const h of monthColumns(WINDOW)) {
    assert.equal(h.yearLabel.includes('3113'), false, 'not 2570 + 543 again');
    assert.notEqual(h.yearLabel, String(h.year).slice(-2), 'not the Gregorian year');
  }
  assert.equal(html.includes('543'), false);
});

test('CONTROL: the per-cell probe DOES distinguish a yearless header', () => {
  /**
   * Without this, `monthHeaderCells` could be returning [] — every `forEach`
   * above would run zero times and every assertion would pass vacuously. Run
   * against synthetic markup in both shapes.
   */
  const withYear = '<th class="px-2 py-3 text-center font-bold"><span>ม.ค.</span><span>70</span></th>';
  const without  = '<th class="px-2 py-3 text-center font-bold"><span>ม.ค.</span></th>';
  assert.equal(monthHeaderCells(withYear).length, 1, 'the matcher finds a real cell');
  assert.ok(monthHeaderCells(withYear)[0].includes('>70<'));
  assert.equal(monthHeaderCells(without)[0].includes('>70<'), false, 'and notices a missing year');
  // …and it really is finding cells in the live render, not just in fixtures.
  assert.equal(monthHeaderCells(render(WINDOW)).length, WINDOW.length);
});

// ── Column sizing ───────────────────────────────────────────────────────────

test("the table's minWidth grows with the month count", () => {
  const html = render(WINDOW);
  assert.ok(
    html.includes(`min-width:${tableMinWidth(WINDOW.length)}px`),
    `expected min-width:${tableMinWidth(WINDOW.length)}px in the rendered table`,
  );
  // The value is the frozen block plus one MONTH_MIN_WIDTH per column — not a
  // constant that happens to be near it.
  assert.equal(
    tableMinWidth(WINDOW.length),
    FROZEN_TOTAL + MONTH_MIN_WIDTH * WINDOW.length,
  );
});

test('the dead min-w-[900px] is gone and the table is width:100%', () => {
  const html = render(WINDOW);
  assert.equal(html.includes('min-w-[900px]'), false, 'a constant that stopped describing anything');
  assert.match(html, /<table class="[^"]*\bw-full\b/, 'width:100% is what lets months absorb slack');
});

test('the month <col>s carry NO width; the frozen ones carry theirs', () => {
  const html = render(WINDOW);
  const colgroup = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/)?.[1] ?? '';
  assert.notEqual(colgroup, '', 'colgroup not found');

  const cols = colgroup.match(/<col[^>]*>/g) ?? [];
  assert.equal(cols.length, 4 + WINDOW.length, 'four frozen plus one per month');

  const frozen = cols.slice(0, 4);
  const months = cols.slice(4);
  assert.deepEqual(
    frozen.map((c) => c.match(/width:(\d+)px/)?.[1]),
    ['120', '360', '60', '100'],
  );
  for (const col of months) {
    assert.equal(/width/.test(col), false, `a month <col> must be widthless: ${col}`);
  }
});

test('the month <th> and <td> no longer carry the dead min-w-[90px]', () => {
  // It never applied — the colgroup wins under `table-fixed` — and it would
  // actively mislead now that the month width is dynamic.
  const html = render(WINDOW);
  assert.equal(html.includes('min-w-[90px]'), false);
});

test('CONTROL: the sizing probes DO discriminate between month counts', () => {
  // Without this, `min-width:…px` could be absent entirely and both sizing
  // assertions above would be matching a substring that never varies.
  const wide = render(WINDOW);
  assert.ok(wide.includes(`min-width:${tableMinWidth(6)}px`));
  assert.equal(wide.includes(`min-width:${tableMinWidth(2)}px`), false, 'not a fixed string');
  assert.equal(tableMinWidth(6) - tableMinWidth(2), MONTH_MIN_WIDTH * 4);
});

// ── Sticky offsets are INLINE, never an arbitrary Tailwind class ────────────

test('no left-[ arbitrary class survives on the frozen cells', () => {
  /**
   * Tailwind scans SOURCE TEXT and never evaluates it, so `left-[${x}px]`
   * compiles to no class at all and fails silently as an unstuck column. The
   * offsets are inline styles for that reason.
   */
  const html = render(WINDOW);
  assert.equal(html.includes('left-['), false, 'arbitrary left-[…] classes must be gone');
});

test('the frozen cells carry their cumulative offsets as inline left', () => {
  const html = render(WINDOW);
  // `left:0` without a unit is React's own serialisation of the number 0 for a
  // length property; every non-zero one keeps its px. Asserted in the exact
  // form the renderer emits rather than a normalised one, so this test fails if
  // that serialisation ever changes rather than silently matching nothing.
  assert.ok(html.includes('style="left:0"'), 'missing inline left:0 on the first frozen column');
  for (const left of [120, 480, 540]) {
    assert.ok(html.includes(`left:${left}px`), `missing inline left:${left}px`);
  }
  // Every frozen cell is still sticky — losing that would let them scroll away
  // while every offset assertion above still passed. 4 columns × (1 header row
  // + 1 body row) = 8.
  const stickyCells = html.match(/class="sticky /g) ?? [];
  assert.ok(stickyCells.length >= 8, `expected >= 8 sticky cells, got ${stickyCells.length}`);
});

test('CONTROL: the left- probe would fire on a real arbitrary class', () => {
  // Proves the absence assertion is not matching an impossible string.
  assert.ok('<th class="sticky left-[120px] z-10">'.includes('left-['));
  assert.equal('<th class="sticky z-10" style="left:120px">'.includes('left-['), false);
});
