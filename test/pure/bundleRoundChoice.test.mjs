import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PICK_REASONS,
  previousDayKey,
  effectivePickDeadline,
  latestAllowedPickUntil,
  pickUntilTooLate,
  roundChoices,
  validateBundlePicks,
  bundleRegistrable,
  prunePicks,
} from '@/lib/pageBuilder/bundleRoundChoice';

/**
 * The bundle's round-choice core. No I/O and no clock in the subject, so every
 * boundary below is a fact rather than whatever day the suite ran on.
 *
 * ── THE FIXTURES NAME DATES, NOT OFFSETS ─────────────────────────────────
 * `today` is passed explicitly everywhere. A fixture that said "tomorrow"
 * would be computing the thing under test with the thing under test.
 */

const TODAY = '2026-10-08';

/** An offered round: `{ id, snapshot: { dates }, pickUntil? }`. */
const offer = (id, dates, pickUntil) => ({
  id,
  snapshot: { id, dates, type: 'onsite' },
  ...(pickUntil === undefined ? {} : { pickUntil }),
});

/** A live MSDB row as the status layer hands it over. */
const live = (id, dates, status = 'open') => [id, { status, dates }];

const item = (id, rounds) => ({ id, courseId: `C-${id}`, rounds });

// ── previousDayKey ──────────────────────────────────────────────────────────

test('previousDayKey steps back over month, year and leap boundaries', () => {
  assert.equal(previousDayKey('2026-10-08'), '2026-10-07');
  assert.equal(previousDayKey('2026-10-01'), '2026-09-30');
  assert.equal(previousDayKey('2026-01-01'), '2025-12-31');
  assert.equal(previousDayKey('2026-03-01'), '2026-02-28');
  assert.equal(previousDayKey('2024-03-01'), '2024-02-29', '2024 is a leap year');
});

test('previousDayKey refuses anything that is not a day key', () => {
  for (const v of ['', '2026-10', '2026-10-8', 'yesterday', 0, null, undefined, {}, []]) {
    assert.equal(previousDayKey(v), null, `${JSON.stringify(v)} should be refused`);
  }
});

// ── effectivePickDeadline (R7) ──────────────────────────────────────────────

test('an EMPTY pickUntil closes the round the day before it starts', () => {
  assert.equal(effectivePickDeadline(offer('r1', ['2026-11-12'])), '2026-11-11');
});

test('an EARLIER pickUntil wins — the author may close sooner', () => {
  assert.equal(effectivePickDeadline(offer('r1', ['2026-11-12'], '2026-10-31')), '2026-10-31');
});

test('a LATER pickUntil does NOT extend the round — it still closes the day before', () => {
  // The rule a stored value must never be able to break. The editor and
  // publishBlockers refuse this, but a seeded document can carry it, so the
  // clamp is at READ and holds independently of every writer.
  assert.equal(effectivePickDeadline(offer('r1', ['2026-11-12'], '2026-12-25')), '2026-11-11');
});

test('a pickUntil EQUAL to the cap is kept as-is', () => {
  assert.equal(effectivePickDeadline(offer('r1', ['2026-11-12'], '2026-11-11')), '2026-11-11');
});

test('the FIRST day of a multi-day round is what the deadline is derived from', () => {
  // The dates array is not guaranteed sorted — a round listing its days out of
  // order must still close before its real first day.
  assert.equal(
    effectivePickDeadline(offer('r1', ['2026-11-20', '2026-11-12', '2026-11-13'])),
    '2026-11-11',
  );
});

test('with no readable dates only the author date can speak', () => {
  assert.equal(effectivePickDeadline(offer('r1', [])), null);
  assert.equal(effectivePickDeadline(offer('r1', [], '2026-10-31')), '2026-10-31');
});

test('a malformed pickUntil is ignored, not thrown on', () => {
  for (const v of ['', '2026-13-99x', 'soon', 42, null, {}]) {
    assert.equal(
      effectivePickDeadline(offer('r1', ['2026-11-12'], v)), '2026-11-11',
      `${JSON.stringify(v)} should fall through to the cap`,
    );
  }
});

test('latestAllowedPickUntil / pickUntilTooLate agree with the clamp', () => {
  const r = offer('r1', ['2026-11-12']);
  assert.equal(latestAllowedPickUntil(r), '2026-11-11');
  assert.equal(pickUntilTooLate(offer('r1', ['2026-11-12'], '2026-11-11')), false);
  assert.equal(pickUntilTooLate(offer('r1', ['2026-11-12'], '2026-11-12')), true, 'the start day itself is too late');
  assert.equal(pickUntilTooLate(offer('r1', ['2026-11-12'], '2026-12-25')), true);
  assert.equal(pickUntilTooLate(offer('r1', ['2026-11-12'])), false, 'absent is never too late');
  assert.equal(pickUntilTooLate(offer('r1', [], '2026-12-25')), false, 'no cap, nothing to exceed');
});

// ── the deadline boundary, to the day ───────────────────────────────────────

test('today === pickUntil is still pickable; the day after is deadline_passed', () => {
  const items = [item('i1', [offer('r1', ['2026-11-12'], '2026-10-31')])];
  const statuses = new Map([live('r1', ['2026-11-12'])]);

  const on = roundChoices({ items, liveStatusById: statuses, picks: {}, today: '2026-10-31' });
  assert.equal(on[0].options[0].pickable, true, 'the deadline day itself is inclusive');

  const after = roundChoices({ items, liveStatusById: statuses, picks: {}, today: '2026-11-01' });
  assert.equal(after[0].options[0].pickable, false);
  assert.equal(after[0].options[0].reason, 'deadline_passed');
});

test('with an empty pickUntil the round closes the day it starts', () => {
  const items = [item('i1', [offer('r1', ['2026-11-12'])])];
  const statuses = new Map([live('r1', ['2026-11-12'])]);

  const before = roundChoices({ items, liveStatusById: statuses, picks: {}, today: '2026-11-11' });
  assert.equal(before[0].options[0].pickable, true, 'the day before the start is the last pickable day');

  // On the start day BOTH the deadline and the started test fire. `started` is
  // reported, because that is the fact about the world rather than our rule.
  const onStart = roundChoices({ items, liveStatusById: statuses, picks: {}, today: '2026-11-12' });
  assert.equal(onStart[0].options[0].pickable, false);
  assert.equal(onStart[0].options[0].reason, 'started');
});

test('the reported deadline is the EFFECTIVE one, not the stored one', () => {
  const items = [item('i1', [offer('r1', ['2026-11-12'], '2026-12-25')])];
  const [row] = roundChoices({
    items, liveStatusById: new Map([live('r1', ['2026-11-12'])]), picks: {}, today: TODAY,
  });
  assert.equal(row.options[0].deadline, '2026-11-11');
});

// ── the schedule's reasons win (R4) ─────────────────────────────────────────

test('closed, cancelled and any unknown status all read as closed', () => {
  for (const status of ['closed', 'cancelled', 'postponed', 'whatever-upstream-invented', '']) {
    const [row] = roundChoices({
      items: [item('i1', [offer('r1', ['2026-11-12'])])],
      liveStatusById: new Map([live('r1', ['2026-11-12'], status)]),
      picks: {}, today: TODAY,
    });
    assert.equal(row.options[0].reason, 'closed', `status ${JSON.stringify(status)}`);
  }
});

test('a round MSDB no longer returns is closed, not assumed fine', () => {
  const [row] = roundChoices({
    items: [item('i1', [offer('r1', ['2026-11-12'])])],
    liveStatusById: new Map(), // nothing live
    picks: {}, today: TODAY,
  });
  assert.equal(row.options[0].reason, 'closed');
});

test('full is not pickable but is still reported as full', () => {
  const [row] = roundChoices({
    items: [item('i1', [offer('r1', ['2026-11-12'])])],
    liveStatusById: new Map([live('r1', ['2026-11-12'], 'full')]),
    picks: {}, today: TODAY,
  });
  assert.equal(row.options[0].pickable, false);
  assert.equal(row.options[0].reason, 'full');
});

test('nearly_full IS pickable — it is a warning, not a closure', () => {
  const [row] = roundChoices({
    items: [item('i1', [offer('r1', ['2026-11-12'])])],
    liveStatusById: new Map([live('r1', ['2026-11-12'], 'nearly_full')]),
    picks: {}, today: TODAY,
  });
  assert.equal(row.options[0].pickable, true);
});

test('MSDB closed BEATS a future pickUntil — the schedule always wins', () => {
  const [row] = roundChoices({
    items: [item('i1', [offer('r1', ['2026-11-12'], '2026-11-01')])],
    liveStatusById: new Map([live('r1', ['2026-11-12'], 'closed')]),
    picks: {}, today: '2026-10-20',
  });
  assert.equal(row.options[0].reason, 'closed', 'not deadline_passed, and certainly not pickable');
});

test('a started round is not pickable even with a generous pickUntil', () => {
  const [row] = roundChoices({
    items: [item('i1', [offer('r1', ['2026-10-01'], '2026-12-31')])],
    liveStatusById: new Map([live('r1', ['2026-10-01'])]),
    picks: {}, today: TODAY,
  });
  assert.equal(row.options[0].reason, 'started');
});

// ── non-sequential: free picks ──────────────────────────────────────────────

test('NON-sequential: every item picks freely, nothing is locked', () => {
  const items = [
    item('i1', [offer('a1', ['2026-11-12']), offer('a2', ['2026-12-10'])]),
    item('i2', [offer('b1', ['2026-11-05'])]), // EARLIER than i1's — fine here
  ];
  const statuses = new Map([
    live('a1', ['2026-11-12']), live('a2', ['2026-12-10']), live('b1', ['2026-11-05']),
  ]);
  const rows = roundChoices({ items, sequential: false, liveStatusById: statuses, picks: {}, today: TODAY });
  assert.equal(rows.every((r) => r.locked === false), true);
  assert.equal(rows.every((r) => r.options.every((o) => o.pickable)), true);

  const v = validateBundlePicks({
    items, sequential: false, liveStatusById: statuses,
    picks: { i1: 'a1', i2: 'b1' }, today: TODAY,
  });
  assert.deepEqual(v, { ok: true }, 'an out-of-order pair is valid when order is not required');
});

// ── sequential (R3) ─────────────────────────────────────────────────────────

const SEQ_ITEMS = [
  item('i1', [offer('a1', ['2026-11-02', '2026-11-03'])]),              // ends 11-03
  item('i2', [offer('b1', ['2026-11-03']), offer('b2', ['2026-11-04']),  // same-day / next-day
              offer('b3', ['2026-11-20'])]),
];
const SEQ_LIVE = new Map([
  live('a1', ['2026-11-02', '2026-11-03']),
  live('b1', ['2026-11-03']), live('b2', ['2026-11-04']), live('b3', ['2026-11-20']),
]);

test('SEQUENTIAL: the second course is locked until the first is picked', () => {
  const rows = roundChoices({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE, picks: {}, today: TODAY,
  });
  assert.equal(rows[0].locked, false);
  assert.equal(rows[1].locked, true);
  assert.equal(rows[1].options.every((o) => o.reason === 'previous_not_picked'), true);
});

test('SEQUENTIAL: same-day boundary — start === previous end is NOT pickable', () => {
  const rows = roundChoices({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1' }, today: TODAY,
  });
  const by = Object.fromEntries(rows[1].options.map((o) => [o.roundId, o]));
  assert.equal(by.b1.pickable, false, 'b1 starts the day a1 ends');
  assert.equal(by.b1.reason, 'before_previous');
  assert.equal(by.b2.pickable, true, 'b2 starts the day after');
  assert.equal(by.b3.pickable, true);
});

test('SEQUENTIAL: a valid chain validates, an invalid one reports the item', () => {
  const good = validateBundlePicks({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1', i2: 'b2' }, today: TODAY,
  });
  assert.deepEqual(good, { ok: true });

  const bad = validateBundlePicks({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1', i2: 'b1' }, today: TODAY,
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors, [{ itemId: 'i2', reason: 'before_previous' }]);
});

test('a missing pick and a pick that was never offered are DIFFERENT errors', () => {
  const missing = validateBundlePicks({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE, picks: { i1: 'a1' }, today: TODAY,
  });
  assert.deepEqual(missing.errors, [{ itemId: 'i2', reason: 'not_picked' }]);

  // The shape a tampered payload takes: a real round id, not on this item.
  const tampered = validateBundlePicks({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1', i2: 'a1' }, today: TODAY,
  });
  assert.deepEqual(tampered.errors, [{ itemId: 'i2', reason: 'not_offered' }]);
});

// ── clearing later picks after an earlier change ────────────────────────────

test('prunePicks clears a later pick that the new earlier pick invalidates', () => {
  const items = [
    item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-11-25'])]),
    item('i2', [offer('b1', ['2026-11-10'])]),
  ];
  const statuses = new Map([
    live('a1', ['2026-11-02']), live('a2', ['2026-11-25']), live('b1', ['2026-11-10']),
  ]);
  // a1 (ends 11-02) + b1 (starts 11-10) is a valid chain.
  const before = prunePicks({
    items, sequential: true, liveStatusById: statuses, picks: { i1: 'a1', i2: 'b1' }, today: TODAY,
  });
  assert.deepEqual(before, { picks: { i1: 'a1', i2: 'b1' }, cleared: [] });

  // Moving course 1 to a2 (ends 11-25) puts b1 in the past relative to it.
  const after = prunePicks({
    items, sequential: true, liveStatusById: statuses, picks: { i1: 'a2', i2: 'b1' }, today: TODAY,
  });
  assert.deepEqual(after.picks, { i1: 'a2' });
  assert.deepEqual(after.cleared, ['i2'], 'the applicant is told which pick went');
});

test('prunePicks CASCADES — clearing item 2 also clears item 3', () => {
  const items = [
    item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-20'])]),
    item('i2', [offer('b1', ['2026-11-10'])]),
    item('i3', [offer('c1', ['2026-11-20'])]),
  ];
  const statuses = new Map([
    live('a1', ['2026-11-02']), live('a2', ['2026-12-20']),
    live('b1', ['2026-11-10']), live('c1', ['2026-11-20']),
  ]);
  const after = prunePicks({
    items, sequential: true, liveStatusById: statuses,
    picks: { i1: 'a2', i2: 'b1', i3: 'c1' }, today: TODAY,
  });
  assert.deepEqual(after.picks, { i1: 'a2' });
  assert.deepEqual(after.cleared, ['i2', 'i3'], 'i3 depended on i2, so it goes too');
});

test('prunePicks keeps everything when nothing broke', () => {
  const after = prunePicks({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1', i2: 'b2' }, today: TODAY,
  });
  assert.deepEqual(after, { picks: { i1: 'a1', i2: 'b2' }, cleared: [] });
});

// ── auto-close (R5) ─────────────────────────────────────────────────────────

test('registrable when every course has a pickable round', () => {
  assert.equal(bundleRegistrable({
    items: SEQ_ITEMS, sequential: true, liveStatusById: SEQ_LIVE, today: TODAY,
  }), true);
  assert.equal(bundleRegistrable({
    items: SEQ_ITEMS, sequential: false, liveStatusById: SEQ_LIVE, today: TODAY,
  }), true);
});

test('AUTO-CLOSE: one course with no pickable round closes the bundle', () => {
  const statuses = new Map([
    live('a1', ['2026-11-02', '2026-11-03']),
    live('b1', ['2026-11-03'], 'full'), live('b2', ['2026-11-04'], 'full'),
    live('b3', ['2026-11-20'], 'closed'),
  ]);
  for (const sequential of [false, true]) {
    assert.equal(
      bundleRegistrable({ items: SEQ_ITEMS, sequential, liveStatusById: statuses, today: TODAY }),
      false, `sequential=${sequential}`,
    );
  }
});

test('AUTO-CLOSE: an item offering no rounds at all closes the bundle', () => {
  const items = [item('i1', [offer('a1', ['2026-11-12'])]), item('i2', [])];
  const statuses = new Map([live('a1', ['2026-11-12'])]);
  for (const sequential of [false, true]) {
    assert.equal(bundleRegistrable({ items, sequential, liveStatusById: statuses, today: TODAY }), false);
  }
});

test('AUTO-CLOSE: rounds exist, all are open, but NO CHAIN fits', () => {
  // The case non-sequential would call registrable and sequential must not:
  // course 2's only round starts before course 1's only round ends.
  const items = [
    item('i1', [offer('a1', ['2026-11-20', '2026-11-21'])]),
    item('i2', [offer('b1', ['2026-11-05'])]),
  ];
  const statuses = new Map([
    live('a1', ['2026-11-20', '2026-11-21']), live('b1', ['2026-11-05']),
  ]);
  assert.equal(bundleRegistrable({ items, sequential: false, liveStatusById: statuses, today: TODAY }), true,
    'order does not matter when sequential is off');
  assert.equal(bundleRegistrable({ items, sequential: true, liveStatusById: statuses, today: TODAY }), false,
    'no ordering of these two works');
});

test('GREEDY IS EXACT: the chain only exists via the earliest-ENDING first pick', () => {
  // i1 offers a long round ending 12-20 and a short one ending 11-02. Only the
  // short one leaves room for i2 (starts 11-10). A greedy walk that took the
  // first listed round, or the earliest-STARTING, would answer false.
  const items = [
    item('i1', [offer('aLong', ['2026-11-01', '2026-12-20']), offer('aShort', ['2026-11-02'])]),
    item('i2', [offer('b1', ['2026-11-10'])]),
  ];
  const statuses = new Map([
    live('aLong', ['2026-11-01', '2026-12-20']), live('aShort', ['2026-11-02']),
    live('b1', ['2026-11-10']),
  ]);
  assert.equal(bundleRegistrable({ items, sequential: true, liveStatusById: statuses, today: TODAY }), true);
  assert.deepEqual(
    validateBundlePicks({
      items, sequential: true, liveStatusById: statuses, picks: { i1: 'aShort', i2: 'b1' }, today: TODAY,
    }),
    { ok: true },
  );
});

test('AUTO-CLOSE: a deadline that has passed closes the bundle too', () => {
  const items = [item('i1', [offer('a1', ['2026-11-12'], '2026-10-01')])];
  const statuses = new Map([live('a1', ['2026-11-12'])]);
  assert.equal(bundleRegistrable({ items, sequential: false, liveStatusById: statuses, today: TODAY }), false);
  assert.equal(bundleRegistrable({ items, sequential: false, liveStatusById: statuses, today: '2026-09-30' }), true);
});

test('an empty bundle is not registrable, and validate says so', () => {
  assert.equal(bundleRegistrable({ items: [], liveStatusById: new Map(), today: TODAY }), false);
  const v = validateBundlePicks({ items: [], liveStatusById: new Map(), picks: {}, today: TODAY });
  assert.equal(v.ok, false);
});

// ── shape tolerance ────────────────────────────────────────────────────────

test('liveStatusById works as a Map OR a plain object', () => {
  const items = [item('i1', [offer('r1', ['2026-11-12'])])];
  const asMap = roundChoices({ items, liveStatusById: new Map([live('r1', ['2026-11-12'])]), picks: {}, today: TODAY });
  const asObj = roundChoices({ items, liveStatusById: { r1: { status: 'open', dates: ['2026-11-12'] } }, picks: {}, today: TODAY });
  assert.equal(asMap[0].options[0].pickable, true);
  assert.equal(asObj[0].options[0].pickable, true);
});

test('a half-authored document does not throw', () => {
  for (const items of [undefined, null, [], [{}], [{ id: 'i1' }], [{ id: 'i1', rounds: null }], [{ id: 'i1', rounds: [null, 7] }]]) {
    assert.doesNotThrow(() => roundChoices({ items, liveStatusById: new Map(), picks: {}, today: TODAY }));
    assert.doesNotThrow(() => bundleRegistrable({ items, liveStatusById: new Map(), today: TODAY }));
  }
});

test('control: PICK_REASONS lists exactly the reasons the walk can produce', () => {
  // A reason string the UI has no Thai text for would render blank, so the
  // vocabulary is pinned rather than left to drift.
  assert.deepEqual([...PICK_REASONS], [
    'closed', 'full', 'started', 'deadline_passed', 'previous_not_picked', 'before_previous',
  ]);
});

test('CONTROL: closed and full stay DISTINCT despite the shared normaliser', () => {
  // `normalizeScheduleStatus` aliases 'closed' -> 'full' (a badge-colour
  // decision: it stops a full session rendering green). This module reads the
  // raw word first so the applicant is told the right thing — ปิดรับ is the
  // organiser shutting the round, เต็ม is other people taking the seats.
  //
  // Pinned because the alias makes the naive implementation collapse the two,
  // and the collapse is invisible: both are "not pickable", so every
  // pickable/unpickable assertion passes either way.
  const mk = (status) => roundChoices({
    items: [item('i1', [offer('r1', ['2026-11-12'])])],
    liveStatusById: new Map([live('r1', ['2026-11-12'], status)]),
    picks: {}, today: TODAY,
  })[0].options[0].reason;

  assert.equal(mk('closed'), 'closed');
  assert.equal(mk('CLOSED'), 'closed', 'case and padding do not change the meaning');
  assert.equal(mk('  closed  '), 'closed');
  assert.equal(mk('full'), 'full');
  assert.notEqual(mk('closed'), mk('full'), 'the two must not collapse');
});
