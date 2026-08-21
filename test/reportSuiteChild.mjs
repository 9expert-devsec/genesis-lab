// Child driver for test/fs/runnerFlush.test.mjs.
//
// It drives the REAL test/reportSuite.mjs — the same function test/run.mjs
// calls — over a ONE-CASE manifest, in a REAL process that really exits. The
// child process is not incidental: the defect this guards is stdout being torn
// down by process teardown, and nothing short of an actual process teardown can
// demonstrate that the bytes survive it. A capture stream in-process would show
// the ordering but never the truncation.
//
// What it deliberately does NOT do is register test/loader.mjs. The cases it
// runs are plain assert; the claim under test is about flushing, not resolution.
//
//   argv[2]      case file name, relative to test/
//   argv[3]      the floor to report against
//   argv[4...]   names to report as "undiscovered", relative to test/
//
// Not a *.test.mjs, so the discovery meta-control never sees it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportSuite } from './reportSuite.mjs';

const { run } = await import('node:test');
const { spec } = await import('node:test/reporters');

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const [caseName, floorArg, ...undiscoveredNames] = process.argv.slice(2);

const files = [path.join(TEST_DIR, caseName)];
// isolation:'none' matches the real runner — the suite depends on one shared
// process, and a child-per-file would not exercise the same stream wiring.
const stream = run({ files, isolation: 'none', concurrency: true });

process.exitCode = await reportSuite({
  stream,
  reporter: spec,
  out: process.stdout,
  files,
  floor: Number(floorArg),
  undiscovered: undiscoveredNames.map((n) => path.join(TEST_DIR, n)),
  testDir: TEST_DIR,
});
