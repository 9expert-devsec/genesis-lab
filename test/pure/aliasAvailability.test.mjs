import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliasConflict, normaliseAlias } from '@/lib/courses/aliasAvailability';

/**
 * The alias half of the create flow's duplicate guard — the sibling of
 * courseIdAvailability, and deliberately the same shape.
 *
 * The decision is pure; the lookup that feeds it (`checkAliasAvailable`) needs a
 * database and is pinned as wiring in test/fs/aliasUniqueness.
 */

// ── normalisation: the seam between the rail and the database ──────────────

test('a typed alias gains exactly one leading slash', () => {
  // The rail's input holds it WITHOUT the slash (it renders a literal "/"
  // beside the box); the database stores it WITH one. If the two callers
  // normalise differently they compare "/x" against "x", find no conflict, and
  // the unique index rejects the write instead — the failure this round removed.
  assert.equal(normaliseAlias('excel-training-course'), '/excel-training-course');
  assert.equal(normaliseAlias('/excel-training-course'), '/excel-training-course');
  assert.equal(normaliseAlias('  spaced-course  '), '/spaced-course');
});

test('an empty alias normalises to NULL, not to an empty string', () => {
  // null, because the unique index is SPARSE and skips null keys — that is what
  // lets every course without a custom URL coexist. '' is a value and would
  // collide on the second one.
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(normaliseAlias(empty), null, `${JSON.stringify(empty)} did not normalise to null`);
  }
});

test('a double slash is not invented or collapsed', () => {
  // '//x' is already slash-prefixed, so it passes through. Documenting rather
  // than asserting a cleanup this function does not do.
  assert.equal(normaliseAlias('//x'), '//x');
});

// ── the decision ───────────────────────────────────────────────────────────

test('a free alias is no conflict', () => {
  assert.equal(aliasConflict({ alias: 'brand-new-course', existingCourseId: null }), null);
});

test('a taken alias is a conflict on the urlAlias FIELD', () => {
  const c = aliasConflict({
    alias: '/power-apps-for-business-training-course',
    existingCourseId: 'POWER-APPS',
  });
  assert.ok(c, 'a taken alias was allowed');
  assert.equal(c.field, 'urlAlias', 'the error would attach to the wrong input');
});

test('the conflict NAMES the course that already owns the alias', () => {
  // The reason an app-level check exists beside the unique index at all: the
  // driver's E11000 reports the key, never the owner, and "this alias is taken"
  // without saying by what leaves the admin guessing at 78 courses.
  const c = aliasConflict({ alias: '/x', existingCourseId: 'POWER-APPS' });
  assert.match(c.error, /POWER-APPS/);
});

test('an EMPTY alias is never a conflict, whatever is passed alongside it', () => {
  // No custom URL is always allowed — the sparse index permits many nulls.
  assert.equal(aliasConflict({ alias: '', existingCourseId: 'POWER-APPS' }), null);
  assert.equal(aliasConflict({ alias: null, existingCourseId: 'POWER-APPS' }), null);
  assert.equal(aliasConflict({}), null);
});

test('the check compares NORMALISED forms, so "x" collides with "/x"', () => {
  // The caller may pass either representation; both must reach the same verdict.
  const withSlash = aliasConflict({ alias: '/dup-course', existingCourseId: 'OTHER' });
  const without   = aliasConflict({ alias: 'dup-course',  existingCourseId: 'OTHER' });
  assert.ok(withSlash && without, 'one representation slipped through');
  assert.equal(withSlash.error, without.error);
});

// ── shape parity with the code guard ───────────────────────────────────────

test('it returns the same shape as courseIdConflict, so the caller handles both alike', () => {
  const c = aliasConflict({ alias: '/x', existingCourseId: 'Y' });
  assert.deepEqual(Object.keys(c).sort(), ['error', 'field']);
  assert.equal(typeof c.error, 'string');
  assert.ok(c.error.length > 0);
});

test('CONTROL: a conflict is only raised by an EXISTING owner, not by the alias alone', () => {
  // Without this, a function that returned a conflict unconditionally would
  // pass every test above.
  assert.equal(aliasConflict({ alias: '/anything', existingCourseId: null }), null);
  assert.equal(aliasConflict({ alias: '/anything' }), null);
});
