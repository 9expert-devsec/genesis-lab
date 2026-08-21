import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ROOT, readSource } from '../sourceScan.mjs';

/**
 * THE RUNNER'S OUTPUT IS READABLE ON RED — the control for round 0.
 *
 * The defect: test/run.mjs piped the spec reporter at process.stdout and then
 * called process.exit() from the test stream's 'close' handler. 'close' fires
 * when the TEST stream finishes, not when the composed reporter has finished
 * writing, so the exit tore stdout down mid-flush. A red run printed
 *
 *     ✖ <test name> (0.733ms)
 *
 * and stopped. No assertion message, no diff, no stack, and none of the
 * reporter's own end-of-run recap either. Measured against 442 KB of captured
 * stdout: a probe whose failure detail carried a unique token appeared ZERO
 * times, while the ✖ line for it sat right there at the end.
 *
 * WHY A TEST THAT ONLY CHECKS THE EXIT CODE IS WORTHLESS HERE: the exit code
 * was ALREADY 1 on red in the broken state. That is exactly what let the bug
 * survive — every control in this repo was judged red-vs-green, so a control
 * that went red for the WRONG reason looked identical to one that worked. So
 * these tests assert THE DIFF LINES THEMSELVES reach stdout.
 *
 * WHY A CHILD PROCESS. The failure mode is bytes lost to process teardown.
 * Capturing reportSuite's output into an in-memory stream would show the
 * ordering but could never show the truncation, because nothing gets torn down.
 * So the control spawns test/reportSuiteChild.mjs, which calls the SAME
 * reportSuite() run.mjs calls, over a one-case manifest, in a process that
 * really exits.
 *
 * WHAT THIS CANNOT SEE, stated rather than papered over: the child drives
 * reportSuite directly, so no spawn here proves run.mjs *calls* it. The source
 * guards at the bottom carry that single link — run.mjs must delegate, and no
 * file in the runner may contain a process.exit( call.
 */

// Duplicated from test/reportSuiteRed.case.mjs on purpose — importing that file
// would EXECUTE it and register its deliberate failure into this very suite.
// The drift is caught: the last test here reads the fixture's source for both.
const TOKEN = 'RUNNER_FLUSH_DETAIL_9E';
const ACTUAL = 'flush-detail-actual';

const CHILD = path.join(ROOT, 'test', 'reportSuiteChild.mjs');

function drive(...args) {
  const r = spawnSync(process.execPath, [CHILD, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const RED = drive('reportSuiteRed.case.mjs', '1');
const GREEN = drive('reportSuiteGreen.case.mjs', '1');
const UNDER_FLOOR = drive('reportSuiteGreen.case.mjs', '999');
const UNDISCOVERED = drive('reportSuiteGreen.case.mjs', '1', path.join('ghost', 'never-run.test.mjs'));
const EMPTY = drive('reportSuiteEmpty.case.mjs', '0');

const lines = (s) => s.split(/\r?\n/);
const trimmedLines = (s) => lines(s).map((l) => l.trim());
const RED_NAME = 'deliberate failure; its detail carries the flush token';

// ── THE MESSAGE RENDERS ─────────────────────────────────────────────────────

test('a RED run prints the assertion DIFF, not just the ✖ line', () => {
  const seen = trimmedLines(RED.stdout);
  // The exact two lines node:assert produces for a strictEqual mismatch.
  // Asserting these, rather than "the token appears somewhere", is what makes
  // this a check on RENDERING: in the broken state the run ended at the ✖ line.
  assert.ok(seen.includes(`+ '${ACTUAL}'`), 'the actual side of the diff is missing');
  assert.ok(seen.includes(`- '${TOKEN}'`), 'the expected side of the diff is missing');
  assert.ok(
    RED.stdout.includes('AssertionError [ERR_ASSERTION]'),
    'the assertion error line itself is missing'
  );
});

test('CONTROL: no ✖ line carries the token, so its presence can only be flushed detail', () => {
  // The timing suffix is stripped so the set is stable run to run.
  const marks = lines(RED.stdout)
    .filter((l) => l.startsWith('✖ '))
    .map((l) => l.replace(/ \(\d[\d.]*ms\)$/, ''));
  assert.deepEqual(marks, [`✖ ${RED_NAME}`, '✖ failing tests:', `✖ ${RED_NAME}`]);
  for (const m of marks) {
    assert.ok(!m.includes(TOKEN), `a ✖ line carries the token, which would fake a pass: ${m}`);
  }
});

test('the reporter end-of-run recap survives too — it was lost along with the diff', () => {
  const seen = trimmedLines(RED.stdout);
  assert.ok(seen.includes('ℹ fail 1'), 'the recap line is missing');
  assert.ok(seen.includes('✖ failing tests:'), 'the failing-tests block header is missing');
});

test('the stack trace names the case file, so the detail belongs to the real failure', () => {
  assert.ok(
    RED.stdout.includes('reportSuiteRed.case.mjs'),
    'no frame naming the failing file reached stdout'
  );
});

// ── THE SUMMARY STILL LANDS LAST ────────────────────────────────────────────

test('[suite] comes AFTER the diff and after the recap, and appears exactly once', () => {
  const suiteLines = lines(RED.stdout).filter((l) => l.startsWith('[suite] '));
  assert.deepEqual(suiteLines, ['[suite] 0 passed, 1 failed, 1 total across 1 files (floor 1)']);
  const at = RED.stdout.indexOf('[suite] ');
  const diffAt = RED.stdout.indexOf(`- '${TOKEN}'`);
  const recapAt = RED.stdout.indexOf('ℹ fail 1');
  // PRESENCE FIRST. indexOf returns -1 when the thing is missing, and -1 is
  // less than everything — so an ordering assertion on its own passes VACUOUSLY
  // in exactly the truncated state this file exists to catch. Measured: with the
  // old process.exit() restored, the ordering asserts stayed green while the
  // diff was absent.
  assert.ok(diffAt > -1, 'the diff is absent, so there is no ordering to check');
  assert.ok(recapAt > -1, 'the recap is absent, so there is no ordering to check');
  assert.ok(diffAt < at, 'the diff landed after the summary');
  assert.ok(recapAt < at, 'the recap landed after the summary');
});

test('a GREEN run reports the same [suite] shape with nothing failing', () => {
  const suiteLines = lines(GREEN.stdout).filter((l) => l.startsWith('[suite] '));
  assert.deepEqual(suiteLines, ['[suite] 1 passed, 0 failed, 1 total across 1 files (floor 1)']);
  assert.ok(!GREEN.stdout.includes(TOKEN), 'a green run mentioned the failing fixture');
});

// ── THE EXIT CODE, AND THAT THE PROCESS ENDS ON ITS OWN ─────────────────────

test('red exits 1, green exits 0', () => {
  assert.equal(RED.status, 1);
  assert.equal(GREEN.status, 0);
});

test('every run ends by itself — no signal, no timeout', () => {
  // process.exitCode only works if the event loop drains. Had dropping
  // process.exit() left a handle open, spawnSync would have hit its timeout and
  // reported a signal instead of a status.
  for (const [name, r] of Object.entries({ RED, GREEN, UNDER_FLOOR, UNDISCOVERED, EMPTY })) {
    assert.equal(r.signal, null, `${name} was killed rather than exiting`);
    assert.equal(typeof r.status, 'number', `${name} produced no exit status`);
  }
});

// ── THE THREE META-CONTROLS, EACH STILL FIRING AND STILL LANDING LAST ───────

test('the FLOOR check still fires, with its message unchanged', () => {
  const meta = lines(UNDER_FLOOR.stdout).filter((l) => l.startsWith('[meta-control] '));
  assert.deepEqual(meta, [
    '[meta-control] FAIL: expected AT LEAST 999 tests, ran 1. '
    + 'Tests VANISHED — that is what this check is for.',
  ]);
  assert.equal(UNDER_FLOOR.status, 1, 'a floor breach must still be a non-zero exit');
  assert.ok(
    UNDER_FLOOR.stdout.indexOf('[suite] ') < UNDER_FLOOR.stdout.indexOf('[meta-control] '),
    'the meta-control line must stay below the [suite] line'
  );
});

test('the file-discovery meta-control still fires, with its message unchanged', () => {
  const at = UNDISCOVERED.stdout.indexOf('[meta-control] ');
  assert.equal(
    UNDISCOVERED.stdout.slice(at).trimEnd(),
    '[meta-control] FAIL: these *.test.mjs files exist on disk but the manifest never ran them:\n'
    + `    ${path.join('ghost', 'never-run.test.mjs')}`
  );
  assert.equal(UNDISCOVERED.status, 1, 'an undiscovered file must still be a non-zero exit');
});

test('the per-file zero-count meta-control still fires, with its message unchanged', () => {
  const at = EMPTY.stdout.indexOf('[meta-control] ');
  assert.equal(
    EMPTY.stdout.slice(at).trimEnd(),
    '[meta-control] FAIL: these files were enumerated but contributed ZERO tests:\n'
    + '    reportSuiteEmpty.case.mjs'
  );
  assert.equal(EMPTY.status, 1, 'a zero-count file must still be a non-zero exit');
  // MEASURED, and it is the per-file guard's whole justification: a file with no
  // tests still emits ONE file-level pass event, so the TOTAL reads 1 and no
  // count-based check can see the file is empty. Only the per-file map can —
  // that event carries no `file`, so perFile stays at 0 and the guard fires.
  const suiteLines = lines(EMPTY.stdout).filter((l) => l.startsWith('[suite] '));
  assert.deepEqual(suiteLines, ['[suite] 1 passed, 0 failed, 1 total across 1 files (floor 0)']);
});

test('CONTROL: a run with nothing wrong emits NO meta-control line at all', () => {
  assert.deepEqual(lines(GREEN.stdout).filter((l) => l.startsWith('[meta-control] ')), []);
  assert.deepEqual(lines(RED.stdout).filter((l) => l.startsWith('[meta-control] ')), []);
});

// ── THE SOURCE LINKS: run.mjs delegates, and nothing in the runner exits ────

test('no file in the runner calls process.exit() — read from scrubbed code', () => {
  // Scrubbed, because the comments in all three files discuss the call by name
  // and a raw match would fail on files that are completely correct.
  const runnerFiles = ['test/run.mjs', 'test/reportSuite.mjs', 'test/reportSuiteChild.mjs'];
  const offenders = runnerFiles.filter((rel) => readSource(rel).code.includes('process.exit('));
  assert.deepEqual(offenders, [], 'a process.exit( call is back; red runs will truncate again');
});

test('run.mjs decides its exit code by delegating to reportSuite', () => {
  const { code } = readSource('test/run.mjs');
  assert.ok(
    code.includes('process.exitCode = await reportSuite({'),
    'run.mjs no longer routes its exit code through reportSuite'
  );
  assert.ok(code.includes('floor: FLOOR'), 'the FLOOR is no longer handed to the reporter');
  assert.ok(code.includes('undiscovered,'), 'the discovery result is no longer handed over');
});

test('reportSuite drains the composed reporter before it writes anything of its own', () => {
  const { code } = readSource('test/reportSuite.mjs');
  assert.ok(
    code.includes('await pipeline(stream.compose(reporter), out, { end: false })'),
    'the awaited drain is gone — this is the fix itself'
  );
  const drainAt = code.indexOf('await pipeline(');
  const writeAt = code.indexOf('out.write(');
  assert.ok(drainAt > -1 && writeAt > drainAt, 'the summary is written before the drain completes');
});

test('the runner still runs one shared process and still honours CANARY=1', () => {
  const { code } = readSource('test/run.mjs');
  assert.ok(code.includes("isolation: 'none'"), 'isolation is no longer none');
  assert.ok(code.includes('process.env.CANARY'), 'the CANARY path is gone');
  assert.ok(code.includes('canary.case.mjs'), 'the canary case is no longer injected');
});

test('CONTROL: the fixture really carries the token, and not in its test NAME', () => {
  const { code } = readSource('test/reportSuiteRed.case.mjs');
  assert.ok(code.includes(TOKEN), 'the fixture no longer asserts against the token this file greps');
  assert.ok(code.includes(ACTUAL), 'the fixture no longer produces the actual side this file greps');
  const names = [...code.matchAll(/\btest\('([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(names, [RED_NAME]);
  assert.ok(!names[0].includes(TOKEN), 'the token moved into the test NAME, which fakes the check');
});
