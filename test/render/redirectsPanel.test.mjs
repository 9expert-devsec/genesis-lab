import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ROOT } from '../sourceScan.mjs';

/**
 * THE REDIRECT PANEL, DRIVEN FOR REAL — T1.
 *
 * A real `createRoot`, real effects, real clicks, the real component, in a child
 * process. `renderToStaticMarkup` runs no effects and presses no buttons; it can
 * only prove what the first paint contains. Last round a panel shipped with 57
 * green tests of that kind and spun forever on first click.
 *
 * Only the SERVER ACTIONS are injected, through the seam the component carries.
 * A drive built around a reimplementation of the handlers would be checking a
 * replica — the same mistake one level down.
 *
 * T3 is obeyed throughout: every value is read from the element that holds it,
 * never from flattened textContent. Thai has no word spaces and adjacent
 * numbers merge.
 *
 * See the case file's header for the ordering constraint that made this work at
 * all — react-dom must be imported AFTER the jsdom globals exist, or synthetic
 * events silently never fire and a form drive passes by typing nothing.
 */

const CHILD = path.join(ROOT, 'test', 'redirectsPanel.case.mjs');

/** NODE_ENV named, not inherited: under `npm test` it is production, where
 *  `act` throws. Same pin and same reason as canvasFrameLateAttach. */
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  env: { ...process.env, NODE_ENV: 'development' },
});
const R = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

test('the drive ran at all', () => {
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr}`);
  assert.notEqual(R, null, 'the drive printed nothing parseable');
});

// ── the rules table ─────────────────────────────────────────────────────────

test('every rule renders, with its own source, destination and status code', () => {
  assert.equal(R.rulesList.rowCount, 2);
  assert.equal(R.rulesList.firstSource, '/old-course-page');
  assert.equal(R.rulesList.firstDestination, '/excel-training-course');
  assert.equal(R.rulesList.firstCode, '308', 'a permanent rule must read as 308');
  assert.equal(R.rulesList.secondCode, '307', 'a temporary one as 307');
});

test('a disabled rule is marked as disabled rather than looking live', () => {
  assert.equal(R.rulesList.disabledBadges, 1);
});

test('an empty table explains itself instead of rendering nothing', () => {
  assert.equal(R.rulesEmpty.emptyShown, true);
  assert.equal(R.rulesEmpty.rowCount, 0);
  assert.equal(R.rulesList.emptyShown, false, 'CONTROL: it is not always shown');
});

// ── the open-redirect guard, at the surface an admin touches ────────────────

test('a PROTOCOL-RELATIVE destination is refused in the form, visibly', () => {
  /**
   * `//evil.test/phish` starts with a slash and is not internal. The pure guard
   * is proved in test/pure/redirectRules; this is the other half — that the
   * refusal actually reaches the screen the admin is looking at.
   */
  assert.equal(R.externalRefused.showedError, true, 'no refusal was shown at all');
  assert.equal(R.externalRefused.errorMentionsInternal, true,
    'the message does not say the destination must be internal');
});

test('and the save button will not fire with it — a refusal you can click past is not one', () => {
  assert.equal(R.externalRefused.saveDisabled, true);
  assert.equal(R.externalRefused.saveCalls, 0, 'the action was called with a known-bad destination');
  assert.equal(R.externalRefused.formStillOpen, true, 'the form closed as though it had saved');
});

// ── save: success, rejection, and refusal ───────────────────────────────────

test('a successful save sends what was typed, closes the form and confirms', () => {
  assert.equal(R.saveSucceeds.sentSource, '/old-thing');
  assert.equal(R.saveSucceeds.sentDestination, '/new-thing');
  assert.equal(R.saveSucceeds.formClosed, true);
  assert.equal(R.saveSucceeds.message, 'บันทึกกฎแล้ว');
  assert.equal(R.saveSucceeds.spinnerGone, true);
});

test('a REJECTED save clears the spinner and leaves the work recoverable', () => {
  /**
   * The failure mode from last round, asserted here before it can happen again:
   * an action that throws must not leave a spinner running forever. The `finally`
   * is what guarantees it, and this is what proves the `finally` is reached.
   */
  assert.equal(R.saveRejects.spinnerGone, true, 'the spinner is still running after a rejection');
  assert.equal(R.saveRejects.errorShown, true, 'the failure is invisible');
  assert.equal(R.saveRejects.formStillOpen, true, 'the admin lost what they typed');
  assert.equal(R.saveRejects.saveButtonEnabled, true, 'they cannot try again');
});

test('a server-side duplicate refusal lands on the form, not in a void', () => {
  assert.equal(R.serverRefusal.duplicateShown, true);
  assert.equal(R.serverRefusal.formStillOpen, true);
  assert.equal(R.serverRefusal.spinnerGone, true);
});

// ── the 404 worklist, and the affordance it exists for ──────────────────────

test('a 404 row shows its path and its count, each read from its own element', () => {
  assert.equal(R.logAndCreate.path, '/legacy/deep/path');
  assert.equal(R.logAndCreate.count, '137 ครั้ง');
});

test('creating a rule FROM a 404 row sends that row and the typed destination', () => {
  /**
   * The point of building the log. The host and source come from the recorded
   * row rather than being retyped, so a rule cannot be keyed on a path nobody
   * actually requested.
   */
  assert.equal(R.logAndCreate.sentHitId, 'h1');
  assert.equal(R.logAndCreate.sentDestination, '/excel-training-course');
  assert.equal(R.logAndCreate.message, 'สร้างกฎจากรายการ 404 แล้ว');
  assert.equal(R.logAndCreate.spinnerGone, true);
});

test('an empty 404 log explains the retention rather than looking broken', () => {
  assert.equal(R.logEmpty.shown, true);
  assert.equal(R.logEmpty.mentionsRetention, true,
    'the empty state does not mention that rows expire after 30 days');
});

// ── the URL-filter defect class, driven rather than scanned ─────────────────

test('a changed filter PROP re-renders the same instance — nothing is held in state', () => {
  /**
   * test/fs/urlFilterNoState asserts the SHAPE that makes this defect
   * unrepresentable, and says in its own header that it cannot stage the
   * navigation-timing case because the runner forbids a React root. This file
   * has one, in a child process, so the behavioural half is available here:
   * the same component instance is re-rendered with different props, exactly as
   * a navigation to the same route with changed searchParams does.
   *
   * A filter copied into `useState` would keep the old value. The panel switches.
   */
  assert.equal(R.filterProp.beforeQ, 'first', 'CONTROL: the first prop really was rendered');
  assert.equal(R.filterProp.switchedView, true, 'the view prop did not take effect on re-render');
  assert.equal(R.filterProp.rulesGone, true, 'the old view survived a prop change');
});
