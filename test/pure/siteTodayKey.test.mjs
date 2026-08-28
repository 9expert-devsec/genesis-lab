import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteTodayKey, siteDateParts, SITE_TIME_ZONE } from '@/lib/articlePublishTime';
import { withTZ } from '../withTZ.mjs';

/**
 * THE BOUNDARY IS LOCAL MIDNIGHT IN BANGKOK, NOT IN THE RUNTIME'S ZONE.
 *
 * ── THE SEVEN-HOUR HOLE THIS EXISTS TO CLOSE ────────────────────────────────
 * The rule `siteTodayKey` serves is "a round disappears the moment its FIRST
 * training day arrives", and "arrives" means midnight in Bangkok — the zone the
 * courses are taught in and the admins work in.
 *
 * Vercel runs in UTC. Bangkok is UTC+7 with no DST, so for the first SEVEN
 * HOURS of every Bangkok day the UTC date is still yesterday. Reading the
 * boundary with `new Date().getDate()` would keep every round starting today
 * visible until 07:00 Bangkok — not an edge case once a year, but a seven-hour
 * hole every single morning, at exactly the hours someone is most likely to be
 * looking for a course starting that day.
 *
 * So the cases below pin an INSTANT and force the runtime zone around it. The
 * instant never changes; only the process's idea of "local" does. If the answer
 * moves with the runtime zone, the helper is reading the wrong clock.
 */

/**
 * The two instants the ruling names, as unambiguous UTC.
 *
 *   23:00 Bangkok on 28 ส.ค. is 16:00Z on 28 ส.ค. — same date in both zones.
 *   01:00 Bangkok on 29 ส.ค. is 18:00Z on 28 ส.ค. — Bangkok has rolled over,
 *                                                   UTC has NOT. This is the
 *                                                   case that breaks a naive
 *                                                   implementation.
 */
const AT_2300_BANGKOK = new Date('2026-08-28T16:00:00.000Z');
const AT_0100_BANGKOK = new Date('2026-08-28T18:00:00.000Z');

test('CONTROL: the two fixtures really are the Bangkok times they claim', () => {
  /**
   * Every assertion below is about a date boundary, so a fixture off by an hour
   * would make the whole file agree with itself and mean nothing. The claim is
   * checked against `siteDateParts`, the module's own zone reader.
   */
  const late = siteDateParts(AT_2300_BANGKOK);
  assert.deepEqual(
    { y: late.year, m: late.month, d: late.day, h: late.hour },
    { y: 2026, m: 8, d: 28, h: 23 },
    '23:00 Bangkok on 28 Aug',
  );

  const early = siteDateParts(AT_0100_BANGKOK);
  assert.deepEqual(
    { y: early.year, m: early.month, d: early.day, h: early.hour },
    { y: 2026, m: 8, d: 29, h: 1 },
    '01:00 Bangkok on 29 Aug',
  );

  // And the UTC dates really do disagree for the second one — which is the
  // entire reason this file exists.
  assert.equal(AT_2300_BANGKOK.toISOString().slice(0, 10), '2026-08-28');
  assert.equal(AT_0100_BANGKOK.toISOString().slice(0, 10), '2026-08-28');

  assert.equal(SITE_TIME_ZONE, 'Asia/Bangkok');
});

test('23:00 Bangkok resolves to that day, with the runtime in UTC', () => {
  withTZ('UTC', () => {
    assert.equal(siteTodayKey(AT_2300_BANGKOK), '2026-08-28');
  });
});

test('01:00 Bangkok resolves to the NEW day, with the runtime still in UTC', () => {
  /**
   * THE CASE THAT MATTERS. In UTC it is still 18:00 on the 28th; in Bangkok the
   * 29th has begun. A round starting on the 29th must already be gone.
   */
  withTZ('UTC', () => {
    assert.equal(siteTodayKey(AT_0100_BANGKOK), '2026-08-29');
    assert.notEqual(
      siteTodayKey(AT_0100_BANGKOK),
      AT_0100_BANGKOK.toISOString().slice(0, 10),
      'the helper agreed with UTC — it is reading the runtime clock, not Bangkok',
    );
  });
});

test('the answer does NOT move with the runtime zone', () => {
  /**
   * The strongest form of the claim: one instant, four very different runtime
   * zones — including one WEST of UTC and one east of Bangkok — and one answer.
   * A helper reading `getDate()` would produce three different days here.
   */
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Bangkok', 'Pacific/Kiritimati']) {
    withTZ(tz, () => {
      assert.equal(
        siteTodayKey(AT_0100_BANGKOK),
        '2026-08-29',
        `runtime zone ${tz} changed the answer`,
      );
      assert.equal(siteTodayKey(AT_2300_BANGKOK), '2026-08-28', `runtime zone ${tz}`);
    });
  }
});

test('CONTROL: a runtime-zone implementation DOES move, in the same harness', () => {
  /**
   * Proves the harness can observe the defect at all. Without it, a `withTZ`
   * that silently failed to change the zone would make every case above pass
   * for the wrong reason.
   */
  const naive = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const seen = new Set();
  for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
    withTZ(tz, () => seen.add(naive(AT_0100_BANGKOK)));
  }
  assert.ok(seen.size > 1, 'the naive reader gave one answer in every zone — withTZ is not working');
  assert.ok(seen.has('2026-08-28'), 'and in UTC it gives the WRONG day, which is the defect');
});

test('the shape is a zero-padded YYYY-MM-DD, comparable with the round keys', () => {
  /**
   * `roundHasStarted` compares this string against a round's first-day key with
   * a plain `<=`, which is calendar order only while both are fixed-width and
   * zero-padded. Single-digit month AND day, checked together.
   */
  withTZ('UTC', () => {
    // 09:00 Bangkok on 2026-01-05 → 02:00Z the same day.
    assert.equal(siteTodayKey(new Date('2026-01-05T02:00:00.000Z')), '2026-01-05');
    assert.match(siteTodayKey(new Date('2026-01-05T02:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
  });
});

test('a new-year rollover crosses in Bangkok before it does in UTC', () => {
  // 00:30 Bangkok on 1 Jan 2027 is 17:30Z on 31 Dec 2026 — the year itself
  // disagrees, which is the same seam `siteCurrentYear` was written for.
  withTZ('UTC', () => {
    const instant = new Date('2026-12-31T17:30:00.000Z');
    assert.equal(siteTodayKey(instant), '2027-01-01');
    assert.equal(instant.toISOString().slice(0, 10), '2026-12-31');
  });
});

test('called with no argument it reads the clock, and returns today-shaped output', () => {
  /**
   * The production call takes no argument. It cannot be pinned — it IS the
   * clock read — so what is asserted is the shape and that it agrees with the
   * module's own parts reader for the same moment.
   */
  const key = siteTodayKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  const parts = siteDateParts(new Date());
  const expected = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  assert.equal(key, expected);
});
