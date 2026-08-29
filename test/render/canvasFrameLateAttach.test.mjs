import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ROOT, readSource } from '../sourceScan.mjs';

/**
 * THE CANVAS FRAME MUST ATTACH TO AN IFRAME THAT MOUNTS *LATER* THAN THE HOOK.
 *
 * ── THE DEFECT, AND WHY IT LOOKED LIKE A DATA-FLOW BUG ────────────────────
 * CanvasPanel does not always render the frame: a page with NO sections returns
 * the “หน้านี้ยังว่างอยู่” message instead, and no iframe with it. The hook used
 * `useRef` plus `useEffect(…, [])`, so on such a page the effect ran ONCE with
 * `frameRef.current === null` and — having no dependencies — never ran again.
 *
 * The author then added their first section. The iframe mounted; nothing was
 * listening for it; `frameDoc` stayed null; `createPortal` was never reached.
 * The canvas stayed BLANK for the rest of the session — through the add,
 * through every keystroke, through autosave — and came back only on a reload,
 * where the page now has a section on its first render. That is the whole of
 * the reported “nothing shows until I save and reopen”, and it is why the
 * reducer and the prop chain both measured clean (see
 * test/pure/canvasReflectsWorkingTree).
 *
 * ── WHY THE DRIVE IS IN A CHILD PROCESS ───────────────────────────────────
 * The bug IS an effect that did not re-run, so it needs a real DOM and real
 * effects: `renderToStaticMarkup` runs none, and a source assertion about
 * `useState` versus `useRef` alone would be a shape check — the kind
 * sourceScan's header calls defect 7, green the moment the expression is
 * reformulated.
 *
 * But installing `globalThis.document` in THIS process is not available here.
 * Measured: with the drive inline, the suite went from 5 failures to 34 —
 * `concurrency: true` applies to the tests inside a file as well as to the
 * files, so the window stayed open across other files' module evaluation, and
 * scheduleFilterSheet and heroBannerLinks both render differently inside it.
 * test/render/imageNodeViewButton does install those globals in-process and is
 * not a precedent for this: its window is synchronous and never yields, and
 * `act` is async by construction.
 *
 * So the drive lives in test/canvasFrameAttach.case.mjs and runs in a process
 * with nothing else in it — the same idiom, for the same reason, as
 * test/reportSuiteChild.mjs.
 *
 * ── THE CONTROL IS THE OLD WIRING ─────────────────────────────────────────
 * The child drives BOTH hooks through the same sequences: the current one, and
 * `useLegacyCanvasFrame`, which is the hook as it was. The claim is that they
 * DISAGREE about a late frame — the current one attaches, the old one does not.
 * Without it, “the frame attaches” would also be true of a harness that never
 * had a late-mounting frame in the first place.
 */

const CHILD = path.join(ROOT, 'test', 'canvasFrameAttach.case.mjs');
/**
 * NODE_ENV IS NAMED RATHER THAN INHERITED, and that is not tidying.
 *
 * Other files in this suite set `process.env.NODE_ENV = 'production'` to drive
 * the production branches of components that have them — SectionRenderer's
 * unknown-type block is one — and `spawnSync` inherits the environment as it
 * stands at the moment it is called. Under `npm test` that is a race: the child
 * then resolves React's PRODUCTION build, where `act` throws outright.
 *
 * Measured: the child ran clean standalone and exited 1 with
 * “act(...) is not supported in production builds of React” inside the full
 * suite. Naming the value makes this file's result independent of whichever
 * other file happened to be mid-test.
 */
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  env: { ...process.env, NODE_ENV: 'development' },
});
const RESULTS = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

test('the drive ran at all', () => {
  // First, because every assertion below reads its output. A child that died
  // would otherwise surface as an unreadable TypeError on a property access.
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr}`);
  assert.notEqual(RESULTS, null, 'the drive printed nothing parseable');
});

test('a frame present from the FIRST render attaches', () => {
  // The case that always worked — an author opening a page that already has
  // sections. Stated first so the failure below is isolated to lateness.
  assert.equal(RESULTS.firstRender.iframeMounted, true);
  assert.equal(RESULTS.firstRender.canvasInFrame, true);
  assert.equal(RESULTS.firstRender.textInFrame, 'เนื้อหา');
});

test('a frame that mounts LATER also attaches — the reported defect', () => {
  // Empty page, then the author adds their first section. No save, no reload.
  assert.equal(RESULTS.lateMount.iframeMounted, true);
  assert.equal(RESULTS.lateMount.canvasInFrame, true, 'the canvas never reached the frame that mounted late');
  assert.equal(RESULTS.lateMount.textInFrame, 'เนื้อหา');
});

test('a frame that goes away and comes BACK attaches again', () => {
  // The symmetric case — delete every section, then add one. The old wiring
  // lost the frame here too, and for the same reason.
  assert.equal(RESULTS.goneAndBack.canvasInFrame, true);
});

test('CONTROL: the OLD wiring attaches a first-render frame', () => {
  // Half the control. Without it, the red below could mean the legacy hook is
  // simply broken rather than blind to LATENESS specifically.
  assert.equal(RESULTS.legacyFirstRender.iframeMounted, true);
  assert.equal(RESULTS.legacyFirstRender.canvasInFrame, true);
});

test('CONTROL: the OLD wiring NEVER attaches a late frame — the two disagree', () => {
  // The other half, and the whole reason this file exists. Same host, same
  // steps, one hook apart. If this ever went green the tests above would be
  // proving nothing about lateness.
  assert.equal(RESULTS.legacyLateMount.iframeMounted, true, 'the control never even rendered the frame');
  assert.equal(RESULTS.legacyLateMount.canvasInFrame, false, 'the old wiring attached — the control has stopped discriminating');
  assert.equal(RESULTS.legacyLateMount.textInFrame, '');
});

test('the control really is the OLD wiring, not a paraphrase of it', () => {
  // The legacy hook is a copy, and a copy drifts. What makes it the control is
  // the pairing the defect actually was: a ref read inside an effect with an
  // EMPTY dependency list. Both halves are pinned, in the child's own source,
  // because a "legacy" hook that had quietly acquired a dependency would stop
  // reproducing anything and the disagreement above would vanish with it.
  const child = readSource('test/canvasFrameAttach.case.mjs').code;
  const legacy = child.slice(child.indexOf('function useLegacyCanvasFrame'));
  assert.equal(/frameRef\s*=\s*useRef\(/.test(legacy), true, 'the control no longer uses a ref');
  assert.equal(/\}\s*,\s*\[\]\s*\)\s*;/.test(legacy), true, 'the control no longer has an EMPTY dependency list');
});

test('CONTROL: the same reader says the REAL hook has neither', () => {
  // The matcher above must be able to answer both ways, or it is defect 4 in
  // sourceScan's header pointed at this file: a pattern that matches nothing
  // anywhere reads as a pass for every assertion written with it.
  const hook = readSource('src/components/pageBuilder/editor/useCanvasFrame.js').code;
  assert.equal(/frameRef\s*=\s*useRef\(/.test(hook), false, 'useCanvasFrame is back on a ref');
  assert.equal(/\}\s*,\s*\[\]\s*\)\s*;/.test(hook), false, 'useCanvasFrame is back on an empty dependency list');
  assert.equal(/\}\s*,\s*\[frameEl\]\s*\)\s*;/.test(hook), true, 'the effect no longer keys off the element');
});
