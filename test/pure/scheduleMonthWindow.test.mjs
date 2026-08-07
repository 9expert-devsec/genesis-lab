import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  addMonths,
  monthColumns,
  monthKey,
  monthLabel,
  monthLabelWithYear,
  monthYearLabel,
  parseMonthKey,
  rollingWindow,
  scheduleMonthKey,
  windowBetween,
} from '@/lib/schedule/monthWindow';
import { withTZ } from '../withTZ.mjs';

/**
 * The /schedule month window, which used to be a bare 0–11 index and therefore
 * could not express "December then January" at all.
 *
 * Every date here is FIXED. The module's own defaults read `new Date()`, and a
 * test that inherits today is a test whose meaning changes with the calendar —
 * which is precisely the class of defect being fixed.
 */

// ── monthKey ────────────────────────────────────────────────────────────────

test('monthKey zero-pads a single-digit month', () => {
  assert.equal(monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.equal(monthKey(new Date(2026, 8, 1)), '2026-09');
  // The padding is not cosmetic — it is what makes string order chronological.
  assert.equal(monthKey(new Date(2026, 11, 31)), '2026-12');
});

test('monthKey is LOCAL time, not UTC', () => {
  /**
   * `toISOString()` would put 2026-09-01T00:00 in Bangkok into August — the
   * wrong column, for the first day of every month, for every visitor in a
   * positive offset. Asserted from two opposite zones on the same wall-clock
   * date so the failure is unmistakable.
   */
  withTZ('Asia/Bangkok', () => {
    const d = new Date(2026, 8, 1, 0, 0);
    assert.equal(monthKey(d), '2026-09');
    assert.equal(d.toISOString().slice(0, 7), '2026-08', 'UTC really does disagree here');
  });
  withTZ('America/Los_Angeles', () => {
    assert.equal(monthKey(new Date(2026, 8, 30, 23, 0)), '2026-09');
  });
});

test('monthKey refuses a non-date rather than emitting NaN-NaN', () => {
  assert.equal(monthKey(new Date('nonsense')), null);
  assert.equal(monthKey(null), null);
  assert.equal(monthKey('2026-09'), null);
});

test('parseMonthKey round-trips and rejects junk', () => {
  assert.deepEqual(parseMonthKey('2027-01'), { year: 2027, month: 0 });
  assert.deepEqual(parseMonthKey('2026-12'), { year: 2026, month: 11 });
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-01', '', null, undefined]) {
    assert.equal(parseMonthKey(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
});

test('scheduleMonthKey buckets on the FIRST date', () => {
  // Unchanged rule from the old getMonthIndex: a session spanning a month
  // boundary files under the month it starts in, which is what the cell label
  // ("30 ต.ค. - 2") already tells the reader.
  assert.equal(scheduleMonthKey({ dates: ['2026-10-30', '2026-11-02'] }), '2026-10');
  assert.equal(scheduleMonthKey({ dates: [] }), null);
  assert.equal(scheduleMonthKey({}), null);
  assert.equal(scheduleMonthKey(null), null);
  assert.equal(scheduleMonthKey({ dates: ['not-a-date'] }), null);
});

// ── addMonths / rollingWindow ───────────────────────────────────────────────

test('addMonths crosses the year in both directions', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2027-01', -1), '2026-12');
  assert.equal(addMonths('2026-08', 12), '2027-08');
  assert.equal(addMonths('2026-01', 0), '2026-01');
});

test('rollingWindow of 6 from JANUARY stays inside the year', () => {
  assert.deepEqual(
    rollingWindow('2026-01', 6),
    ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  );
});

test('rollingWindow of 6 from AUGUST crosses into the next year', () => {
  // The live case: today is August, and January is index 0 — unreachable under
  // the old `for (m = monthFrom; m <= monthTo; m++)`.
  assert.deepEqual(
    rollingWindow('2026-08', 6),
    ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']
  );
});

test('rollingWindow of 6 from DECEMBER starts on the boundary', () => {
  // The worst case: the old code produced ONE column here and the `ถึง` select
  // had exactly one enabled option, so nothing in the new year was selectable.
  assert.deepEqual(
    rollingWindow('2026-12', 6),
    ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']
  );
});

test('rollingWindow accepts a Date as well as a key', () => {
  assert.deepEqual(rollingWindow(new Date(2026, 11, 20), 2), ['2026-12', '2027-01']);
});

test('rollingWindow refuses nonsense instead of looping or emitting nulls', () => {
  for (const bad of [[null, 6], ['2026-13', 6], ['2026-08', 0], ['2026-08', -3], ['2026-08', NaN]]) {
    assert.deepEqual(rollingWindow(bad[0], bad[1]), [], `${JSON.stringify(bad)}`);
  }
});

test('CONTROL: a bare 0-11 implementation agrees EXCEPT where the year turns', () => {
  /**
   * THE WHOLE POINT OF THE MODULE, executed. This is the implementation that
   * shipped — a month index advanced with `% 12` and the year left alone. It is
   * indistinguishable from the correct one for any window that does not cross
   * December, which is exactly why the bug survived: it looks right for seven
   * months of the year and degrades quietly for the other five.
   */
  const yearBlind = (startKey, count) => {
    const { year, month } = parseMonthKey(startKey);
    return Array.from({ length: count }, (_, i) =>
      `${year}-${String(((month + i) % 12) + 1).padStart(2, '0')}`);
  };

  const CASES = [
    ['2026-01', 6, false], // January  — no crossing
    ['2026-06', 6, false], // June     — ends in November, no crossing
    ['2026-08', 6, true],  // August   — crosses (today's case)
    ['2026-12', 6, true],  // December — crosses immediately
  ];

  const disagreements = CASES.filter(
    ([key, n]) => JSON.stringify(yearBlind(key, n)) !== JSON.stringify(rollingWindow(key, n))
  ).map(([key]) => key);

  assert.deepEqual(
    disagreements,
    ['2026-08', '2026-12'],
    'the mutant must redden the crossing cases AND ONLY those'
  );

  // Named concretely so the failure mode is legible: the same month, the wrong
  // year — a key that matches no bucket, so the row is silently dropped.
  assert.equal(yearBlind('2026-08', 6)[5], '2026-01');
  assert.equal(rollingWindow('2026-08', 6)[5], '2027-01');
});

// ── windowBetween ───────────────────────────────────────────────────────────

test('windowBetween is INCLUSIVE at both ends', () => {
  assert.deepEqual(windowBetween('2026-09', '2026-11'), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(windowBetween('2026-09', '2026-09'), ['2026-09'], 'a single month is one column');
});

test('windowBetween crosses the year', () => {
  assert.deepEqual(
    windowBetween('2026-11', '2027-02'),
    ['2026-11', '2026-12', '2027-01', '2027-02']
  );
});

test('a `to` BEFORE `from` clamps to [from] — never empty, never reversed', () => {
  /**
   * The transient state after the user moves `from` past `to`. An empty window
   * makes `filteredCourses` empty and the page renders "ไม่พบหลักสูตร" for what
   * is really a half-finished filter interaction; a reversed one renders
   * columns in the wrong order.
   */
  assert.deepEqual(windowBetween('2026-11', '2026-09'), ['2026-11']);
  assert.deepEqual(windowBetween('2027-01', '2026-12'), ['2027-01'], 'across the year too');
});

test('windowBetween survives a junk endpoint', () => {
  assert.deepEqual(windowBetween('2026-09', 'nope'), ['2026-09'], 'bad `to` clamps to `from`');
  assert.deepEqual(windowBetween(null, '2026-09'), [], 'bad `from` has nothing to anchor on');
});

test('YYYY-MM string order IS chronological order — the load-bearing property', () => {
  // windowBetween and the component's `safeMonthTo` clamp both compare with a
  // plain `<`. If the key format ever loses its zero padding or its fixed
  // width, both break silently and in opposite directions.
  assert.ok('2026-12' < '2027-01');
  assert.ok('2026-02' < '2026-10', 'zero padding is what makes this true');
  const window = rollingWindow('2026-08', 12);
  assert.deepEqual([...window].sort(), window, 'a generated window is already sorted');
});

// ── The default constant ────────────────────────────────────────────────────

test('the default is 6, and the window it produces is 6 long', () => {
  // Pinned together so the constant and the behaviour cannot drift — the shape
  // of defect ADMIN_SCHEDULE_MONTHS was extracted to prevent.
  assert.equal(PUBLIC_SCHEDULE_DEFAULT_MONTHS, 6);
  for (const start of ['2026-01', '2026-08', '2026-12']) {
    assert.equal(
      rollingWindow(start, PUBLIC_SCHEDULE_DEFAULT_MONTHS).length,
      6,
      `${start} must yield six columns regardless of the month`
    );
  }
});

test('the filter horizon is 12 + the default, and always reaches next year', () => {
  assert.equal(PUBLIC_SCHEDULE_FILTER_HORIZON, 18);
  assert.equal(PUBLIC_SCHEDULE_FILTER_HORIZON, 12 + PUBLIC_SCHEDULE_DEFAULT_MONTHS);
  // The 12 term's purpose: the same month next year is selectable from any
  // starting month. The 6 term's: the default's last column is never the last
  // option, so there is always somewhere further to extend to.
  for (const start of ['2026-01', '2026-08', '2026-12']) {
    const options = rollingWindow(start, PUBLIC_SCHEDULE_FILTER_HORIZON);
    assert.ok(options.includes(addMonths(start, 12)), `${start}: same month next year`);
    const defaultEnd = rollingWindow(start, PUBLIC_SCHEDULE_DEFAULT_MONTHS).at(-1);
    assert.ok(options.indexOf(defaultEnd) < options.length - 1, `${start}: room to extend`);
  }
});

// ── Labels ──────────────────────────────────────────────────────────────────

test('the bare label matches the hand-written MONTH_TH the header used to print', () => {
  /**
   * The header's twelve Thai abbreviations came from a literal array. They now
   * come from Intl, and the two must agree or the change is a silent restyle.
   * Pinned rather than assumed — an ICU update that reworded ก.ย. would
   * otherwise ship unnoticed.
   */
  const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const fromIntl = rollingWindow('2026-01', 12).map(monthLabel);
  assert.deepEqual(fromIntl, MONTH_TH);
});

test('the one-line label is BUDDHIST, from Intl, and never hand-added', () => {
  // th-TH renders the Buddhist era natively. 2027 CE is 2570 BE → "70".
  // THIS FORM IS THE FILTER DROPDOWN'S — a dropdown option is one line of text.
  // The table header uses the two-part form instead; see monthColumns.
  assert.equal(monthLabelWithYear('2027-01'), 'ม.ค. 70');
  assert.equal(monthLabelWithYear('2026-08'), 'ส.ค. 69');
  // The specific failure a hand-rolled `+ 543` produces: the Gregorian year, or
  // a doubly-shifted one.
  const label = monthLabelWithYear('2027-01');
  assert.equal(label.includes('27'), false, 'not the Gregorian year');
  assert.equal(label.includes('3113'), false, 'not 2570 + 543 again');
});

test('a junk key yields an empty label, not "Invalid Date"', () => {
  assert.equal(monthLabel('nope'), '');
  assert.equal(monthLabelWithYear(null), '');
});

// ── monthYearLabel: the header's second line ────────────────────────────────

test('monthYearLabel is the Buddhist year ALONE, with no era prefix', () => {
  // `{ year: '2-digit' }` formats as 'พ.ศ. 70'; the header's second line wants
  // just '70'. Taken via formatToParts, because slicing the era off by index or
  // by a space is a guess an ICU update can invalidate.
  assert.equal(monthYearLabel('2027-01'), '70');
  assert.equal(monthYearLabel('2026-08'), '69');
  assert.equal(monthYearLabel('2030-08'), '73');
  for (const key of ['2027-01', '2026-08']) {
    assert.equal(monthYearLabel(key).includes('พ.ศ.'), false, 'no era prefix');
    assert.match(monthYearLabel(key), /^\d{2}$/, 'exactly two digits, nothing else');
  }
});

test('monthYearLabel is BUDDHIST and never hand-added', () => {
  // Kept from the previous rule's test: the two specific wrong answers a
  // hand-rolled `+ 543` produces.
  const label = monthYearLabel('2027-01');
  assert.equal(label.includes('27'), false, 'not the Gregorian year');
  assert.equal(label.includes('3113'), false, 'not 2570 + 543 again');
  assert.equal(monthLabelWithYear('2027-01').includes('3113'), false);
});

test('monthYearLabel yields empty for junk, not "Invalid Date"', () => {
  assert.equal(monthYearLabel('nope'), '');
  assert.equal(monthYearLabel(null), '');
});

// ── monthColumns: EVERY column carries its year ─────────────────────────────

test('every column in a crossing window carries a year — no exceptions', () => {
  /**
   * THE RULE THIS REPLACED, and why. The old one showed the year only on the
   * first column of a new year, assuming the reader could see that column
   * alongside the bare ones. THE TABLE SCROLLS HORIZONTALLY, so scrolling two
   * columns past `ม.ค. 70` left `ก.พ.` and `มี.ค.` on screen with no year
   * anywhere on the page — which is what a user actually hit.
   */
  const cols = monthColumns(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  assert.deepEqual(cols.map((c) => c.label), ['พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.']);
  assert.deepEqual(cols.map((c) => c.yearLabel), ['69', '69', '70', '70', '70']);
  assert.equal(cols.every((c) => c.yearLabel !== ''), true, 'no column may be yearless');
});

test('a window inside ONE year also carries its year on every column', () => {
  // The common case is no longer special-cased. It costs a second line, not
  // horizontal space — the columns have a 90px floor and a window can be
  // twelve wide, so widening them was never on the table.
  const cols = monthColumns(['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(cols.map((c) => c.label), ['ส.ค.', 'ก.ย.', 'ต.ค.']);
  assert.deepEqual(cols.map((c) => c.yearLabel), ['69', '69', '69']);
});

test('a window ENTIRELY in another year needs no special case any more', () => {
  // The hole the deleted "first column" clause was patching. With no condition
  // there is nothing left to have a hole in.
  const cols = monthColumns(['2027-03', '2027-04', '2027-05']);
  assert.deepEqual(cols.map((c) => c.yearLabel), ['70', '70', '70']);
});

test('the month and the year are SEPARATE fields, not a pre-joined string', () => {
  // The header renders them on two lines with different sizes and colours, so
  // joining them here would force the caller to split a localised string back
  // apart — the exact operation monthYearLabel exists to avoid.
  const [col] = monthColumns(['2027-01']);
  assert.equal(col.label, 'ม.ค.');
  assert.equal(col.yearLabel, '70');
  assert.equal(col.label.includes('70'), false, 'line 1 carries no year');
});

test('monthColumns takes NO options — there is no condition left to configure', () => {
  /**
   * The condition was DELETED rather than defaulted to `true`. A parameter that
   * only ever takes one value reads like a branch someone can still reach, and
   * the next reader will try. This asserts the shape: passing the old
   * `{ currentYear }` opt changes nothing.
   */
  assert.equal(monthColumns.length, 1, 'one parameter: the keys');
  assert.deepEqual(
    monthColumns(['2026-08'], { currentYear: 2026 }),
    monthColumns(['2026-08'], { currentYear: 1999 }),
    'a leftover caller passing currentYear gets the same answer'
  );
});

test('monthColumns carries the parsed year and month for the caller', () => {
  const [first] = monthColumns(['2027-01']);
  assert.equal(first.key, '2027-01');
  assert.equal(first.year, 2027);
  assert.equal(first.month, 0, '0-indexed, as Date.getMonth() returns');
});

test('monthColumns drops unparseable keys rather than rendering a blank column', () => {
  const cols = monthColumns(['2026-08', 'nope', null, '2026-09']);
  assert.deepEqual(cols.map((c) => c.key), ['2026-08', '2026-09']);
  assert.deepEqual(monthColumns(null), []);
});

test('CONTROL: a bare-month implementation reddens EVERY column of a crossing window', () => {
  /**
   * Replaces the old `showYear`-forced-false mutation, which no longer has
   * anything to force. This is the shape the header had before the fix — the
   * month and nothing else — run against a crossing window and asserted to
   * disagree on all five columns, not just the ones at a boundary.
   */
  const bare = (keys) => keys.map((key) => ({ label: monthLabel(key), yearLabel: '' }));
  const keys = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
  const real = monthColumns(keys);
  const mutant = bare(keys);

  const disagreements = keys.filter((_, i) => mutant[i].yearLabel !== real[i].yearLabel);
  assert.equal(disagreements.length, keys.length, 'every column must distinguish the two');

  // …and the month line is IDENTICAL, which is what makes the year line the
  // only thing under test.
  assert.deepEqual(mutant.map((c) => c.label), real.map((c) => c.label));
});

test('CONTROL: the OLD conditional rule left later columns yearless', () => {
  // Replays the shipped rule against the same window, naming exactly which
  // columns a horizontal scroll could strand. If this ever reports zero, the
  // bug being fixed was not the bug that was described.
  const keys = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
  const oldShowYear = keys.map((key, i) => {
    const { year } = parseMonthKey(key);
    const prev = i > 0 ? parseMonthKey(keys[i - 1]) : null;
    return year !== 2026 && (i === 0 || prev.year !== year);
  });
  assert.deepEqual(oldShowYear, [false, false, true, false, false]);
  const stranded = keys.filter((k, i) => !oldShowYear[i] && parseMonthKey(k).year !== 2026);
  assert.deepEqual(stranded, ['2027-02', '2027-03'], 'these two had no year of their own');
});
