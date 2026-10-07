import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardPosition,
  nearestIndex,
  niceTicks,
  pointValueText,
  tooltipText,
} from '@/components/admin/charts/chartGeometry';
import { yAxis } from '@/components/admin/charts/LineChart';
import { thaiDay, thaiDayTick, thaiDayWithWeekday } from '@/lib/admin/thaiDay';

// ── nice ticks ────────────────────────────────────────────────────────────

test('niceTicks: 1/2/5 × 10^n steps, 4–6 ticks, max rounded up', () => {
  assert.deepEqual(niceTicks(667, { integer: true }).ticks, [0, 200, 400, 600, 800]);
  assert.deepEqual(niceTicks(97, { integer: true }).ticks, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks(6, { integer: true }).ticks, [0, 2, 4, 6]);
  assert.deepEqual(niceTicks(1110, { integer: true }).ticks, [0, 500, 1000, 1500]);
  assert.deepEqual(niceTicks(0.7).ticks, [0, 0.2, 0.4, 0.6, 0.8]);
  for (const max of [1, 3, 7, 13, 48, 99, 101, 250, 999, 12345]) {
    const { ticks, step, top } = niceTicks(max, { integer: true });
    assert.ok(ticks.length >= 4 && ticks.length <= 6, `${max}: ${ticks}`);
    assert.ok(top >= max, `${max}: top ${top} below max`);
    const mant = step / 10 ** Math.floor(Math.log10(step));
    assert.ok([1, 2, 5].includes(Math.round(mant)), `${max}: step ${step}`);
  }
});

test('niceTicks: integer data never gets fractional steps; empty/zero data still has an axis', () => {
  assert.deepEqual(niceTicks(1, { integer: true }).ticks, [0, 1, 2, 3]);
  assert.deepEqual(niceTicks(0, { integer: true }).ticks, [0, 1, 2, 3]);
  assert.ok(niceTicks(2, { integer: true }).ticks.every(Number.isInteger));
});

test('yAxis: an explicit yMax keeps equal steps (percentages 0/25/50/75/100)', () => {
  assert.deepEqual(yAxis([12.5, 80], { yMax: 100, yTicks: 4 }).ticks, [0, 25, 50, 75, 100]);
  assert.deepEqual(yAxis([3, null, 667]).ticks, [0, 200, 400, 600, 800], 'nice ticks without yMax');
});

// ── hover / card ──────────────────────────────────────────────────────────

test('nearestIndex snaps to the closest x, ties to the earlier point', () => {
  const xs = [44, 200, 400, 784];
  assert.equal(nearestIndex(0, xs), 0);
  assert.equal(nearestIndex(130, xs), 1);
  assert.equal(nearestIndex(299, xs), 1);
  assert.equal(nearestIndex(301, xs), 2);
  assert.equal(nearestIndex(900, xs), 3);
  assert.equal(nearestIndex(122, [44, 200]), 0, 'exact midpoint goes to the earlier point');
  assert.equal(nearestIndex(5, []), -1);
});

test('cardPosition: right of the guide by default, flips left near the right edge, never clipped', () => {
  assert.deepEqual(cardPosition({ anchorX: 100, cardWidth: 150, containerWidth: 800 }), { side: 'right', left: 112 });
  assert.deepEqual(cardPosition({ anchorX: 750, cardWidth: 150, containerWidth: 800 }), { side: 'left', left: 588 });
  // near the left edge it stays on the right
  assert.equal(cardPosition({ anchorX: 5, cardWidth: 150, containerWidth: 800 }).side, 'right');
  // narrower container than the card + gap on either side: clamped inside
  for (const anchorX of [0, 60, 120, 180, 200]) {
    const { left } = cardPosition({ anchorX, cardWidth: 150, containerWidth: 200 });
    assert.ok(left >= 0 && left + 150 <= 200, `anchor ${anchorX}: left ${left}`);
  }
  // card wider than the container: pinned at 0
  assert.equal(cardPosition({ anchorX: 50, cardWidth: 300, containerWidth: 200 }).left, 0);
});

test('tooltip text: value, gap and not-collected wording; meta joined for aria-live', () => {
  const f = (v) => `${v} ครั้ง`;
  assert.equal(pointValueText(5, 3, 2, f), '5 ครั้ง');
  assert.equal(pointValueText(null, 1, 2, f), 'ยังไม่เริ่มเก็บ');
  assert.equal(pointValueText(null, 3, 2, f), 'ไม่มีข้อมูล');
  assert.equal(pointValueText(null, 0, undefined, f), 'ไม่มีข้อมูล');
  assert.equal(
    tooltipText({ line1: 'อ. 7 ต.ค. 2569', line2: '667 ครั้ง', meta: [{ label: 'เทียบวันก่อน', value: '+52.3%' }] }),
    'อ. 7 ต.ค. 2569 · 667 ครั้ง · เทียบวันก่อน +52.3%',
  );
  assert.equal(tooltipText(null), '');
});

// ── Thai day labels ───────────────────────────────────────────────────────

test('Thai day labels: weekday + day + month + Buddhist year; tick drops weekday and year', () => {
  assert.equal(thaiDay('2026-10-07'), '7 ต.ค. 2569');
  assert.equal(thaiDayWithWeekday('2026-10-07'), 'พ. 7 ต.ค. 2569'); // a Wednesday
  assert.equal(thaiDayWithWeekday('2026-10-05'), 'จ. 5 ต.ค. 2569');
  assert.equal(thaiDayWithWeekday('2026-10-11'), 'อา. 11 ต.ค. 2569');
  assert.equal(thaiDayTick('2026-09-08'), '8 ก.ย.');
  assert.equal(thaiDay(null), null);
});
