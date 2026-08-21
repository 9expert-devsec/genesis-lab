import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  beginAttempt, attemptView, escalate, rankOf, REASON_RANK, shouldAutoComplete,
} from '@/components/pageBuilder/editor/useLeaveGuard';
import { leaveBlockReason } from '@/lib/pageBuilder/leaveGuard';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';

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

/** A minimal stored page, for the cases that need a real reducer state. */
const LIVE = {
  slug: 'live-slug', title: 'Live', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
};
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

// ══ ROUND 8: the departure finishes itself once nothing is left to lose ═════

/**
 * A stand-in for the hook's render loop.
 *
 * The effect under test is `if (shouldAutoComplete({pending, blocked})) confirmLeave()`
 * with deps [pending, blocked, confirmLeave]. This runs that exact rule over a
 * sequence of committed states and counts what it calls — the closest a suite
 * that mounts no React roots can get to the real thing, and the same technique
 * rounds 6 and 7 used for the freeze and the publish bracket.
 *
 * `confirmLeave` here does what the real one does, in the same order: read and
 * null departRef, clear the attempt, then depart. That ordering is why no
 * one-shot ref is needed, and this harness would expose it if it changed.
 */
function editorSession(openWith) {
  const calls = { confirmLeave: 0, departed: 0 };
  let attempt = openWith ? beginAttempt('back', openWith) : null;
  let departRef = openWith ? () => { calls.departed += 1; } : null;

  const confirmLeave = () => {
    calls.confirmLeave += 1;
    const depart = departRef;
    departRef = null;
    attempt = null;
    depart?.();
  };

  // One committed render: escalate as round 7 does, then run the effect.
  const commit = (liveReason, blocked) => {
    attempt = escalate(attempt, liveReason);
    const { pending } = attemptView(attempt, liveReason);
    if (shouldAutoComplete({ pending, blocked })) confirmLeave();
    return attemptView(attempt, liveReason).pending;
  };

  return { commit, calls, confirmLeave, peek: () => attempt };
}

test('the predicate fires only with an attempt open AND nothing blocking', () => {
  assert.equal(shouldAutoComplete({ pending: 'back', blocked: false }), true);
  assert.equal(shouldAutoComplete({ pending: 'link', blocked: false }), true);
  assert.equal(shouldAutoComplete({ pending: 'back', blocked: true }), false, 'it fired while still blocked');
  assert.equal(shouldAutoComplete({ pending: null, blocked: false }), false, 'it fired with no attempt open');
  assert.equal(shouldAutoComplete({ pending: null, blocked: true }), false);
  assert.equal(shouldAutoComplete({}), false);
});

test('an autosave landing under an open dialog completes the departure itself', () => {
  // Back pressed while dirty; the in-flight autosave then lands and the tree
  // goes clean. Nothing is left to lose, so the original Back gesture finishes
  // without a second click on a warning that has stopped being true.
  const s = editorSession('dirty');
  assert.equal(s.commit('dirty', true), 'back', 'precondition: the dialog is open and blocking');
  assert.equal(s.calls.departed, 0, 'it departed while still blocked');

  const pendingAfter = s.commit(null, false);   // the save landed
  assert.equal(s.calls.departed, 1, 'the departure did not complete on its own');
  assert.equal(pendingAfter, null, 'pending did not reset after the auto-complete');
});

test('the publish sequence completes the departure only after the PROMOTE lands', () => {
  // Round 7's fix is what makes this safe, so it is driven here as the real
  // sequence rather than as a single clean transition: the flush lands (which
  // by itself clears dirty and `saving`), the promote is still in flight —
  // `blocked` stays true because `publishing` holds it — and only when the
  // promote resolves does the departure complete.
  const s = editorSession('saving');
  const seen = [];
  seen.push(['back-pressed', s.commit('saving', true), s.calls.departed]);
  seen.push(['flush-landed', s.commit('saving', true), s.calls.departed]);   // publishing holds blocked
  seen.push(['promote-landed', s.commit(null, false), s.calls.departed]);

  assert.deepEqual(seen, [
    ['back-pressed', 'back', 0],
    ['flush-landed', 'back', 0],
    ['promote-landed', null, 1],
  ], 'the departure completed at the wrong point in the publish sequence');
});

test('CONTROL: without round 7 the departure would fire mid-publish', () => {
  // The same sequence with `blocked` false at flush-landed — which is exactly
  // what it read before round 7's publishing bracket. This is the hazard that
  // deferred this feature, expressed as a measurement rather than a claim.
  const s = editorSession('saving');
  s.commit('saving', true);
  s.commit(null, false);                        // pre-round-7: idle mid-publish
  assert.equal(
    s.calls.departed, 1,
    'the harness cannot even express the pre-round-7 hazard, so the case above proves nothing'
  );
});

test('a CONFLICTED session never auto-departs, however long it runs', () => {
  // `blocked` cannot fall for a conflicted session — SAVE_CONFLICT sets it and
  // nothing in the reducer clears it — so the effect never becomes true. Driven
  // for many commits, including live reasons that would clear any other session.
  const s = editorSession('dirty');
  s.commit('dirty', true);
  s.commit('conflict', true);                   // escalates; round 7's floor holds it
  assert.equal(attemptView(s.peek(), 'conflict').reason, 'conflict', 'precondition: escalated to conflict');

  for (let i = 0; i < 25; i += 1) s.commit('conflict', true);
  assert.equal(s.calls.departed, 0, 'a conflicted session auto-departed');
  assert.equal(s.calls.confirmLeave, 0, 'a conflicted session reached confirmLeave');
  assert.equal(attemptView(s.peek(), 'conflict').pending, 'back', 'the dialog closed itself');
});

test('conflict is terminal in the reducer — the premise the case above rests on', () => {
  // Asserted against the real reducer rather than taken on trust: nothing
  // clears `conflict`, so `blocked` can never fall once it is set.
  let state = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  state = editorReducer(state, { type: 'SAVE_CONFLICT', message: 'moved' });
  assert.deepEqual(state.conflict, { message: 'moved' });

  const everythingElse = [
    { type: 'SAVE_START' },
    { type: 'SAVE_OK', domains: ['content', 'identity'], updatedAt: 'T9', at: 0 },
    { type: 'SAVE_ERROR', error: 'x' },
    { type: 'PUBLISH_START' },
    { type: 'PUBLISH_END' },
    { type: 'DRAFT_DISCARDED' },
    { type: 'PATCH_PAGE', patch: { title: 'Typed' } },
    { type: 'SELECT', path: null },
  ];
  for (const action of everythingElse) {
    state = editorReducer(state, action);
    assert.deepEqual(state.conflict, { message: 'moved' }, `${action.type} cleared the conflict`);
  }
});

test('the auto path and the manual button are the SAME function, called once', () => {
  // Not two implementations that agree today. The harness counts confirmLeave
  // itself, and the auto-complete raises it exactly once across the whole
  // sequence — the same single function a click would have invoked.
  const s = editorSession('dirty');
  s.commit('dirty', true);
  s.commit(null, false);
  assert.equal(s.calls.confirmLeave, 1, 'the auto path did not go through confirmLeave, or went through it twice');
  assert.equal(s.calls.departed, 1, 'confirmLeave was called without departing');
});

test('it fires at most once per attempt, with no one-shot ref', () => {
  // confirmLeave nulls departRef and clears the attempt, so the next commit
  // sees pending null and the predicate is false. Many further commits with
  // nothing blocking must add nothing.
  const s = editorSession('dirty');
  s.commit('dirty', true);
  s.commit(null, false);
  for (let i = 0; i < 20; i += 1) s.commit(null, false);
  assert.equal(s.calls.departed, 1, 'the departure fired more than once');
  assert.equal(s.calls.confirmLeave, 1, 'confirmLeave was re-entered');
});

test('CONTROL: an attempt that never opened departs nothing', () => {
  // Without this, "fires once" would pass for a harness whose departure never
  // fires at all.
  const s = editorSession(null);
  for (let i = 0; i < 5; i += 1) s.commit(null, false);
  assert.equal(s.calls.confirmLeave, 0);
  assert.equal(s.calls.departed, 0);
});
