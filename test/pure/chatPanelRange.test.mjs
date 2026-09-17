import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SPAN_DAYS, DEFAULT_SPAN_DAYS, RANGE_PRESETS,
  parseIsoDate, isIsoDate, bangkokToday, shiftIsoDate, spanDays, isValidRange,
  defaultPanelRange, firstParam, readPanelRange, readPage, readVote, readHasError, presetRange,
} from '@/lib/chatPanel/range';

/**
 * src/lib/chatPanel/range.js — the panel's date window, read from the URL.
 *
 * Pure: no env, no clock other than the `now` each function takes. Every
 * "today" below is pinned to an instant, and the Bangkok boundary is tested
 * from both sides of midnight because that is the one place the arithmetic
 * could quietly be off by a day.
 */

// 2026-09-17 12:00:00 UTC — 19:00 in Bangkok, unambiguously the 17th.
const NOON_UTC = Date.UTC(2026, 8, 17, 12, 0, 0);

test('parseIsoDate accepts only real YYYY-MM-DD dates; rolled-forward dates are refused', () => {
  assert.equal(parseIsoDate('2026-09-17'), Date.UTC(2026, 8, 17));
  assert.equal(parseIsoDate('2024-02-29'), Date.UTC(2024, 1, 29), 'a leap day is real');
  for (const bad of ['2026-02-30', '2026-09-31', '2025-02-29', '2026-13-01', '2026-00-10', '2026-9-7', '20260917', 'today', '', null, undefined, 20260917]) {
    assert.equal(parseIsoDate(bad), null, JSON.stringify(bad));
    assert.equal(isIsoDate(bad), false);
  }
  assert.equal(isIsoDate(' 2026-09-17 '), true, 'surrounding whitespace is tolerated');
});

test('bangkokToday: UTC+7, no DST — the day flips at 17:00 UTC', () => {
  assert.equal(bangkokToday(Date.UTC(2026, 8, 17, 16, 59, 59)), '2026-09-17');
  assert.equal(bangkokToday(Date.UTC(2026, 8, 17, 17, 0, 0)), '2026-09-18');
  assert.equal(bangkokToday(Date.UTC(2026, 11, 31, 17, 30)), '2027-01-01', 'across a year boundary');
});

test('shiftIsoDate and spanDays are inclusive-day arithmetic', () => {
  assert.equal(shiftIsoDate('2026-09-17', -6), '2026-09-11');
  assert.equal(shiftIsoDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftIsoDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftIsoDate('bad', 1), null);
  assert.equal(spanDays('2026-09-01', '2026-09-17'), 17, 'the contract example: inclusive');
  assert.equal(spanDays('2026-09-17', '2026-09-17'), 1);
  assert.equal(spanDays('2026-09-17', '2026-09-01'), null, 'reversed');
  assert.equal(spanDays('2026-09-01', 'x'), null);
});

test('isValidRange: ordered real dates of at most MAX_SPAN_DAYS (92) inclusive', () => {
  assert.equal(MAX_SPAN_DAYS, 92);
  assert.equal(isValidRange('2026-06-18', '2026-09-17'), true, 'exactly 92 days');
  assert.equal(isValidRange('2026-06-17', '2026-09-17'), false, '93 days');
  assert.equal(isValidRange('2026-09-17', '2026-09-17'), true, 'one day');
  assert.equal(isValidRange('2026-09-18', '2026-09-17'), false);
  assert.equal(isValidRange('', ''), false);
});

test('defaultPanelRange is the last 7 days ending today in Bangkok', () => {
  assert.equal(DEFAULT_SPAN_DAYS, 7);
  assert.deepEqual(defaultPanelRange(NOON_UTC), { from: '2026-09-11', to: '2026-09-17' });
  // 17:30 UTC is already the 18th in Bangkok — the window follows.
  assert.deepEqual(defaultPanelRange(Date.UTC(2026, 8, 17, 17, 30)), { from: '2026-09-12', to: '2026-09-18' });
  assert.equal(spanDays(defaultPanelRange(NOON_UTC).from, defaultPanelRange(NOON_UTC).to), 7);
});

test('firstParam: the first of a repeated key, "" when absent, never an array', () => {
  assert.equal(firstParam({ from: '2026-09-01' }, 'from'), '2026-09-01');
  assert.equal(firstParam({ from: ['a', 'b'] }, 'from'), 'a');
  assert.equal(firstParam({}, 'from'), '');
  assert.equal(firstParam(undefined, 'from'), '');
  assert.equal(firstParam({ from: null }, 'from'), '');
});

test('readPanelRange: a valid query wins; nothing → default; anything else → default, marked invalid', () => {
  assert.deepEqual(
    readPanelRange({ from: '2026-09-01', to: '2026-09-17' }, NOON_UTC),
    { from: '2026-09-01', to: '2026-09-17', source: 'query' },
  );
  assert.deepEqual(readPanelRange({}, NOON_UTC), { from: '2026-09-11', to: '2026-09-17', source: 'default' });
  assert.deepEqual(readPanelRange(undefined, NOON_UTC), { from: '2026-09-11', to: '2026-09-17', source: 'default' });
  for (const sp of [
    { from: '2026-09-01' },                            // half a window
    { from: '2026-02-30', to: '2026-03-01' },          // not a date
    { from: '2026-09-17', to: '2026-09-01' },          // reversed
    { from: '2026-01-01', to: '2026-09-17' },          // too wide
    { from: ['2026-09-17', '2026-09-01'], to: '2026-09-01' }, // repeated key, first is reversed
  ]) {
    const r = readPanelRange(sp, NOON_UTC);
    assert.deepEqual(r, { from: '2026-09-11', to: '2026-09-17', source: 'invalid' }, JSON.stringify(sp));
    assert.equal(isValidRange(r.from, r.to), true, 'the returned window is ALWAYS valid');
  }
});

test('readPage / readVote / readHasError narrow the URL to the service vocabulary', () => {
  assert.equal(readPage({ page: '3' }), 3);
  for (const bad of ['0', '-1', '1.5', 'abc', '', undefined, ['2', '9']]) {
    const v = readPage({ page: bad });
    assert.equal(v, Array.isArray(bad) ? 2 : 1, JSON.stringify(bad));
  }
  assert.equal(readVote({ vote: 'up' }), 'up');
  assert.equal(readVote({ vote: 'down' }), 'down');
  for (const bad of ['any', 'sideways', '', undefined, 'UP']) assert.equal(readVote({ vote: bad }), 'any');
  assert.equal(readHasError({ has_error: '1' }), true);
  assert.equal(readHasError({ has_error: 'true' }), true);
  for (const bad of ['0', 'false', '', 'yes', undefined]) assert.equal(readHasError({ has_error: bad }), false);
});

test('the presets each end today and stay inside the service cap', () => {
  assert.deepEqual(RANGE_PRESETS.map((p) => p.key), ['today', 'week', 'month', 'quarter']);
  for (const p of RANGE_PRESETS) {
    const r = presetRange(p, NOON_UTC);
    assert.equal(r.to, '2026-09-17', p.key);
    assert.equal(spanDays(r.from, r.to), p.days, p.key);
    assert.ok(p.days <= MAX_SPAN_DAYS, `${p.key} exceeds the cap`);
    assert.equal(isValidRange(r.from, r.to), true);
  }
  assert.deepEqual(presetRange(RANGE_PRESETS[0], NOON_UTC), { from: '2026-09-17', to: '2026-09-17' }, 'วันนี้ is a one-day window');
});
