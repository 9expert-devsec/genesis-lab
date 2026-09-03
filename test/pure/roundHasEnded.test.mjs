import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundHasEnded,
  roundHasStarted,
  roundLastDayKey,
} from '@/lib/schedule/roundHasStarted';

/**
 * "IS THIS ROUND OVER?" — the predicate /admin/schedules greys a card by.
 *
 * MSDB began returning fully-past rounds, so the admin grid now draws history
 * beside the future and has to tell the two apart. Everything downstream —
 * the จบไปแล้ว badge, the withheld แก้ไข/ลบ, the details view — branches on this
 * one answer, so the boundary is pinned here rather than at the pixels.
 *
 * ── WHY `status` IS NOT THE INPUT, AND CANNOT BE ────────────────────────────
 * Measured against live MSDB on 2026-09-02: of 172 rounds whose last training
 * day is in the past, 130 say `full`, 40 still say `open` and 2 `nearly_full`.
 * Nothing rewrites a round's status when it finishes. So `status` answers "how
 * were seats selling when someone last looked", never "is it over" — reading it
 * would mark 42 finished rounds as live. The dates are the only field that
 * tracks time, which is why every test below feeds dates and no test feeds a
 * status.
 *
 * ── EVERY CLAIM HAS A CONTROL THAT WOULD REDDEN ─────────────────────────────
 * A predicate that returns a constant passes half a suite by accident. Each
 * boundary case below is paired with its neighbour on the other side of the
 * line, so a hardwired `false` reddens the ENDED cases, a hardwired `true`
 * reddens the RUNNING ones, and `<=` in place of `<` reddens exactly the
 * ends-today case — the one that decides whether an admin can still fix a
 * course while the trainees are in the room.
 */

const TODAY = '2026-09-02';

test('a round whose last day is YESTERDAY has ended', () => {
  assert.equal(roundHasEnded(['2026-09-01'], TODAY), true);
});

test('CONTROL: the same round is NOT ended when yesterday is still ahead', () => {
  // Same dates, clock moved back. If the predicate ignored `todayKey` — or
  // answered from a constant — this and the test above could not disagree.
  assert.equal(roundHasEnded(['2026-09-01'], '2026-08-20'), false);
});

test('a round whose last day is TODAY has NOT ended — it is running now', () => {
  /*
   * THE `<` vs `<=` LINE, AND THE WHOLE REASON THIS TEST EXISTS.
   *
   * Trainees are in the room today. The round keeps its real status and keeps
   * แก้ไข/ลบ, because today is exactly when an admin still needs to correct it.
   * Writing `<=` in roundHasEnded greys out every round on its final morning
   * and locks it read-only, and nothing else in the suite would notice.
   */
  assert.equal(roundHasEnded([TODAY], TODAY), false);
});

test('a round that STARTS today has not ended either', () => {
  assert.equal(roundHasEnded([TODAY, '2026-09-03'], TODAY), false);
});

test('a round entirely in the future has not ended', () => {
  assert.equal(roundHasEnded(['2026-09-03'], TODAY), false);
  assert.equal(roundHasEnded(['2026-12-01', '2026-12-02'], TODAY), false);
});

test('CONTROL: ended and running are not the same answer for the same input shape', () => {
  // Two single-day rounds one day apart straddling `TODAY`. A predicate that
  // collapsed them would pass every individual assertion above that happens to
  // agree with its constant; it cannot pass this.
  assert.notEqual(
    roundHasEnded(['2026-09-01'], TODAY),
    roundHasEnded(['2026-09-03'], TODAY),
  );
});

test('a multi-day round is judged by its LAST day, not its first', () => {
  /*
   * The round began before today and finished before today: ended.
   * A `dates[0]`-based reading gets this one right by luck, which is why the
   * next test is the one that matters.
   */
  assert.equal(roundHasEnded(['2026-08-30', '2026-08-31'], TODAY), true);
});

test('a round STRADDLING today is not ended, though its first day has passed', () => {
  /*
   * THE CASE THAT SEPARATES first-day FROM last-day. A 1–4 ก.ย. round on
   * 2 ก.ย. is half over and still running. Reading `dates[0]` answers "ended"
   * and greys out a course that is being taught this afternoon.
   *
   * Note it is simultaneously STARTED and NOT ENDED — the two predicates are
   * not complements, and this is the state that proves it.
   */
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  assert.equal(roundHasEnded(dates, TODAY), false);
  assert.equal(roundHasStarted(dates, TODAY), true);
});

test('the dates array is not trusted to be sorted', () => {
  /*
   * MSDB owns these arrays and its contract promises no order — roundDateLabel
   * says so in as many words (`@param dates the round's dates, in any order`).
   * A round whose array happens to END with its earliest day would read as
   * finished while it was still running, if the last ELEMENT were mistaken for
   * the last DAY.
   */
  assert.equal(roundHasEnded(['2026-09-04', '2026-09-01'], TODAY), false);
  assert.equal(roundLastDayKey(['2026-09-04', '2026-09-01']), '2026-09-04');
  assert.equal(roundLastDayKey(['2026-08-01', '2026-08-31', '2026-08-15']), '2026-08-31');
});

test('CONTROL: reversing a round that IS over does not rescue it', () => {
  // The mirror of the case above — order must not change the answer in either
  // direction, so a sort-order bug cannot hide behind one-sided fixtures.
  assert.equal(roundHasEnded(['2026-08-31', '2026-08-30'], TODAY), true);
});

test('ISO instants from MSDB are read as their calendar day', () => {
  // Upstream sends UTC midnights, not bare `YYYY-MM-DD`. Asia/Bangkok is UTC+7,
  // so a UTC midnight is the same calendar day locally; a round dated
  // 2026-09-01T00:00:00.000Z is yesterday's, and must grey out.
  assert.equal(roundHasEnded(['2026-09-01T00:00:00.000Z'], TODAY), true);
  assert.equal(roundHasEnded(['2026-09-03T00:00:00.000Z'], TODAY), false);
});

test('a Date object is accepted alongside a string', () => {
  assert.equal(roundHasEnded([new Date(2026, 7, 31)], TODAY), true);
  assert.equal(roundHasEnded([new Date(2026, 8, 30)], TODAY), false);
});

test('a round with no usable date is NOT ended', () => {
  /*
   * Deliberately `false`, matching roundHasStarted's ruling for the same shape.
   * On this screen `false` is the conservative answer: the round keeps its
   * normal treatment and stays editable. Answering `true` would let a data
   * fault lock a live round into a read-only historical state with no control
   * left on the card to undo it.
   */
  assert.equal(roundHasEnded([], TODAY), false);
  assert.equal(roundHasEnded(undefined, TODAY), false);
  assert.equal(roundHasEnded(null, TODAY), false);
  assert.equal(roundHasEnded(['not a date'], TODAY), false);
});

test('the epoch trap: falsy non-strings do not become 1970', () => {
  /*
   * `new Date(null)`, `new Date(0)` and `new Date(false)` all yield the UNIX
   * epoch, not an Invalid Date. As a round's LAST day that reads as a round
   * that finished in 1970 — permanently greyed, permanently uneditable. The
   * shared `dayKey` type-checks instead of filtering falsy values, and this
   * pins that it still does.
   */
  assert.equal(roundHasEnded([null], TODAY), false);
  assert.equal(roundHasEnded([0], TODAY), false);
  assert.equal(roundHasEnded([false], TODAY), false);
  assert.equal(roundLastDayKey([0, null, false]), null);
});

test('CONTROL: a real date mixed in with the junk still decides the answer', () => {
  // Proves the guard above rejects the junk rather than bailing out of the
  // whole array — otherwise every mixed round would silently read as live.
  assert.equal(roundHasEnded([null, '2026-08-31', 0], TODAY), true);
  assert.equal(roundLastDayKey([null, '2026-08-31', 0]), '2026-08-31');
});

test('a caller that cannot say what day it is gets `false`', () => {
  // A missing todayKey must not grey out the entire grid.
  assert.equal(roundHasEnded(['2020-01-01'], ''), false);
  assert.equal(roundHasEnded(['2020-01-01'], undefined), false);
  assert.equal(roundHasEnded(['2020-01-01'], null), false);
});

test('CONTROL: that same ancient round IS ended once a day is supplied', () => {
  assert.equal(roundHasEnded(['2020-01-01'], TODAY), true);
});
