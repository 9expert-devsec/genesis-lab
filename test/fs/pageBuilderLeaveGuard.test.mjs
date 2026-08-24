import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';

/**
 * THE WIRING, AND AN HONEST STATEMENT OF WHAT IS NOT PROVEN HERE.
 *
 * test/pure/leaveGuard.test.mjs proves the DECISION — when leaving should be
 * blocked. It says nothing about whether anything asks. The bug this round
 * closes was entirely in the asking: the condition was right and only one of
 * three exits consulted it, so the BACK button left the editor silently.
 *
 * ── WHY THIS IS A SOURCE SCAN AND NOT A REAL TEST ──────────────────────────
 * The mechanism is history entries, popstate ordering, and capture-phase clicks
 * on `document`. None of that can be exercised here:
 *
 *   · the runner is `isolation: 'none'` — one shared process — so mounting a
 *     React root leaks globalThis.window/document into every
 *     renderToStaticMarkup test in the run;
 *   · jsdom does not implement session history. Faking `pushState`/`go` and
 *     then asserting the fake moved would be a test OF THE FAKE, and it would
 *     stay green through every real-browser failure this round is about.
 *
 * So: the shape is pinned here, and BACK / FORWARD / SIDEBAR BEHAVIOUR RESTS ON
 * A HUMAN CLICK-TEST. That sentence is the point of this docstring — a green
 * suite must not be read as proof that Back is handled.
 *
 * Every probe below is paired with a DISCRIMINATION control that runs the same
 * probe over a literal of the shape it is meant to reject, so a probe that
 * cannot tell the two apart is caught rather than trusted (defect 7, face
 * three — see sourceScan.mjs).
 */

const HOOK = 'src/components/pageBuilder/editor/useLeaveGuard.js';
const SHELL = 'src/components/pageBuilder/editor/EditorShell.jsx';
const DIALOG = 'src/components/pageBuilder/editor/LeaveConfirmDialog.jsx';
const PURE = 'src/lib/pageBuilder/leaveGuard.js';
const SAVE = 'src/components/pageBuilder/editor/useEditorSave.js';

/**
 * Per-file floors, not one number — and the outlier is the interesting part.
 *
 * `leaveGuard.js` is 3.4 kB on disk and scans to ~320 characters of CODE: it is
 * two short functions under a page of reasoning about why they are one module.
 * A shared floor tuned for the others called that "scanned to almost nothing"
 * and reddened on a perfectly healthy file — the inverse failure, a guard that
 * fails while the code is fine, which erodes trust in a run just as fast.
 *
 * It also happens to be the cleanest evidence in this file that the scrubber is
 * doing its job: a 10:1 raw-to-code ratio is comments being removed.
 */
const MIN_CODE = {
  [HOOK]: 2000, [SHELL]: 2000, [DIALOG]: 1500, [SAVE]: 2000, [PURE]: 250,
};

test('CONTROL: every file under scan exists and was really read', () => {
  // Each "does not contain" assertion below passes vacuously against an empty
  // string, so the reads are proven before anything is concluded from them.
  for (const [rel, min] of Object.entries(MIN_CODE)) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    const { raw, code } = readSource(rel);
    assert.ok(code.length > min,
      `${rel} scanned to ${code.length} chars of code (floor ${min}) — almost nothing`);
    assert.ok(raw.length > code.length, `${rel}: the raw and code views are identical`);
  }
});

// ── 1. all three exits are registered, in ONE place ─────────────────────────

test('the hook registers all three exits — beforeunload, popstate, and a capture-phase click', () => {
  const code = readSource(HOOK).code;
  assert.match(code, /addEventListener\('beforeunload'/,
    'beforeunload is gone — tab close and reload stopped asking');
  assert.match(code, /addEventListener\('popstate'/,
    'the popstate listener is gone. THIS IS THE CONFIRMED BUG: without it the '
    + 'browser Back button leaves the editor with no warning and no autosave '
    + 'flush, and on /builder/new autosave never runs at all, so the whole draft '
    + 'goes');
  assert.match(code, /document\.addEventListener\('click',[^;]*,\s*true\)/,
    'the in-app link handler is gone or is no longer CAPTURE phase. Bubble phase '
    + 'is too late — Next has already begun the soft navigation, and the admin '
    + 'sidebar is the everyday way out of this editor');
});

test('CONTROL: those probes reject the pre-change shell, which had only beforeunload', () => {
  // The literal as EditorShell stood before this round. It must satisfy the
  // beforeunload probe and fail the other two, or the two that matter are
  // green about nothing.
  const OLD = `
    if (!dirty && !conflict) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  `;
  assert.match(OLD, /addEventListener\('beforeunload'/);
  assert.doesNotMatch(OLD, /addEventListener\('popstate'/);
  assert.doesNotMatch(OLD, /document\.addEventListener\('click',[^;]*,\s*true\)/);
});

// ── 2. all three consult the SHARED predicate ───────────────────────────────

test('the hook imports the shared decision and does not restate it', () => {
  // ABOUT AN IMPORT, so it reads `withImports` — the CODE view strips import
  // statements and this assertion would pass vacuously against it. The control
  // below asserts that precondition rather than assuming it.
  const withImports = readSource(HOOK).withImports;
  assert.match(withImports, /from\s+'@\/lib\/pageBuilder\/leaveGuard'/,
    'useLeaveGuard no longer imports the shared predicate — the rule has been '
    + 'inlined back into the mechanism, which is the drift this round removed');

  const code = readSource(HOOK).code;
  assert.match(code, /shouldBlockLeave\(/, 'the hook never calls the shared predicate');
  // The pre-change condition, restated inside the hook, is the regression.
  assert.doesNotMatch(code, /!dirty\s*&&\s*!conflict/,
    'the old inline condition is back inside the hook. Two copies of one rule is '
    + 'exactly how the third exit got forgotten the first time');
});

test('CONTROL: the import probe reads a view that HAS imports, and the code view does not', () => {
  // The precondition the standing rule requires: prove the two views differ on
  // this very file, so the assertion above is known to be reading import lines.
  const { code, withImports } = readSource(HOOK);
  assert.match(withImports, /^import /m, 'withImports lost its import statements');
  assert.doesNotMatch(code, /^import /m,
    'PRECONDITION BROKEN: the code view still contains import statements, so an '
    + '"imports X" guard read from it would pass vacuously');
});

test('EditorShell delegates to the hook and no longer keeps a guard of its own', () => {
  const { code, withImports } = readSource(SHELL);
  assert.match(withImports, /from\s+'\.\/useLeaveGuard'/, 'EditorShell no longer imports the hook');
  assert.match(withImports, /from\s+'\.\/LeaveConfirmDialog'/, 'EditorShell no longer imports the dialog');
  assert.match(code, /useLeaveGuard\(\{[^}]*dirty[^}]*\}\)/,
    'EditorShell does not call useLeaveGuard with the editor state');
  assert.match(code, /<LeaveConfirmDialog/, 'the confirm dialog is not rendered');
  assert.doesNotMatch(code, /addEventListener\('beforeunload'/,
    'EditorShell registers beforeunload again alongside the hook. TWO listeners '
    + 'on one rule: the browser would ask twice, and the next state to be added '
    + 'would land in only one of them');
});

// ── 3. the sentinel repair — the interaction most likely to go wrong ────────

test('the hook repairs its own sentinel after useEditorSave rewrites the entry', () => {
  /**
   * useEditorSave adopts a created page with `replaceState(null, …)`, which
   * rewrites THE CURRENT ENTRY — the sentinel — and the `null` wipes the marker
   * off it. Without a repair the Back guard dies at the first save of a new
   * page: precisely the page where loss is total, because autosave never runs
   * for an unsaved page. Pinned as a pair, because either half alone is fine
   * and the two together are the defect.
   */
  const save = readSource(SAVE).code;
  assert.match(save, /history\.replaceState\(null, '', `\/admin\/pages\/builder\//,
    'the create→edit adoption changed shape — re-read it against the repair below');

  const hook = readSource(HOOK).code;
  assert.match(hook, /replaceState\(SENTINEL/,
    'the sentinel is never re-stamped. After the first save of a new page the '
    + 'marker is gone and Back stops being guarded');
  assert.match(hook, /\}, \[blocked, pathname\]\)/,
    'the sentinel effect no longer re-runs on pathname change, which is the only '
    + 'signal the create→edit replaceState produces');
  assert.match(hook, /history\.length > 1/,
    'the sentinel is installed unconditionally. With a single history entry Back '
    + 'is disabled, and pushing a sentinel ENABLES it — inventing a Back press '
    + 'whose confirm has nowhere to go');
});

// ── 4. the click handler carries its exclusions ─────────────────────────────

test('the capture-phase click handler excludes everything that is not a departure', () => {
  const code = readSource(HOOK).code;
  const required = [
    ['data-pb-canvas', 'the editor canvas — a document-level CAPTURE handler runs BEFORE '
      + "CanvasPanel's own capture handler, so without this every section-selection click "
      + 'in the canvas is swallowed. That is the author\'s main interaction'],
    ['download', 'a download does not navigate this tab away'],
    ['_self', 'target="_blank" opens elsewhere — the Preview dialog\'s link is exactly this'],
    ['origin', 'external hosts (and mailto:/tel:, whose origin is "null")'],
    ['metaKey', 'cmd-click opens a new tab'],
    ['ctrlKey', 'ctrl-click opens a new tab'],
    ['shiftKey', 'shift-click opens a new window'],
    ['altKey', 'alt-click downloads'],
    ['e.button', 'middle click / non-primary buttons'],
  ];
  for (const [needle, why] of required) {
    assert.ok(code.includes(needle),
      `the link handler no longer excludes ${needle} — ${why}`);
  }
});

test('CONTROL: that sweep rejects a naive handler that intercepts every anchor', () => {
  // The shape someone writes first. It must fail the sweep, or the sweep is
  // asserting the presence of words that any handler would happen to contain.
  const NAIVE = `
    const onClickCapture = (e) => {
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      e.preventDefault();
      setPending('link');
    };
    document.addEventListener('click', onClickCapture, true);
  `;
  assert.match(NAIVE, /document\.addEventListener\('click',[^;]*,\s*true\)/,
    'the naive literal must still satisfy the registration probe — otherwise this '
    + 'control is rejecting it for the wrong reason');
  for (const needle of ['data-pb-canvas', 'download', '_self', 'metaKey', 'e.button']) {
    assert.ok(!NAIVE.includes(needle), `the naive literal already contains ${needle}`);
  }
});

// ── 5. the dialog is the repo's confirm, not the browser's ──────────────────

test('the confirm is a Radix dialog, focused off the destructive button', () => {
  const { code, withImports } = readSource(DIALOG);
  assert.match(withImports, /@radix-ui\/react-dialog/, 'the dialog is no longer Radix');
  assert.match(code, /onOpenAutoFocus=\{\(e\) => \{ e\.preventDefault\(\);/,
    'default focus placement is back. This dialog often opens because the author '
    + 'pressed Back — a key they may still be repeating — and a focused "leave" '
    + 'button one Enter away from discarding the work makes the guard the hazard');
  assert.match(code, /cancelRef\.current\?\.focus\(\)/, 'focus is not moved to the cancel button');
});

test('nothing in the leave path uses window.confirm', () => {
  for (const rel of [HOOK, SHELL, DIALOG]) {
    assert.doesNotMatch(readSource(rel).code, /window\.confirm|[^.\w]confirm\(/,
      `${rel} calls window.confirm — it blocks the main thread, cannot carry the `
      + 'sentence that matters (the work exists only in this tab), and is a system '
      + 'alert in an editor that has never asked anything that way');
  }
});

test('the copy tells the author the work exists only in this tab, in all three reasons', () => {
  // The one sentence the dialog exists to deliver. A confirm that says only
  // "are you sure?" leaves the author guessing whether autosave has them
  // covered — and on /builder/new it never does.
  const code = readSource(DIALOG).code;
  for (const reason of ['conflict', 'saving', 'dirty']) {
    assert.ok(code.includes(`${reason}:`), `REASON_COPY has no ${reason} line`);
  }
  const tabPhrase = /แค่ในแท็บนี้/g;
  const hits = code.match(tabPhrase) ?? [];
  assert.equal(hits.length, 3,
    `the "only in this tab" sentence appears ${hits.length} times, expected 3 — one `
    + 'per reason. A reason without it is a confirm that does not say what is at stake');
});
