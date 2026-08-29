import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withTZ, AMBIENT_TZ, AMBIENT_PROBE, zoneProbe } from '../withTZ.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 54 — a process-global set by one test file is set for every other one.
 *
 * The runner is `isolation: 'none'` with `concurrency: true`: ONE process, all
 * 515 files. Anything on `process.env` is therefore shared state, and a file
 * that fails to put a value back has changed the ambient environment for
 * whatever runs next — in any tier, hundreds of lines away, with nothing
 * connecting the two.
 *
 * ── WHAT THIS ROUND WENT LOOKING FOR, AND WHAT IT ACTUALLY FOUND ──────────
 * The reported concern was `NODE_ENV`. Round 45 recorded that "other files in
 * this suite set process.env.NODE_ENV = 'production' at an unpredictable
 * moment" and pinned the value for a child process against that.
 *
 * MEASURED, THE PREMISE IS FALSE. No test file writes NODE_ENV. The only writer
 * inside `npm test` is test/run.mjs, at module scope, BEFORE the loader is
 * registered and before `run()` imports a single file — so the value is
 * 'production' from before file one and never moves. Round 45's pin is still
 * correct and still necessary, but for a plainer reason than a race: the child
 * inherits a value that is deterministically wrong for it.
 *
 * THE SAME SHAPE WAS LIVE FOR `TZ`, and that one was real. Two files restored
 * with `if (original === undefined) delete process.env.TZ`, and TZ is normally
 * unset, so the delete branch is the one that ran. Deleting TZ does not restore
 * the OS zone. Measured on this clone: after test/pure/promotionDateLabel ran,
 * the process was left in Pacific/Kiritimati — the last entry in its own zone
 * list — for whatever ran next.
 *
 * `test/withTZ.mjs` already existed, with a header explaining precisely this.
 * Two files simply did not use it. They do now, and this file is the guard.
 */

// ── THE HELPER ACTUALLY RESTORES ───────────────────────────────────────────

test('withTZ leaves the process in the zone it found it in', () => {
  const before = zoneProbe();
  withTZ('Pacific/Kiritimati', () => {
    assert.notEqual(zoneProbe(), before, 'the block did not actually change zone');
  });
  assert.equal(zoneProbe(), before, 'withTZ did not restore');
  assert.equal(zoneProbe(), AMBIENT_PROBE, 'the process drifted from its ambient zone');
});

test('nesting withTZ restores to the OUTER zone, not to ambient', () => {
  const before = zoneProbe();
  withTZ('America/Los_Angeles', () => {
    const outer = zoneProbe();
    withTZ('UTC', () => {
      assert.notEqual(zoneProbe(), outer, 'the inner block did nothing');
    });
    assert.equal(zoneProbe(), outer, 'the inner restore skipped past the outer zone');
  });
  assert.equal(zoneProbe(), before);
});

test('CONTROL — the naive delete-to-restore does NOT restore', () => {
  /**
   * The defect, reproduced. Without this, "withTZ restores" would pass for a
   * runtime where ANY restore works and the helper's whole reason for existing
   * would be unevidenced.
   *
   * THE UNSET CASE IS ESTABLISHED, NOT ASSUMED. An earlier draft asserted that
   * TZ was ambiently undefined here and went red — because withTZ restores by
   * ASSIGNING the ambient zone, so the tests above this one leave TZ set. The
   * real case is "TZ was unset, a file set it, the file deleted it", so this
   * deletes first and builds that case deliberately.
   *
   * REPAIRED SYNCHRONOUSLY, in a finally, by assignment — the very thing the
   * naive version gets wrong. No await anywhere: a mutation that spans a
   * microtask boundary leaks into whatever else is mid-flight, which is the
   * rule withTZ's header states and what makes this safe to run in the shared
   * process at all.
   */
  const saved = process.env.TZ;
  let whileSet;
  let afterDelete;
  try {
    delete process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    whileSet = zoneProbe();
    delete process.env.TZ; // the naive "restore"
    afterDelete = zoneProbe();
  } finally {
    process.env.TZ = saved ?? AMBIENT_TZ;
  }
  assert.notEqual(whileSet, AMBIENT_PROBE, 'setting TZ did nothing — nothing below means anything');
  assert.equal(afterDelete, whileSet,
    'delete DID restore on this runtime — re-read withTZ, its reason may have expired');
  assert.equal(zoneProbe(), AMBIENT_PROBE, 'the control leaked its own zone');
});

// ── AND NO FILE DOES IT THE NAIVE WAY ANY MORE ────────────────────────────

const TZ_WRITERS = [
  'test/pure/promotionDateLabel.test.mjs',
  'test/pure/publishWindow.test.mjs',
];

test('the two files that forced TZ now use the shared helper', () => {
  for (const rel of TZ_WRITERS) {
    const { code } = readSource(rel);
    // The USAGE, not the import line: readSource's scrubber drops imports, so
    // asserting on the import statement was a guard that could never pass.
    assert.match(code, /withTZ/, `${rel} does not use the shared helper`);
    assert.ok(!/delete\s+process\.env\.TZ/.test(code),
      `${rel} still restores TZ with a delete, which is not a restore`);
  }
});

test('CONTROL: that reader can see the files it is asserting over', () => {
  for (const rel of TZ_WRITERS) {
    const { code } = readSource(rel);
    assert.ok(code.length > 500, `${rel} scrubbed to ${code.length} chars`);
    assert.match(code, /withTZ/, `${rel} scrubbed away the thing being asserted`);
  }
});

// ── NODE_ENV: THE VALUE IS SET ONCE, AND EVERY READER SEES THE SAME ONE ───

/**
 * What NODE_ENV was when this file was imported. The invariant is STABILITY,
 * not a literal: under `npm test` the runner has already set 'production', but
 * a single file run straight through `node --test` never loads the runner and
 * sees whatever the shell exported. Asserting the literal made this file pass
 * one way and fail the other, which is a worse guard than none.
 */
const NODE_ENV_AT_LOAD = process.env.NODE_ENV;

test('NODE_ENV does not move during the run', () => {
  /**
   * Not a race, so not a race guard — an invariant. If this fails, some file
   * has started writing NODE_ENV mid-run and the readers named below can
   * disagree about what they are rendering.
   */
  assert.equal(process.env.NODE_ENV, NODE_ENV_AT_LOAD,
    'something changed NODE_ENV after the runner set it');
});

test('the readers WOULD change answer if it flipped — so the invariant matters', () => {
  /**
   * A guard on a value nothing reads is decoration. This names the consequence:
   * SectionRenderer draws a dev-only block for an unknown section type and
   * nothing in production, so the same section is 0 bytes or 245 depending on
   * a variable any file could assign.
   *
   * Asserted on the SOURCE rather than by re-rendering under a flipped value,
   * because flipping it here is exactly the mutation this file exists to
   * prevent.
   */
  const { code } = readSource('src/components/pageBuilder/SectionRenderer.jsx');
  assert.match(code, /process\.env\.NODE_ENV !== 'production'/,
    'SectionRenderer no longer branches on NODE_ENV — re-check what this invariant is protecting');
});
