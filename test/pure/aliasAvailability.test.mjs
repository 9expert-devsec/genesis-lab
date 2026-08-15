import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasConflict,
  normaliseAlias,
  legacyPathOwner,
} from '@/lib/courses/aliasAvailability';

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

// ── G2 (1): a trailing slash is stripped ───────────────────────────────────

test('G2: a trailing slash is stripped, so /x and /x/ are one alias', () => {
  /**
   * They are two distinct keys to a unique index, so both would save — while
   * Next redirects /x/ to /x (trailingSlash unset, default applies), meaning
   * two rows resolve to ONE final URL and the index sees no conflict.
   *
   * Measured behaviour-preserving before the change: zero of the 78 stored rows
   * carry a trailing slash, so no existing alias changes meaning.
   */
  assert.equal(normaliseAlias('/excel-training-course/'), '/excel-training-course');
  assert.equal(normaliseAlias('excel-training-course/'), '/excel-training-course');
  assert.equal(normaliseAlias('/excel-training-course///'), '/excel-training-course');
  assert.equal(
    normaliseAlias('/x/'),
    normaliseAlias('/x'),
    'the two spellings still normalise apart'
  );
});

test('G2: "/" alone is no custom URL, not an alias of nothing', () => {
  // It strips to '', which must read as null — an empty-string alias is a value
  // and the sparse unique index would let exactly one row hold it.
  assert.equal(normaliseAlias('/'), null);
  assert.equal(normaliseAlias('///'), null);
});

test('G2 CONTROL: an INTERNAL slash is untouched', () => {
  // Only the trailing one goes. A nested path is a legitimate alias.
  assert.equal(normaliseAlias('/a/b/c'), '/a/b/c');
  assert.equal(normaliseAlias('/a/b/c/'), '/a/b/c');
});

// ── G2 (2): an alias may not shadow a course's derived legacy URL ──────────

const COURSE_IDS = ['POWER-APPS', 'MSE-L1', 'Power_BI', 'COPILOT-STU'];

test('G2: an alias equal to another course\'s legacy URL is refused', () => {
  const owner = legacyPathOwner({
    alias: '/power-apps-training-course',
    courseIds: COURSE_IDS,
    exceptCourseId: 'MSE-L1',
  });
  assert.equal(owner, 'POWER-APPS', 'the shadowed course was not found');

  const c = aliasConflict({ alias: '/power-apps-training-course', legacyOwner: owner });
  assert.ok(c, 'the shadowing alias was allowed');
  assert.equal(c.field, 'urlAlias');
  assert.match(c.error, /POWER-APPS/, 'the refusal does not name the course it would hide');
});

test('G2: the match is case-insensitive, because the derived path is lowercased', () => {
  // /POWER-APPS-training-course and /power-apps-training-course are the same
  // claim on the same course.
  assert.equal(
    legacyPathOwner({ alias: '/POWER-APPS-TRAINING-COURSE', courseIds: COURSE_IDS }),
    'POWER-APPS'
  );
});

test('G2: underscores in the course_id become hyphens, as the route derives them', () => {
  // coursePathFromId turns POWER_BI into /power-bi-training-course; an alias of
  // that string shadows it just the same.
  assert.equal(
    legacyPathOwner({ alias: '/power-bi-training-course', courseIds: COURSE_IDS }),
    'Power_BI'
  );
});

test('G2: a course may hold its OWN legacy path as an alias', () => {
  // Harmless — both paths resolve to the same course — and refusing it would
  // reject a perfectly ordinary save.
  assert.equal(
    legacyPathOwner({
      alias: '/power-apps-training-course',
      courseIds: COURSE_IDS,
      exceptCourseId: 'POWER-APPS',
    }),
    null
  );
  // …including when the caller passes a differently-cased id for itself.
  assert.equal(
    legacyPathOwner({
      alias: '/power-apps-training-course',
      courseIds: COURSE_IDS,
      exceptCourseId: 'power-apps',
    }),
    null
  );
});

test('G2: an ordinary alias shadows nothing', () => {
  assert.equal(
    legacyPathOwner({ alias: '/excel-for-accountants', courseIds: COURSE_IDS }),
    null
  );
  assert.equal(aliasConflict({ alias: '/excel-for-accountants', legacyOwner: null }), null);
});

test('G2 CONTROL: a NEAR miss does not count as shadowing', () => {
  // Exact-except-case on the whole path, not a prefix or a contains.
  for (const near of [
    '/power-apps-training',            // truncated
    '/power-apps-training-courses',    // pluralised
    '/my-power-apps-training-course',  // prefixed
  ]) {
    assert.equal(
      legacyPathOwner({ alias: near, courseIds: COURSE_IDS }),
      null,
      `${near} was treated as shadowing`
    );
  }
});

test('G2: an empty course list shadows nothing, and does not throw', () => {
  assert.equal(legacyPathOwner({ alias: '/x', courseIds: [] }), null);
  assert.equal(legacyPathOwner({ alias: '/x' }), null);
  assert.equal(legacyPathOwner({}), null);
});

test('G2: a null or blank id in the list is skipped, not crashed on', () => {
  assert.equal(
    legacyPathOwner({ alias: '/power-apps-training-course', courseIds: [null, '', undefined, 'POWER-APPS'] }),
    'POWER-APPS'
  );
});

test('G2: both refusals name the owner, and they are different messages', () => {
  const taken = aliasConflict({ alias: '/x', existingCourseId: 'AAA' });
  const shadow = aliasConflict({ alias: '/x', legacyOwner: 'BBB' });
  assert.match(taken.error, /AAA/);
  assert.match(shadow.error, /BBB/);
  assert.notEqual(taken.error, shadow.error, 'the two refusals are indistinguishable');
  assert.equal(taken.field, shadow.field, 'both must attach to the same input');
});

// ── H1: a reserved segment is refused ──────────────────────────────────────

test('H1: an alias claiming a reserved segment is refused', () => {
  /**
   * The only one of the four refusals with NO visible symptom. A reserved alias
   * produces no conflict, no error and no duplicate — the static route or the
   * redirect simply wins, [...slug] never runs, and the alias does nothing.
   * Which is exactly why it is worth catching at save time.
   */
  for (const reserved of ['/schedule', '/admin', '/promotion', '/brand', '/api']) {
    const c = aliasConflict({ alias: reserved });
    assert.ok(c, `${reserved} was allowed as an alias`);
    assert.equal(c.field, 'urlAlias');
  }
});

test('H1: the refusal names the segment it collides with', () => {
  const c = aliasConflict({ alias: '/schedule' });
  assert.match(c.error, /schedule/);
});

test('H1: reserved beats the other refusals — it is checked first', () => {
  // An alias that is BOTH reserved and taken must report the reserved reason:
  // fixing the duplicate would not make /schedule work.
  const c = aliasConflict({
    alias: '/schedule',
    existingCourseId: 'SOME-COURSE',
    legacyOwner: 'OTHER-COURSE',
  });
  assert.match(c.error, /schedule/, 'the reserved reason was not the one reported');
  assert.ok(!/SOME-COURSE/.test(c.error), 'it reported the alias-taken reason instead');
});

test('H1 CONTROL: an ordinary alias is unaffected by the reserved check', () => {
  assert.equal(aliasConflict({ alias: '/excel-for-accountants' }), null);
  assert.equal(aliasConflict({ alias: '/power-apps-for-business-training-course' }), null);
});

test('H1: a nested alias is judged on its FIRST segment', () => {
  // Top-segment only, as scoped. /schedule/foo is still the schedule route's.
  assert.ok(aliasConflict({ alias: '/schedule/foo' }), '/schedule/foo was allowed');
  // …and a segment that merely CONTAINS a reserved word is fine.
  assert.equal(aliasConflict({ alias: '/scheduler-course' }), null);
});
