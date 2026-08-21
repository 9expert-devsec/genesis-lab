// The report-and-flush tail of the runner, lifted out of test/run.mjs so it can
// be driven over a ONE-CASE manifest by a control (test/fs/runnerFlush.test.mjs)
// instead of only ever running as the tail of a 5700-test suite.
//
// ── WHY THIS EXISTS, AND WHY IT WAS ROUND 0 ─────────────────────────────────
// run.mjs used to pipe the spec reporter at process.stdout and then call
// process.exit() from the TEST stream's 'close' handler. 'close' fires when the
// test stream is done — not when the composed reporter has finished writing —
// so the exit tore stdout down mid-flush and a RED run printed
//
//     ✖ <test name> (0.733ms)
//
// and nothing else. No assertion message, no diff, and none of the reporter's
// own end-of-run recap either. Measured, not assumed: a probe whose failure
// detail carried a unique token appeared ZERO times in 442 KB of captured
// stdout, while the ✖ line for it was right there at the end.
//
// The consequence is why this had to be fixed before any feature work: every
// control ever run in this repo was judged on red-vs-green alone, so a control
// that went red for the WRONG REASON was indistinguishable from one that
// worked. The exit code was the only signal, and the exit code cannot tell
// those two apart.
//
// ── WHAT THIS DOES INSTEAD ──────────────────────────────────────────────────
//   1. Drain the composed reporter to its END before printing anything of our
//      own. `{ end: false }` keeps process.stdout open afterwards — piping to
//      stdout normally calls end() on it, which would swallow the summary.
//   2. Print the summary AFTER that, so it still lands LAST. Landing last is
//      the point: a summary interleaved into the failure detail is a different
//      flavour of unreadable, not a fix.
//   3. RETURN the exit code rather than calling process.exit(). The caller
//      assigns process.exitCode and lets the process end on its own, so every
//      queued byte is flushed. There is now no stdout-truncating call anywhere
//      in the runner — which is the invariant test/fs/runnerFlush.test.mjs
//      guards by reading this file's source and run.mjs's.
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

/**
 * @param {object} o
 * @param {import('node:stream').Readable} o.stream  the node:test run() stream
 * @param {import('node:stream').Transform} o.reporter  e.g. the `spec` reporter
 * @param {import('node:stream').Writable} o.out  normally process.stdout
 * @param {string[]} o.files  the manifest, exactly as run() received it
 * @param {number} o.floor  minimum total tests expected
 * @param {string[]} o.undiscovered  *.test.mjs on disk the manifest never ran
 * @param {string} o.testDir  base for the relative paths in problem messages
 * @returns {Promise<0|1>} the exit code the caller should assign
 */
export async function reportSuite({ stream, reporter, out, files, floor, undiscovered, testDir }) {
  let pass = 0, fail = 0;
  // Per-file counts, so "this file ran" can be distinguished from "this file was
  // listed". A file that imports cleanly but defines no test contributes nothing
  // and, under a total-only check, is indistinguishable from one that was never
  // written — which is exactly the shape of a silently-deleted suite.
  const perFile = new Map(files.map((f) => [f, 0]));
  const bump = (e) => {
    const f = e?.file;
    if (f && perFile.has(f)) perFile.set(f, perFile.get(f) + 1);
  };
  // Attached BEFORE compose() starts consuming the stream, and synchronously —
  // no await may come between run() and here, or events are lost.
  stream.on('test:pass', (e) => { pass += 1; bump(e); });
  stream.on('test:fail', (e) => { fail += 1; bump(e); });

  // THE FIX. Everything below this line runs only once the last byte of failure
  // detail has been handed to `out`.
  await pipeline(stream.compose(reporter), out, { end: false });

  const total = pass + fail;
  const problems = [];

  // A FLOOR, not an exact count — and the comment says so now, because it used
  // to argue the opposite while the code did this, which is worse than either
  // choice on its own.
  //
  // WHAT THE FLOOR STILL CATCHES: wholesale disappearance. A tier that stops
  // being enumerated, a file that throws on import, a manifest that silently
  // walks nothing — all of those drop the total and are caught here, which is the
  // failure that actually shipped a green suite before this check existed.
  //
  // WHAT IT GIVES UP, stated plainly because it was measured: an exact count also
  // catches tests added and then LOST inside the same window, because the number
  // that would catch them is the one a human has to write down. That is not
  // hypothetical — 26 tests once landed against a floor of 565 and the suite sat
  // green, so all 26 could have vanished the next day in silence. A floor cannot
  // see that. The two sibling meta-controls below are what remain against it:
  // FILE DISCOVERY (a *.test.mjs on disk the manifest never ran) and PER-FILE
  // COUNTS (an enumerated file contributing zero), and between them they catch
  // the disappearance of a whole file even when the total still clears the floor.
  //
  // Raising the floor is optional under these semantics. Lowering it, or watching
  // it drift far below the real total, gives the check less and less to do.
  if (total < floor) {
    problems.push(
      `expected AT LEAST ${floor} tests, ran ${total}. `
      + 'Tests VANISHED — that is what this check is for.'
    );
  }
  if (undiscovered.length) {
    problems.push(
      'these *.test.mjs files exist on disk but the manifest never ran them:\n' +
      undiscovered.map((f) => `    ${path.relative(testDir, f)}`).join('\n')
    );
  }
  const empty = [...perFile].filter(([, n]) => n === 0).map(([f]) => f);
  if (empty.length) {
    problems.push(
      'these files were enumerated but contributed ZERO tests:\n' +
      empty.map((f) => `    ${path.relative(testDir, f)}`).join('\n')
    );
  }

  // console.log would do the same bytes, but writing through `out` keeps the
  // summary on the SAME stream the reporter just drained into — which is what
  // makes "the summary lands last" true rather than merely likely.
  out.write(
    `\n[suite] ${pass} passed, ${fail} failed, ${total} total across ${files.length} files `
    + `(floor ${floor})\n`
  );
  for (const p of problems) out.write(`[meta-control] FAIL: ${p}\n`);

  return fail > 0 || problems.length ? 1 : 0;
}
