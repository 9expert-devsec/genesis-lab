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
  assert.match(code, /canExecuteRename\(\{ preview, typedCode, ackUpstream \}\)/,
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
  assert.equal(countCallSites(code, 'renameCourseCode'), 1);
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
  assert.equal(countCallSites(code, 'inspectRenameState'), 3,
    'the state inspector must run on the success path, the throw path, and before any attempt');

  // The success-path call is NOT inside the catch block. `run` is written above
  // the pre-run effect for exactly this reason — the FIRST occurrence is the
  // one that has to straddle the try.
  const tryAt = code.indexOf('try {');
  const catchAt = code.indexOf('} catch (err) {');
  const firstInspect = code.indexOf('inspectRenameState');
  assert.ok(tryAt !== -1 && catchAt !== -1, 'the run handler changed shape');
  assert.ok(
    firstInspect > tryAt && firstInspect < catchAt,
    'the state inspector only runs in the error branch'
  );
});

/**
 * THE STATE IS ASKED FOR BEFORE THE BUTTON IS OFFERED, AND ON A REFUSED
 * PREVIEW TOO.
 *
 * The inspector's own docstring has said since 79b04ca that it exists "so the
 * screen can ask BEFORE offering the button". Nothing wired it: the state was
 * fetched only inside `run`, and the panel returned null on a refused preview —
 * so the upstream-only state, which IS refused, could not appear anywhere.
 *
 * Shape guard, and stated as one: it proves the effect is written and that the
 * refused branch renders the report, not that either runs.
 */
test('the state is fetched from an EFFECT, and refused previews still report it', () => {
  const code = panel();
  assert.match(code, /useEffect\(\(\) => \{[\s\S]*?inspectRenameState\(/,
    'the state is never fetched outside a click handler');
  // The identical-codes case is deliberately NOT asked — the detector reads the
  // upstream axis as two codes and calls one row counted twice a conflict.
  assert.match(code, /if \(!from \|\| !to \|\| from === to\)/,
    'the effect asks the two-sided detector about a single code');
  // The refused branch returns the report rather than null.
  const refusedAt = code.indexOf('preview.ok === false');
  assert.ok(refusedAt !== -1, 'the refused branch is gone');
  const after = code.slice(refusedAt, refusedAt + 400);
  assert.match(after, /<RenameStateReport/, 'a refused preview reports nothing about the two sides');
  assert.ok(!/return null;\s*\}\s*$/.test(after.split('\n').slice(0, 3).join('\n')),
    'the refused branch still returns null');
});

test('the partial state names the stores and offers the re-run as SAFE', () => {
  const code = panel();
  assert.match(code, /state\.stillOnOldCode\.map/, 'the unfinished stores are not named');
  assert.match(code, /onClick=\{onRerun\}/, 'there is no re-run control on a partial rename');
  assert.match(code, /ทำซ้ำแล้วได้ผลเดิม/, 'the re-run is offered without saying it is safe');
});

/**
 * ══ THIS ASSERTION WAS DELIBERATELY REPLACED ═══════════════════════════════
 *
 * It used to pin `{done && <MsdbObligation … loud />}` — that after a
 * successful phase 1 the loudest thing on screen was "go and change MSDB
 * yourself". There is no second step any more: the action writes upstream and
 * confirms it by read-back, so an obligation card would be instructing the
 * admin to redo work that is already done.
 *
 * WHAT IS GUARANTEED NOW: the outcome report leads, the success branch says
 * plainly that nothing is owed, and the write's REACH is disclosed BEFORE the
 * button rather than an obligation being disclosed after it.
 */
test('the outcome leads, and a success says nothing is owed', () => {
  const code = panel();
  assert.match(code, /<RenameOutcomeReport result=\{result\} \/>/,
    'the outcome is not rendered at the top of the panel');
  assert.match(code, /const done = result\?\.ok === true/);
  assert.match(code, /ไม่ต้องไปแก้ MSDB เองแล้ว/, 'a success does not say the MSDB step is gone');
  assert.ok(!/MsdbObligation/.test(code), 'the retired MSDB obligation card is still here');
});

test('the REACH is disclosed before the button, not an obligation after it', () => {
  const code = panel();
  assert.match(code, /data-testid="upstream-reach"/, 'nothing discloses that this writes upstream');
  assert.match(code, /\{!done && <UpstreamReach from=\{from\} to=\{to\} \/>\}/,
    'the reach card is not shown while there is still something to confirm');
  // and it carries both codes so they can be read off
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

/**
 * THE PICKER CAN OFFER A CODE UPSTREAM NO LONGER HAS.
 *
 * Every option on this screen came from `listPublicCourses`, i.e. from
 * upstream — the side that MOVES when the tech lead renames `course_id` by
 * hand. So the code genesis was left holding was offered nowhere, the admin's
 * only reachable attempt was `from === to`, and the screen answered "nothing to
 * change". Making the state reachable at all starts here.
 */
test('the picker is fed from BOTH sides, not upstream alone', () => {
  const code = readSource(PAGE).code;
  assert.match(code, /CourseExtension\.distinct\('courseId'\)/,
    'the page never asks genesis which codes it holds');
  assert.match(code, /detachedGenesisCodes\(/, 'the two lists are never diffed');
  // The genesis-only codes are OPTIONS, not merely computed and dropped.
  assert.match(
    code,
    /const courses = \[\s*\.\.\.detached\.map\(/,
    'the detached codes are computed but never reach the picker'
  );
  // and the page still offers the upstream catalogue as well
  assert.match(code, /listPublicCourses\(\{ includeHidden: true \}\)/);
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
