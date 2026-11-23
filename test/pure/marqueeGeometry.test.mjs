import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARQUEE_GAP_PX,
  MARQUEE_ITEM_PX,
  marqueeCopyCount,
  marqueeDurationSec,
  marqueePeriodPx,
  marqueeTrackVars,
} from '@/lib/marqueeGeometry.mjs';

/**
 * LOGO-MARQUEE — the numbers the CSS animation runs on.
 *
 * The old loop wrapped at scrollWidth / 3. With 21 logos that is
 * (63·140 + 62·48) / 3 = 3,932px, one 48px gap short per copy of the true
 * period 21·(140+48) = 3,948px — a 16px jump on every loop.
 */

test('the period includes the trailing gap: 21 logos = 3,948px, not scrollWidth/3 = 3,932px', () => {
  assert.equal(MARQUEE_ITEM_PX + MARQUEE_GAP_PX, 188);
  assert.equal(marqueePeriodPx(21), 3948);
  const oldScrollWidthThird = (63 * 140 + 62 * 48) / 3;
  assert.equal(oldScrollWidthThird, 3932);
  assert.equal(marqueePeriodPx(21) - oldScrollWidthThird, 16, 'the seam the old wrap math jumped');
});

test('copies cover the 1200px window for any row length, never fewer than 2', () => {
  assert.equal(marqueeCopyCount(21), 2, 'today: 2 copies of 3,948px');
  assert.equal(marqueeCopyCount(0), 0);
  for (const n of [1, 2, 3, 5, 7, 21, 40]) {
    const k = marqueeCopyCount(n);
    const p = marqueePeriodPx(n);
    assert.ok(k >= 2, `${n} logos → ${k} copies`);
    // After sliding one period, the track must still reach past the window.
    assert.ok(k * p >= p + 1200, `${n} logos: ${k}×${p} < ${p}+1200`);
    // …and not one copy more than needed.
    assert.ok(k === 2 || (k - 1) * p < p + 1200, `${n} logos: ${k} copies is more than needed`);
  }
});

test('duration keeps each row\'s speed: period ÷ px/s', () => {
  assert.equal(marqueeDurationSec(21, 40), 3948 / 40);
  assert.equal(marqueeDurationSec(21, 35), 3948 / 35);
  assert.equal(marqueeDurationSec(21, 0), 0);
  const vars = marqueeTrackVars(21, 40);
  assert.equal(vars['--marquee-shift'], '-50.000000%', 'two copies → move by half the track');
  assert.equal(vars['--marquee-duration'], '98.700s');
});
