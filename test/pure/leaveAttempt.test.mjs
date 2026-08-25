import { test } from 'node:test';
import assert from 'node:assert/strict';

import { beginAttempt, attemptView } from '@/components/pageBuilder/editor/useLeaveGuard';
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
