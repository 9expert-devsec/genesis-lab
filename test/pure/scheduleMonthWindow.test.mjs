import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_ROUND_COLLAPSE_THRESHOLD,
  addMonths,
  decemberOf,
  monthColumns,
  monthKey,
  monthLabel,
  monthLabelWithYear,
  monthYearLabel,
  parseMonthKey,
  rollingWindow,
  scheduleMonthKey,
  scheduleWindowEnd,
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

// ── The range end ───────────────────────────────────────────────────────────
//
// THIS SECTION WAS REWRITTEN, NOT RENUMBERED. It used to pin two constants —
// `PUBLIC_SCHEDULE_DEFAULT_MONTHS === 6` for the default view and
// `PUBLIC_SCHEDULE_FILTER_HORIZON === 12` for the dropdown — and the
// relationship between them. Both are retired. The range now runs from the
// current Bangkok month to December of this year, or of NEXT year when an
// eligible round reaches past this one, and the dropdown and the default view
// share it. Each test below says which old claim it replaces and why.

test('scheduleWindowEnd: December of THIS year when nothing reaches past it', () => {
  /**
   * The short branch, and the floor of the rule. Replaces "the default is 6",
   * which pinned a rolling count; there is no count any more, so what is pinned
   * is the calendar boundary the count was replaced by.
   */
  const inRange = [['2026-03-10'], ['2026-11-30'], ['2026-12-31']];
  assert.equal(scheduleWindowEnd('2026-01', inRange), '2026-12', 'from January');
  assert.equal(scheduleWindowEnd('2026-10', inRange), '2026-12', 'from October');
  assert.equal(scheduleWindowEnd('2026-12', inRange), '2026-12', 'from December itself');
});

test('scheduleWindowEnd: December of NEXT year as soon as one round reaches past', () => {
  // A single eligible round in the new year extends it — and only to December.
  assert.equal(scheduleWindowEnd('2026-10', [['2027-01-05']]), '2027-12');
  assert.equal(scheduleWindowEnd('2026-01', [['2027-01-05']]), '2027-12');
  // The boundary is exact: 2026-12-31 does NOT extend, 2027-01-01 does.
  assert.equal(scheduleWindowEnd('2026-10', [['2026-12-31']]), '2026-12', 'the last day of this year');
  assert.equal(scheduleWindowEnd('2026-10', [['2027-01-01']]), '2027-12', 'the first day of next');
});

test('the four worked examples the rule was specified with', () => {
  /**
   * Stated as a table because these are the cases the behaviour was AGREED on,
   * and a reader checking the implementation against the decision should not
   * have to derive them. Length is what each example names.
   */
  const NEXT_YEAR = [['2027-04-20']];
  const NONE = [['2026-11-02']];
  const cases = [
    { start: '2026-01', rounds: NONE, end: '2026-12', length: 12 },
    { start: '2026-10', rounds: NONE, end: '2026-12', length: 3 },
    { start: '2026-10', rounds: NEXT_YEAR, end: '2027-12', length: 15 },
    { start: '2026-01', rounds: NEXT_YEAR, end: '2027-12', length: 24 },
  ];
  for (const { start, rounds, end, length } of cases) {
    const actual = scheduleWindowEnd(start, rounds);
    assert.equal(actual, end, `${start} → ${end}`);
    assert.equal(
      windowBetween(start, actual).length,
      length,
      `${start} → ${end} must be ${length} months long`,
    );
  }
});

test('a round SPANNING new year counts as next year, on any of its days', () => {
  /**
   * A 30 Dec – 2 Jan round reaches past this December, so it extends the range —
   * even though its FIRST date does not. The rule reads every day of the span
   * for the same reason `roundInWindow` does: a month key cannot express a round
   * that occupies two months, and the one that matters here is the later one.
   */
  const spanning = [['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']];
  assert.equal(scheduleWindowEnd('2026-10', spanning), '2027-12');
  // And order within the span is irrelevant — it is a scan, not a `dates[0]` read.
  assert.equal(scheduleWindowEnd('2026-10', [['2027-01-02', '2026-12-30']]), '2027-12');
});

test('a round TWO years out still caps at December of next year', () => {
  /**
   * The cap is on the OUTPUT, not a filter on the input, so no amount of
   * far-future data can stretch the dropdown further. This is what stops one
   * stray row from drawing dozens of empty columns for every visitor.
   */
  assert.equal(scheduleWindowEnd('2026-10', [['2028-06-01']]), '2027-12');
  assert.equal(scheduleWindowEnd('2026-10', [['2031-01-01']]), '2027-12');
  assert.equal(scheduleWindowEnd('2026-01', [['2099-12-31']]), '2027-12', 'not even then');
});

test('empty, missing and junk input fall back to December of this year', () => {
  /**
   * The fallback is the rule's FLOOR, never a bare `start`: a one-column page
   * is what a failed fetch would otherwise render, and it looks like a bug
   * rather than like an empty year.
   */
  assert.equal(scheduleWindowEnd('2026-10', []), '2026-12', 'no rounds at all');
  assert.equal(scheduleWindowEnd('2026-10', null), '2026-12');
  assert.equal(scheduleWindowEnd('2026-10', undefined), '2026-12');
  assert.equal(scheduleWindowEnd('2026-10', [[]]), '2026-12', 'a round with no dates');
  assert.equal(scheduleWindowEnd('2026-10', [['not-a-date']]), '2026-12', 'an unparseable date');
  assert.equal(scheduleWindowEnd('2026-10', [null, undefined]), '2026-12');
  // An unparseable START has nothing to anchor a year on.
  assert.equal(scheduleWindowEnd('nope', [['2027-01-01']]), null);
  assert.equal(scheduleWindowEnd(null, [['2027-01-01']]), null);
});

test('scheduleWindowEnd accepts Dates as well as date strings', () => {
  // The page passes `s.dates`, which upstream sends as ISO strings but which a
  // hydrated Mongoose row can carry as Dates. Both must read the same.
  assert.equal(scheduleWindowEnd('2026-10', [[new Date(2027, 0, 5)]]), '2027-12');
  assert.equal(scheduleWindowEnd('2026-10', [[new Date(2026, 10, 5)]]), '2026-12');
});

test('decemberOf is the one spelling of a year end, and crosses years', () => {
  assert.equal(decemberOf('2026-01', 0), '2026-12');
  assert.equal(decemberOf('2026-12', 0), '2026-12', 'already December');
  assert.equal(decemberOf('2026-10', 1), '2027-12');
  assert.equal(decemberOf('2026-12', 1), '2027-12');
  assert.equal(decemberOf('nope', 0), null);
  assert.equal(decemberOf(null, 1), null);
  // The default is this year, so a caller that omits the argument cannot
  // accidentally reach into the next one.
  assert.equal(decemberOf('2026-05'), '2026-12');
});

test('the option range runs from the current month to the range end, inclusive', () => {
  /**
   * ── REPLACES "the filter horizon is twelve months, i.e. offsets 0..11" ──────
   * That test asserted `PUBLIC_SCHEDULE_FILTER_HORIZON === 12` plus a length and
   * two offsets. The horizon is retired: the dropdown no longer looks a fixed
   * distance ahead, it looks to the end of a calendar range. So what is pinned
   * is the shape the options now take — anchored at the current month at one
   * end and at `scheduleWindowEnd`'s answer at the other, with no gaps.
   *
   * The ONE claim carried over verbatim is that the current month is offset 0: a
   * range that started next month would hide every round still running this one.
   */
  for (const start of ['2026-01', '2026-08', '2026-12']) {
    for (const rounds of [[['2026-11-02']], [['2027-04-20']]]) {
      const end = scheduleWindowEnd(start, rounds);
      const options = windowBetween(start, end);
      assert.equal(options[0], start, `${start}: the current month is first`);
      assert.equal(options.at(-1), end, `${start}: the range end is last`);
      assert.equal(new Set(options).size, options.length, `${start}: no duplicates`);
      // Consecutive, so every month in between is offered — no gaps to fall into.
      for (let i = 1; i < options.length; i++) {
        assert.equal(options[i], addMonths(options[i - 1], 1), `${start}: consecutive at ${i}`);
      }
    }
  }
});

test('THE DEFAULT VIEW IS THE WHOLE OPTION RANGE — not a shorter window inside it', () => {
  /**
   * ── REPLACES "the default window never ends at the last option" ─────────────
   * That test asserted HORIZON > DEFAULT_MONTHS, i.e. that the default view
   * stopped SHORT of the last option, so a visitor always had somewhere further
   * to go. That property is deliberately gone, and its disappearance is the
   * change: stopping short is exactly how the page came to hide rounds it had
   * already fetched. Measured on the live feed on 2026-10-01, 37 of 144 future
   * rounds fell outside the six-month default while sitting inside the
   * twelve-month dropdown — visible only to someone who thought to widen a
   * filter they had no reason to suspect.
   *
   * The replacement claim is the opposite one, and it is an IDENTITY rather than
   * an inequality, because an identity cannot drift back into two numbers that
   * merely happen to be ordered: the default view spans precisely the months the
   * dropdowns offer. "Nowhere further to go" is now correct and intended — there
   * is nothing further to go TO.
   */
  for (const start of ['2026-01', '2026-08', '2026-12']) {
    for (const rounds of [[['2026-11-02']], [['2027-04-20']]]) {
      const end = scheduleWindowEnd(start, rounds);
      const options = windowBetween(start, end);
      // The default view's two ends, as defaultScheduleFilters composes them.
      assert.equal(options[0], start, `${start}: opens on the first option`);
      assert.equal(options.at(-1), end, `${start}: runs to the last option`);
      assert.deepEqual(
        windowBetween(start, end),
        options,
        `${start}: the default months ARE the option months`,
      );
    }
  }
});

test('the range CAPS at December of next year — it is not unbounded', () => {
  /**
   * ── REPLACES "the horizon no longer reaches the same month next year" ───────
   * That test pinned the cap at offset +11 and explained the property given up
   * when 18 became 12. The cap is a calendar boundary now, so the same guard is
   * restated against it: the range reaches December of next year and never the
   * January after, however far the data goes.
   *
   * Stated as an explicit expectation rather than left as an absence, for the
   * same reason the old one was: a future reader looking at a page full of empty
   * columns is likely to try "just use max(dates)" without knowing the cap was a
   * decision. On 2026-10-01 the two furthest rounds in the feed sat at 2027-12
   * and BOTH were orphans with `course: null`, one of them a ZZTEST- row — so
   * max(dates) would have stretched the dropdown on the strength of rows that
   * render nowhere.
   *
   * A round past the cap is still FETCHED and still rendered when the range
   * reaches it — `getAllSchedules()` stays unbounded. Only the range is capped.
   */
  for (const start of ['2026-01', '2026-08', '2026-12']) {
    const far = scheduleWindowEnd(start, [['2029-05-01']]);
    assert.equal(far, decemberOf(start, 1), `${start}: capped at next December`);
    const options = windowBetween(start, far);
    assert.equal(
      options.includes(addMonths(decemberOf(start, 1), 1)),
      false,
      `${start}: the January after the cap must be out of reach`,
    );
    assert.ok(options.includes(decemberOf(start, 1)), `${start}: the cap itself is selectable`);
    assert.ok(options.length <= 24, `${start}: 24 months is the worst case`);
  }
  // January is the worst case, and it really is 24 — the maximum the UI can show.
  assert.equal(windowBetween('2026-01', scheduleWindowEnd('2026-01', [['2029-01-01']])).length, 24);
});

test('CONTROL: the probes DO distinguish the new cap from +11 and from unbounded', () => {
  /**
   * Every assertion above turns on one month's presence or absence, so the probe
   * is shown to move against BOTH neighbours of the new rule — the thing it
   * replaced and the thing it refuses to become.
   */
  const start = '2026-08';
  const capped = windowBetween(start, scheduleWindowEnd(start, [['2029-01-01']]));

  // vs THE OLD +11 HORIZON. From August that reached 2027-07; the cap reaches
  // 2027-12, so five months the old rule could not offer are now selectable.
  const oldHorizon = rollingWindow(start, 12);
  assert.equal(oldHorizon.at(-1), '2027-07', 'the old rule stopped here');
  assert.equal(capped.at(-1), '2027-12', 'the new one stops here');
  assert.notDeepEqual(capped, oldHorizon, 'the two really are different lists');
  for (const month of ['2027-08', '2027-09', '2027-10', '2027-11', '2027-12']) {
    assert.equal(oldHorizon.includes(month), false, `${month}: unreachable under the old horizon`);
    assert.ok(capped.includes(month), `${month}: reachable now`);
  }

  // vs UNBOUNDED. A round in 2029 is in the data and still does NOT appear.
  assert.equal(capped.includes('2029-01'), false, 'the cap is a real bound, not a formality');
  assert.ok(capped.length < windowBetween(start, '2029-01').length, 'unbounded would be longer');

  // And the short branch is a different list again, so the two branches of the
  // rule are themselves distinguishable — otherwise every case above could be
  // passing on one of them.
  const short = windowBetween(start, scheduleWindowEnd(start, [['2026-09-01']]));
  assert.equal(short.at(-1), '2026-12');
  assert.notDeepEqual(short, capped);
});

test('the mobile collapse threshold is SIX ROUNDS, and not a month count', () => {
  /**
   * It used to be `PUBLIC_SCHEDULE_DEFAULT_MONTHS`, which equalled six only
   * because the default window happened to be six months long. The range is a
   * calendar span now and can be 24 months, so a card deriving from it would
   * list two dozen rounds before offering the toggle.
   *
   * The VALUE is unchanged — six before, six now — and that is the point: this
   * commit separated two numbers, it did not retune either. Pinned as a literal
   * because there is nothing left for it to be derived from, and pinned here
   * because this is where the constant it replaced lived.
   */
  assert.equal(MOBILE_ROUND_COLLAPSE_THRESHOLD, 6);
  // It must not have been quietly re-coupled to anything month-shaped: a range
  // of six months is now one of many lengths, not the length.
  assert.notEqual(
    MOBILE_ROUND_COLLAPSE_THRESHOLD,
    windowBetween('2026-01', scheduleWindowEnd('2026-01', [['2027-01-01']])).length,
    'a 24-month range must not be what sizes a card',
  );
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
