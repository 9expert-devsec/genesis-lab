import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  siteDateParts,
  siteMonthKey,
  siteTodayKey,
  SITE_TIME_ZONE,
} from '@/lib/articlePublishTime';
import { monthKey } from '@/lib/schedule/monthWindow';
import { withTZ } from '../withTZ.mjs';

/**
 * "WHICH MONTH IS IT NOW" IS BANGKOK'S ANSWER, NOT THE RUNTIME'S.
 *
 * ── THE SEVEN-HOUR HOLE, ONE LEVEL UP FROM siteTodayKey ─────────────────────
 * `siteTodayKey` exists because the DAY boundary moves in Bangkok seven hours
 * before it moves in UTC. This file is the same defect at the MONTH boundary,
 * where it is worse rather than rarer: for the last seven hours of every month,
 * a reader using `new Date().getMonth()` on Vercel is a whole month behind.
 *
 * On /schedule that month is the first option of both dropdowns and the start
 * of the opening filter window. So for those seven hours the server shipped a
 * list beginning "ต.ค." and hydration recomputed one beginning "พ.ย." — twelve
 * options shifted by one, with a selected `value` no longer among them.
 *
 * The cases below pin an INSTANT and force the runtime zone around it. The
 * instant never changes; only the process's idea of "local" does. If the answer
 * moves with the runtime zone, the helper is reading the wrong clock.
 */

/**
 * The two instants the brief names. Both are 00:30 Bangkok on the FIRST of a
 * month, expressed as the UTC instant they actually are — which is still
 * 17:30 on the LAST day of the previous month.
 *
 *   2026-10-31T17:30:00Z → 1 Nov 2026, 00:30 Bangkok  (month disagrees)
 *   2026-12-31T17:30:00Z → 1 Jan 2027, 00:30 Bangkok  (month AND year disagree)
 */
const OCT_31_1730Z = new Date('2026-10-31T17:30:00.000Z');
const DEC_31_1730Z = new Date('2026-12-31T17:30:00.000Z');

test('CONTROL: the two instants really are 00:30 Bangkok on the 1st', () => {
  /**
   * Every assertion in this file turns on a month boundary, so a fixture off by
   * an hour would make the whole file agree with itself and mean nothing. The
   * claim is checked against `siteDateParts`, the module's own zone reader.
   */
  const nov = siteDateParts(OCT_31_1730Z);
  assert.deepEqual(
    { y: nov.year, m: nov.month, d: nov.day, h: nov.hour, mi: nov.minute },
    { y: 2026, m: 11, d: 1, h: 0, mi: 30 },
    '00:30 Bangkok on 1 Nov 2026',
  );

  const jan = siteDateParts(DEC_31_1730Z);
  assert.deepEqual(
    { y: jan.year, m: jan.month, d: jan.day, h: jan.hour, mi: jan.minute },
    { y: 2027, m: 1, d: 1, h: 0, mi: 30 },
    '00:30 Bangkok on 1 Jan 2027',
  );

  // And UTC really has NOT rolled over for either — the entire reason this
  // file exists. Asserted on the instant itself, which carries no zone opinion.
  assert.equal(OCT_31_1730Z.toISOString().slice(0, 7), '2026-10');
  assert.equal(DEC_31_1730Z.toISOString().slice(0, 7), '2026-12');

  assert.equal(SITE_TIME_ZONE, 'Asia/Bangkok');
});

test('2026-10-31T17:30:00Z yields 2026-11, with the runtime forced to UTC', () => {
  /**
   * THE CASE THE DROPDOWN GETS WRONG. In UTC it is still October; in Bangkok
   * November has begun, so the first option must be November.
   */
  withTZ('UTC', () => {
    assert.equal(siteMonthKey(OCT_31_1730Z), '2026-11');
    assert.notEqual(
      siteMonthKey(OCT_31_1730Z),
      OCT_31_1730Z.toISOString().slice(0, 7),
      'the helper agreed with UTC — it is reading the runtime clock, not Bangkok',
    );
  });
});

test('2026-12-31T17:30:00Z yields 2027-01 — the YEAR crosses too', () => {
  /**
   * The same seam, on the one night where getting it wrong also puts the wrong
   * Buddhist year on every column head. `siteCurrentYear` already guards the
   * label; this guards the window the labels are drawn for.
   */
  withTZ('UTC', () => {
    assert.equal(siteMonthKey(DEC_31_1730Z), '2027-01');
    assert.notEqual(siteMonthKey(DEC_31_1730Z), '2026-12', 'still in the old year');
  });
});

test('CONTROL: the runtime-local reader DOES disagree at both instants', () => {
  /**
   * Proves the harness can observe the defect at all, and that the two
   * assertions above are not passing for an unrelated reason.
   *
   * The naive reader here is not a hand-rolled straw man — it is
   * `monthWindow`'s real `monthKey`, the function these call sites used to go
   * through and the one that STILL buckets round dates. So this control also
   * documents the exact split: same instant, two different answers, and only
   * the clock read moved to Bangkok.
   *
   * TZ is FORCED to UTC rather than assumed; `withTZ` restores it in a
   * `finally` and the body is synchronous, so nothing leaks into another tier.
   */
  withTZ('UTC', () => {
    assert.equal(monthKey(OCT_31_1730Z), '2026-10', 'runtime-local: still October');
    assert.equal(siteMonthKey(OCT_31_1730Z), '2026-11', 'Bangkok: already November');
    assert.notEqual(monthKey(OCT_31_1730Z), siteMonthKey(OCT_31_1730Z));

    assert.equal(monthKey(DEC_31_1730Z), '2026-12', 'runtime-local: still December');
    assert.equal(siteMonthKey(DEC_31_1730Z), '2027-01', 'Bangkok: already January');
    assert.notEqual(monthKey(DEC_31_1730Z), siteMonthKey(DEC_31_1730Z));
  });

  // And with the runtime already IN Bangkok the two agree — which is what makes
  // the disagreement above attributable to the zone and nothing else.
  withTZ('Asia/Bangkok', () => {
    assert.equal(monthKey(OCT_31_1730Z), siteMonthKey(OCT_31_1730Z));
    assert.equal(monthKey(DEC_31_1730Z), siteMonthKey(DEC_31_1730Z));
  });
});

test('the answer does NOT move with the runtime zone', () => {
  /**
   * The strongest form of the claim: one instant, four very different runtime
   * zones — one WEST of UTC, one east of Bangkok — and one answer. A helper
   * reading `getMonth()` would give three different months here.
   */
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Bangkok', 'Pacific/Kiritimati']) {
    withTZ(tz, () => {
      assert.equal(siteMonthKey(OCT_31_1730Z), '2026-11', `runtime zone ${tz} changed the answer`);
      assert.equal(siteMonthKey(DEC_31_1730Z), '2027-01', `runtime zone ${tz} changed the answer`);
    });
  }
});

test('the key IS the first seven characters of siteTodayKey', () => {
  /**
   * Not an implementation detail restated — it is the reason there is no second
   * formatter and no second `padStart`. Both fields of `YYYY-MM-DD` are
   * fixed-width and zero-padded, so the slice is exact rather than approximate.
   * Checked across a single-digit month, a double-digit month and a boundary.
   */
  withTZ('UTC', () => {
    for (const instant of [
      OCT_31_1730Z,
      DEC_31_1730Z,
      new Date('2026-01-05T02:00:00.000Z'),
      new Date('2026-09-30T23:59:00.000Z'),
    ]) {
      assert.equal(siteMonthKey(instant), siteTodayKey(instant).slice(0, 7));
    }
  });
});

test('the shape is a zero-padded YYYY-MM that compares chronologically', () => {
  /**
   * `windowBetween` walks from one of these to another with a plain string
   * `<=`, which is calendar order ONLY while the month is zero-padded. A
   * single-digit month is therefore the case worth pinning, together with the
   * cross-year comparison the padding is what makes work.
   */
  withTZ('UTC', () => {
    // 09:00 Bangkok on 2026-01-05 → 02:00Z the same day.
    const jan = siteMonthKey(new Date('2026-01-05T02:00:00.000Z'));
    assert.equal(jan, '2026-01');
    assert.match(jan, /^\d{4}-\d{2}$/);
    assert.ok(jan < siteMonthKey(new Date('2026-10-05T02:00:00.000Z')), 'padding is what makes this true');
    assert.ok(siteMonthKey(OCT_31_1730Z) < siteMonthKey(DEC_31_1730Z), 'and it holds across the year');
  });
});

test('called with no argument it reads the clock, and agrees with the parts reader', () => {
  /**
   * The production call takes no argument. It cannot be pinned — it IS the
   * clock read — so what is asserted is the shape and that it agrees with the
   * module's own zone reader for the same moment.
   */
  const key = siteMonthKey();
  assert.match(key, /^\d{4}-\d{2}$/);
  const parts = siteDateParts(new Date());
  assert.equal(key, `${parts.year}-${String(parts.month).padStart(2, '0')}`);
});
