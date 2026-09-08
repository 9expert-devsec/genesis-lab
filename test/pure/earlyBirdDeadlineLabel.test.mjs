import { test } from 'node:test';
import assert from 'node:assert/strict';

import { earlyBirdDeadlineLabel, DEADLINE_PREFIX } from '@/lib/earlyBird/deadlineLabel';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The zone forcing helper, shared because its RESTORE is the
// part that took a bug to get right (test/withTZ.mjs says so at length).
import { withTZ } from '../withTZ.mjs';

/**
 * The Early Bird deadline label.
 *
 * ── WHAT THIS FILE IS ACTUALLY GUARDING ─────────────────────────────────
 * Not "does a string concatenate". The banner is `'use client'`, so any date it
 * formats is formatted TWICE — SSR and hydration — against two different local
 * timezones, and a deadline near midnight then names two different calendar
 * days. Nothing sets `TZ` in this repo, so on Vercel that is UTC against a
 * reader in Bangkok: a seven-hour gap, straddling midnight every night.
 *
 * The fix is two properties, and BOTH are asserted below because either alone
 * is insufficient:
 *   · it is formatted on the SERVER and passed as a finished string — a source
 *     claim, checked in the render tier where the component lives;
 *   · the formatter is ZONE-PINNED, so the one machine that does it cannot get
 *     a different answer than another would. That is this file's subject, and
 *     the control is a deadline at 23:30 in a zone where 23:30 is a different
 *     day somewhere else.
 */

const ZONES = ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati'];

test('a known deadline formats to the expected Thai string', () => {
  /**
   * 2026-09-10T16:59:59.999Z is 10 Sep 23:59:59.999 in Bangkok — the exact
   * instant `windowEndFromInput` stores when an author picks 10 September, so
   * this is the value the field really holds rather than a convenient one.
   *
   * 2026 + 543 = 2569, and ก.ย. is the ninth abbreviation. Written out because
   * a Buddhist year computed in the test would just be the implementation
   * agreeing with itself.
   */
  assert.equal(earlyBirdDeadlineLabel('2026-09-10T16:59:59.999Z'), 'หมดเขต 10 ก.ย. 2569');
  assert.equal(DEADLINE_PREFIX, 'หมดเขต');
});

test('CONTROL — a 23:30 Bangkok deadline formats identically in every zone', () => {
  /**
   * THE assertion this round exists for. 2026-09-10T16:30:00.000Z is 10 Sep
   * 23:30 in Bangkok and 10 Sep 09:30 in UTC — but it is already 11 Sep in
   * Kiritimati (UTC+14), and still 10 Sep in Los Angeles. So a formatter that
   * read the runtime calendar would produce TWO different days across this set,
   * which is precisely the SSR/hydration split.
   *
   * All four zones must agree, and they must agree on the BANGKOK day.
   */
  const instant = '2026-09-10T16:30:00.000Z';
  const answers = ZONES.map((tz) => withTZ(tz, () => earlyBirdDeadlineLabel(instant)));
  assert.deepEqual([...new Set(answers)], ['หมดเขต 10 ก.ย. 2569'],
    `the label is machine-dependent: ${JSON.stringify(Object.fromEntries(ZONES.map((z, i) => [z, answers[i]])))}`);
});

test('CONTROL — an UNPINNED reading really would disagree across those zones', () => {
  /**
   * Without this, the test above passes for the wrong reason: if the zones
   * happened not to straddle a date boundary for that instant, "they all agree"
   * would be true of a broken formatter too. This is the shape the banner's own
   * `formatScheduleRange` uses — `getDate()` off the runtime — proving the
   * fixture is a genuine trap.
   */
  const d = new Date('2026-09-10T16:30:00.000Z');
  const ambient = ZONES.map((tz) => withTZ(tz, () => d.getDate()));
  assert.ok(new Set(ambient).size > 1,
    `the fixture does not straddle a date boundary in these zones (${ambient}) — ` +
    'the agreement above proves nothing; pick an instant that does');
});

test('an absent, empty or unparseable deadline renders NO label', () => {
  /**
   * `null` rather than `'หมดเขต '` with nothing after it, and rather than a
   * label reading `Invalid Date`. The banner renders nothing for null, so a row
   * with no deadline is byte-identical to what it rendered before this round —
   * which is the same set of rows whose countdown is already absent.
   */
  for (const value of [null, undefined, '', '   ', 'not a date', {}, [], NaN, 0]) {
    assert.equal(earlyBirdDeadlineLabel(value), null,
      `deadline ${JSON.stringify(value)} produced a label`);
  }
});

test('a Date instance and its ISO string give the same label', () => {
  /**
   * `getEarlyBirdByCourse` serialises through JSON, so the value reaching the
   * page is a STRING — but the admin read and the write-through both handle
   * real `Date`s, and a helper that only worked for one of them would fail on
   * whichever path a later caller used.
   */
  const iso = '2026-09-10T16:59:59.999Z';
  assert.equal(earlyBirdDeadlineLabel(new Date(iso)), earlyBirdDeadlineLabel(iso));
});

test('CONTROL — withTZ left the process zone as it found it', () => {
  /**
   * `test/run.mjs` runs `isolation: 'none'`, so `process.env.TZ` is shared with
   * every other test in every tier. A leak here fails a file three hundred
   * lines away, which is exactly what happened the first time this pattern was
   * written (see test/withTZ.mjs's header).
   */
  const before = new Date('2026-07-30T18:00').toISOString();
  for (const tz of ZONES) withTZ(tz, () => earlyBirdDeadlineLabel('2026-09-10T16:30:00.000Z'));
  assert.equal(new Date('2026-07-30T18:00').toISOString(), before,
    'withTZ leaked a zone — every test after this file is now evaluated in the wrong one');
});
