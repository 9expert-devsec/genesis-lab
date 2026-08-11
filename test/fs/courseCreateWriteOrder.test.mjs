import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * CREATE is ordered, and a half-done create cannot be repeated.
 *
 * The edit page attempts both writes regardless — its two stores are
 * independent and a half-landed save loses nothing. Create is not that:
 *
 *   · the extension row is keyed by the course_id CODE, so writing it after a
 *     FAILED create leaves an orphan keyed to a course that does not exist,
 *     which the next course created with that code silently inherits;
 *   · a second submit after a SUCCESSFUL create makes a duplicate course.
 *
 * A text scan because the submit path is a click handler behind two server
 * actions. What can be reached — the conflict decision — is pure and tested in
 * test/pure/courseIdAvailability.
 */

const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');
const ACTIONS = readSource('src/lib/actions/courses.js');

/**
 * The create arm of the submit handler.
 *
 * Bounded by CODE, not by comment text: `readSource().code` has comments
 * stripped, so anchoring on a banner comment finds nothing and every assertion
 * below would collapse at module load. The edit arm begins at its
 * `updateCourse(` call, which is the first real statement after this arm.
 */
const CREATE_ARM = (() => {
  const start = FORM.code.indexOf('if (isCreate) {');
  assert.notEqual(start, -1, 'the create arm is gone — has submit been rewritten?');
  const end = FORM.code.indexOf('await updateCourse(', start);
  assert.notEqual(end, -1, 'the edit arm is gone');
  return FORM.code.slice(start, end);
})();

// ── R3: ordered, and conditional on the create succeeding ───────────────────

test('the extension is written only AFTER a successful create', () => {
  const created = CREATE_ARM.indexOf('await createCourse(fd)');
  const ext = CREATE_ARM.indexOf('await saveExtensionFor(code)');
  assert.notEqual(created, -1, 'createCourse is no longer called');
  assert.notEqual(ext, -1, 'the extension write is gone');
  assert.ok(created < ext, 'the extension is written before the course exists');
});

test('a failed create returns before any extension write', () => {
  // The orphan-row guard: on `ok !== true` the arm must leave, not continue.
  assert.match(
    CREATE_ARM,
    /if \(courseRes\?\.ok !== true\) \{[\s\S]{0,400}?return;\s*\}/,
    'a failed create falls through to the extension write'
  );
});

// ── R4: the guard runs before any write, server-side ────────────────────────

test('the duplicate guard runs inside createCourse, before msdbCreate', () => {
  const guard = ACTIONS.code.indexOf('courseIdConflict({');
  const write = ACTIONS.code.indexOf("msdbCreate('public-course'");
  assert.notEqual(guard, -1, 'the duplicate guard is gone');
  assert.ok(guard < write, 'the guard runs after the course is already created');
});

test('a lookup failure refuses the create rather than assuming the code is free', () => {
  // Refusing to answer is not the same as answering no, and guessing costs
  // another course's SEO.
  assert.match(
    ACTIONS.code,
    /catch \(err\) \{[\s\S]{0,300}?field: 'course_id',[\s\S]{0,300}?ตรวจสอบรหัสหลักสูตรซ้ำไม่สำเร็จ/,
    'a failed duplicate lookup does not block the create'
  );
});

test('both stores are consulted, case-insensitively', () => {
  assert.match(ACTIONS.code, /findCourseCodeInsensitive\(body\.course_id\)/);
  assert.match(ACTIONS.code, /findCourseExtensionCodeInsensitive\(body\.course_id\)/);
});

// ── R5: partial create switches to "already created" ────────────────────────

test('a partial create records the course and does NOT re-baseline or navigate', () => {
  const partial = CREATE_ARM.slice(CREATE_ARM.indexOf('setCreatedCourse('));
  assert.notEqual(partial.length, 0, 'the partial-create state is gone');
  assert.doesNotMatch(partial, /router\.push/, 'a partial create navigates away');
  assert.doesNotMatch(partial, /baselineRef\.current\s*=/, 'a partial create re-baselines');
});

test('once created, a submit retries ONLY the extension', () => {
  // A second createCourse would produce a duplicate course.
  assert.match(
    CREATE_ARM,
    /if \(createdCourse\) \{[\s\S]{0,400}?saveExtensionFor\(createdCourse\.code\)/,
    'the retry path does not exist'
  );
  const retry = CREATE_ARM.slice(
    CREATE_ARM.indexOf('if (createdCourse) {'),
    CREATE_ARM.indexOf('const courseRes')
  );
  assert.doesNotMatch(retry, /createCourse\(/, 'the retry can create a second course');
});

// ── R8: the redirect target ─────────────────────────────────────────────────

test('full success goes to the new course\'s editor, built from the returned _id', () => {
  assert.match(
    FORM.code,
    /`\/admin\/courses\/\$\{encodeURIComponent\(newId\)\}\/edit`/,
    'the redirect is not built from the returned _id'
  );
  assert.match(FORM.code, /withListQuery\(\s*`\/admin\/courses\/\$\{encodeURIComponent\(newId\)/s,
    'the redirect drops the list filter at this hop');
});

test('with no _id it falls back to the LIST rather than guessing a URL', () => {
  // `/admin/courses/<CODE>/edit` is a 404 that reads as a missing course.
  assert.match(
    FORM.code,
    /newId\s*\?[\s\S]{0,200}?:\s*withListQuery\('\/admin\/courses', listQuery\)/,
    'no fallback when the action returns no id'
  );
});

test('the create redirect sets leavingRef, or the guard blocks its own navigation', () => {
  // R7 put the unsaved-changes guard on this page; the redirect is a
  // programmatic leave the guard must be told about.
  const finish = FORM.code.slice(FORM.code.indexOf('const finishCreate'));
  assert.match(
    finish.slice(0, finish.indexOf('router.refresh()')),
    /leavingRef\.current = true/,
    'the guard will intercept the post-create redirect'
  );
});
