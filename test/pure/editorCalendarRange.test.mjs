import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITOR_RANGE_MONTHS_BACK,
  EDITOR_RANGE_MONTHS_FORWARD,
  EDITOR_VISIBLE_MONTHS,
  arrowState,
  daysOfMonth,
  monthKeyOf,
  openingMonth,
  rangeFor,
  shiftMonthKey,
  stepMonth,
  storedMonthSpan,
  visibleMonthsFrom,
} from '@/lib/schedule/editorCalendarRange';

// The picker used to render four month blocks anchored on `initialMonthKey`,
// which the EDIT path never supplied — so the window came off the clock and a
// round stored outside it had no day cell in the DOM at all. Measured on
// 2026-08-27: 15 of 90 live rounds were unreachable that way.
//
// The rule under test is NOT "±1/±2 years". It is THE RANGE ALWAYS CONTAINS
// THE DATA BEING EDITED. The defaults are ergonomics and may be re-tuned; the
// containment invariant may not. The tests are written so that the invariant
// cases would still fail if someone widened the defaults instead of fixing the
// derivation — they use dates far outside any plausible default.

const NOW = new Date(2026, 7, 27); // 2026-08-27, the day this was measured

// ── the defaults ───────────────────────────────────────────────────────────

test('the default range is today - 1 year to today + 2 years, month-granular', () => {
  const { min, max } = rangeFor({ now: NOW, selectedDates: [] });
  assert.equal(min, '2025-08', 'lower default is 12 months back from 2026-08');
  assert.equal(max, '2028-08', 'upper default is 24 months forward from 2026-08');
});

test('the default range is stated by the constants, not by a literal in the code', () => {
  const { min, max } = rangeFor({ now: NOW, selectedDates: [] });
  assert.equal(min, shiftMonthKey(monthKeyOf(NOW), -EDITOR_RANGE_MONTHS_BACK));
  assert.equal(max, shiftMonthKey(monthKeyOf(NOW), EDITOR_RANGE_MONTHS_FORWARD));
  assert.equal(EDITOR_RANGE_MONTHS_BACK, 12);
  assert.equal(EDITOR_RANGE_MONTHS_FORWARD, 24);
});

test('the December round that could not be reached at all is now inside the range', () => {
  // The reported defect, concretely: 25 + 30 Dec 2026 under a picker whose
  // ceiling was 2026-11-30.
  const { min, max } = rangeFor({
    now: NOW,
    selectedDates: ['2026-12-25', '2026-12-30'],
  });
  assert.ok('2026-12' >= min && '2026-12' <= max, 'December 2026 must be navigable');
});

// ── the invariant: the range always contains the data ──────────────────────

test('an earliest date 3 years back widens the LOWER bound to that month', () => {
  const { min, max } = rangeFor({
    now: NOW,
    selectedDates: ['2023-04-11', '2023-04-12'],
  });
  assert.equal(min, '2023-04', 'lower bound must reach the earliest stored date');
  assert.equal(max, '2028-08', 'the forward reach is untouched — widening is per-end');
});

test('a latest date 4 years ahead widens the UPPER bound to that month', () => {
  const { min, max } = rangeFor({
    now: NOW,
    selectedDates: ['2030-09-02'],
  });
  assert.equal(max, '2030-09', 'upper bound must reach the latest stored date');
  assert.equal(min, '2025-08', 'the backward reach is untouched — widening is per-end');
});

test('both ends widen at once when the round spans past both defaults', () => {
  const { min, max } = rangeFor({
    now: NOW,
    selectedDates: ['2020-01-31', '2031-06-01'],
  });
  assert.equal(min, '2020-01');
  assert.equal(max, '2031-06');
});

test('a round comfortably inside the defaults does not narrow the range', () => {
  const { min, max } = rangeFor({ now: NOW, selectedDates: ['2026-10-30', '2026-11-02'] });
  assert.equal(min, '2025-08', 'the range must never shrink to fit the data');
  assert.equal(max, '2028-08');
});

test('CONTROL: a clock-only range would MISS the stored data — that was the bug', () => {
  // Replicates the old derivation: a window from `now` with no reference to
  // the round being edited. If this ever contains the date, the test above has
  // stopped discriminating.
  const clockOnly = { min: '2026-08', max: shiftMonthKey('2026-08', 3) };
  assert.ok(
    '2026-12' > clockOnly.max,
    'the old today+3 window must genuinely exclude December, or these tests prove nothing',
  );
  const fixed = rangeFor({ now: NOW, selectedDates: ['2026-12-25'] });
  assert.ok('2026-12' <= fixed.max, 'the derived range includes what the clock-only one missed');
});

test('every stored date of every unreachable shape lands inside its own range', () => {
  // Property-style sweep rather than one example: the invariant is universal.
  const rounds = [
    ['2026-11-30', '2026-12-01'], // the cross-month one in live data
    ['2026-12-31', '2027-01-01'], // crosses a year
    ['2019-02-28'],               // far past
    ['2035-12-31'],               // far future
    ['2024-02-29'],               // leap day
  ];
  for (const dates of rounds) {
    const { min, max } = rangeFor({ now: NOW, selectedDates: dates });
    for (const d of dates) {
      const key = d.slice(0, 7);
      assert.ok(
        key >= min && key <= max,
        `${d} fell outside its own range ${min}..${max} — the invariant is broken`,
      );
    }
  }
});

// ── opening month ──────────────────────────────────────────────────────────

test('on EDIT the picker opens on the month of the EARLIEST stored date', () => {
  // 30 Oct + 2 Nov must open on OCTOBER, so both months are on screen and the
  // cross-month round needs no navigation.
  const selectedDates = ['2026-10-30', '2026-11-02'];
  const open = openingMonth({ isEdit: true, selectedDates, now: NOW });
  assert.equal(open, '2026-10');
});

test('on EDIT the stored month wins over a hint and over today', () => {
  const open = openingMonth({
    isEdit: true,
    selectedDates: ['2026-12-16', '2026-12-17'],
    monthKeyHint: '2026-08',
    now: NOW,
  });
  assert.equal(open, '2026-12', 'the data being edited decides, not the clock or the caller');
});

test('on CREATE the picker opens on the hint', () => {
  const open = openingMonth({ isEdit: false, selectedDates: [], monthKeyHint: '2027-03', now: NOW });
  assert.equal(open, '2027-03');
});

test('on CREATE with no hint the picker opens on today', () => {
  const open = openingMonth({ isEdit: false, selectedDates: [], monthKeyHint: null, now: NOW });
  assert.equal(open, '2026-08');
});

test('a malformed hint falls back to today rather than rendering nothing', () => {
  for (const bad of ['', 'nonsense', '2026-13', null, undefined]) {
    assert.equal(
      openingMonth({ isEdit: false, selectedDates: [], monthKeyHint: bad, now: NOW }),
      '2026-08',
      `hint ${JSON.stringify(bad)} must not blank the picker`,
    );
  }
});

test('the opening month is always inside the range it is used with', () => {
  for (const dates of [[], ['2021-05-04'], ['2029-11-11'], ['2026-12-25', '2026-12-30']]) {
    const range = rangeFor({ now: NOW, selectedDates: dates });
    const open = openingMonth({ isEdit: true, selectedDates: dates, now: NOW, range });
    assert.ok(open >= range.min && open <= range.max, `${open} outside ${range.min}..${range.max}`);
  }
});

// ── the two visible blocks, and the arrows ─────────────────────────────────

test('two month blocks are visible at once', () => {
  assert.equal(EDITOR_VISIBLE_MONTHS, 2);
  const range = rangeFor({ now: NOW, selectedDates: [] });
  assert.deepEqual(visibleMonthsFrom('2026-10', range), ['2026-10', '2026-11']);
});

test('a cross-month round has BOTH its months on screen without navigating', () => {
  const selectedDates = ['2026-10-30', '2026-11-02'];
  const range = rangeFor({ now: NOW, selectedDates });
  const open = openingMonth({ isEdit: true, selectedDates, now: NOW, range });
  const visible = visibleMonthsFrom(open, range);
  assert.deepEqual(visible, ['2026-10', '2026-11']);
  for (const d of selectedDates) {
    assert.ok(visible.includes(d.slice(0, 7)), `${d} is not on the opening screen`);
  }
});

test('the visible pair is pulled back at the top of the range, never past it', () => {
  const range = { min: '2025-08', max: '2028-08' };
  assert.deepEqual(
    visibleMonthsFrom('2028-08', range),
    ['2028-07', '2028-08'],
    'the last month renders as the RIGHT block, not as a lone left one',
  );
});

test('arrows are DISABLED at both ends and enabled in between', () => {
  const range = { min: '2025-08', max: '2028-08' };

  const atMin = arrowState('2025-08', range);
  assert.equal(atMin.canPrev, false, 'cannot step before the range');
  assert.equal(atMin.canNext, true);

  const atMax = arrowState('2028-07', range); // pair = Jul+Aug, the last screen
  assert.equal(atMax.canNext, false, 'cannot step past the range');
  assert.equal(atMax.canPrev, true);

  const middle = arrowState('2026-08', range);
  assert.equal(middle.canPrev, true);
  assert.equal(middle.canNext, true);
});

test('the arrows step exactly ONE month', () => {
  const range = { min: '2025-08', max: '2028-08' };
  assert.equal(stepMonth('2026-10', 1, range), '2026-11');
  assert.equal(stepMonth('2026-10', -1, range), '2026-09');
});

test('stepping clamps at both ends instead of leaving the range', () => {
  const range = { min: '2025-08', max: '2028-08' };
  assert.equal(stepMonth('2025-08', -1, range), '2025-08', 'clamped at the lower bound');
  assert.equal(
    stepMonth('2028-07', 1, range),
    '2028-07',
    'clamped so the right-hand block stays inside the range',
  );
});

test('a widened range lets the arrows reach the widened end', () => {
  const selectedDates = ['2030-09-02'];
  const range = rangeFor({ now: NOW, selectedDates });
  assert.equal(arrowState('2030-08', range).canNext, false, 'the widened end is the new stop');
  assert.equal(arrowState('2030-07', range).canNext, true, 'and it is reachable from before it');
});

// ── small helpers the above lean on ────────────────────────────────────────

test('storedMonthSpan ignores junk and finds the true first and last', () => {
  assert.deepEqual(
    storedMonthSpan(['2026-12-30', 'nope', '', null, '2026-11-02']),
    { first: '2026-11', last: '2026-12' },
  );
  assert.deepEqual(storedMonthSpan([]), { first: null, last: null });
  assert.deepEqual(storedMonthSpan(null), { first: null, last: null });
});

test('storedMonthSpan reads a full ISO timestamp, which is what MSDB returns', () => {
  assert.deepEqual(
    storedMonthSpan(['2026-12-16T00:00:00.000Z']),
    { first: '2026-12', last: '2026-12' },
  );
});

test('shiftMonthKey crosses year boundaries in both directions', () => {
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(shiftMonthKey('2027-01', -1), '2026-12');
  assert.equal(shiftMonthKey('2026-08', 24), '2028-08');
});

test('daysOfMonth returns every day and stops at the month end', () => {
  assert.equal(daysOfMonth('2026-02').length, 28);
  assert.equal(daysOfMonth('2028-02').length, 29, 'leap February');
  assert.equal(daysOfMonth('2026-12').length, 31);
  assert.equal(daysOfMonth('bad').length, 0);
  const dec = daysOfMonth('2026-12');
  assert.equal(dec[0].getDate(), 1);
  assert.equal(dec.at(-1).getDate(), 31);
  assert.equal(dec[0].getMonth(), 11, 'local month, not UTC-shifted');
});

test('CONTROL: the helpers are live, not constants', () => {
  assert.notEqual(
    rangeFor({ now: new Date(2026, 0, 10) }).min,
    rangeFor({ now: new Date(2026, 5, 10) }).min,
    'rangeFor ignores its `now`',
  );
});
