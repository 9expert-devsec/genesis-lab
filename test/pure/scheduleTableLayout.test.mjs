import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FROZEN_COLUMNS,
  FROZEN_TOTAL,
  MIN_TRACK_WIDTH,
  MONTH_MIN_WIDTH,
  frozenLayout,
  frozenOffsets,
  scrollTrackInset,
  tableMinWidth,
} from '@/lib/schedule/scheduleTableLayout';

/**
 * The /schedule table's horizontal geometry.
 *
 * jsdom does not do layout, so no test in this repo can measure a rendered
 * column. What CAN be pinned is the arithmetic that the sticky offsets and the
 * table floor are derived from — which is where the defect actually lived: four
 * widths written out about a dozen times with nothing making them agree, so a
 * one-column edit sheared the frozen block and only showed it once you scrolled.
 */

test('the frozen offsets are the cumulative sums of the widths', () => {
  assert.deepEqual(frozenOffsets(), [0, 120, 480, 540]);
});

test('offset[0] is 0 and each is the sum of everything to its left', () => {
  // Stated as the RULE rather than as four numbers, so a deliberate width
  // change updates one place and this still holds.
  const offsets = frozenOffsets();
  assert.equal(offsets[0], 0, 'the first column sticks at the container edge');
  for (let i = 1; i < FROZEN_COLUMNS.length; i++) {
    const expected = FROZEN_COLUMNS.slice(0, i).reduce((s, c) => s + c.width, 0);
    assert.equal(offsets[i], expected, `column ${i} must clear the ones before it`);
  }
});

test('FROZEN_TOTAL is derived from the array, not written down', () => {
  assert.equal(FROZEN_TOTAL, FROZEN_COLUMNS.reduce((s, c) => s + c.width, 0));
  assert.equal(FROZEN_TOTAL, 640);
  // …and the last offset plus the last width is the total, which is the
  // property the month columns start at.
  const offsets = frozenOffsets();
  const last = FROZEN_COLUMNS[FROZEN_COLUMNS.length - 1];
  assert.equal(offsets[offsets.length - 1] + last.width, FROZEN_TOTAL);
});

test('CONTROL: a widened column moves every offset AFTER it and none before', () => {
  /**
   * Without this, `frozenOffsets` could be returning a hardcoded
   * `[0, 120, 480, 540]` and every assertion above would pass. Run on a mutated
   * column set: widening the second column by 40 must shift exactly the two
   * offsets to its right.
   */
  const widened = FROZEN_COLUMNS.map((c) =>
    c.key === 'name' ? { ...c, width: c.width + 40 } : c);
  assert.deepEqual(frozenOffsets(widened), [0, 120, 520, 580]);
});

test('frozenLayout attaches the offset and flags the last column', () => {
  const layout = frozenLayout();
  assert.deepEqual(layout.map((c) => c.key), ['code', 'name', 'days', 'price']);
  assert.deepEqual(layout.map((c) => c.left), [0, 120, 480, 540]);
  assert.deepEqual(layout.map((c) => c.isLast), [false, false, false, true]);
  // The labels ride along so the colgroup and the header row cannot fall out of
  // order with each other — an off-by-one there puts the course name under the
  // "วัน" heading, which no width check would catch.
  assert.deepEqual(layout.map((c) => c.label), ['รหัสหลักสูตร', 'ชื่อหลักสูตร', 'วัน', 'ราคา']);
});

// ── tableMinWidth ───────────────────────────────────────────────────────────

test('the table floor grows by one month width per month', () => {
  assert.equal(tableMinWidth(0), FROZEN_TOTAL);
  assert.equal(tableMinWidth(2), 640 + 180);
  assert.equal(tableMinWidth(6), 640 + 540);
  assert.equal(tableMinWidth(12), 640 + 1080);
  for (let n = 1; n <= 18; n++) {
    assert.equal(
      tableMinWidth(n) - tableMinWidth(n - 1),
      MONTH_MIN_WIDTH,
      `adding month ${n} must widen the floor by exactly one column`
    );
  }
});

test('THE POINT: at a narrow selection the floor is BELOW the old 900px', () => {
  /**
   * The old markup used a fixed `min-w-[900px]`. With two months the specified
   * widths summed to 820, the table was forced out to 900, and the 80px surplus
   * was redistributed across ALL columns — including the frozen ones, whose
   * `left-[120px]` / `left-[480px]` / `left-[540px]` offsets stayed pinned to
   * the UNSTRETCHED widths. That is the shear.
   *
   * With a computed floor the table is never forced past its content, so there
   * is no surplus to redistribute and `width: 100%` hands the slack to the
   * month columns instead — which have no width and therefore absorb it.
   */
  assert.ok(tableMinWidth(2) < 900, 'two months must not be forced out to 900');
  assert.equal(tableMinWidth(2), 820, 'exactly the sum of the real widths');
  // And the old constant is not merely smaller — it is meaningless: it happens
  // to equal the floor at a month count nobody chose.
  const monthsThatHappenTo900 = (900 - FROZEN_TOTAL) / MONTH_MIN_WIDTH;
  assert.equal(monthsThatHappenTo900, 2.888888888888889, 'not even an integer');
});

test('the default 6-month window overflows a phone and fits a desktop', () => {
  // The two behaviours the single rule has to produce, expressed as the
  // viewport widths they switch between.
  const floor = tableMinWidth(6);
  assert.equal(floor, 1180);
  assert.ok(floor > 390, 'a phone scrolls');
  assert.ok(floor <= 1200, 'the max-w-[1200px] content column does not');
});

test('tableMinWidth refuses nonsense instead of emitting NaN', () => {
  // A NaN minWidth is dropped by React with no warning, silently restoring the
  // shrink-to-fit behaviour this replaced.
  for (const bad of [undefined, null, NaN, -3, 'six']) {
    assert.equal(tableMinWidth(bad), FROZEN_TOTAL, `${JSON.stringify(bad)}`);
  }
  assert.equal(tableMinWidth('6'), 640 + 540, 'a numeric string still works');
});

test('CONTROL: the floor really depends on the month count', () => {
  // Without this, `tableMinWidth = () => 900` would pass the "grows" loop only
  // if that loop were broken — so pin the coarse claim too.
  assert.notEqual(tableMinWidth(2), tableMinWidth(6));
  assert.ok(tableMinWidth(12) > tableMinWidth(6));
});

// ── scrollTrackInset ────────────────────────────────────────────────────────

test('on a wide container the track starts exactly at the month area', () => {
  /**
   * The frozen columns are sticky and never move, so the whole horizontal
   * overflow IS the month area. A track spanning the full table begins under
   * รหัสหลักสูตร — pointing at something that cannot scroll.
   */
  assert.equal(scrollTrackInset(1200), FROZEN_TOTAL);
  assert.equal(scrollTrackInset(1200), 640);
  // Anything from FROZEN_TOTAL + MIN_TRACK_WIDTH upward gets the full inset.
  assert.equal(scrollTrackInset(FROZEN_TOTAL + MIN_TRACK_WIDTH), FROZEN_TOTAL);
});

test('THE NARROW-VIEWPORT FLOOR: below FROZEN_TOTAL the track keeps a usable width', () => {
  /**
   * A naive `left: 640` on a 390px phone leaves the track zero-width or
   * negative — an invisible or inverted scrollbar exactly where the custom one
   * is doing essential work, since the container is `no-native-scrollbar` and
   * there is nothing else to grab.
   */
  for (const container of [320, 390, 480, 600, 639]) {
    const inset = scrollTrackInset(container);
    assert.ok(inset >= 0, `${container}px: the inset must never go negative`);
    assert.equal(
      container - inset,
      MIN_TRACK_WIDTH,
      `${container}px: the track must keep exactly MIN_TRACK_WIDTH`,
    );
  }
});

test('the floor gives the thumb real travel, not a token sliver', () => {
  // The thumb has its own 40px minimum (Math.max(40, …) in ProgramTable). A
  // track shorter than that is a control with no travel at all.
  assert.equal(MIN_TRACK_WIDTH, 120);
  assert.ok(MIN_TRACK_WIDTH >= 40 * 2, 'at least 80px of drag range in the worst case');
});

test('a container narrower than the floor itself insets to zero, not below', () => {
  // Absurd but reachable (a 200px embed, a print stylesheet). Full-width track
  // is the only sane answer, and it must not be negative.
  for (const container of [0, 50, 120]) {
    assert.equal(scrollTrackInset(container), 0, `${container}px`);
  }
});

test('the inset is monotonic — it never jumps backwards as the viewport grows', () => {
  let prev = -1;
  for (let w = 0; w <= 1400; w += 10) {
    const inset = scrollTrackInset(w);
    assert.ok(inset >= prev, `inset went backwards at ${w}px`);
    assert.ok(inset <= FROZEN_TOTAL, `inset exceeded the frozen block at ${w}px`);
    prev = inset;
  }
});

test('scrollTrackInset refuses nonsense instead of emitting NaN', () => {
  // A NaN marginLeft is dropped by React with no warning, silently restoring
  // the full-width track this replaced.
  for (const bad of [undefined, null, NaN, -50, 'wide']) {
    assert.equal(scrollTrackInset(bad), 0, `${JSON.stringify(bad)}`);
  }
});

test('CONTROL: a naive `left: FROZEN_TOTAL` DOES break the narrow case', () => {
  /**
   * Without this the floor tests above could be satisfied by an implementation
   * that simply returned 0 everywhere. Runs the naive version and asserts it
   * produces exactly the defect the floor exists to stop.
   */
  const naive = () => FROZEN_TOTAL;
  const trackWidth = (container, inset) => container - inset;

  assert.ok(trackWidth(390, naive()) < 0, 'the naive inset inverts the track on a phone');
  assert.equal(trackWidth(640, naive()), 0, '…and zeroes it exactly at the frozen width');
  assert.ok(trackWidth(390, scrollTrackInset(390)) > 0, 'the real one does not');

  // …and the two agree wherever there is room, so the floor is not just a
  // blanket override.
  assert.equal(naive(), scrollTrackInset(1200));
});
