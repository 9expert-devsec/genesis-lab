import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDepSets,
  auditPureHarnesses,
  pureTestFiles,
  isCallable,
} from '../injectedDeps.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * NO PURE TEST MAY LEAVE A DATABASE-BACKED DEPENDENCY UNSUPPLIED.
 *
 * ── THE DEFECT THIS WAS BUILT FROM ─────────────────────────────────────────
 * test/pure/listPublicCoursesHidden.test.mjs built a `deps` object for
 * `listPublicCourses` with `fetchUpstream` and `loadHidden` and no `loadOrder`.
 * `loadOrder` defaults to the real `loadCourseOrder`, which connects and queries
 * ProgramOrder, so nine of that file's twelve tests were talking to a database.
 *
 * Nothing in this suite could see it:
 *   · the tests PASSED — loadCourseOrder catches its own failure and returns
 *     null, which is also what a correct stub returns;
 *   · the only symptom was TIME. Measured: 10.5 seconds for a file that runs in
 *     66ms once repaired, all of it mongoose's 10-second buffering timeout;
 *   · the nine `[courseOrder] could not read the stored order` lines it printed
 *     are indistinguishable from ordinary fixture noise in a 7739-test run.
 * And on a machine where that read is reachable-but-slow, or where nothing
 * stubs @/lib/db/connect, it does not warn — it HANGS. `process.exit()` used to
 * kill a hung suite; round 0 removed it, correctly, because it was truncating
 * red output, and its own note flags that a leaked handle now hangs instead.
 *
 * ── WHY A SOURCE SCAN AND NOT THE TWO ALTERNATIVES ─────────────────────────
 * Both alternatives were considered and both are strictly weaker HERE:
 *
 *   A PER-FILE TIMEOUT IN THE RUNNER that names the file instead of hanging.
 *   It only fires once the defect is already costing wall-clock, and it cannot
 *   see a latent one at all. That is not hypothetical: of the three harnesses
 *   this guard found, TWO — hiddenCoursePreviewGate and resolveCourseAliasCase —
 *   omitted `fetchExtensionByFormerCode` and ran in 80ms, because no fixture
 *   reached the branch that calls it. A timeout would have reported both as
 *   healthy right up until the fixture that reaches it lands.
 *
 *   A RUNTIME ASSERTION THAT dbConnect IS NEVER REACHED FROM THE PURE TIER.
 *   Same blindness to the latent case, plus it cannot name the file: the runner
 *   drives all three tiers in ONE process with concurrency:true, so at the
 *   moment of the call the stack is inside the store and several files are
 *   in flight. "Something reached the database" is not an actionable report.
 *
 * The scan catches all three before any of them costs a second, and it names
 * the file. What it CANNOT see is listed in test/injectedDeps.mjs's header, in
 * full, and the two counts asserted at the bottom of this file are what stop
 * that list growing silently.
 *
 * ── AND IT IS NOT A LIST OF FILE NAMES ─────────────────────────────────────
 * Nothing below enumerates a test file or a dep name. Both ends are read from
 * source every run: which deps are db-backed comes from src/'s import graph,
 * and which files answer for them comes from what each test file imports by
 * name. A new store, a new dep or a new harness is covered the day it lands.
 */

const DEP_SETS = collectDepSets();
const PURE = pureTestFiles();

/** The dep set of `fn` in `file` that declares `owns` — a function may take more than one. */
const depsOf = (file, fn, owns) =>
  DEP_SETS.find((d) => d.file === file && d.fn === fn && d.deps.has(owns));

test('every pure harness supplies the db-backed deps of what it imports', () => {
  const { violations } = auditPureHarnesses(PURE, DEP_SETS);
  assert.deepEqual(
    violations.map((v) => `${v.file} never mentions {${v.missing.join(', ')}} for ${v.fn}`),
    [],
    'a pure test leaves a database-backed dependency at its production default'
  );
});

test('CONTROL: the audit NAMES THE FILE when the override is absent', () => {
  // The red half of the pair. If this reported nothing, the assertion above
  // would be green because the reader is broken, not because the suite is
  // clean — which is the only way that check can lie.
  const { violations } = auditPureHarnesses(['test/injectedDepMissing.case.mjs'], DEP_SETS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'test/injectedDepMissing.case.mjs');
  assert.deepEqual(violations[0].missing, ['loadOrder']);
  assert.equal(violations[0].fn, 'src/lib/api/public-courses.js :: listPublicCourses');
});

test('CONTROL: the same file with the override present reports nothing', () => {
  // The green half. Without it the test above would also pass against a reader
  // that flagged every file it was handed.
  const { violations } = auditPureHarnesses(['test/injectedDepComplete.case.mjs'], DEP_SETS);
  assert.deepEqual(violations, []);
});

test('CONTROL: the two case files differ by exactly the one line', () => {
  // Pins the pair to being a controlled comparison. Let them drift apart and
  // the two tests above stop being about `loadOrder` at all.
  const a = readSource('test/injectedDepMissing.case.mjs').code.split('\n').map((l) => l.trim()).filter(Boolean);
  const b = readSource('test/injectedDepComplete.case.mjs').code.split('\n').map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(b.filter((l) => !a.includes(l)), ['loadOrder: async () => null,']);
  assert.deepEqual(a.filter((l) => !b.includes(l)), []);
});

// ── the reader itself, in both directions ──────────────────────────────────

test('the scan is NOT vacuous: it classifies loadOrder as db-backed', () => {
  // Everything above is satisfied by a reader that finds no db-backed deps at
  // all. This is the assertion that makes the audit mean something: the dep
  // that caused the defect is read out of src/, with the module it lives in.
  // `listPublicCourses` declares TWO `{…} = {}` parameter objects — the options
  // one, `{ skill, program, includeHidden }`, comes first — so the deps set is
  // selected by a name it owns rather than by position.
  const set = depsOf('src/lib/api/public-courses.js', 'listPublicCourses', 'loadOrder');
  assert.ok(set, 'listPublicCourses no longer declares a deps object');
  assert.deepEqual([...set.deps].sort(), ['fetchUpstream', 'loadHidden', 'loadOrder']);
  assert.deepEqual([...set.dbBacked].sort(), ['loadHidden', 'loadOrder']);
});

test('the db reach is TRANSITIVE and follows `await import()`', () => {
  // loadCourseOrder does not import @/lib/db/connect at module load — it defers
  // it, deliberately, so the adapter stays loadable without MONGODB_URI. A
  // static-only import walk sees no database edge from public-courses.js at all
  // and classifies loadOrder as harmless, which is a silently vacuous guard.
  const set = depsOf('src/lib/api/public-courses.js', 'listPublicCourses', 'loadOrder');
  assert.equal(set.dbBacked.has('loadOrder'), true);
});

test('fetchUpstream is NOT db-backed — the classifier discriminates', () => {
  // It defaults to aiFetch, which is HTTP. A classifier that called every dep
  // db-backed would satisfy every assertion above and would demand overrides
  // for network stubs that are already there for other reasons.
  const set = depsOf('src/lib/api/public-courses.js', 'listPublicCourses', 'fetchUpstream');
  assert.equal(set.dbBacked.has('fetchUpstream'), false);
});

test('CONTROL: a CONSTANT default in a db-reaching module is not db-backed', () => {
  // `perPage = PAGE_SIZE` in listMasterclassRegistrations is a page size sitting
  // in a module that does reach Mongo. Before the callable rule it was the one
  // false positive across all of src/ — and one false positive in a guard is how
  // the guard gets switched off.
  assert.equal(isCallable('const PAGE_SIZE = 20;', 'PAGE_SIZE'), false);
  assert.equal(isCallable('export async function loadCourseOrder(deps) {}', 'loadCourseOrder'), true);
  assert.equal(isCallable('const loadCourseOrder = async (d) => d;', 'loadCourseOrder'), true);
  const masterclass = DEP_SETS.filter((d) => d.file === 'src/lib/actions/masterclass-registrations.js');
  for (const d of masterclass) assert.equal(d.dbBacked.has('perPage'), false);
});

// ── what the guard is answerable for, so shrinking it cannot be silent ─────

test('the set of files ON THE HOOK is what it was measured to be', () => {
  // Not a list of files to maintain — a floor on COVERAGE. Every entry here is
  // derived; the number is the measurement. If a pure test stops importing the
  // function it drives, or the reader stops resolving `@/`, this collapses to a
  // shorter list and the audit above goes vacuously green without it.
  const { onHook } = auditPureHarnesses(PURE, DEP_SETS);
  assert.equal(onHook.length >= 9, true, `only ${onHook.length} pure file/function pairs are covered`);
  const pairs = onHook.map((h) => `${h.file} -> ${h.fn}`);
  assert.equal(pairs.includes('test/pure/listPublicCoursesHidden.test.mjs -> listPublicCourses'), true);
  assert.equal(pairs.includes('test/pure/hiddenCoursePreviewGate.test.mjs -> resolveCourse'), true);
  assert.equal(pairs.includes('test/pure/resolveCourseAliasCase.test.mjs -> resolveCourse'), true);
});

test('every dep set carrying a db-backed default is still found', () => {
  // The other direction: if src/ grows a store-backed dep the reader cannot see,
  // this number drops and the audit silently stops asking about it.
  //
  // A FLOOR, not an exact set, for the reason the runner's own FLOOR gives: an
  // exact set turns every legitimate new store-backed dep into an unrelated red,
  // and a guard that goes red for the wrong reason gets edited rather than read.
  // Losing one of these is the failure worth catching.
  const withDb = DEP_SETS.filter((d) => d.dbBacked.size > 0).map((d) => `${d.file} :: ${d.fn}`);
  for (const known of [
    'src/lib/api/public-courses.js :: getCourseByCodeInsensitive',
    'src/lib/api/public-courses.js :: listPublicCourses',
    'src/lib/courses/adminCoursePreview.js :: resolveHiddenCourseForAdmin',
    'src/lib/registrations/inhouseCourseSearch.js :: inhouseCourseCodes',
    'src/lib/resolveCourse.js :: resolveCourse',
  ]) {
    assert.equal(withDb.includes(known), true, `${known} is no longer read as db-backed`);
  }
});
