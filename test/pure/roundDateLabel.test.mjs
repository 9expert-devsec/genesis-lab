import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRoundDays, roundMonthSpan } from '@/lib/schedule/roundDateLabel';
import { monthKey } from '@/lib/schedule/monthWindow';
import { withTZ } from '../withTZ.mjs';

/**
 * The ONE round-date formatter, and the five it replaces.
 *
 * ── THE SHIPPED DEFECT ──────────────────────────────────────────────────────
 * A round on 8, 10 and 12 ต.ค. — three separate days — rendered as `8-12` on
 * /schedule, on /search, and in the page-builder's schedule section, and as
 * `8 & 12` through lib/formatScheduleDate. The first three advertise training
 * on the 9th and the 11th when there is none; the fourth silently loses the
 * 10th. All four are on pages where a visitor can then book, which is why
 * `nonConsecutiveOneMonth` below is the fixture this whole file is built
 * around.
 *
 * ── EVERY DATE IS FIXED, AND SO IS `currentYear` ────────────────────────────
 * Nothing here reads the clock. `showYear: 'auto'` takes `currentYear` as an
 * argument precisely so a test can pin it; letting it read the real year would
 * make this file mean something different every January, which is the class of
 * defect the option exists to prevent.
 */

/** A local-midnight ISO string, the shape upstream sends. */
const at = (y, m, d) => new Date(y, m - 1, d).toISOString();

/** The desktop table: the column header already carries the month AND the year. */
const TABLE = {};

/** The mobile card / course card: no header to lean on, so both travel with the row. */
const CARD = { showMonth: true, showYear: 'auto', currentYear: 2026 };

/**
 * The expected-output table from the spec, verbatim, as the fixture.
 *
 * `table` is `formatRoundDays(dates)` with no options; `card` is the same dates
 * under CARD. 2026 is BE 69 and 2027 is BE 70 — those two digits come out of
 * `Intl`, never out of `+ 543`, and test/fs/scheduleThaiYearSource enforces
 * that on the source text because no value assertion can tell them apart.
 */
const ROUNDS = {
  singleDay: {
    dates: [at(2026, 9, 16)],
    table: '16',
    card: '16 ก.ย.',
  },
  consecutiveOneMonth: {
    dates: [at(2026, 9, 16), at(2026, 9, 17)],
    table: '16-17',
    card: '16-17 ก.ย.',
  },
  nonConsecutiveOneMonth: {
    dates: [at(2026, 10, 8), at(2026, 10, 10), at(2026, 10, 12)],
    table: '8, 10, 12',
    card: '8, 10, 12 ต.ค.',
  },
  consecutiveCrossMonth: {
    dates: [at(2026, 9, 30), at(2026, 10, 1)],
    table: '30 ก.ย. - 1 ต.ค.',
    card: '30 ก.ย. - 1 ต.ค.',
  },
  nonConsecutiveCrossMonth: {
    dates: [at(2026, 10, 28), at(2026, 10, 30), at(2026, 11, 2)],
    table: '28, 30 ต.ค., 2 พ.ย.',
    card: '28, 30 ต.ค., 2 พ.ย.',
  },
  longConsecutiveCrossMonth: {
    dates: [at(2026, 10, 30), at(2026, 10, 31), at(2026, 11, 1), at(2026, 11, 2)],
    table: '30 ต.ค. - 2 พ.ย.',
    card: '30 ต.ค. - 2 พ.ย.',
  },
  mixedRunAndSingle: {
    dates: [at(2026, 10, 8), at(2026, 10, 9), at(2026, 10, 12)],
    table: '8-9, 12',
    card: '8-9, 12 ต.ค.',
  },
  nextYear: {
    dates: [at(2027, 2, 16), at(2027, 2, 17)],
    table: '16-17',
    card: '16-17 ก.พ. 70',
  },
  crossingTheYear: {
    dates: [at(2026, 12, 30), at(2027, 1, 2)],
    table: '30 ธ.ค., 2 ม.ค.',
    card: '30 ธ.ค. 69, 2 ม.ค. 70',
  },
  empty: { dates: [], table: '-', card: '-' },
  /**
   * `null` is in here deliberately and it caught a real defect. `new Date(null)`
   * is NOT an invalid date — null coerces to 0 and yields the UNIX EPOCH — so a
   * null survives a NaN check and renders as `1 ม.ค. 13`. Mongo sends this
   * array through unfiltered, so that would have shipped as a training day in
   * 1970.
   */
  allInvalid: { dates: ['not a date', '', null, undefined], table: '-', card: '-' },
};

// ── The table ───────────────────────────────────────────────────────────────

for (const [name, row] of Object.entries(ROUNDS)) {
  test(`${name}: the table label is ${JSON.stringify(row.table)}`, () => {
    assert.equal(formatRoundDays(row.dates, TABLE), row.table);
  });

  test(`${name}: the card label is ${JSON.stringify(row.card)}`, () => {
    assert.equal(formatRoundDays(row.dates, CARD), row.card);
  });
}

test('no options at all is the table', () => {
  // The desktop cell calls `formatRoundDays(schedule.dates)` bare. If the
  // defaults ever stop being `{ showMonth: false, showYear: false }` the whole
  // table gains a month it does not need, so the bare call is pinned too.
  for (const [name, row] of Object.entries(ROUNDS)) {
    assert.equal(formatRoundDays(row.dates), row.table, name);
  }
});

// ── Normalisation ───────────────────────────────────────────────────────────

test('input order does not matter — the days are sorted', () => {
  const shuffled = [at(2026, 10, 12), at(2026, 10, 8), at(2026, 10, 10)];
  assert.equal(formatRoundDays(shuffled), '8, 10, 12');
});

test('invalid dates are dropped, not rendered as NaN', () => {
  const mixed = [at(2026, 10, 8), 'not a date', at(2026, 10, 10), undefined];
  assert.equal(formatRoundDays(mixed), '8, 10');
});

test('the same calendar day twice is one day', () => {
  /**
   * Upstream sends timestamps, not dates. Two rows for the 8th at different
   * times of day are one training day, and left undeduped they would break the
   * consecutiveness split: `8, 8, 9` is not a run.
   */
  const dup = [
    new Date(2026, 9, 8, 9, 0).toISOString(),
    new Date(2026, 9, 8, 13, 30).toISOString(),
    new Date(2026, 9, 9, 9, 0).toISOString(),
  ];
  assert.equal(formatRoundDays(dup), '8-9');
});

test('a run crossing a leap day is still one run', () => {
  // 2028 is a leap year: 28 → 29 → 1 มี.ค. is three consecutive days, and a
  // naive "day + 1 is the next date" rule gets this wrong every four years.
  const leap = [at(2028, 2, 28), at(2028, 2, 29), at(2028, 3, 1)];
  assert.equal(formatRoundDays(leap), '28 ก.พ. - 1 มี.ค.');
});

test('the day arithmetic does not depend on the runtime timezone', () => {
  /**
   * Vercel runs in UTC, CI boxes run in whatever they were imaged with, and the
   * office runs in Bangkok. The label has to be the same string in all three —
   * so the fixture is rebuilt INSIDE each zone (that is what upstream data
   * being local wall-clock means) and the answer compared.
   */
  const inZone = (tz) =>
    withTZ(tz, () =>
      formatRoundDays([
        new Date(2026, 9, 30).toISOString(),
        new Date(2026, 9, 31).toISOString(),
        new Date(2026, 10, 1).toISOString(),
        new Date(2026, 10, 2).toISOString(),
      ]),
    );
  assert.equal(inZone('UTC'), '30 ต.ค. - 2 พ.ย.');
  assert.equal(inZone('Asia/Bangkok'), '30 ต.ค. - 2 พ.ย.');
  assert.equal(inZone('America/Los_Angeles'), '30 ต.ค. - 2 พ.ย.');
});

// ── showYear: true, the third setting ───────────────────────────────────────

test('showYear: true puts the year on the last token unconditionally', () => {
  // Unlike 'auto', it does not care what year it is — 2026 IS the current year
  // in CARD and the year still prints.
  assert.equal(
    formatRoundDays(ROUNDS.singleDay.dates, { showMonth: true, showYear: true }),
    '16 ก.ย. 69',
  );
});

test('showYear: true still puts a year on an interior year boundary', () => {
  assert.equal(
    formatRoundDays(ROUNDS.crossingTheYear.dates, { showMonth: true, showYear: true }),
    '30 ธ.ค. 69, 2 ม.ค. 70',
  );
});

// ── roundMonthSpan ──────────────────────────────────────────────────────────

test('roundMonthSpan is the first and last month, as YYYY-MM', () => {
  assert.deepEqual(roundMonthSpan(ROUNDS.consecutiveCrossMonth.dates), {
    startKey: '2026-09',
    endKey: '2026-10',
  });
  assert.deepEqual(roundMonthSpan(ROUNDS.nonConsecutiveOneMonth.dates), {
    startKey: '2026-10',
    endKey: '2026-10',
  });
  assert.deepEqual(roundMonthSpan(ROUNDS.crossingTheYear.dates), {
    startKey: '2026-12',
    endKey: '2027-01',
  });
});

test('roundMonthSpan is null/null when there is nothing usable', () => {
  assert.deepEqual(roundMonthSpan([]), { startKey: null, endKey: null });
  assert.deepEqual(roundMonthSpan(['nope']), { startKey: null, endKey: null });
  assert.deepEqual(roundMonthSpan(undefined), { startKey: null, endKey: null });
});

test('roundMonthSpan and the label AGREE about crossing', () => {
  /**
   * The property the desktop lane packing depends on. `laneLayout` decides how
   * many columns a round covers from the span; the label decides whether to
   * print its months from its own crossing test. If those two ever disagree, a
   * round spans ก.ย.–ต.ค. while its own label claims it is entirely in October
   * — and nothing else in the system would notice.
   *
   * Stated as: the span crosses IFF the bare table label carries a month.
   */
  for (const [name, row] of Object.entries(ROUNDS)) {
    const { startKey, endKey } = roundMonthSpan(row.dates);
    if (startKey === null) continue;
    const spanCrosses = startKey !== endKey;
    const labelHasMonth = /[ก-ฮ]/.test(row.table);
    assert.equal(spanCrosses, labelHasMonth, name);
  }
});

test('roundMonthSpan uses the same YYYY-MM vocabulary as monthWindow', () => {
  // Not a coincidence to be re-derived — the lane packing looks the span's keys
  // up in `visibleMonths`, which monthWindow produced.
  const { startKey, endKey } = roundMonthSpan(ROUNDS.crossingTheYear.dates);
  assert.equal(startKey, monthKey(new Date(2026, 11, 30)));
  assert.equal(endKey, monthKey(new Date(2027, 0, 2)));
});

// ── The refusal to guess the year ───────────────────────────────────────────

test("showYear: 'auto' with no currentYear THROWS", () => {
  /**
   * It must throw rather than fall back to `new Date().getFullYear()`. Vercel
   * is UTC; for the seven hours before midnight Bangkok on 31 December the
   * server's year and the visitor's year disagree, so a silent fallback renders
   * a next-year round WITHOUT its year on the server and WITH it on the client
   * — a hydration mismatch on the one night the year is the question.
   *
   * Asserting the THROW, not a fallback string: a test that accepted
   * `'16 ก.ย.'` here would pass just as happily against the defect.
   */
  assert.throws(
    () => formatRoundDays(ROUNDS.singleDay.dates, { showYear: 'auto' }),
    /currentYear/,
  );
  assert.throws(
    () => formatRoundDays(ROUNDS.singleDay.dates, { showYear: 'auto', currentYear: null }),
    TypeError,
  );
});

test("showYear: 'auto' refuses a non-numeric currentYear too", () => {
  assert.throws(
    () => formatRoundDays(ROUNDS.singleDay.dates, { showYear: 'auto', currentYear: '2026' }),
    TypeError,
  );
});

test("the refusal is about the CALL, not about the data", () => {
  // An empty round would return '-' without ever needing a year. It still
  // throws, so an ill-formed call cannot hide behind a course that happens to
  // have no rounds today and start throwing the week one is published.
  assert.throws(() => formatRoundDays([], { showYear: 'auto' }), TypeError);
});

test('the other two showYear settings need no currentYear', () => {
  assert.equal(formatRoundDays(ROUNDS.singleDay.dates, { showYear: false }), '16');
  assert.equal(
    formatRoundDays(ROUNDS.singleDay.dates, { showMonth: true, showYear: true }),
    '16 ก.ย. 69',
  );
});

// ── Controls ────────────────────────────────────────────────────────────────
//
// Each control names a specific way the module could be reverted and shows that
// the expectations above DISCRIMINATE against it — i.e. that the mutant and the
// pinned string are different text. Without these, an assertion like
// `equal(label, '8, 10, 12')` proves only that the module is self-consistent.

test('CONTROL: a first-to-last range DOES redden the non-consecutive rows', () => {
  /**
   * The shipped defect, as code. This is `formatDateLabel` from ScheduleClient
   * with its month handling removed — the exact shape that renders three
   * separate days as a five-day block.
   */
  const firstToLast = (dates) => {
    const days = dates.map((d) => new Date(d)).sort((a, b) => a - b);
    if (days.length === 1) return String(days[0].getDate());
    return `${days[0].getDate()}-${days[days.length - 1].getDate()}`;
  };

  assert.equal(firstToLast(ROUNDS.nonConsecutiveOneMonth.dates), '8-12');
  assert.notEqual(firstToLast(ROUNDS.nonConsecutiveOneMonth.dates), ROUNDS.nonConsecutiveOneMonth.table);
  assert.notEqual(firstToLast(ROUNDS.mixedRunAndSingle.dates), ROUNDS.mixedRunAndSingle.table);
  assert.notEqual(firstToLast(ROUNDS.nonConsecutiveCrossMonth.dates), ROUNDS.nonConsecutiveCrossMonth.table);

  // And the other half: it AGREES on the consecutive rows, which is exactly why
  // the defect survived review for as long as it did. Only the rows above can
  // catch it.
  assert.equal(firstToLast(ROUNDS.consecutiveOneMonth.dates), ROUNDS.consecutiveOneMonth.table);
});

test('CONTROL: printing every day of a run DOES redden the consecutive rows', () => {
  // The over-correction: honest about which days exist, but `30, 31, 1, 2` in a
  // 90px column is not a label.
  const everyDay = (dates) =>
    dates.map((d) => new Date(d).getDate()).sort((a, b) => a - b).join(', ');

  assert.equal(everyDay(ROUNDS.consecutiveOneMonth.dates), '16, 17');
  assert.notEqual(everyDay(ROUNDS.consecutiveOneMonth.dates), ROUNDS.consecutiveOneMonth.table);
  assert.notEqual(everyDay(ROUNDS.longConsecutiveCrossMonth.dates), ROUNDS.longConsecutiveCrossMonth.table);
  assert.notEqual(everyDay(ROUNDS.mixedRunAndSingle.dates), ROUNDS.mixedRunAndSingle.table);

  // A run's INTERIOR days must not appear. `8-9, 12` may contain 8, 9 and 12;
  // `30 ต.ค. - 2 พ.ย.` must not contain 31.
  assert.equal(/31/.test(ROUNDS.longConsecutiveCrossMonth.table), false);
});

test('CONTROL: obeying showMonth:false on a CROSSING round produces a date that does not exist', () => {
  /**
   * The month override is not cosmetic. `30 - 1` under a single ก.ย. heading
   * says the round ran from the 30th to the 1st of September, backwards, which
   * is not a thing. So a crossing round keeps its months even when the caller
   * asked for none.
   */
  const table = formatRoundDays(ROUNDS.consecutiveCrossMonth.dates, { showMonth: false });
  assert.notEqual(table, '30-1');
  assert.notEqual(table, '30 - 1');
  assert.match(table, /ก\.ย\./);
  assert.match(table, /ต\.ค\./);

  // Same for the non-consecutive and the long-run crossing rows.
  assert.match(formatRoundDays(ROUNDS.nonConsecutiveCrossMonth.dates), /พ\.ย\./);
  assert.match(formatRoundDays(ROUNDS.longConsecutiveCrossMonth.dates), /พ\.ย\./);

  // And the control's other half: a NON-crossing round under the same options
  // has no month at all, so the rule above is a crossing rule and not "always
  // show the month".
  assert.equal(/[ก-ฮ]/.test(formatRoundDays(ROUNDS.nonConsecutiveOneMonth.dates)), false);
});

test("CONTROL: 'auto' as whole-round-year DOES redden the crossing-the-year row", () => {
  /**
   * The tempting simplification — "print the year only if the round is not in
   * the current year" — yields `30 ธ.ค., 2 ม.ค. 70`, which reads as one
   * December and one January THIRTEEN MONTHS APART. The 69 on the first token
   * is there because of its NEIGHBOUR, not because of today.
   */
  const wholeRoundOnly = '30 ธ.ค., 2 ม.ค. 70';
  assert.notEqual(ROUNDS.crossingTheYear.card, wholeRoundOnly);
  assert.equal(formatRoundDays(ROUNDS.crossingTheYear.dates, CARD), ROUNDS.crossingTheYear.card);

  // The discriminating detail, named: a year on the FIRST token.
  assert.match(ROUNDS.crossingTheYear.card, /^30 ธ\.ค\. 69/);
});

test("CONTROL: 'auto' implemented as `true` DOES redden the current-year rows", () => {
  // One direction. A constant `true` would print 69 on every card in the
  // default six-month window.
  const asTrue = { showMonth: true, showYear: true };
  for (const name of ['singleDay', 'consecutiveOneMonth', 'nonConsecutiveOneMonth', 'mixedRunAndSingle']) {
    assert.notEqual(
      formatRoundDays(ROUNDS[name].dates, asTrue),
      ROUNDS[name].card,
      `${name} must distinguish auto from true`,
    );
  }
});

test("CONTROL: 'auto' implemented as `false` DOES redden the next-year row", () => {
  /**
   * The other direction, and both are needed: a one-sided control passes for a
   * constant. `auto === true` is caught above by the current-year rows;
   * `auto === false` is caught here by the ones that are not.
   */
  const asFalse = { showMonth: true, showYear: false };
  assert.notEqual(formatRoundDays(ROUNDS.nextYear.dates, asFalse), ROUNDS.nextYear.card);
  assert.notEqual(formatRoundDays(ROUNDS.crossingTheYear.dates, asFalse), ROUNDS.crossingTheYear.card);

  // And it AGREES on the current-year rows, which is why one direction alone
  // would not have caught it.
  assert.equal(formatRoundDays(ROUNDS.singleDay.dates, asFalse), ROUNDS.singleDay.card);
});

test('CONTROL: the fixture is real data, not empty strings', () => {
  /**
   * A wrong import or a fixture that silently became `[]` makes every label '-'
   * and every "notEqual" control pass together — the worst combination. Assert
   * the table has content and that the rows differ from each other.
   */
  const labels = Object.values(ROUNDS).map((r) => r.table);
  assert.equal(new Set(labels).size >= 8, true, 'the rows must not all be the same string');
  assert.equal(Object.keys(ROUNDS).length, 11);
  assert.equal(typeof formatRoundDays, 'function');
  assert.equal(typeof roundMonthSpan, 'function');
});
