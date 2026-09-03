import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ROOT } from '../sourceScan.mjs';

/**
 * THE HISTORY TAB ACTUALLY LEAVES ITS LOADING STATE.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Reported from the browser: the tab spun forever while the server action
 * returned 200 with correct, complete data and no exception was thrown
 * anywhere. The cause was in the effect, not the server:
 *
 *   `state.status` sat in the dependency array of the effect that WROTE
 *   `state.status`. Setting 'loading' changed a dep, so React ran the effect's
 *   CLEANUP — which flipped `cancelled = true` on the closure owning the only
 *   in-flight request — and then re-ran the effect, which refused to start a
 *   replacement because the guard now saw 'loading' instead of 'idle'. The
 *   response arrived and was discarded by the component's own cancel guard.
 *
 * The `cancelled` flag meant "my effect instance was torn down", which is NOT
 * the same question as "has someone else started a newer fetch". That
 * conflation is the whole bug.
 *
 * ── WHY THE 57 TESTS OF THE PRECEDING ROUND DID NOT CATCH IT ─────────────
 * Every one of them asserted a pure function's output, or a STATIC render's
 * markup, or the source text. `renderToStaticMarkup` runs no effects, so the
 * panel's own tests deliberately drove the presentational `VersionDetail` and
 * never the component that fetches. Worse, a source-shape assertion in
 * test/fs/courseVersionReadSide pinned the exact expression that deadlocked, as
 * though it were the design — it has been DELETED rather than rewritten,
 * because a regex over source cannot tell a correct guard from a broken one.
 *
 * This file is the coverage that seam never had: a REAL React root, REAL
 * effects, and the REAL component.
 *
 * ── WHY THE DRIVE IS IN A CHILD PROCESS ──────────────────────────────────
 * Same measured reason as test/render/canvasFrameLateAttach: installing
 * `globalThis.document` in the suite's process leaks into every other file
 * (that experiment took the suite from 5 failures to 34), and `act` is async by
 * construction so the window cannot be kept closed.
 *
 * ── VERIFIED TO FAIL AGAINST THE OLD CODE ────────────────────────────────
 * Not assumed. The drive was run against the component BEFORE the fix, with
 * only the test seam added, and every scenario reported `spinner: true`,
 * `versionsShown: []`, no error state, no retry, no empty state and no
 * clickable rows. Those numbers are in the commit message.
 */

const CHILD = path.join(ROOT, 'test', 'courseVersionHistoryLoad.case.mjs');

/**
 * NODE_ENV IS NAMED RATHER THAN INHERITED. Under `npm test` the environment
 * carries NODE_ENV=production, where React's production build makes `act`
 * throw outright. Same pin, same reason, as canvasFrameLateAttach — see its
 * note for the measurement.
 */
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  env: { ...process.env, NODE_ENV: 'development' },
});
const R = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

test('the drive ran at all', () => {
  // First, because every assertion below reads its output. A child that died
  // would otherwise surface as an unreadable TypeError on a property access.
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr}`);
  assert.notEqual(R, null, 'the drive printed nothing parseable');
});

// ── V2 — the reported defect ────────────────────────────────────────────────

test('V2: opening the tab renders the list — the spinner CLEARS', () => {
  // The whole bug, in one assertion. Against the old code this read `true`.
  assert.equal(R.openTab.spinner, false, 'the spinner is still showing after the response arrived');
});

test('V2: every version from the response reaches the screen', () => {
  assert.deepEqual(R.openTab.versionsShown, ['เวอร์ชัน 3', 'เวอร์ชัน 2', 'เวอร์ชัน 1'],
    'newest first, all three rows');
  assert.equal(R.openTab.summaryShown, true, 'the changed-field summary is missing');
  assert.equal(R.openTab.actorShown, true, 'the actor name is missing');
});

test('V2: the fetch fired exactly once, and only after the tab was opened', () => {
  assert.equal(R.openTab.beforeOpenSpinner, true, 'the closed tab should sit in its loading placeholder');
  assert.equal(R.openTab.fetchCalls, 1,
    'the tab either did not fetch, or fetched more than once');
});

test('leaving the tab and coming back does NOT re-fetch', () => {
  // The property the old `state.status` guard was reaching for, and which any
  // replacement has to keep. It is what stops a tab-flip from re-querying.
  assert.equal(R.tabAwayAndBack.fetchCalls, 1, 'the panel re-fetched on re-entry');
  assert.equal(R.tabAwayAndBack.spinner, false, 'the list did not survive the round trip');
  assert.equal(R.tabAwayAndBack.versionsShown.length, 3);
});

// ── V3 — the error state, and a retry that can actually reach 'ready' ──────

test('V3: a REJECTED fetch shows the error state, not a spinner', () => {
  assert.equal(R.rejectThenRetry.rejectedSpinner, false, 'a failed load still shows the spinner');
  assert.equal(R.rejectThenRetry.rejectedError, true, 'a failed load shows no error message');
});

test('V3: the error state offers a retry', () => {
  assert.equal(R.rejectThenRetry.hasRetry, true, 'there is no way to try again');
});

test('V3: retry actually reaches the list — the old guard made this impossible', () => {
  /**
   * Worth stating precisely. Under the old code a failure left `status:
   * 'error'`, and the effect's guard only fetched from `'idle'` — so there was
   * nowhere for a retry to go even if a button had existed. The fix has to make
   * retry REACHABLE, not merely visible.
   */
  assert.equal(R.rejectThenRetry.fetchCalls, 2, 'the retry did not fetch again');
  assert.equal(R.rejectThenRetry.retriedSpinner, false, 'the retry left the spinner running');
  assert.deepEqual(R.rejectThenRetry.retriedVersions, ['เวอร์ชัน 3', 'เวอร์ชัน 2', 'เวอร์ชัน 1']);
});

test('V3: an ok:false response is an error too, with its own wording', () => {
  // A refused read must not look like an empty history — see the read action's
  // note on why it reports a refusal rather than swallowing it.
  assert.equal(R.notOk.spinner, false);
  assert.equal(R.notOk.error, true);
  assert.equal(R.notOk.forbidden, true, 'a permission refusal reads as a generic failure');
});

// ── the empty state was unreachable too ─────────────────────────────────────

test('a course with no history reaches the EMPTY state, not the spinner', () => {
  /**
   * Found while driving this: the deadlock swallowed the empty state as well.
   * Since almost every course has no history yet, the explanatory panel written
   * last round had never once been displayed to anybody.
   */
  assert.equal(R.empty.spinner, false, 'an empty history still spins');
  assert.equal(R.empty.empty, true, 'the explanatory empty state never renders');
});

// ── V4 — the select race ────────────────────────────────────────────────────

test('V4: clicking A then B, with A resolving LAST, leaves B on screen', () => {
  /**
   * The adjacent defect found while diagnosing the spinner: `select` had no
   * supersession guard at all, so a slower EARLIER request overwrote the newer
   * one and the admin read version A's diff under version B's row.
   *
   * The drive resolves them deliberately out of order.
   */
  assert.equal(R.detailRace.rowsClickable, true,
    'the rows never rendered, so the race could not be exercised at all');
  assert.equal(R.detailRace.showsSecondClickDiff, true,
    "the last-clicked version's diff is not the one showing");
  assert.equal(R.detailRace.showsFirstClickDiff, false,
    'the earlier, slower response overwrote the newer one');
});
