import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStat,
  formatRating,
  formatParts,
  statParts,
} from '@/lib/stats/formatStat';

/**
 * The one headline-number formatter. See src/lib/stats/formatStat.js for the
 * rule: ≥1000 → floored thousands + "K+", 100–999 → value + "+", below 100
 * exact, rating always one decimal.
 */

test('the values the strips carry today format exactly as they display today', () => {
  assert.equal(formatStat(5000), '5K+');
  assert.equal(formatStat(90000), '90K+');
  assert.equal(formatStat(700000), '700K+');
  assert.equal(formatStat(300), '300+');
  assert.equal(formatStat(77), '77');
  assert.equal(formatStat(2), '2');
  assert.equal(formatStat(94000), '94K+');
});

test('the band edges: 0, 99, 100, 999, 1000, 1999', () => {
  assert.equal(formatStat(0), '0');
  assert.equal(formatStat(99), '99');
  assert.equal(formatStat(100), '100+');
  assert.equal(formatStat(999), '999+');
  assert.equal(formatStat(1000), '1K+');
  // floored, never rounded — "2K+" would claim 2,000 for 1,999
  assert.equal(formatStat(1999), '1K+');
  assert.equal(formatStat(94999), '94K+');
});

test('rating always carries one decimal', () => {
  assert.equal(formatRating(5), '5.0');
  assert.equal(formatRating(5.0), '5.0');
  assert.equal(formatRating(4.8), '4.8');
  assert.equal(formatRating(0), '0.0');
  // clamped to the 0–5 scale
  assert.equal(formatRating(7), '5.0');
});

test('junk input formats as 0, never NaN or a negative', () => {
  for (const v of [null, undefined, '', 'abc', -5, NaN]) {
    assert.equal(formatStat(v), '0');
  }
});

test('a mid-animation target keeps the suffix and lands on the server string', () => {
  const parts = statParts(94000);
  assert.deepEqual(parts, { target: 94, decimals: 0, suffix: 'K+' });
  assert.equal(formatParts({ ...parts, target: 47.6 }), '47K+');
  assert.equal(formatParts(parts), formatStat(94000));
  assert.equal(formatParts({ target: 3.66, decimals: 1, suffix: '' }), '3.7');
});
