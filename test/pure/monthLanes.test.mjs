import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneLayout, roundInWindow, roundSpanIndices } from '@/lib/schedule/monthLanes';

/**
 * Lane packing for the /schedule desktop table.
 *
 * ── THE TWO THINGS UNDER TEST ───────────────────────────────────────────────
 * 1. A round crossing months SPANS them, while a round inside one month stays
 *    ALIGNED under it — which one `<tr>` cannot do when the two overlap, hence
 *    lanes.
 * 2. A round is visible when ANY month of its span is in the window. The shipped
 *    code keyed a round by its FIRST DATE only, so filtering to "เฉพาะ ต.ค."
 *    made a 30 ก.ย. – 1 ต.ค. round vanish and took the whole course row with it.
 *
 * Every date here is FIXED. The window is written out rather than rolled off a
 * clock, because a packing test whose columns move with the calendar is a test
 * that means something different every month.
 */

const WINDOW = ['2026-09', '2026-10', '2026-11', '2026-12'];

/** A round, with `dates` in the shape upstream sends (local-midnight ISO). */
const at = (y, m, d) => new Date(y, m - 1, d).toISOString();
const round = (id, dates) => ({ _id: id, dates });

// Rounds, named for where they sit in WINDOW.
const SEP = round('sep', [at(2026, 9, 8), at(2026, 9, 9)]);          // col 0
const SEP_2 = round('sep2', [at(2026, 9, 20)]);                       // col 0
const OCT = round('oct', [at(2026, 10, 6), at(2026, 10, 7)]);         // col 1
const NOV = round('nov', [at(2026, 11, 3)]);                          // col 2
const CROSS_SEP_OCT = round('x-so', [at(2026, 9, 30), at(2026, 10, 1)]); // cols 0-1
const CROSS_OCT_NOV = round('x-on', [at(2026, 10, 31), at(2026, 11, 2)]); // cols 1-2

// ── roundSpanIndices ────────────────────────────────────────────────────────

test('a single-month round occupies exactly one column', () => {
  assert.deepEqual(roundSpanIndices(OCT.dates, WINDOW), {
    startIdx: 1, endIdx: 1, span: 1,
    clippedBefore: false, clippedAfter: false,
    startKey: '2026-10', endKey: '2026-10',
  });
});

test('a cross-month round occupies both its columns', () => {
  const span = roundSpanIndices(CROSS_SEP_OCT.dates, WINDOW);
  assert.equal(span.startIdx, 0);
  assert.equal(span.endIdx, 1);
  assert.equal(span.span, 2);
  assert.equal(span.clippedBefore, false);
  assert.equal(span.clippedAfter, false);
});

test('a round starting BEFORE the window is clipped, not dropped', () => {
  /**
   * The whole point of §4d: a round running ส.ค.–ก.ย. is still real training in
   * September and must show in the September column. Clipping the CELL is not
   * the same as hiding the round.
   */
  const span = roundSpanIndices([at(2026, 8, 30), at(2026, 9, 1)], WINDOW);
  assert.equal(span.startIdx, 0, 'clipped to the first visible column');
  assert.equal(span.endIdx, 0);
  assert.equal(span.span, 1);
  assert.equal(span.clippedBefore, true);
  assert.equal(span.clippedAfter, false);
  assert.equal(span.startKey, '2026-08', 'and it remembers the month it really starts in');
});

test('a round ending AFTER the window is clipped the other way', () => {
  const span = roundSpanIndices([at(2026, 12, 30), at(2027, 1, 2)], WINDOW);
  assert.equal(span.startIdx, 3);
  assert.equal(span.endIdx, 3);
  assert.equal(span.clippedBefore, false);
  assert.equal(span.clippedAfter, true);
  assert.equal(span.endKey, '2027-01');
});

test('a round spanning the WHOLE window is clipped at both ends', () => {
  const span = roundSpanIndices([at(2026, 7, 30), at(2027, 3, 2)], WINDOW);
  assert.deepEqual(
    [span.startIdx, span.endIdx, span.span, span.clippedBefore, span.clippedAfter],
    [0, 3, 4, true, true],
  );
});

test('a round entirely outside the window is DROPPED, not clamped', () => {
  /**
   * Clamping instead of dropping is the tempting one-character version of this
   * (`Math.max(0, …)` with no bounds check) and it would pin last March's round
   * into the September column, inventing a session that is not running.
   */
  assert.equal(roundSpanIndices([at(2026, 3, 4)], WINDOW), null, 'before');
  assert.equal(roundSpanIndices([at(2027, 6, 4)], WINDOW), null, 'after');
  // One month either side — the closest a dropped round can be.
  assert.equal(roundSpanIndices([at(2026, 8, 15)], WINDOW), null, 'the month before');
  assert.equal(roundSpanIndices([at(2027, 1, 15)], WINDOW), null, 'the month after');
});

test('no usable dates, or no window, is null', () => {
  assert.equal(roundSpanIndices([], WINDOW), null);
  assert.equal(roundSpanIndices(['nope', null], WINDOW), null);
  assert.equal(roundSpanIndices(undefined, WINDOW), null);
  assert.equal(roundSpanIndices(OCT.dates, []), null);
  assert.equal(roundSpanIndices(OCT.dates, undefined), null);
});

test('the span is computed by month ARITHMETIC, not by indexOf', () => {
  /**
   * `visibleMonths.indexOf(startKey)` returns the same -1 for "one month before
   * the window" and "three years before", so it cannot tell a clipped round from
   * a dropped one. These two rounds both have a startKey absent from WINDOW and
   * must come out differently.
   */
  const clipped = roundSpanIndices([at(2026, 8, 31), at(2026, 9, 1)], WINDOW);
  const dropped = roundSpanIndices([at(2023, 8, 31)], WINDOW);
  assert.ok(clipped, 'the ส.ค.–ก.ย. round is in view');
  assert.equal(dropped, null, 'the 2023 round is not');
});

// ── THE BUCKETING DEFECT ────────────────────────────────────────────────────

test('THE FIX: a cross-month round is visible from EITHER of its months', () => {
  /**
   * The shipped predicate keyed on the first date alone. Filtering the window
   * down to October made this round — which really does run on 1 ต.ค. — vanish,
   * and `filteredCourses` then dropped the entire course row because no visible
   * bucket held anything.
   */
  assert.equal(roundInWindow(CROSS_SEP_OCT.dates, ['2026-09']), true, 'from September');
  assert.equal(roundInWindow(CROSS_SEP_OCT.dates, ['2026-10']), true, 'from October');
  assert.equal(roundInWindow(CROSS_SEP_OCT.dates, ['2026-11']), false, 'but not from November');
});

test('CONTROL: a FIRST-DATE predicate DOES lose the round — the shipped defect', () => {
  // The old rule, as code: bucket on the month of dates[0] and ask whether that
  // one bucket is visible.
  const firstDateOnly = (dates, months) => {
    const d = new Date(dates[0]);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return months.includes(key);
  };

  assert.equal(firstDateOnly(CROSS_SEP_OCT.dates, ['2026-10']), false, 'the defect reproduces');
  assert.notEqual(
    firstDateOnly(CROSS_SEP_OCT.dates, ['2026-10']),
    roundInWindow(CROSS_SEP_OCT.dates, ['2026-10']),
    'and the new predicate disagrees with it — which is the fix',
  );
  // The other half: the two rules AGREE on a single-month round, which is why
  // the defect went unnoticed for so long.
  assert.equal(firstDateOnly(OCT.dates, ['2026-10']), roundInWindow(OCT.dates, ['2026-10']));
});

// ── laneLayout: the common case must not regress ────────────────────────────

test('THE PROPERTY: no crossing round means exactly ONE lane', () => {
  /**
   * The regression that would matter most. Almost every course row on the page
   * has no cross-month round at all, and those rows must render exactly as they
   * did — one `<tr>`, no rowSpan, no colSpan.
   */
  const { lanes } = laneLayout([SEP, OCT, NOV], WINDOW);
  assert.equal(lanes.length, 1);
  assert.deepEqual(
    lanes[0].map((c) => [c.startIdx, c.endIdx, c.span]),
    [[0, 0, 1], [1, 1, 1], [2, 2, 1]],
    'three single-column cells, left to right',
  );
  assert.ok(lanes[0].every((c) => c.rounds.length === 1));
});

test('two rounds in the SAME month share one cell and stack inside it', () => {
  const { lanes } = laneLayout([SEP, SEP_2], WINDOW);
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].length, 1, 'one cell, not two');
  assert.equal(lanes[0][0].span, 1);
  assert.deepEqual(lanes[0][0].rounds.map((r) => r._id), ['sep', 'sep2'], 'in date order');
});

test('a cross-month round alone is one lane with one spanning cell', () => {
  const { lanes } = laneLayout([CROSS_SEP_OCT], WINDOW);
  assert.equal(lanes.length, 1);
  assert.deepEqual(lanes[0].map((c) => [c.startIdx, c.span]), [[0, 2]]);
});

test('a cross-month round and a round it OVERLAPS need two lanes', () => {
  /**
   * The case that forces lanes to exist. `x-so` covers columns 0-1 and `oct`
   * sits at column 1; one `<tr>` cannot hold a colSpan=2 over 0-1 and a separate
   * cell at 1.
   */
  const { lanes } = laneLayout([CROSS_SEP_OCT, OCT], WINDOW);
  assert.equal(lanes.length, 2);
  assert.deepEqual(lanes[0].map((c) => [c.startIdx, c.endIdx]), [[0, 1]], 'lane 1 takes the span');
  assert.deepEqual(lanes[1].map((c) => [c.startIdx, c.endIdx]), [[1, 1]], 'lane 2 takes the overlap');
});

test('a NON-overlapping round rides in the same lane as a spanning one', () => {
  // `x-so` covers 0-1, `nov` is at 2 — no overlap, so no second lane. The
  // greedy pack must not open one per cross-month round.
  const { lanes } = laneLayout([CROSS_SEP_OCT, NOV], WINDOW);
  assert.equal(lanes.length, 1, 'one lane is enough when nothing overlaps');
  assert.deepEqual(lanes[0].map((c) => [c.startIdx, c.endIdx]), [[0, 1], [2, 2]]);
});

test('two overlapping spans open a third lane only when they must', () => {
  // x-so (0-1), x-on (1-2), oct (1). All three want column 1.
  const { lanes } = laneLayout([CROSS_SEP_OCT, CROSS_OCT_NOV, OCT], WINDOW);
  assert.equal(lanes.length, 3);
  assert.deepEqual(lanes[0].map((c) => [c.startIdx, c.endIdx]), [[0, 1]]);
  assert.deepEqual(lanes[1].map((c) => [c.startIdx, c.endIdx]), [[1, 1]]);
  assert.deepEqual(lanes[2].map((c) => [c.startIdx, c.endIdx]), [[1, 2]]);
});

test('cells never overlap WITHIN a lane', () => {
  /**
   * The invariant the greedy pack exists to hold, and the one that shears the
   * table if it breaks — two cells in one `<tr>` claiming the same column push
   * every later column right by one.
   */
  const { lanes } = laneLayout(
    [CROSS_SEP_OCT, CROSS_OCT_NOV, OCT, SEP, NOV, SEP_2],
    WINDOW,
  );
  for (const [i, lane] of lanes.entries()) {
    let cursor = -1;
    for (const cell of lane) {
      assert.ok(cell.startIdx > cursor, `lane ${i}: cell at ${cell.startIdx} overlaps ${cursor}`);
      cursor = cell.endIdx;
    }
  }
});

test('every cell fits inside the window', () => {
  const { lanes } = laneLayout(
    [CROSS_SEP_OCT, round('wide', [at(2026, 7, 1), at(2027, 5, 1)]), NOV],
    WINDOW,
  );
  for (const cell of lanes.flat()) {
    assert.ok(cell.startIdx >= 0, 'no cell starts left of the window');
    assert.ok(cell.endIdx <= WINDOW.length - 1, 'nor ends right of it');
    assert.equal(cell.span, cell.endIdx - cell.startIdx + 1, 'span matches its bounds');
  }
});

test('the total colSpan of a lane never exceeds the column count', () => {
  /**
   * The off-by-one that shears the whole table and that no visual check catches
   * reliably. Asserted as a property over a deliberately awkward set.
   */
  const { lanes } = laneLayout(
    [CROSS_SEP_OCT, CROSS_OCT_NOV, OCT, SEP, SEP_2, NOV,
      round('wide', [at(2026, 8, 1), at(2027, 2, 1)])],
    WINDOW,
  );
  for (const lane of lanes) {
    const used = lane.reduce((n, c) => n + c.span, 0);
    assert.ok(used <= WINDOW.length, `a lane claims ${used} of ${WINDOW.length} columns`);
  }
});

test('a clipped cell carries its continuation months', () => {
  const { lanes } = laneLayout(
    [round('early', [at(2026, 8, 30), at(2026, 9, 1)]),
      round('late', [at(2026, 12, 30), at(2027, 1, 2)])],
    WINDOW,
  );
  const cells = lanes.flat();
  const early = cells.find((c) => c.rounds[0]._id === 'early');
  const late = cells.find((c) => c.rounds[0]._id === 'late');
  assert.equal(early.clippedBefore, true);
  assert.equal(early.beforeKey, '2026-08');
  assert.equal(early.clippedAfter, false);
  assert.equal(late.clippedAfter, true);
  assert.equal(late.afterKey, '2027-01');
  assert.equal(late.clippedBefore, false);
});

test('an empty round list, or one entirely out of window, is zero lanes', () => {
  assert.deepEqual(laneLayout([], WINDOW).lanes, []);
  assert.deepEqual(laneLayout([round('old', [at(2020, 1, 1)])], WINDOW).lanes, []);
  assert.deepEqual(laneLayout(undefined, WINDOW).lanes, []);
});

test('a one-column window still packs', () => {
  // The narrowest real case — the user filtered to a single month. A cross-month
  // round clipped to that one column must still land in it.
  const { lanes } = laneLayout([CROSS_SEP_OCT, OCT], ['2026-10']);
  assert.equal(lanes.length, 1, 'both clip to column 0, so they share one cell');
  assert.equal(lanes[0][0].span, 1);
  assert.deepEqual(lanes[0][0].rounds.map((r) => r._id), ['x-so', 'oct']);
  assert.equal(lanes[0][0].clippedBefore, true);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the lane-count assertions DO distinguish one lane from two', () => {
  /**
   * "exactly one lane" is the property that must not regress, and a broken
   * `laneLayout` returning `{lanes: []}` would satisfy `lanes.length === 1`
   * nowhere but would satisfy several `.every()` calls vacuously. So: the
   * one-lane case and the two-lane case must actually come out different.
   */
  const flat = laneLayout([SEP, OCT, NOV], WINDOW).lanes;
  const stacked = laneLayout([CROSS_SEP_OCT, OCT], WINDOW).lanes;
  assert.notEqual(flat.length, stacked.length, 'the two cases must differ');
  assert.equal(flat.length, 1);
  assert.equal(stacked.length, 2);
  // And neither is empty, which is the shape that would pass `every` for free.
  assert.ok(flat.flat().length > 0 && stacked.flat().length > 0);
});

test('CONTROL: packing everything into ONE lane would break the no-overlap invariant', () => {
  /**
   * The tempting simplification — skip the greedy pack, put every cell in lane
   * 0 — and proof that the invariant test above would catch it.
   */
  const cells = laneLayout([CROSS_SEP_OCT, OCT], WINDOW).lanes.flat();
  const asOneLane = [cells];
  let overlapped = false;
  let cursor = -1;
  for (const cell of asOneLane[0]) {
    if (cell.startIdx <= cursor) overlapped = true;
    cursor = cell.endIdx;
  }
  assert.equal(overlapped, true, 'flattening these two cells DOES overlap');
});

test('CONTROL: the fixture rounds really do span what the tests assume', () => {
  // A fixture whose dates silently stopped crossing a month would make half this
  // file pass while testing the single-month path twice.
  assert.equal(roundSpanIndices(CROSS_SEP_OCT.dates, WINDOW).span, 2, 'x-so must cross');
  assert.equal(roundSpanIndices(CROSS_OCT_NOV.dates, WINDOW).span, 2, 'x-on must cross');
  assert.equal(roundSpanIndices(OCT.dates, WINDOW).span, 1, 'oct must NOT cross');
  assert.equal(WINDOW.length, 4);
});
