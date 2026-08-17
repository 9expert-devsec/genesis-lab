import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  excludeStartedRounds,
  roundFirstDayKey,
  roundHasStarted,
  startedRounds,
} from '@/lib/schedule/roundHasStarted';

/**
 * A ROUND DISAPPEARS FROM THE PUBLIC SITE THE MOMENT ITS FIRST DAY ARRIVES.
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 * `/schedules` filters `dates: {$elemMatch: {$gte: from}}` — "keep the round if
 * ANY of its days is today or later" — so a 13–14 ส.ค. round matches on its own
 * first day and survives its own start date. On 13 ส.ค. 2026 the public table
 * listed it. The bound is applied by an endpoint this repo does not own, so the
 * narrowing happens on this side and this is where it is pinned.
 *
 * Every case below pins "today" explicitly. Nothing here reads a clock: the
 * boundary is a parameter precisely so the rule can be tested at a date rather
 * than only on the day the suite happens to run.
 */

const TODAY = '2026-08-28';

// ── the five cases the rule is written for ──────────────────────────────────

test('a round starting TODAY is EXCLUDED', () => {
  // THE `=` IN `<=`. This single case is the entire difference between this
  // rule and the upstream `>= today` bound it corrects.
  assert.equal(roundHasStarted(['2026-08-28', '2026-08-29'], TODAY), true);
});

test('a round starting TOMORROW is INCLUDED', () => {
  assert.equal(roundHasStarted(['2026-08-29', '2026-08-30'], TODAY), false);
});

test('a multi-day round that started YESTERDAY and ends TOMORROW is EXCLUDED', () => {
  /**
   * The case the upstream filter gets most confidently wrong: a round in
   * progress has days in the future, so `$elemMatch: {$gte: today}` matches and
   * keeps it. Nobody can book the second day of a course that began yesterday.
   */
  assert.equal(roundHasStarted(['2026-08-27', '2026-08-28', '2026-08-29'], TODAY), true);
});

test('a CROSS-MONTH round starting today is EXCLUDED', () => {
  // 28 ส.ค. – 2 ก.ย. Crossing a month is not an exception to the rule; it is
  // the shape most likely to be special-cased by accident.
  assert.equal(roundHasStarted(['2026-08-28', '2026-09-01', '2026-09-02'], TODAY), true);
  // …and one starting on the 1st of next month is still ordinary future work.
  assert.equal(roundHasStarted(['2026-09-01', '2026-09-02'], TODAY), false);
});

test('an OUT-OF-ORDER dates array whose EARLIEST day is today is EXCLUDED', () => {
  /**
   * THE A3 CASE, and the reason `roundFirstDayKey` is a `min` and never
   * `dates[0]`. `dates` is not guaranteed sorted in storage — rounds written by
   * this app are, but these arrive from MSDB, and roundDateLabel's own contract
   * says "in any order". With `dates[0]` this round reads as starting on
   * 30 ส.ค. and would linger on the public site for its whole duration.
   */
  const outOfOrder = ['2026-08-30', '2026-08-28', '2026-08-29'];
  assert.equal(outOfOrder[0], '2026-08-30', 'the fixture must really be out of order');
  assert.equal(roundFirstDayKey(outOfOrder), '2026-08-28');
  assert.equal(roundHasStarted(outOfOrder, TODAY), true);
});

test('CONTROL: reading dates[0] instead of the min gets that case WRONG', () => {
  // The mutant, written out, so the case above cannot be read as a tautology.
  const outOfOrder = ['2026-08-30', '2026-08-28', '2026-08-29'];
  const byIndex = String(outOfOrder[0]) <= TODAY;
  assert.equal(byIndex, false, 'dates[0] says "not started"…');
  assert.equal(roundHasStarted(outOfOrder, TODAY), true, '…while the round has in fact started');
});

// ── first-day derivation ────────────────────────────────────────────────────

test('roundFirstDayKey takes the minimum, in any order and across months', () => {
  assert.equal(roundFirstDayKey(['2026-09-02', '2026-08-30']), '2026-08-30');
  assert.equal(roundFirstDayKey(['2027-01-02', '2026-12-30']), '2026-12-30');
  assert.equal(roundFirstDayKey(['2026-08-28']), '2026-08-28');
  assert.equal(roundFirstDayKey([]), null);
  assert.equal(roundFirstDayKey(undefined), null);
});

test('a NULL in the dates array is dropped, not read as the UNIX epoch', () => {
  /**
   * `new Date(null)` is not an invalid date — null coerces to 0 and yields
   * 1970-01-01, which as a "first day" would mark every round containing a null
   * as started fifty-six years ago. Upstream sends these arrays straight from
   * Mongo and a null in one is entirely ordinary. Same guard, same reason, as
   * roundDateLabel.calendarDays.
   */
  assert.equal(roundFirstDayKey([null, '2026-09-10']), '2026-09-10');
  assert.equal(roundHasStarted([null, '2026-09-10'], TODAY), false);
  for (const junk of [0, false, '', undefined, 'not-a-date']) {
    assert.equal(roundFirstDayKey([junk, '2026-09-10']), '2026-09-10', `mishandled ${JSON.stringify(junk)}`);
  }
});

test('a round with NO usable date is KEPT, not hidden', () => {
  /**
   * Chosen deliberately, and the choice is worth an assertion. Hiding is silent
   * and unrecoverable from the visitor's side; keeping leaves a visible,
   * reportable row. A round with no dates is a data fault to fix upstream, not
   * a round to delete quietly from the site.
   */
  assert.equal(roundHasStarted([], TODAY), false);
  assert.equal(roundHasStarted([null, ''], TODAY), false);
  assert.equal(roundHasStarted(undefined, TODAY), false);
});

test('a missing or malformed todayKey KEEPS everything', () => {
  // A caller that cannot say what day it is must not be able to empty the
  // schedule page.
  for (const bad of [undefined, null, '', 0, new Date()]) {
    assert.equal(roundHasStarted(['2020-01-01'], bad), false, `emptied on todayKey=${String(bad)}`);
  }
});

// ── the list helpers ────────────────────────────────────────────────────────

const ROUNDS = [
  { _id: 'r-yesterday', dates: ['2026-08-27', '2026-08-29'] },
  { _id: 'r-today',     dates: ['2026-08-28', '2026-08-29'] },
  { _id: 'r-tomorrow',  dates: ['2026-08-29'] },
  { _id: 'r-crossmonth-today', dates: ['2026-09-02', '2026-08-28'] }, // out of order
  { _id: 'r-next-month', dates: ['2026-09-15', '2026-09-16'] },
];

test('excludeStartedRounds keeps only what has not begun', () => {
  const kept = excludeStartedRounds(ROUNDS, TODAY).map((r) => r._id);
  assert.deepEqual(kept, ['r-tomorrow', 'r-next-month']);
});

test('startedRounds is the exact complement — the two partition the input', () => {
  /**
   * Asserted as a partition rather than as two independent lists: the
   * registration page relies on every round landing in exactly one of them, and
   * a round in both (or in neither) would make the wizard's message depend on
   * which list was consulted first.
   */
  const kept = excludeStartedRounds(ROUNDS, TODAY);
  const started = startedRounds(ROUNDS, TODAY);
  assert.equal(kept.length + started.length, ROUNDS.length);

  const keptIds = new Set(kept.map((r) => r._id));
  const startedIds = new Set(started.map((r) => r._id));
  for (const r of ROUNDS) {
    assert.equal(
      keptIds.has(r._id) !== startedIds.has(r._id),
      true,
      `${r._id} is in both lists or in neither`,
    );
  }
  assert.deepEqual([...startedIds].sort(), ['r-crossmonth-today', 'r-today', 'r-yesterday']);
});

test('neither helper mutates its input', () => {
  const input = ROUNDS.map((r) => ({ ...r }));
  const snapshot = JSON.stringify(input);
  excludeStartedRounds(input, TODAY);
  startedRounds(input, TODAY);
  assert.equal(JSON.stringify(input), snapshot);
});

test('a non-array degrades to an empty list rather than throwing', () => {
  // This sits in the fetch path of every public surface, including the home
  // page. An upstream shape change must degrade to an empty table, not a 500.
  for (const junk of [undefined, null, {}, 'items', 42]) {
    assert.deepEqual(excludeStartedRounds(junk, TODAY), []);
    assert.deepEqual(startedRounds(junk, TODAY), []);
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the upstream $elemMatch rule DISAGREES on exactly the cases above', () => {
  /**
   * The defect, written as executable code: "keep the round if ANY day is today
   * or later". Naming it makes the subject of this file unmistakable, and shows
   * the two rules agree on everything except the rounds that have begun — which
   * is why the defect survived so long.
   */
  const elemMatchKeeps = (dates) => dates.some((d) => String(d) >= TODAY);

  // The reported defect: a 13–14 ส.ค. round on 13 ส.ค., transposed onto TODAY.
  assert.equal(elemMatchKeeps(['2026-08-28', '2026-08-29']), true, 'upstream keeps it');
  assert.equal(roundHasStarted(['2026-08-28', '2026-08-29'], TODAY), true, 'we now drop it');

  // And a round in progress.
  assert.equal(elemMatchKeeps(['2026-08-27', '2026-08-29']), true);
  assert.equal(roundHasStarted(['2026-08-27', '2026-08-29'], TODAY), true);

  // But they AGREE on future rounds, which is why nothing else moves.
  assert.equal(elemMatchKeeps(['2026-08-29']), true);
  assert.equal(roundHasStarted(['2026-08-29'], TODAY), false);
});

test('CONTROL: the key comparison really is calendar order across a year end', () => {
  // Lexicographic `<=` on 'YYYY-MM-DD' is calendar order only because the shape
  // is fixed-width, zero-padded and most-significant-first. Proven, not assumed.
  assert.equal(roundHasStarted(['2026-12-31'], '2027-01-01'), true);
  assert.equal(roundHasStarted(['2027-01-01'], '2026-12-31'), false);
  assert.equal(roundHasStarted(['2026-09-01'], '2026-08-31'), false);
  assert.equal(roundHasStarted(['2026-08-31'], '2026-09-01'), true);
  // Zero padding is what makes this hold for single-digit months and days.
  assert.equal(roundHasStarted(['2026-09-09'], '2026-09-10'), true);
  assert.equal(roundHasStarted(['2026-09-10'], '2026-09-09'), false);
});
