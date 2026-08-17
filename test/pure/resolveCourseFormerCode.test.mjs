import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCourse } from '@/lib/resolveCourse';
import { courseHaystack } from '@/lib/search/matchSearch';

/**
 * AN OLD CODE STILL RESOLVES — through the URL, and through search.
 *
 * ── THE STATE BEING SIMULATED ──────────────────────────────────────────────
 * Phase 1 of a rename has run. Every genesis store carries the NEW code
 * (`EXCEL-INT`); MSDB still carries the OLD one (`MSE-L1`) because the tech
 * lead has not made his change yet. Both of the failures below are real for
 * the whole of that interval, and neither is cosmetic:
 *
 *   · the ALIASED url 404s — the alias row is found, its `courseId` misses
 *     upstream, and path 2 then uppercases the ALIAS rather than a code;
 *   · the DERIVED url loses its extension — so the SEO and gallery go, and
 *     with them the `isPublished` gate, which means a HIDDEN course becomes
 *     publicly visible mid-migration.
 *
 * `deps` is the resolver's own test seam; production callers pass nothing.
 */

const EXT = {
  courseId: 'EXCEL-INT',              // already renamed by phase 1
  formerCodes: ['MSE-L1'],            // what it used to be
  urlAlias: '/excel-intermediate-training-course',
  isPublished: true,
};

const UPSTREAM = { course_id: 'MSE-L1', course_name: 'Excel Intermediate' };

/** Upstream still knows only the OLD code. */
const fetchCourse = async (code) =>
  String(code).toUpperCase() === 'MSE-L1' ? UPSTREAM : null;

const deps = (over = {}) => ({
  fetchExtensionByAlias: async (a) => (a === EXT.urlAlias ? EXT : null),
  fetchExtension: async (code) => (code === EXT.courseId ? EXT : null),
  fetchExtensionByFormerCode: async (code) =>
    (EXT.formerCodes.some((f) => f.toLowerCase() === String(code).toLowerCase()) ? EXT : null),
  fetchCourse,
  ...over,
});

// ── The aliased URL survives the interval ───────────────────────────────────

test('the ALIASED url resolves through formerCodes while upstream lags', () => {
  return resolveCourse('excel-intermediate-training-course', deps()).then((r) => {
    assert.ok(r, 'the aliased url 404d during the rename interval');
    assert.equal(r.mode, 'alias-former-code');
    assert.equal(r.course.course_id, 'MSE-L1', 'it must resolve to the course upstream still serves');
    assert.equal(r.extension.courseId, 'EXCEL-INT', 'and keep the extension that was already renamed');
  });
});

test('a course whose CURRENT code resolves never reaches the former-code branch', async () => {
  // The fallback is a miss path. A course that is fine must not pay an extra
  // lookup, and must report the ordinary mode.
  let formerCalls = 0;
  const r = await resolveCourse('excel-intermediate-training-course', deps({
    fetchCourse: async () => UPSTREAM,           // current code resolves
    fetchExtensionByFormerCode: async () => { formerCalls += 1; return EXT; },
  }));
  assert.equal(r.mode, 'alias');
  assert.equal(formerCalls, 0, 'the former-code lookup ran on a path that had already succeeded');
});

// ── The derived URL keeps its extension ─────────────────────────────────────

test('the OLD derived url keeps the extension, so the publish gate still applies', async () => {
  const r = await resolveCourse('mse-l1-training-course', deps());
  assert.ok(r, 'the old derived url stopped resolving');
  assert.equal(r.mode, 'code');
  assert.equal(r.extension?.courseId, 'EXCEL-INT', 'the extension was lost during the interval');
});

test('A HIDDEN course stays hidden on the old derived url', async () => {
  /**
   * The safety half. Without the former-code fallback the extension read
   * misses, `extension?.isPublished === false` becomes `undefined === false`,
   * and the gate below it never fires — so un-publishing a course would be
   * silently undone for the length of the migration.
   */
  const hidden = { ...EXT, isPublished: false };
  const r = await resolveCourse('mse-l1-training-course', deps({
    fetchExtension: async () => null,
    fetchExtensionByFormerCode: async () => hidden,
  }));
  assert.equal(r, null, 'a hidden course resolved publicly during the rename interval');
});

test('an admin preview still reaches the hidden course', async () => {
  const hidden = { ...EXT, isPublished: false };
  const r = await resolveCourse('mse-l1-training-course', deps({
    fetchExtension: async () => null,
    fetchExtensionByFormerCode: async () => hidden,
    includeHidden: true,
  }));
  assert.ok(r, 'includeHidden must still open the gate');
  assert.equal(r.extension.isPublished, false);
});

// ── Nothing regresses for a course that was never renamed ───────────────────

test('a course with NO formerCodes behaves exactly as before', async () => {
  const plain = { courseId: 'MSE-L1', urlAlias: '/plain-training-course', isPublished: true };
  const d = {
    fetchExtensionByAlias: async (a) => (a === plain.urlAlias ? plain : null),
    fetchExtension: async (c) => (c === 'MSE-L1' ? plain : null),
    fetchExtensionByFormerCode: async () => null,
    fetchCourse,
  };
  const byAlias = await resolveCourse('plain-training-course', d);
  assert.equal(byAlias.mode, 'alias');
  const byCode = await resolveCourse('mse-l1-training-course', d);
  assert.equal(byCode.mode, 'code');
  assert.equal(byCode.extension.courseId, 'MSE-L1');
});

test('an unknown slug is still null', async () => {
  assert.equal(await resolveCourse('no-such-thing-training-course', deps()), null);
  assert.equal(await resolveCourse('', deps()), null);
});

// ── Search ──────────────────────────────────────────────────────────────────

test('SEARCHING THE OLD CODE finds the course', () => {
  // The customer with the code on their quotation. `urlAlias` saved the URL and
  // nothing saved the code — this is what does.
  const row = { course_name: 'Excel Intermediate', course_id: 'EXCEL-INT', formerCodes: ['MSE-L1'] };
  assert.ok(courseHaystack(row).includes('mse-l1'), 'the retired code is not searchable');
  assert.ok(courseHaystack(row).includes('excel-int'), 'the current code stopped being searchable');
});

test('a course with no formerCodes has an unchanged haystack', () => {
  const withField = courseHaystack({ course_name: 'X', course_id: 'A', formerCodes: [] });
  const without = courseHaystack({ course_name: 'X', course_id: 'A' });
  assert.equal(withField, without);
});

test('CONTROL: the haystack does not match a code that belongs to nobody', () => {
  const row = { course_name: 'Excel Intermediate', course_id: 'EXCEL-INT', formerCodes: ['MSE-L1'] };
  assert.ok(!courseHaystack(row).includes('power-bi'), 'the haystack matches everything');
});
