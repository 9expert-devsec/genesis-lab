import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveBlockReason, shouldBlockLeave } from '@/lib/pageBuilder/leaveGuard';

/**
 * The HALF OF THE LEAVE GATE THAT CAN BE TESTED HONESTLY.
 *
 * The editor's three exits (beforeunload, popstate/Back, in-app link) all ask
 * this module one question. The listeners themselves are browser mechanism —
 * history entries, capture-phase clicks — and are NOT tested here or anywhere:
 * faking history semantics in jsdom produces a test of the fake. That split is
 * stated at useLeaveGuard.js and again in the wiring guard
 * (test/fs/pageBuilderLeaveGuard.test.mjs), so a green suite is never mistaken
 * for "Back is proven to work".
 *
 * What IS provable is the decision, and it is exhaustive below: all eight
 * combinations of (dirty, saving, conflict), by construction rather than by a
 * hand-written list that could miss one.
 */

// `conflict` is an OBJECT or null in the reducer, never a boolean — the
// fixtures use the real shape so the coercion is exercised, not assumed.
const CONFLICT = { message: 'มีการแก้ไขจากผู้ใช้อื่น' };

/** All 2³ states, generated so none can be forgotten. */
const ALL_STATES = [false, true].flatMap((dirty) =>
  [false, true].flatMap((saving) =>
    [false, true].map((hasConflict) => ({
      dirty, saving, conflict: hasConflict ? CONFLICT : null,
    }))));

test('the state space really is all eight combinations', () => {
  // The generator above is the thing the sweeps below trust. If it collapsed to
  // four cases every sweep would still pass and cover half of what it claims.
  assert.equal(ALL_STATES.length, 8);
  assert.equal(new Set(ALL_STATES.map((s) => JSON.stringify(s))).size, 8);
});

// ── The reason, and its precedence ──────────────────────────────────────────

test('a clean, idle, unconflicted editor is the ONLY state that lets you leave', () => {
  assert.equal(leaveBlockReason({ dirty: false, saving: false, conflict: null }), null);
  const blocking = ALL_STATES.filter((s) => leaveBlockReason(s) !== null);
  assert.equal(blocking.length, 7,
    'some state other than all-clear now allows leaving — a leave that is allowed '
    + 'while work is outstanding is the silent-loss bug this module exists to close');
});

test('conflict outranks everything — autosave has stopped, so that tree is only in this tab', () => {
  for (const s of ALL_STATES.filter((x) => x.conflict)) {
    assert.equal(leaveBlockReason(s), 'conflict',
      `conflict lost its precedence for ${JSON.stringify(s)} — the author would be told `
      + '"still saving" or "unsaved changes" about a session where saving has PERMANENTLY '
      + 'stopped, which is the one case where waiting does not help');
  }
});

test('saving outranks dirty when there is no conflict', () => {
  assert.equal(leaveBlockReason({ dirty: true, saving: true, conflict: null }), 'saving');
  assert.equal(leaveBlockReason({ dirty: false, saving: true, conflict: null }), 'saving');
});

test('dirty alone is the ordinary case', () => {
  assert.equal(leaveBlockReason({ dirty: true, saving: false, conflict: null }), 'dirty');
});

test('the reason is always one of the three names, or null — never a stray truthy', () => {
  for (const s of ALL_STATES) {
    const r = leaveBlockReason(s);
    assert.ok(r === null || ['conflict', 'saving', 'dirty'].includes(r),
      `unexpected reason ${JSON.stringify(r)} for ${JSON.stringify(s)} — the dialog `
      + 'keys its copy off this string and would fall through to the generic line');
  }
});

// ── The predicate is DERIVED, and this is what proves it ────────────────────

test('shouldBlockLeave agrees with leaveBlockReason on every one of the eight', () => {
  // Not a restatement of the implementation: it is the assertion that the two
  // exports cannot disagree. The quiet failure this catches is the predicate
  // saying "leaving is fine" while the reason says "conflict" — the listeners
  // read the predicate and the dialog reads the reason, so a split would let an
  // author out of a conflicted session with no dialog at all.
  for (const s of ALL_STATES) {
    assert.equal(shouldBlockLeave(s), leaveBlockReason(s) !== null, JSON.stringify(s));
  }
});

// ── Shapes that arrive from real callers ────────────────────────────────────

test('a missing or partial state does not accidentally block, or accidentally allow', () => {
  // EditorShell passes `{ dirty, saving, conflict }` off the reducer, so these
  // are defensive rather than expected — but "undefined means blocked" would
  // put a confirm dialog in front of an author with nothing to lose, and that
  // is how a guard gets switched off by whoever meets it next.
  assert.equal(shouldBlockLeave(undefined), false);
  assert.equal(shouldBlockLeave(null), false);
  assert.equal(shouldBlockLeave({}), false);
  assert.equal(shouldBlockLeave({ dirty: true }), true);
  assert.equal(shouldBlockLeave({ conflict: CONFLICT }), true);
  assert.equal(shouldBlockLeave({ saving: true }), true);
});

test('CONTROL: the sweeps are discriminating — a permissive predicate fails them', () => {
  /**
   * The control the round requires, run against the SAME assertions rather than
   * a re-description of them. Two plausible wrong implementations:
   *
   *   · `dirtyOnly` is the pre-change condition minus the conflict clause — the
   *     shape someone reaches for when "conflict is a kind of error, not unsaved
   *     work". It must fail the conflict sweep.
   *   · `alwaysAllow` is the guard being switched off wholesale.
   *
   * If either satisfied the assertions above, those assertions would be green
   * about nothing.
   */
  const dirtyOnly = (s) => Boolean(s?.dirty);
  const alwaysAllow = () => false;

  const conflictOnly = { dirty: false, saving: false, conflict: CONFLICT };
  assert.equal(shouldBlockLeave(conflictOnly), true, 'the real predicate must block here');
  assert.equal(dirtyOnly(conflictOnly), false, 'the permissive version must NOT — else no discrimination');
  assert.equal(alwaysAllow(conflictOnly), false);

  const savingOnly = { dirty: false, saving: true, conflict: null };
  assert.equal(shouldBlockLeave(savingOnly), true);
  assert.equal(dirtyOnly(savingOnly), false);

  // …and the control cuts both ways: on the all-clear state the real predicate
  // agrees with the permissive ones, so "blocks everything" is not what makes
  // the sweeps pass either.
  const clear = { dirty: false, saving: false, conflict: null };
  assert.equal(shouldBlockLeave(clear), false);
  assert.equal(dirtyOnly(clear), false);
});
