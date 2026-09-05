import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERMINAL_STATUSES,
  REQUEST_STATUS_PRECEDENCE,
  isTerminalStatus,
  requestStatusOf,
  requestStatusExpr,
} from '@/lib/registrations/requestStatus';
import { PUBLIC_STATUS_VALUES } from '@/lib/registrations/statuses';

/**
 * ONE REQUEST, ONE CARD. The arithmetic the summary strip depends on.
 *
 * The invariant the whole folded screen rests on is `Σ cards === total`, and it
 * holds only if every request resolves to EXACTLY ONE status. These are the
 * cases that would break it.
 */

// ── The ordinary single-leg case ────────────────────────────────────────────

test('a single leg is its own status, and is never marked mixed', () => {
  for (const value of PUBLIC_STATUS_VALUES) {
    assert.deepEqual(requestStatusOf([value]), { status: value, mixed: false, statuses: [value] });
  }
});

// ── The ruling: cancelled only when there is nothing left ───────────────────

test('EVERY leg cancelled ⇒ the request is cancelled', () => {
  assert.equal(requestStatusOf(['cancelled', 'cancelled', 'cancelled']).status, 'cancelled');
  assert.equal(requestStatusOf(['cancelled']).status, 'cancelled');
});

test('ONE cancelled leg among live ones does NOT cancel the request', () => {
  /**
   * The ruling this module exists for. Filing this under ยกเลิก would assert
   * the read-only lock over two legs that are still editable, and would move
   * outstanding work off the card the team works from.
   */
  const r = requestStatusOf(['cancelled', 'pending', 'pending']);
  assert.equal(r.status, 'pending');
  assert.equal(r.mixed, true);
  assert.deepEqual(r.statuses, ['pending', 'cancelled']);
});

test('CONTROL: the same input under a cancelled-wins rule would differ', () => {
  // Pins that the case above is actually discriminating. If `cancelled` ever
  // moves to the top of the precedence, this is the test that goes red.
  assert.notEqual(requestStatusOf(['cancelled', 'pending']).status, 'cancelled');
  assert.equal(requestStatusOf(['cancelled', 'pending']).status, 'pending');
});

// ── Among the live legs, the most advanced wins ─────────────────────────────

test('paid beats confirmed beats pending', () => {
  assert.equal(requestStatusOf(['pending', 'confirmed']).status, 'confirmed');
  assert.equal(requestStatusOf(['pending', 'paid']).status, 'paid');
  assert.equal(requestStatusOf(['confirmed', 'paid']).status, 'paid');
  assert.equal(requestStatusOf(['pending', 'confirmed', 'paid']).status, 'paid');
  assert.equal(requestStatusOf(['cancelled', 'pending', 'confirmed', 'paid']).status, 'paid');
});

test('the precedence is order-independent in the INPUT', () => {
  // The legs arrive in whatever order the fetch returned them.
  assert.equal(requestStatusOf(['paid', 'pending']).status, 'paid');
  assert.equal(requestStatusOf(['pending', 'paid']).status, 'paid');
});

// ── mixed, and the distinct set ─────────────────────────────────────────────

test('`mixed` is true exactly when the legs disagree', () => {
  assert.equal(requestStatusOf(['pending', 'pending', 'pending']).mixed, false);
  assert.equal(requestStatusOf(['pending', 'confirmed']).mixed, true);
  assert.equal(requestStatusOf(['cancelled', 'cancelled']).mixed, false);
});

test('the distinct set comes back in vocabulary order, then alphabetical', () => {
  assert.deepEqual(
    requestStatusOf(['cancelled', 'paid', 'pending', 'confirmed']).statuses,
    ['pending', 'confirmed', 'paid', 'cancelled'],
  );
  // An unknown value sorts after every known one rather than being dropped.
  assert.deepEqual(requestStatusOf(['archived', 'pending']).statuses, ['pending', 'archived']);
});

// ── Degrading, never throwing ───────────────────────────────────────────────

test('unusable input degrades to an empty status rather than throwing', () => {
  for (const input of [undefined, null, [], ['', '  '], 'pending', 42, {}]) {
    assert.deepEqual(requestStatusOf(input), { status: '', mixed: false, statuses: [] });
  }
});

test('an unrecognised live status is reported, not bucketed', () => {
  assert.equal(requestStatusOf(['archived']).status, 'archived');
  assert.equal(requestStatusOf(['archived', 'cancelled']).status, 'archived');
  // …but a known value still wins over it.
  assert.equal(requestStatusOf(['archived', 'paid']).status, 'paid');
});

test('isTerminalStatus knows exactly the terminal set', () => {
  assert.equal(isTerminalStatus('cancelled'), true);
  assert.equal(isTerminalStatus('pending'), false);
  assert.equal(isTerminalStatus(undefined), false);
});

// ── The generated Mongo expression ──────────────────────────────────────────

test('the $switch is BUILT from the arrays, in their order', () => {
  /**
   * The property that would actually drift: the pipeline and the JS both read
   * the same two arrays, so a reorder reaches both. The suite has no MongoDB,
   * so this asserts the SHAPE rather than executing it — see the note on
   * `requestStatusExpr`.
   */
  const expr = requestStatusExpr('$statuses');
  const branches = expr.$switch.branches;

  assert.equal(branches.length, 1 + REQUEST_STATUS_PRECEDENCE.length,
    'one all-terminal branch plus one per live status');
  assert.deepEqual(branches[0].case, { $setIsSubset: ['$statuses', TERMINAL_STATUSES] },
    'the first branch is no-live-leg-remains');

  const liveOrder = branches.slice(1).map((b) => b.then);
  assert.deepEqual(liveOrder, [...REQUEST_STATUS_PRECEDENCE],
    'the branch order has drifted from REQUEST_STATUS_PRECEDENCE');
  for (const b of branches.slice(1)) {
    assert.deepEqual(b.case, { $in: [b.then, '$statuses'] });
  }
});

test('CONTROL: the shape assertion would catch a reordered precedence', () => {
  // Build the same expression from a deliberately different order and confirm
  // the assertion above would not pass for it. Without this, "the order equals
  // the array" is satisfied by any order at all.
  const expr = requestStatusExpr('$statuses');
  const liveOrder = expr.$switch.branches.slice(1).map((b) => b.then);
  assert.notDeepEqual(liveOrder, [...REQUEST_STATUS_PRECEDENCE].reverse());
});

test('the expression takes the field path it is given', () => {
  const expr = requestStatusExpr('$legStatuses');
  assert.deepEqual(expr.$switch.branches[0].case, { $setIsSubset: ['$legStatuses', TERMINAL_STATUSES] });
  assert.deepEqual(expr.$switch.default, { $arrayElemAt: ['$legStatuses', 0] });
});

// ── The arithmetic the cards depend on ──────────────────────────────────────

test('EVERY request resolves to exactly one status — Σ cards === total', () => {
  /**
   * The invariant stated as a test. A hundred requests built from every
   * combination of the vocabulary, each counted once, must sum to a hundred.
   */
  const combos = [];
  const values = PUBLIC_STATUS_VALUES;
  for (const a of values) for (const b of values) for (const c of values) combos.push([a, b, c]);

  const tally = new Map();
  for (const legs of combos) {
    const { status } = requestStatusOf(legs);
    assert.ok(status, 'a request resolved to no status at all');
    tally.set(status, (tally.get(status) ?? 0) + 1);
  }
  const summed = [...tally.values()].reduce((n, x) => n + x, 0);
  assert.equal(summed, combos.length,
    `the cards would sum to ${summed} over ${combos.length} requests`);
});

test('CONTROL: the arithmetic test is counting a real spread, not one bucket', () => {
  // Σ === total is satisfied trivially if everything lands in one card. This
  // pins that the fixture actually exercises several.
  const values = PUBLIC_STATUS_VALUES;
  const seen = new Set();
  for (const a of values) for (const b of values) seen.add(requestStatusOf([a, b]).status);
  assert.ok(seen.size >= 3, `only ${seen.size} distinct statuses produced: ${[...seen]}`);
});
