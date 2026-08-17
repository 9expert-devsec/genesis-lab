import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE PUT-SEMANTICS PROBE CANNOT BE MADE TO WRITE TWICE, OR TO WRITE TO
 * ANOTHER COURSE.
 *
 * ── WHY A SCRATCH SCRIPT IS GUARDED AT ALL ─────────────────────────────────
 * It is not scratch. It stays in the repo because it is the only recorded
 * procedure for the question it answered, it is the RESTORE mechanism if a
 * later experiment on the same row goes wrong, and it will be re-run the next
 * time somebody doubts the merge finding. A script that issues live upstream
 * writes against a named production row is exactly the kind that gets copied,
 * pointed at a different course, and run.
 *
 * The properties below are what made ONE controlled write safe to perform. They
 * are structural — a call count, a constant, a guard — rather than promises in
 * a header, because the header is the first thing a hurried edit walks past.
 *
 * WHAT THIS CANNOT SEE, named: whether the upstream API actually merged. That
 * is not a property of source and was settled by running it — the result is
 * recorded in docs/api-domains.md under "Write semantics".
 */

const REL = 'scripts/_probe-msdb-put-semantics.mjs';
const { code } = readSource(REL);

// ── One write per invocation ────────────────────────────────────────────────

test('there is EXACTLY ONE write call site in the whole script', () => {
  /**
   * The protocol was one write per step. With two call sites, a step could
   * issue two — and the second would be invisible in the report, because the
   * report is written from the diff, not from the requests.
   */
  const writes = [...code.matchAll(/(?<![\w$])(msdbUpdate|msdbCreate|msdbDelete)\s*\(/g)];
  assert.deepEqual(
    writes.map((m) => m[1]),
    ['msdbUpdate'],
    `expected a single msdbUpdate, found: ${writes.map((m) => m[1]).join(', ') || '(none)'}`
  );
});

test('the two write steps are mutually exclusive, and reach that one call site', () => {
  // `partial` and `restore` both fall through to the shared call — they cannot
  // both run, because exactly one step flag is accepted.
  assert.match(code, /if \(STEP === 'partial'\) \{/, 'the partial step is gone');
  assert.match(code, /const res = await msdbUpdate\('public-course', saved\._id, body\)/,
    'the write no longer targets the snapshot\'s own id');
});

test('exactly one step flag is accepted — no invocation can run two steps', () => {
  assert.match(code, /if \(chosen\.length !== 1\) \{/, 'the single-step guard is gone');
  const at = code.indexOf('if (chosen.length !== 1) {');
  assert.match(code.slice(at, at + 400), /process\.exit\(2\)/, 'a multi-step invocation is not refused');
});

test('the read-only steps return before reaching the write', () => {
  /**
   * EACH BRANCH IS CHECKED IN ITS OWN REGION, and that is the whole assertion.
   *
   * An earlier draft searched from each branch's start all the way to the write
   * for any `process.exit(0)`. Deleting the snapshot branch's own exit left it
   * GREEN — the readback branch's exit, further down the same window, covered
   * for it. That is the weak-test reading of a control that fires nothing, and
   * it was the right one here: the window, not the claim, was wrong.
   *
   * So each branch is bounded by the next statement after it.
   */
  const write = code.indexOf('await msdbUpdate(');
  const BRANCHES = [
    { start: "STEP === 'snapshot'", end: 'if (!existsSync(SNAPSHOT))' },
    { start: "STEP === 'readback' || STEP === 'verify'", end: '// ── The two write steps' },
  ];
  for (const { start, end } of BRANCHES) {
    const at = code.indexOf(start);
    assert.notEqual(at, -1, `the ${start} branch is gone`);
    assert.ok(at < write, `${start} is handled after the write`);
    const stop = code.indexOf(end, at);
    assert.ok(stop > at, `could not bound the ${start} branch — the file changed shape`);
    assert.match(code.slice(at, stop), /process\.exit\(0\)/,
      `${start} can fall through to the write`);
  }
});

// ── One course, and it cannot be changed by an argument ─────────────────────

test('the subject is a CONSTANT, never read from argv', () => {
  assert.match(code, /const SUBJECT = 'EXCEL-HR-01';/, 'the subject code is not pinned');
  assert.match(code, /const SUBJECT_ID = '6a7a97f0b830e289fc383406';/, 'the subject _id is not pinned');
  // argv is read for step flags ONLY — never for a target.
  const argvUses = [...code.matchAll(/process\.argv[^\n]*/g)].map((m) => m[0]);
  assert.ok(argvUses.length > 0, 'argv is never read — the step flags are gone');
  for (const use of argvUses) {
    assert.match(use, /includes\('--(snapshot|partial|readback|restore|verify)'\)/,
      `argv is used for something other than a step flag: ${use}`);
  }
});

test('every read asserts BOTH the code and the _id before the row is used', () => {
  /**
   * The code alone is not enough and this experiment is the reason: the subject
   * is not upstream under the name the round gave it, because it was renamed.
   * A rename between steps moves the code and leaves the id alone, so a probe
   * that trusted the code would write to whatever now answers to it.
   */
  assert.match(code, /if \(String\(row\.course_id\) !== SUBJECT\)/, 'the code is not checked');
  assert.match(code, /if \(String\(row\._id\) !== SUBJECT_ID\)/, 'the _id is not checked');
  const guard = code.indexOf('!== SUBJECT_ID');
  const ret = code.indexOf('return row;');
  assert.ok(guard !== -1 && guard < ret, 'the _id check runs after the row is returned');
});

test('the write body is built from the SNAPSHOT, never from a live read', () => {
  // A body assembled from a fresh read would restore whatever is true now,
  // which is precisely what a restore must not do.
  assert.match(code, /body = Object\.fromEntries\(moved\.map\(\(k\) => \[k, saved\[k\]\]\)\)/,
    'the restore body no longer takes its values from the snapshot');
  assert.match(code, /body = \{ \[pick\.key\]: pick\.mutate\(saved\[pick\.key\]\) \}/,
    'the partial body no longer derives from the snapshot');
});

// ── It refuses rather than guesses ──────────────────────────────────────────

test('the restore REFUSES to echo a populated ref back', () => {
  /**
   * Reads return previous_course / related_courses / skills / program
   * populated; writes expect ObjectIds. Echoing a read row back would push
   * objects into ObjectId paths — the restore would become the first thing in
   * the experiment capable of causing damage.
   */
  assert.match(code, /const POPULATED_REFS = new Set\(\['previous_course', 'related_courses', 'skills', 'program'\]\)/,
    'the populated-ref list is gone');
  const at = code.indexOf('const unsafe =');
  assert.notEqual(at, -1, 'nothing checks the changed keys against that list');
  assert.match(code.slice(at, at + 400), /process\.exit\(3\)/, 'an unsafe restore is not refused');
});

test('the snapshot must exist before any step that could write', () => {
  const at = code.indexOf('if (!existsSync(SNAPSHOT))');
  const write = code.indexOf('await msdbUpdate(');
  assert.notEqual(at, -1, 'the script no longer requires a snapshot');
  assert.ok(at < write, 'a write can happen with no restore copy on disk');
});

test('the read is UNCACHED — a cached read would misreport the write', () => {
  assert.match(code, /revalidate: 0/, 'the probe reads through the ISR cache');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the source was read and the matchers are live', () => {
  assert.ok(code.length > 2000, `the probe scrubbed to ${code.length} chars`);
  // The write verb really is a thing this scan can find — same regex, pointed
  // at a module known to call it.
  const known = readSource('src/lib/actions/courses.js').code;
  const found = [...known.matchAll(/(?<![\w$])(msdbUpdate|msdbCreate|msdbDelete)\s*\(/g)];
  assert.ok(found.length >= 2, `the write-verb scan found only ${found.length} calls in a known writer`);
});

test('CONTROL: the probe is not wired into the suite or the npm scripts', () => {
  /**
   * It performs LIVE UPSTREAM WRITES. It must stay a thing a human runs
   * deliberately, with the env file, one step at a time — never something a
   * test run or a careless `npm run` can trigger.
   */
  const pkg = JSON.parse(readSource('package.json').withImports);
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    assert.ok(
      !String(cmd).includes('_probe-msdb-put-semantics'),
      `npm script "${name}" runs the live-write probe`
    );
  }
  // and it is not under test/, so the runner's three named dirs never see it.
  assert.match(REL, /^scripts\//);
});
