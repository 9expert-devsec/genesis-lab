import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * HOW the course-order write reaches Mongo.
 *
 * The suite has no database, so this cannot invoke `saveProgramCourseOrder` —
 * it is `'use server'` and reaches next-auth and mongoose at import. The
 * DECISION half (what may be written, and when) is driven for real in
 * test/pure/courseOrderEditing. This pins the four properties of the write
 * itself that only the source can show, each of which fails silently if it
 * regresses: an enumerated update would blank sibling fields, a missing
 * `courseOrderSource` would leave the group re-seedable, an un-normalised code
 * would go unlisted on the next read, and an unguarded empty array would erase
 * a group's order under the marker that stops the re-seed repairing it.
 */

const ACTION = 'src/lib/actions/program-order.js';
const CLIENT = 'src/app/admin/courses/_components/CoursesAdminClient.jsx';
const STORE = 'src/lib/courses/courseOrderStore.js';

const src = () => readSource(ACTION).code;

/** The body of `saveProgramCourseOrder`, up to the next top-level export. */
function actionBody() {
  const code = src();
  const start = code.indexOf('export async function saveProgramCourseOrder');
  assert.notEqual(start, -1, 'saveProgramCourseOrder not found');
  const after = code.indexOf('export async function', start + 10);
  return code.slice(start, after === -1 ? code.length : after);
}

// ── Operator form ───────────────────────────────────────────────────────────

test('the write is OPERATOR FORM — $set of exactly the two fields', () => {
  const body = actionBody();
  assert.match(body, /\$set:\s*\{/, 'the update is not an operator document');
  assert.match(body, /courseOrder:\s*codes/, '$set does not carry the ordered codes');
  assert.match(body, /courseOrderSource:\s*'arranged'/, "$set does not mark the group 'arranged'");
});

test('the update is NOT an enumerated document', () => {
  /**
   * CourseExtension's writer takes the enumerated shape. Copying it here would
   * rewrite `order`, `displayName`, `iconUrl` and `isHidden` from whatever the
   * caller held — and this caller holds none of them, so they would be blanked.
   * Every write in this file is operator-form; this asserts the new one joined
   * them rather than importing the other convention.
   */
  const body = actionBody();
  assert.ok(!/findOneAndUpdate\(\s*\{[^}]*\},\s*\{\s*courseOrder/.test(body),
    'the update object starts with a bare field — that is the enumerated shape');
  for (const sibling of ['displayName', 'iconUrl', 'isHidden', 'order:']) {
    assert.ok(!body.includes(sibling), `the write touches ${sibling}, which it does not own`);
  }
});

test('EVERY write in this file stays operator-form', () => {
  // The convention this action was required to join, asserted for the file as a
  // whole so the next one cannot quietly break it either.
  const code = src();
  const updates = [...code.matchAll(/(?:findOneAndUpdate|updateOne)[\s\S]{0,200}?update:|findOneAndUpdate\(/g)];
  assert.ok(updates.length >= 5, `only ${updates.length} write sites found — has the file changed shape?`);
  const setCount = (code.match(/\$set:/g) ?? []).length;
  const setOnInsert = (code.match(/\$setOnInsert:/g) ?? []).length;
  assert.ok(setCount >= 6, `only ${setCount} $set operators for ${updates.length} writes`);
  assert.ok(setOnInsert >= 2, 'the sync upserts lost their $setOnInsert');
});

test('CourseExtension is not touched', () => {
  const { withImports } = readSource(ACTION);
  assert.ok(!/CourseExtension/.test(withImports), 'the course-order write reached into CourseExtension');
});

// ── The two guards ──────────────────────────────────────────────────────────

test('an EMPTY code list is refused, never written', () => {
  const body = actionBody();
  const guard = /if \(codes\.length === 0\)/.exec(body);
  assert.ok(guard, 'nothing refuses an empty list');
  // and it returns BEFORE the write
  assert.ok(
    guard.index < body.indexOf('findOneAndUpdate'),
    'the empty-list guard sits after the write — it would fire too late'
  );
  assert.match(body, /return \{ ok: false/, 'the refusal does not report itself');
});

test('codes are normalised on the way in', () => {
  const body = actionBody();
  assert.equal(
    countCallSites(body, 'normalizeCourseCode'), 1,
    'the codes are not normalised through the shared helper'
  );
  // The one normalisation, shared with the seed and the rank map. A second
  // spelling here is how a code stored lower-case becomes permanently unlisted.
  assert.match(readSource(ACTION).withImports, /from '@\/lib\/courses\/courseOrder'/);
});

test('the action is RBAC-gated on the screen that calls it', () => {
  // `courses`, not `programs`: this is /admin/courses. The siblings in this file
  // guard on `programs` because they belong to /admin/programs.
  assert.match(actionBody(), /requireAdmin\('courses'\)/, 'the action is not gated, or gated on the wrong key');
});

// ── The store now carries courseOrderSource ─────────────────────────────────

test('loadCourseOrder projects and returns courseOrderSource', () => {
  const { code } = readSource(STORE);
  assert.match(code, /courseOrderSource:\s*1/, 'the projection does not select courseOrderSource');
  assert.match(code, /programOrderSource/, 'the loader does not return the source map');
  assert.match(code, /return \{ programRank, programCourseOrder, programOrderSource, skillCourseOrder \}/);
});

// ── The client cannot call the action from a blocked state ──────────────────

test('the screen gates the drag on the shared decision, not on an inline check', () => {
  const { code, withImports } = readSource(CLIENT);
  assert.match(withImports, /canReorderCourseGroups/, 'the screen does not import the decision');
  assert.equal(
    countCallSites(code, 'canReorderCourseGroups'), 1,
    'the decision is made somewhere other than the one shared place'
  );
  // The drag props are handed out only when it says yes.
  assert.match(
    code,
    /canReorder \? getDragProps\(index\) : null/,
    'drag props are attached without consulting the decision'
  );
});

test('the save sends the shared payload builder, not a hand-rolled map', () => {
  const { code } = readSource(CLIENT);
  assert.equal(countCallSites(code, 'orderedCodesForGroup'), 1);
  assert.equal(countCallSites(code, 'saveProgramCourseOrder'), 1, 'more than one call site writes the order');
  assert.ok(
    !/items\.map\(\s*\(?\w+\)?\s*=>\s*\w+\.course\.course_id/.test(code),
    'the payload is built inline — normalisation and de-duplication would be skipped'
  );
});

// ── Control ─────────────────────────────────────────────────────────────────

test('CONTROL: the body slicer returns the action and not the whole file', () => {
  // Every assertion above reads `actionBody()`. A slicer that returned the whole
  // module would let a sibling action satisfy them.
  const body = actionBody();
  assert.ok(body.length > 400, `the slice is ${body.length} chars`);
  assert.ok(body.includes('saveProgramCourseOrder'));
  assert.ok(!body.includes('toggleProgramHidden'), 'the slice ran past the end of the action');
  assert.ok(!body.includes('saveSkillOrder'), 'the slice swallowed a sibling');
});
