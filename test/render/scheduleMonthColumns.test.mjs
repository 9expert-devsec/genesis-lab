import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleClient } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  addMonths,
  decemberOf,
  monthColumns,
  windowBetween,
} from '@/lib/schedule/monthWindow';
import { siteMonthKey } from '@/lib/articlePublishTime';
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
 *     new: columns rendered = every month of the range, always
 *
 * The year-crossing arithmetic itself is pinned on FIXED dates in
 * test/pure/scheduleMonthWindow.test.mjs. What this tier adds is that
 * ScheduleClient actually consumes it — a component that kept its own 0–11 loop
 * passes every pure test in the repo.
 */

const now = new Date();
/**
 * The month range the page opens on: this month through December of NEXT year —
 * the rule's longer branch, i.e. an eligible round reaches past this year.
 *
 * Pinned to next December rather than left to whatever the live clock implies,
 * because a range derived from `now` alone is ONE month long every December and
 * a one-column table cannot demonstrate anything this file claims.
 */
const RANGE_START = siteMonthKey(now);
const RANGE_END = decemberOf(RANGE_START, 1);
const WINDOW = windowBetween(RANGE_START, RANGE_END);

/** A `YYYY-MM-15` date inside the Nth month of the default range. */
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

/**
 * `monthRangeEnd` is passed because the SHELL is what is under test here, and
 * the shell takes the range end as a prop — the server computes it (see
 * schedule/page.jsx). Omitting it would let the component fall back to its own
 * year-end floor, and every assertion about a month past this December would
 * then be measuring the fallback rather than the range.
 */
const render = (keys, monthRangeEnd = RANGE_END) =>
  renderToStaticMarkup(
    createElement(ScheduleClient, {
      courses: [courseWithSchedulesIn(keys)],
      programs: [{ _id: 'p1', program_name: 'AI' }],
      schedulePDF: null,
      earlyBirdMap: {},
      monthRangeEnd,
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
  // Fixture guard, unchanged in role. The length was `=== DEFAULT_MONTHS` while
  // the window was a fixed six; the range is variable now, so the guard pins
  // what it was always guarding against — a WINDOW degenerated to one entry,
  // which would make the test above pass while asserting almost nothing.
  assert.ok(WINDOW.length >= 13, 'the pinned range spans at least to next December');
  assert.equal(WINDOW[0], siteMonthKey(now), 'starts at the current month, inclusive');
  assert.equal(WINDOW.at(-1), RANGE_END, 'and ends at the range end, inclusive');
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
  const oldDrops = (startMonth) => {
    const start = `2026-${String(startMonth + 1).padStart(2, '0')}`;
    // The range as the rule now computes it, on a FIXED start, taking the
    // longer branch — the one a year-blind loop cannot express at all.
    return windowBetween(start, decemberOf(start, 1))
      .filter((key) => !oldVisible(startMonth).includes(Number(key.slice(5)) - 1));
  };

  assert.deepEqual(oldDrops(0), [], 'January: the old rule happened to be right');
  assert.deepEqual(
    oldDrops(7),
    ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07'],
    'August: everything up to next July is unreachable',
  );
  assert.deepEqual(
    oldDrops(11),
    [
      '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
      '2027-07', '2027-08', '2027-09', '2027-10', '2027-11',
    ],
    'December: eleven of thirteen lost, and the ถึง select could not reach them either',
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

test('a STALE server range end is clamped up to the client\'s own year end', () => {
  /**
   * THE NEW-YEAR CASE. `monthRangeEnd` is computed when the HTML is built and
   * this page is ISR-cached for 30 minutes (page.jsx `revalidate = 1800`), so a
   * page built on 31 December can be served to a visitor whose calendar has
   * already rolled over. Its end would then be LAST December — behind the
   * visitor's own month — and an unclamped range would collapse to a single
   * column with every later round dropped from a page that is otherwise fine.
   *
   * So the client floors the end at December of ITS current Bangkok year. Here
   * the server end is deliberately two years stale; what must render is the
   * client's own December, not the stale one and not a one-month range.
   */
  const clientDecember = decemberOf(RANGE_START, 0);
  const stale = decemberOf(addMonths(RANGE_START, -24), 0);
  const html = render([RANGE_START], stale);

  const headers = monthHeaderCells(html);
  assert.equal(
    headers.length,
    windowBetween(RANGE_START, clientDecember).length,
    'the range runs to the CLIENT\'s December, whatever the server said',
  );
  assert.ok(headers.length >= 1);
  // The stale end is in the past, so its own months must not appear at all.
  assert.equal(html.includes(`&amp;class=s-${stale}`), false, 'no column from the stale year');
});

test('CONTROL: an end the server pushes FURTHER than the client floor is honoured', () => {
  /**
   * The clamp is one-directional ON PURPOSE — up, never down. Without this
   * control the test above would also pass against a component that ignored
   * `monthRangeEnd` entirely and always used its own December, which would
   * discard the whole data-driven rule while looking correct.
   */
  const toNextDecember = render([RANGE_START], RANGE_END);
  const toThisDecember = render([RANGE_START], decemberOf(RANGE_START, 0));
  assert.equal(monthHeaderCells(toNextDecember).length, WINDOW.length, 'the server extended it');
  assert.ok(
    monthHeaderCells(toNextDecember).length > monthHeaderCells(toThisDecember).length,
    'and the two ends really do render different numbers of columns',
  );
});

test('the header renders exactly one month column per month of the range', () => {
  // Was `=== PUBLIC_SCHEDULE_DEFAULT_MONTHS` on both sides, which pinned the
  // count to a constant. The range has no constant now, so the claim is stated
  // as the identity it always really was: one column per month IN RANGE, empty
  // months included. That is also the stronger form — it holds at any length.
  const html = render(WINDOW);
  const headers = monthColumns(WINDOW);
  assert.equal(headers.length, WINDOW.length);
  assert.equal(monthHeaderCells(html).length, WINDOW.length);
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
  assert.ok(wide.includes(`min-width:${tableMinWidth(WINDOW.length)}px`));
  assert.equal(
    wide.includes(`min-width:${tableMinWidth(2)}px`),
    false,
    'not a fixed string',
  );
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
