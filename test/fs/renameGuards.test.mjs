import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The four refusals, pinned at the call site.
 *
 * ── WHY FROM SOURCE ────────────────────────────────────────────────────────
 * `renameCourseCodePhase1` is `'use server'` and reaches next-auth and mongoose
 * at import, so this runner cannot invoke it. The DECISIONS it makes are pure
 * and are driven for real in test/pure/renameCoursePlan — the fingerprint, the
 * divergence, the collision, the partial detection. What only source can show
 * is that the action actually CONSULTS them, and in the right order: a guard
 * computed and then not checked is the failure this file exists for.
 */

const REL = 'src/lib/actions/course-rename.js';
const src = () => readSource(REL).code;

/** Index of the first write, so "before any write" is checkable. */
function firstWriteAt(code) {
  const idx = [...code.matchAll(/\.(updateOne|updateMany)\s*\(/g)].map((m) => m.index);
  assert.ok(idx.length > 0, 'the action performs no write at all');
  return Math.min(...idx);
}

test('an UNPREVIEWED rename refuses, before anything is written', () => {
  const code = src();
  const guard = code.indexOf('if (!previewToken)');
  assert.notEqual(guard, -1, 'nothing refuses a request that carries no preview token');
  assert.ok(guard < firstWriteAt(code), 'the preview check sits after a write');
  assert.match(code, /needsPreview: true/, 'the refusal does not say what is missing');
});

test('a STALE preview stops the write, as a failure and not a warning', () => {
  const code = src();
  const guard = code.indexOf('if (previewToken !== fingerprint)');
  assert.notEqual(guard, -1, 'nothing compares the token against the recomputed fingerprint');
  assert.ok(guard < firstWriteAt(code), 'the divergence check sits after a write');
  assert.match(code, /stale: true/);
  // A `return fail(...)`, not a logged warning that falls through.
  const after = code.slice(guard, guard + 600);
  assert.match(after, /return fail\(/, 'a stale preview does not stop the write');
});

test('the fingerprint is RECOMPUTED here, not trusted from the caller', () => {
  // The whole mechanism rests on this. If the action took the caller's counts
  // the token would prove nothing — a caller could send any pair of numbers.
  const code = src();
  assert.match(code, /const preview = await previewCourseCodeRename\(/, 'the preview is not re-run at write time');
  assert.match(code, /countsFromPreview\(preview\)/, 'the counts do not come from the fresh preview');
  assert.match(code, /previewFingerprint\(\{ oldCode: from, newCode: to, counts: expected \}\)/);
});

test('COLLISION is re-checked at write time, against live AND former codes', () => {
  const code = src();
  const guard = code.indexOf('codeTaken(');
  assert.notEqual(guard, -1, 'the write-time collision check is gone');
  assert.ok(guard < firstWriteAt(code), 'the collision check sits after a write');
  assert.match(code, /formerCodes: allFormer/, 'former codes are not part of the write-time check');
  assert.match(code, /formerCodes: \{ \$exists: true, \$ne: \[\] \}/, 'former codes are not read fresh');
  assert.match(code, /clash\.where === 'former'/, 'a former-code collision is not reported distinctly');
});

test('the ALIAS is created before any other write', () => {
  /**
   * With no alias the public URL is DERIVED from the code, so the moment the
   * code changes the old URL 404s and nothing maps old to new. This step has to
   * precede the rename — which is exactly why a rename cannot be a form field's
   * blur handler.
   */
  const code = src();
  const alias = code.indexOf('mustCreateAliasFirst');
  const extension = code.indexOf('$set: { courseId: to }');
  assert.notEqual(alias, -1, 'the alias step is gone');
  assert.notEqual(extension, -1, 'the extension rename is gone');
  assert.ok(alias < extension, 'the extension is renamed BEFORE the alias is created');
});

test('the extension rename and formerCodes are ONE update', () => {
  // Two updates could leave the row carrying the new code with no record of the
  // old one — which is the state every consulting site depends on not existing.
  const code = src();
  assert.match(
    code,
    /\{ \$set: \{ courseId: to \}, \$addToSet: \{ formerCodes: upper \} \}/,
    'courseId and formerCodes are not written together'
  );
});

test('every step is idempotent — re-runnable after an interruption', () => {
  const code = src();
  // `$addToSet` not `$push`: a re-run must not duplicate the former code.
  assert.match(code, /\$addToSet: \{ formerCodes/, 'a re-run would duplicate the former code');
  // The alias step is filtered on the alias being absent.
  assert.match(code, /\$or: \[\{ urlAlias: \{ \$exists: false \} \}/, 'the alias step is not conditional');
  // The array updates target the OLD value, so a second run matches nothing.
  assert.match(code, /arrayFilters: \[\{ el: upper \}\]/);
  assert.match(code, /arrayFilters: \[\{ el: from \}\]/);
});

test('a half-finished rename is DETECTABLE, and the detector is exported', () => {
  // Idempotence is worth nothing if the interruption is invisible.
  const code = src();
  assert.match(code, /export async function inspectRenameState/, 'nothing reports a partial rename');
  // `detectPartialRename` → `detectRenameState` when upstream joined the
  // inputs: the old name described one of six answers.
  assert.match(code, /detectRenameState\(\{/, 'the detector is not called');
  assert.match(code, /upstream: asOld\.upstream/, 'the detector is called without the upstream side');
  assert.match(code, /previewCourseCodeRename\(\{ oldCode: newCode, newCode: oldCode \}\)/,
    'the reverse preview — the half that finds rows already on the new code — is missing');
});

test('the result reports what phase 1 deliberately did NOT do', () => {
  const code = src();
  assert.match(code, /intervalWarnings/, 'the interval is not reported to the admin');
  assert.match(code, /MSDB/, 'nothing says the upstream change is still owed');
});

test('CONTROL: the write-index helper finds real writes', () => {
  // Four assertions above are "the guard sits before the first write". A helper
  // that returned Infinity would satisfy all of them.
  const at = firstWriteAt(src());
  assert.ok(Number.isFinite(at) && at > 0, `firstWriteAt returned ${at}`);
  assert.throws(() => firstWriteAt('const x = 1;'), /performs no write/);
});
