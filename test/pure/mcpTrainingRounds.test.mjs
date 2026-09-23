import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UPSTREAM_STATUS_ALL, listTrainingRounds } from '../../src/lib/mcp/tools/listTrainingRounds.js';

/**
 * The round rules. Every one of these was a measured upstream defect in round
 * 1, not a hypothetical — see docs/mcp/round1-survey.md §2 (a), (b) and the
 * orphan finding.
 *
 * TODAY IS PINNED at 2026-09-23 and injected as `todayKey`. The rules are all
 * date comparisons in Asia/Bangkok and a test that used the real clock would
 * pass today and fail on some Tuesday in March.
 */

const TODAY = '2026-09-23';

/** A round, in the shape `/schedules` actually returns. */
function round({ id = 'r1', code = 'POWER-BI', dates, status = 'open', type = 'classroom', course = undefined }) {
  return {
    _id: id,
    course: course === undefined ? { _id: `oid-${code}`, course_id: code, course_name: `${code} course` } : course,
    dates: dates.map((d) => `${d}T00:00:00.000Z`),
    status,
    type,
    signup_url: `https://www.9experttraining.com/registration/public?class=${id}`,
  };
}

function deps(items, extra = {}) {
  return {
    listSchedules: async () => ({ items, total: items.length }),
    getCourseByCodeInsensitive: async () => null,
    todayKey: () => TODAY,
    ...extra,
  };
}

test('a finished round is never returned, even with include_in_progress', async () => {
  const items = [round({ id: 'done', dates: ['2026-09-20', '2026-09-21'], status: 'full' })];

  const plain = await listTrainingRounds({}, deps(items));
  assert.equal(plain.rounds.length, 0, 'a round whose last day has passed must not appear');

  const widened = await listTrainingRounds({ include_in_progress: true }, deps(items));
  assert.equal(widened.rounds.length, 0, 'include_in_progress widens to running rounds, never to finished ones');
});

test('an in-progress round is hidden by default and flagged when included', async () => {
  // Started 2026-09-22, still running through 2026-09-24: started AND not ended.
  const items = [round({ id: 'live', dates: ['2026-09-22', '2026-09-23', '2026-09-24'], status: 'open' })];

  const hidden = await listTrainingRounds({}, deps(items));
  assert.equal(hidden.rounds.length, 0, 'registration closes when a round starts, so it is out by default');

  const shown = await listTrainingRounds({ include_in_progress: true }, deps(items));
  assert.equal(shown.rounds.length, 1);
  assert.equal(shown.rounds[0].in_progress, true);
  assert.equal(shown.rounds[0].registration_open, false, 'a running class cannot be booked');
});

test('the stale upstream status of a started round is never emitted', async () => {
  // 193 finished rounds still carried a live-looking status upstream — 149
  // `full`, 41 `open`, 3 `nearly_full`. Handing `"open"` to a model would
  // invite it to sell a seat in a class that is already half-taught.
  const items = [round({ id: 'live', dates: ['2026-09-22', '2026-09-24'], status: 'open' })];
  const out = await listTrainingRounds({ include_in_progress: true }, deps(items));

  assert.equal(out.rounds.length, 1);
  assert.ok(!('status' in out.rounds[0]), 'a started round must carry no status key at all');
  // No VALUE may be the raw status either — a rename of the key would otherwise
  // pass the check above while still handing the model "open".
  // (Checked on values, not on the serialised blob: `registration_open`
  // legitimately contains the substring "open" in its KEY.)
  const values = Object.values(out.rounds[0]).map((v) => JSON.stringify(v));
  for (const raw of ['open', 'nearly_full', 'full']) {
    assert.ok(!values.includes(JSON.stringify(raw)), `the raw status "${raw}" must not leak as a value`);
  }
});

test('a not-yet-started round carries the site status vocabulary, not the raw code', async () => {
  const items = [
    round({ id: 'a', dates: ['2026-10-01'], status: 'open' }),
    round({ id: 'b', dates: ['2026-10-02'], status: 'nearly_full' }),
    round({ id: 'c', dates: ['2026-10-03'], status: 'full' }),
  ];
  const out = await listTrainingRounds({}, deps(items));

  assert.deepEqual(out.rounds.map((r) => r.status), ['เปิดรับ', 'ใกล้เต็ม', 'เต็ม']);
  assert.deepEqual(out.rounds.map((r) => r.registration_open), [true, true, false]);
});

test('the Bangkok-date boundary: a round starting TODAY has started', async () => {
  // `roundHasStarted` uses `<=` and the `=` is the whole point — a round whose
  // first day is today is under way, not open for registration.
  const items = [round({ id: 'today', dates: [TODAY], status: 'open' })];

  const hidden = await listTrainingRounds({}, deps(items));
  assert.equal(hidden.rounds.length, 0, 'a round beginning today is no longer registerable');

  const shown = await listTrainingRounds({ include_in_progress: true }, deps(items));
  assert.equal(shown.rounds.length, 1, 'but it IS running today, so it is not finished either');
  assert.equal(shown.rounds[0].in_progress, true);
});

test('the Bangkok-date boundary: a round ENDING today is still running, not finished', async () => {
  // `roundHasEnded` uses `<`, not `<=`. Trainees are in the room on the last day.
  const items = [round({ id: 'lastday', dates: ['2026-09-21', TODAY], status: 'full' })];
  const out = await listTrainingRounds({ include_in_progress: true }, deps(items));
  assert.equal(out.rounds.length, 1, 'a round whose last day is today has not ended');
});

test('a round starting TOMORROW is still registerable', async () => {
  const items = [round({ id: 'soon', dates: ['2026-09-24'], status: 'open' })];
  const out = await listTrainingRounds({}, deps(items));
  assert.equal(out.rounds.length, 1);
  assert.equal(out.rounds[0].in_progress, false);
  assert.equal(out.rounds[0].registration_open, true);
});

test('an orphan round is dropped AND counted', async () => {
  const items = [
    round({ id: 'ok', dates: ['2026-10-01'] }),
    round({ id: 'orphan', dates: ['2026-10-02'], course: null }),
    round({ id: 'orphan2', dates: ['2026-10-03'], course: null }),
  ];
  const out = await listTrainingRounds({}, deps(items));

  assert.equal(out.rounds.length, 1, 'a round with no course cannot be named and must not be rendered');
  assert.equal(out.dropped_orphan_rounds, 2, 'the loss must be visible, or the catalogue looks smaller than it is');
});

test('status=all is always sent upstream, or full rounds vanish silently', async () => {
  let seen = null;
  await listTrainingRounds({}, {
    listSchedules: async (args) => { seen = args; return { items: [] }; },
    getCourseByCodeInsensitive: async () => null,
    todayKey: () => TODAY,
  });
  assert.equal(seen.status, UPSTREAM_STATUS_ALL);
  assert.equal(seen.status, 'all');
});

test('no seat count appears in any field', async () => {
  const items = [round({ id: 'a', dates: ['2026-10-01'], status: 'nearly_full' })];
  const out = await listTrainingRounds({}, deps(items));
  const text = JSON.stringify(out).toLowerCase();
  for (const word of ['seat', 'capacity', 'remaining', 'available_seats', 'places']) {
    assert.ok(!text.includes(word), `"${word}" must never appear — upstream publishes no seat data`);
  }
});

test('an unparseable date range is refused rather than silently ignored', async () => {
  await assert.rejects(
    () => listTrainingRounds({ from: '01/10/2026' }, deps([])),
    /from must be a date in YYYY-MM-DD form/
  );
});

test('rounds come back in date order and the limit is capped', async () => {
  const items = [
    round({ id: 'c', dates: ['2026-12-01'] }),
    round({ id: 'a', dates: ['2026-10-01'] }),
    round({ id: 'b', dates: ['2026-11-01'] }),
  ];
  const out = await listTrainingRounds({ limit: 2 }, deps(items));
  assert.deepEqual(out.rounds.map((r) => r.first_day), ['2026-10-01', '2026-11-01']);
  assert.equal(out.total_matched, 3, 'the caller must be able to tell there were more');
  assert.equal(out.returned, 2);
});
