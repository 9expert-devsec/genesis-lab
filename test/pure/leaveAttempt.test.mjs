import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  beginAttempt, attemptView, escalate, rankOf, REASON_RANK,
} from '@/components/pageBuilder/editor/useLeaveGuard';
import { leaveBlockReason } from '@/lib/pageBuilder/leaveGuard';

/**
 * The leave dialog's copy is decided ONCE, when the attempt opens.
 *
 * ── THE DEFECT THIS PINS ───────────────────────────────────────────────────
 * `reason` was recomputed every render for as long as the dialog was up, and
 * `open` tracked only `pending`, never `blocked`. An autosave already counting
 * down when Back was pressed could land WHILE the author was reading, walking
 * the copy 'dirty' -> 'saving' -> null on screen. At null the dialog's
 * `REASON_COPY[reason] ?? REASON_COPY.dirty` fell back to the DIRTY wording,
 * which by then was false — the edit it warns about losing had just been saved.
 *
 * ── WHY THIS IS PURE, AND WHAT IT DOES NOT COVER ───────────────────────────
 * The two functions under test are exported from useLeaveGuard.js precisely so
 * this claim — "the shown reason does not move while one attempt is open" — can
 * be driven as a SEQUENCE without mounting React (the runner is
 * isolation:'none'; one leaked root breaks unrelated files). The hook's history
 * mechanics remain untested by construction, exactly as useLeaveGuard.js's own
 * header already states; test/fs/leaveConfirmFreeze pins the wiring.
 */

// ── the freeze holds across a whole sequence of live-state changes ──────────

test('the shown reason is frozen at open and does not move while the attempt lives', () => {
  // The real sequence: Back pressed while dirty, the in-flight autosave then
  // reports saving, then lands clean. Live `reason` walks all three.
  const attempt = beginAttempt('back', 'dirty');

  const live = ['dirty', 'saving', null];
  const shown = live.map((r) => attemptView(attempt, r).reason);

  assert.deepEqual(shown, ['dirty', 'dirty', 'dirty'], 'the copy changed mid-read');
  // `pending` is unchanged throughout — the attempt is still open the whole time.
  assert.deepEqual(live.map((r) => attemptView(attempt, r).pending), ['back', 'back', 'back']);
});

test('the freeze holds for each reason it can open on', () => {
  for (const frozen of ['dirty', 'saving', 'conflict']) {
    const attempt = beginAttempt('link', frozen);
    const shown = ['dirty', 'saving', 'conflict', null].map((r) => attemptView(attempt, r).reason);
    assert.deepEqual(
      shown, [frozen, frozen, frozen, frozen],
      `an attempt opened on ${frozen} did not hold it`
    );
  }
});

test('CONTROL: without an attempt the LIVE reason passes straight through', () => {
  // The other half of the contract, and what makes the case above meaningful:
  // the guard is not frozen in general, only the copy of an open attempt is.
  const live = ['dirty', 'saving', 'conflict', null];
  assert.deepEqual(live.map((r) => attemptView(null, r).reason), live);
  assert.deepEqual(live.map((r) => attemptView(null, r).pending), [null, null, null, null]);
});

test('CONTROL: the frozen value is genuinely different from the live one', () => {
  // Without this, the sequence case would pass for a function that returned the
  // live reason whenever the two happened to agree.
  const attempt = beginAttempt('back', 'dirty');
  assert.notEqual(attemptView(attempt, 'saving').reason, 'saving');
  assert.equal(attemptView(attempt, 'saving').reason, 'dirty');
});

// ── the freeze is PER ATTEMPT, not permanent ───────────────────────────────

test('a new attempt after a close captures the reason afresh', () => {
  const first = beginAttempt('back', 'dirty');
  assert.equal(attemptView(first, 'saving').reason, 'dirty');

  // …close (cancel or confirm both clear the attempt to null)…
  assert.equal(attemptView(null, 'saving').reason, 'saving');

  // …and a NEW attempt, opened while the live reason is different.
  const second = beginAttempt('link', 'conflict');
  assert.equal(attemptView(second, 'dirty').reason, 'conflict', 'the second attempt reused the first frozen reason');
  assert.equal(attemptView(second, 'dirty').pending, 'link');
});

test('both exits freeze the same way', () => {
  assert.deepEqual(beginAttempt('back', 'saving'), { exit: 'back', reason: 'saving' });
  assert.deepEqual(beginAttempt('link', 'saving'), { exit: 'link', reason: 'saving' });
});

// ── the captured value is what the shared decision module produced ─────────

test('what gets frozen is leaveBlockReason output, not a private vocabulary', () => {
  // The hook captures reasonRef.current, which is leaveBlockReason(state). This
  // pins that the three values this file exercises are that module's, so the
  // dialog's REASON_COPY keys cannot drift from the decision that picks them.
  const cases = [
    [{ conflict: { message: 'x' }, saving: true, dirty: true }, 'conflict'],
    [{ saving: true, dirty: true }, 'saving'],
    [{ dirty: true }, 'dirty'],
    [{}, null],
  ];
  for (const [state, expected] of cases) {
    const live = leaveBlockReason(state);
    assert.equal(live, expected);
    if (live) assert.equal(attemptView(beginAttempt('back', live), null).reason, expected);
  }
});

// ══ ROUND 7: the freeze lets a WORSENING through ═══════════════════════════

test('a conflict arriving while the dialog is open replaces the milder copy', () => {
  // The round-6 regression this part fixes: autosave has now stopped for good,
  // and the frozen 'dirty' copy would keep promising a save that is never
  // coming. Driven the way the hook drives it — escalate() applied to the
  // STORED attempt on each live change, not recomputed from the original.
  let attempt = beginAttempt('back', 'dirty');
  const shown = [];
  for (const live of ['dirty', 'saving', 'conflict']) {
    attempt = escalate(attempt, live);
    shown.push(attemptView(attempt, live).reason);
  }
  assert.deepEqual(
    shown, ['dirty', 'dirty', 'conflict'],
    'the copy did not follow the escalation, or it followed the harmless one too'
  );
});

test('an escalation STICKS once the live reason recedes', () => {
  // A per-render max(frozen, live) would drop back to 'dirty' here. The hook
  // promotes the stored attempt instead, which is what makes it stick.
  let attempt = beginAttempt('back', 'dirty');
  attempt = escalate(attempt, 'conflict');
  assert.equal(attemptView(attempt, 'conflict').reason, 'conflict');

  for (const live of ['saving', 'dirty', null]) {
    attempt = escalate(attempt, live);
    assert.equal(
      attemptView(attempt, live).reason, 'conflict',
      `the escalation was walked back by a live reason of ${String(live)}`
    );
  }
});

test('de-escalation is still suppressed — the round-6 behaviour is intact', () => {
  // The same sequence round 6 pins, driven through escalate() as the hook does.
  // If the ranking had been applied without a floor, 'saving' would outrank
  // 'dirty' and this would walk — reintroducing the exact morph round 6 removed.
  let attempt = beginAttempt('back', 'dirty');
  const shown = [];
  for (const live of ['dirty', 'saving', null]) {
    attempt = escalate(attempt, live);
    shown.push(attemptView(attempt, live).reason);
  }
  assert.deepEqual(shown, ['dirty', 'dirty', 'dirty'], 'a harmless change moved the copy');
});

test('an attempt already open ON conflict is never promoted again', () => {
  let attempt = beginAttempt('link', 'conflict');
  for (const live of ['conflict', 'saving', 'dirty', null]) {
    const before = attempt;
    attempt = escalate(attempt, live);
    assert.equal(attempt, before, `escalate returned a new object for live=${String(live)}`);
    assert.equal(attemptView(attempt, live).reason, 'conflict');
  }
});

test('escalate returns the SAME object when nothing is promoted', () => {
  // Load-bearing: the hook calls setAttempt(escalate(...)) on every reason
  // change, and React only bails out of the re-render on reference equality.
  const attempt = beginAttempt('back', 'dirty');
  for (const live of ['dirty', 'saving', null]) {
    assert.equal(escalate(attempt, live), attempt, `a no-op escalate cloned on live=${String(live)}`);
  }
  assert.notEqual(escalate(attempt, 'conflict'), attempt, 'a real promotion did not produce a new object');
});

test('escalate on no attempt is inert', () => {
  assert.equal(escalate(null, 'conflict'), null);
  assert.equal(escalate(undefined, 'conflict'), undefined);
});

test('the ranks mirror leaveBlockReason precedence, and the floor is conflict', () => {
  // EXACT map — a fourth key, or a reordering, changes which transitions the
  // dialog follows and must be a deliberate edit rather than a drift.
  assert.deepEqual(REASON_RANK, { dirty: 1, saving: 2, conflict: 3 });
  assert.equal(rankOf(null), 0);
  assert.equal(rankOf('nonsense'), 0);
  // The precedence leaveBlockReason applies, read back as a ranking: the reason
  // it reports when all three hold is the highest-ranked of them.
  assert.equal(leaveBlockReason({ conflict: { message: 'x' }, saving: true, dirty: true }), 'conflict');
  assert.equal(rankOf('conflict') > rankOf('saving'), true);
  assert.equal(rankOf('saving') > rankOf('dirty'), true);
});

test('CONTROL: the floor is what stops dirty -> saving being followed', () => {
  // Proves the de-escalation case above is the FLOOR doing the work and not the
  // rank comparison happening to agree — by rank alone, saving outranks dirty.
  assert.equal(rankOf('saving') > rankOf('dirty'), true, 'saving no longer outranks dirty');
  assert.equal(
    escalate(beginAttempt('back', 'dirty'), 'saving').reason, 'dirty',
    'a strictly-higher rank was promoted despite not clearing the floor'
  );
});
