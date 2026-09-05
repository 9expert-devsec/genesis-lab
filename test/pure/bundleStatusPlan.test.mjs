import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASONS, planBundleStatusChange } from '@/lib/registrations/bundleStatusPlan';
import { PUBLIC_STATUS_TRANSITIONS, allowedTransitions } from '@/lib/registrations/statuses';

/**
 * WHAT A REQUEST-LEVEL STATUS CHANGE WILL DO, decided once and read twice — by
 * the confirmation dialog and by the action's write set.
 *
 * The property that matters most is the one about CANCELLATION: a terminal leg
 * must never be moved, because nothing in the transition table can move it
 * back and the admin would have destroyed a state no screen can restore.
 */

const leg = (id, courseName, status) => ({ _id: id, courseName, status });

const THREE = [
  leg('a1', 'Claude AI', 'pending'),
  leg('a2', 'Vibe Code L1', 'pending'),
  leg('a3', 'Vibe Code L2', 'pending'),
];

// ── The ordinary case ───────────────────────────────────────────────────────

test('every leg that can move, moves', () => {
  const plan = planBundleStatusChange({ legs: THREE, to: 'confirmed' });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.changing.map((l) => l._id), ['a1', 'a2', 'a3']);
  assert.deepEqual(plan.skipped, []);
  assert.equal(plan.to, 'confirmed');
});

test('the order of the legs is preserved into the plan', () => {
  // The confirmation lists courses in the order the page shows them.
  const plan = planBundleStatusChange({ legs: THREE, to: 'confirmed' });
  assert.deepEqual(plan.changing.map((l) => l.courseName), ['Claude AI', 'Vibe Code L1', 'Vibe Code L2']);
});

// ── THE RULING: a terminal leg is skipped, never overwritten ────────────────

test('a CANCELLED leg is skipped, and the rest still move', () => {
  const legs = [THREE[0], leg('a2', 'Vibe Code L1', 'cancelled'), THREE[2]];
  const plan = planBundleStatusChange({ legs, to: 'confirmed' });

  assert.equal(plan.ok, true, 'the whole action must not be refused because one leg is cancelled');
  assert.deepEqual(plan.changing.map((l) => l._id), ['a1', 'a3']);
  assert.equal(plan.skipped.length, 1);
  assert.deepEqual(plan.skipped[0], {
    _id: 'a2', courseName: 'Vibe Code L1', status: 'cancelled', reason: 'terminal',
  });
});

test('CONTROL: without the terminal rule that leg WOULD have been movable', () => {
  /**
   * The skip must come from the rule, not from the fixture. If `cancelled` ever
   * gains an outgoing edge to `confirmed`, this control goes red and the ruling
   * above has to be re-argued rather than silently changing behaviour.
   */
  assert.deepEqual(allowedTransitions('cancelled', PUBLIC_STATUS_TRANSITIONS), [],
    'cancelled is no longer terminal — the skip rule needs re-deciding');
});

test('cancelling a request skips nothing that is already cancelled, and moves the rest', () => {
  const legs = [THREE[0], leg('a2', 'Vibe Code L1', 'cancelled'), THREE[2]];
  const plan = planBundleStatusChange({ legs, to: 'cancelled' });
  assert.deepEqual(plan.changing.map((l) => l._id), ['a1', 'a3']);
  assert.deepEqual(plan.skipped.map((l) => l.reason), ['already']);
});

// ── The three reasons are distinguished ─────────────────────────────────────

test('`already` is not reported as a refusal', () => {
  // Saying "cannot" about a leg that is already there is a lie the admin would
  // try to work around.
  const legs = [leg('a1', 'Claude AI', 'confirmed'), THREE[1]];
  const plan = planBundleStatusChange({ legs, to: 'confirmed' });
  assert.deepEqual(plan.changing.map((l) => l._id), ['a2']);
  assert.deepEqual(plan.skipped.map((l) => l.reason), ['already']);
});

test('a move the table does not permit is `not-allowed`, distinct from terminal', () => {
  // `confirmed → pending` is not in the table. The leg is not terminal.
  const plan = planBundleStatusChange({ legs: [leg('a1', 'Claude AI', 'confirmed')], to: 'pending' });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.skipped.map((l) => l.reason), ['not-allowed']);
});

test('every reason the planner emits is in the declared enumeration', () => {
  const legs = [
    leg('a1', 'A', 'pending'),    // changing
    leg('a2', 'B', 'confirmed'),  // already
    leg('a3', 'C', 'cancelled'),  // terminal
    leg('a4', 'D', 'paid'),       // not-allowed (paid → confirmed is not in the table)
  ];
  const plan = planBundleStatusChange({ legs, to: 'confirmed' });
  for (const s of plan.skipped) {
    assert.ok(SKIP_REASONS.includes(s.reason), `undeclared reason: ${s.reason}`);
  }
  assert.deepEqual(plan.skipped.map((l) => l.reason).sort(), ['already', 'not-allowed', 'terminal']);
});

test('CONTROL: that fixture really does produce three different reasons', () => {
  // Without this, "every reason is declared" passes over an empty skip list.
  const legs = [
    leg('a1', 'A', 'pending'), leg('a2', 'B', 'confirmed'),
    leg('a3', 'C', 'cancelled'), leg('a4', 'D', 'paid'),
  ];
  const plan = planBundleStatusChange({ legs, to: 'confirmed' });
  assert.equal(plan.skipped.length, 3);
  assert.equal(plan.changing.length, 1);
});

// ── `ok` means "there is something to do" ───────────────────────────────────

test('a plan that changes nothing is not ok', () => {
  const legs = [leg('a1', 'A', 'cancelled'), leg('a2', 'B', 'cancelled')];
  assert.equal(planBundleStatusChange({ legs, to: 'confirmed' }).ok, false);
});

test('a plan that changes ONE leg of three is ok', () => {
  const legs = [leg('a1', 'A', 'pending'), leg('a2', 'B', 'cancelled'), leg('a3', 'C', 'cancelled')];
  const plan = planBundleStatusChange({ legs, to: 'confirmed' });
  assert.equal(plan.ok, true);
  assert.equal(plan.changing.length, 1);
});

// ── The course is how an admin tells the legs apart ─────────────────────────

test('a leg with no courseName falls back to its code, never to blank', () => {
  const plan = planBundleStatusChange({
    legs: [{ _id: 'a1', courseCode: 'CLAUDE-AI', status: 'pending' }],
    to: 'confirmed',
  });
  assert.equal(plan.changing[0].courseName, 'CLAUDE-AI');
});

// ── Degrading ───────────────────────────────────────────────────────────────

test('unusable input plans nothing rather than throwing', () => {
  for (const input of [undefined, {}, { legs: null, to: 'confirmed' }, { legs: 'x', to: 'confirmed' }]) {
    const plan = planBundleStatusChange(input);
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.changing, []);
  }
});

test('a blank target moves nothing and refuses every leg', () => {
  const plan = planBundleStatusChange({ legs: THREE, to: '' });
  assert.equal(plan.ok, false);
  assert.equal(plan.skipped.length, 3);
  assert.deepEqual([...new Set(plan.skipped.map((s) => s.reason))], ['not-allowed']);
});

test('non-object entries are ignored rather than crashing the plan', () => {
  const plan = planBundleStatusChange({ legs: [null, THREE[0], 'nope', undefined], to: 'confirmed' });
  assert.deepEqual(plan.changing.map((l) => l._id), ['a1']);
});

// ── It asks the shared table, not a private copy ────────────────────────────

test('the plan agrees with allowedTransitions for every stored status', () => {
  /**
   * The planner must not become a second opinion about what a permitted move
   * is. For each status, a single-leg plan changes exactly when the table says
   * the move is allowed — with `already` (same status) excluded, since that is
   * a no-op rather than a permission question.
   */
  const statuses = Object.keys(PUBLIC_STATUS_TRANSITIONS);
  for (const from of statuses) {
    for (const to of statuses) {
      if (from === to) continue;
      const plan = planBundleStatusChange({ legs: [leg('x', 'C', from)], to });
      const permitted = allowedTransitions(from, PUBLIC_STATUS_TRANSITIONS).includes(to);
      assert.equal(plan.ok, permitted,
        `plan says ${plan.ok} for ${from} → ${to}, table says ${permitted}`);
    }
  }
});

test('CONTROL: that sweep exercises both outcomes', () => {
  // A sweep in which every pair is permitted (or none is) would pass vacuously.
  const statuses = Object.keys(PUBLIC_STATUS_TRANSITIONS);
  const outcomes = new Set();
  for (const from of statuses) {
    for (const to of statuses) {
      if (from === to) continue;
      outcomes.add(planBundleStatusChange({ legs: [leg('x', 'C', from)], to }).ok);
    }
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
});
