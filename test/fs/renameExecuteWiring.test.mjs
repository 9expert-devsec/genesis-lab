import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * The wiring between the gate and the button — the half neither other tier can
 * see.
 *
 * `renderToStaticMarkup` gives one render with no events, so it can show that
 * the button starts disabled and cannot show what enables it.
 * `canExecuteRename` is pure and is driven for real, so it can show what the
 * rules decide and cannot show that anything consults them. This file is the
 * seam: that the panel asks the gate, sends the ON-SCREEN token, and runs the
 * state inspector unconditionally.
 *
 * A shape guard, and stated as one: it proves the calls are written, not that
 * they run.
 */

const PANEL = 'src/app/admin/courses/rename/_components/RenameExecutePanel.jsx';
const CLIENT = 'src/app/admin/courses/rename/_components/RenamePreviewClient.jsx';
const PAGE = 'src/app/admin/courses/rename/page.jsx';
const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';

const panel = () => readSource(PANEL).code;

// ── The confirmation actually gates the button ──────────────────────────────

test('the button is disabled from the GATE, not from a local boolean', () => {
  const code = panel();
  assert.equal(countCallSites(code, 'canExecuteRename'), 1, 'the gate is not consulted exactly once');
  assert.match(code, /disabled=\{!gate\.allowed \|\| busy\}/, 'the button does not read the gate');
});

test('both confirmations feed the gate', () => {
  const code = panel();
  assert.match(code, /canExecuteRename\(\{ preview, typedCode, ackMsdb \}\)/,
    'the gate is called without one of the two consents');
});

// ── It acts on the preview ON SCREEN ────────────────────────────────────────

test('THE TOKEN SENT IS THE ON-SCREEN PREVIEW\'S, not a fresh read', () => {
  /**
   * The admin consents to a blast radius they can SEE. Deriving the token from
   * a freshly fetched preview would mean the write agreed with whatever is true
   * now, which is exactly what the staleness refusal exists to prevent.
   */
  const code = panel();
  assert.match(code, /previewToken: gate\.token/, 'the write does not send the on-screen token');
  assert.ok(
    !/previewCourseCodeRename/.test(code),
    'the execute panel fetches its own preview — it must act on the one displayed'
  );
});

test('the write is called once, with the codes from the displayed preview', () => {
  const code = panel();
  assert.equal(countCallSites(code, 'renameCourseCodePhase1'), 1);
  assert.match(code, /oldCode: from,/);
  assert.match(code, /newCode: to,/);
  assert.match(code, /const from = preview\?\.oldCode/);
});

test('a STALE refusal is rendered, not thrown', () => {
  const code = panel();
  assert.match(code, /if \(res\?\.stale\) setStale\(res\)/, 'a stale response is not surfaced');
  assert.match(code, /data-testid="rename-stale"/, 'there is no stale panel to render into');
});

// ── The post-run state, unconditionally ─────────────────────────────────────

test('inspectRenameState RUNS ON SUCCESS AND ON FAILURE', () => {
  /**
   * A half-finished rename is exactly what follows a request that appeared to
   * fail, so putting the inspector only in the catch would surface it in the
   * one case the admin already distrusts — and hide it in the case where they
   * have been told everything worked.
   */
  const code = panel();
  assert.equal(countCallSites(code, 'inspectRenameState'), 2,
    'the state inspector must run on both the success path and the throw path');

  // The success-path call is NOT inside the catch block.
  const tryAt = code.indexOf('try {');
  const catchAt = code.indexOf('} catch (err) {');
  const firstInspect = code.indexOf('inspectRenameState');
  assert.ok(tryAt !== -1 && catchAt !== -1, 'the run handler changed shape');
  assert.ok(
    firstInspect > tryAt && firstInspect < catchAt,
    'the state inspector only runs in the error branch'
  );
});

test('the partial state names the stores and offers the re-run as SAFE', () => {
  const code = panel();
  assert.match(code, /state\.stillOnOldCode\.map/, 'the unfinished stores are not named');
  assert.match(code, /onClick=\{onRerun\}/, 'there is no re-run control on a partial rename');
  assert.match(code, /ทำซ้ำแล้วได้ผลเดิม/, 'the re-run is offered without saying it is safe');
});

test('after a COMPLETE phase 1 the MSDB obligation is the loud one', () => {
  const code = panel();
  assert.match(code, /\{done && <MsdbObligation from=\{from\} to=\{to\} loud \/>\}/,
    'the obligation is not escalated after a successful write');
  assert.match(code, /const done = result\?\.ok === true/);
  // and it carries both codes so they can be copied
  assert.match(code, /<CopyableCode value=\{from\} \/> เป็น <CopyableCode value=\{to\} \/>/);
});

// ── The deep link ───────────────────────────────────────────────────────────

test('the selected course is READ FROM THE URL every render, never copied into state', () => {
  /**
   * The register rule in test/fs/urlFilterNoState. A URL value seeded once into
   * `useState` goes stale on any navigation that keeps the instance, and this
   * screen is not going to be the next entry on that list.
   */
  const code = readSource(CLIENT).code;
  assert.match(code, /const oldCode = course;/, 'the course is not read straight from the prop');
  for (const arg of [...code.matchAll(/useState\(([^)]*)\)/g)].map((m) => m[1])) {
    assert.ok(!/course|oldCode/i.test(arg), `useState(${arg}) copies the URL-derived course`);
  }
});

test('the picker WRITES the url, through one writer', () => {
  const code = readSource(CLIENT).code;
  const writes = [...code.matchAll(/router\.(push|replace)\(/g)].length;
  assert.equal(writes, 1, `expected a single URL writer, found ${writes}`);
  assert.match(code, /params\.set\('course', value\)/, 'the picker does not put the course in the URL');
});

test('the page reads ?course= and passes it down', () => {
  const code = readSource(PAGE).code;
  assert.match(code, /sp\?\.course/, 'the page does not read the deep link');
  assert.match(code, /course=\{course\}/, 'the page does not pass the course to the client');
});

test('THE COURSE FORM CARRIES THE CODE, so the admin arrives with it selected', () => {
  const code = readSource(FORM).code;
  assert.match(
    code,
    /href=\{`\/admin\/courses\/rename\?course=\$\{encodeURIComponent\(courseId\)\}`\}/,
    'the edit form links to the rename screen without saying which course'
  );
});

test('the preview does NOT auto-run on arrival', () => {
  /**
   * The new code is empty on arrival so there is nothing to preview, and an
   * action that fires on navigation is the wrong habit for a screen whose next
   * button writes to twelve stores.
   */
  const code = readSource(CLIENT).code;
  assert.ok(!/useEffect/.test(code), 'the client gained an effect — nothing here should fire on mount');
  assert.match(code, /if \(!canRun\) return;/, 'the preview runs without both codes');
});

// ── Control ─────────────────────────────────────────────────────────────────

test('CONTROL: the panel source was read and the matchers are live', () => {
  const code = panel();
  assert.ok(code.length > 2000, `the panel scrubbed to ${code.length} chars`);
  assert.equal(countCallSites(code, 'canExecuteRename'), 1);
  // countCallSites finds nothing for a name that is not there, so the counts
  // above are measurements rather than constants.
  assert.equal(countCallSites(code, 'previewCourseCodeRename'), 0);
});
