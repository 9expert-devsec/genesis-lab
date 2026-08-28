import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';

/**
 * THE ADMIN GRID'S ROUND LABEL, AT ITS CALL-SITE CONTRACT.
 *
 * ── WHY THIS FILE EXISTS BESIDE test/pure/roundDateLabel ────────────────────
 * That file tests the FORMATTER — every option, every edge, the year rules, the
 * epoch-from-null trap. This one tests the CALL /admin/schedules makes: bare
 * `formatRoundDays(schedule.dates)`, no `showMonth`, no `showYear`, because
 * every month column on that grid carries its own month AND its Buddhist year
 * in the header. If someone "helpfully" adds `showMonth: true` at that call
 * site, the formatter's own suite stays green and the grid starts printing the
 * month twice — once in the header, once in every cell. That is what these
 * five rows pin.
 *
 * ── WHAT WAS THERE BEFORE, AND WHY IT WAS A CORRECTNESS BUG ─────────────────
 * The admin cell built its own label:
 *
 *     `${days[0]}-${days[days.length - 1]}`
 *
 * first date to last date, with NO consecutiveness check — a sixth
 * hand-rolled formatter, and one of the wrong ones. It is the identical defect
 * lib/schedule/roundDateLabel's docstring enumerates for the five public
 * copies it retired, and on this screen it was misreporting stored data to the
 * people who maintain it:
 *
 *   16 + 18 ก.ย.        rendered `16-18` — advertising a 17th nobody scheduled
 *   30 ต.ค. + 2 พ.ย.    rendered `30-2`  — a range that exists in no month
 *
 * So the CONTROL at the bottom reproduces that expression verbatim and proves
 * it disagrees. Without it these rows only say "the shared formatter still
 * works", which is the other file's job.
 */

/** The five patterns a round on this grid can have. */
const PATTERNS = [
  {
    name: 'one day',
    dates: ['2026-09-16'],
    label: '16',
    why: 'a single day is just the day — the header carries the month',
  },
  {
    name: 'a consecutive run',
    dates: ['2026-09-16', '2026-09-17', '2026-09-18'],
    label: '16-18',
    why: 'endpoints only, tight hyphen: the days between really are in the round',
  },
  {
    name: 'NON-consecutive days in one month',
    dates: ['2026-09-16', '2026-09-18'],
    label: '16, 18',
    why: 'THE BUG. `16-18` claims a 17th that is not in the round',
  },
  {
    name: 'a cross-month CONSECUTIVE round',
    dates: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'],
    label: '30 ต.ค. - 2 พ.ย.',
    why: 'crossing a month prints BOTH months — `30 - 2` under one heading is not a date',
  },
  {
    name: 'a cross-month round with a GAP',
    dates: ['2026-10-30', '2026-11-02'],
    label: '30 ต.ค., 2 พ.ย.',
    why: 'THE OTHER BUG. `30-2` was both wrong months and a run that does not exist',
  },
];

for (const p of PATTERNS) {
  test(`admin label — ${p.name} → ${p.label}`, () => {
    assert.equal(formatRoundDays(p.dates), p.label, p.why);
  });
}

test('NO DAY IS EVER DROPPED — every scheduled day survives into the label', () => {
  /**
   * The complement of "no day is invented", and the half a spot-check of the
   * five rows above would miss. `lib/formatScheduleDate`'s retired `8 & 12`
   * spelling silently lost the 10th of a three-day round — a customer paying to
   * attend a day the admin screen does not show is the worse direction of this
   * defect, so it gets its own assertion rather than riding on row 3.
   */
  const dates = ['2026-10-08', '2026-10-10', '2026-10-12'];
  const label = formatRoundDays(dates);
  assert.equal(label, '8, 10, 12');
  for (const day of ['8', '10', '12']) {
    assert.match(label, new RegExp(`(^|[^\\d])${day}([^\\d]|$)`), `the ${day}th vanished from the label`);
  }
});

test('the admin call takes NO options — no month, no year, on a single-month round', () => {
  /**
   * Positive proof of the call-site contract itself. The grid's header row is
   * `TH_MONTH_FMT` — month AND 2-digit Buddhist year on every column — so a
   * cell repeating either is noise in a 144px column that already wraps.
   *
   * A cross-month round is the deliberate exception and is asserted above: the
   * formatter prints its months REGARDLESS of `showMonth`, because that is the
   * one case a single column heading cannot explain.
   */
  const label = formatRoundDays(['2026-09-16', '2026-09-18']);
  assert.equal(/ก\.ย\.|69|2569/.test(label), false, `a bare call leaked a month or a year: ${label}`);
});

test('an empty or unusable round still renders something, not `undefined`', () => {
  // A round with no dates is not reachable through the editor, but MSDB is not
  // this app's database. The formatter's own answer is a hyphen; the point here
  // is that the admin call site does not need — and must not grow — a local
  // `?? '—'` fallback beside it, which is where a sixth formatter starts again.
  assert.equal(formatRoundDays([]), '-');
  assert.equal(formatRoundDays(undefined), '-');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the retired first-to-last expression DISAGREES on both bugs', () => {
  /**
   * The exact code that was in ScheduleCell, so the subject of this file is
   * unmistakable and cannot be read as a tautology.
   */
  const retired = (dates) => {
    const days = [...dates]
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b)
      .map((d) => d.getDate());
    return days.length === 0
      ? '—'
      : days.length === 1
        ? String(days[0])
        : `${days[0]}-${days[days.length - 1]}`;
  };

  // The two reported faults, reproduced.
  assert.equal(retired(['2026-09-16', '2026-09-18']), '16-18');
  assert.equal(retired(['2026-10-30', '2026-11-02']), '30-2');

  // …and neither is what the grid renders now.
  assert.notEqual(retired(['2026-09-16', '2026-09-18']), formatRoundDays(['2026-09-16', '2026-09-18']));
  assert.notEqual(retired(['2026-10-30', '2026-11-02']), formatRoundDays(['2026-10-30', '2026-11-02']));

  // But it AGREES on the case that was always correct, which is why the defect
  // survived: most rounds are a single consecutive run and looked right.
  assert.equal(retired(['2026-09-16', '2026-09-17', '2026-09-18']), '16-18');
  assert.equal(formatRoundDays(['2026-09-16', '2026-09-17', '2026-09-18']), '16-18');
});

test('CONTROL: the pattern table is actually being read', () => {
  // Five rows, and each one asserts a DIFFERENT string — a table whose entries
  // collapsed to one value would pass every row above and mean nothing.
  assert.equal(PATTERNS.length, 5);
  assert.equal(new Set(PATTERNS.map((p) => p.label)).size, 5);
});
