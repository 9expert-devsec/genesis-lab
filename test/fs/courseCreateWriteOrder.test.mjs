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
const ACTIONS_EXT = readSource('src/lib/actions/course-extensions.js');

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
  const ext = CREATE_ARM.indexOf('await saveExtensionFor(code, newId)');
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
    /if \(createdCourse\) \{[\s\S]{0,400}?saveExtensionFor\(createdCourse\.code, createdCourse\.id\)/,
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

// ── R6 ──────────────────────────────────────────────────────────────────────

test('CONTROL: the create form uppercases course_id on its way to the payload', () => {
  /**
   * A CONTROL — it passes against the pre-change tree, deliberately, and is
   * added under an explicit override of my own call to omit it.
   *
   * WHAT IT GUARDS, which is not this round's work but is inside the file this
   * round rewrote: mixed-case course_ids are a LIVE upstream defect. Upstream
   * `?course_id=` is exact-match and case-sensitive, so a mixed-case id makes
   * the public detail page fall back to a list scan and poisons the ISR cache
   * with a negative entry that cannot be busted by code. The create form is
   * where new ones are born.
   *
   * The guarantee is not in shapePayload — `toStr` only trims. It rests
   * entirely on this input being a CONTROLLED field whose onChange uppercases,
   * so FormData reads back what React put there. Turn it into an uncontrolled
   * input and every other test in the suite still passes while lowercase ids
   * start reaching MSDB again. That gap is the whole reason this exists.
   */
  const input = FORM.code.slice(
    FORM.code.indexOf('name="course_id"'),
    FORM.code.indexOf('placeholder="POWER-BI-PQ"')
  );
  assert.notEqual(input.length, 0, 'the course_id input is gone');

  assert.match(
    input,
    /value=\{courseId\}/,
    'course_id is no longer a controlled input — React cannot normalise what it does not own'
  );
  assert.match(
    input,
    /onChange=\{\(e\) => setCourseId\(e\.target\.value\.toUpperCase\(\)\)\}/,
    'course_id no longer uppercases on change'
  );

  // And nothing downstream re-lowers it: shapePayload passes the value through
  // `toStr`, which trims only.
  assert.match(
    ACTIONS.code,
    /course_id:\s*toStr\(get\('course_id'\)\)/,
    'shapePayload no longer reads course_id straight from the form'
  );
  assert.doesNotMatch(
    ACTIONS.code,
    /course_id:[^,\n]*toLowerCase\(\)/,
    'the payload lowercases course_id — that is the defect this guards'
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

// ── E1: the ALIAS check joined the code check, ahead of the MSDB write ──────

const RAIL = readSource('src/app/admin/courses/_components/CourseSeoRail.jsx');

test('E1: the alias is checked BEFORE createCourse, not after', () => {
  /**
   * It used to be checked inside saveCourseExtension — i.e. after createCourse
   * had already written to MSDB — so a clashing alias left a real course
   * upstream with no extension row. The duplicate-CODE guard has always refused
   * before writing anything; an alias clash is the same kind of refusal and now
   * behaves the same way. Consistency was the reason, not the saved round trip.
   */
  const aliasCheck = CREATE_ARM.indexOf('await checkAliasAvailable(');
  const created = CREATE_ARM.indexOf('await createCourse(fd)');
  assert.notEqual(aliasCheck, -1, 'the alias pre-check is gone from the create arm');
  assert.notEqual(created, -1, 'createCourse is no longer called');
  assert.ok(
    aliasCheck < created,
    'the alias is checked after the course is created — the partial-create path is the ordinary route again'
  );
});

test('E1: a clashing alias returns before createCourse runs', () => {
  // Not merely checked first — it must LEAVE. A check whose result is ignored
  // is the same bug with extra steps.
  assert.match(
    CREATE_ARM,
    /if \(aliasClash\) \{[\s\S]{0,400}?return;\s*\}/,
    'a clashing alias falls through to createCourse anyway'
  );
});

test('E1: a failed alias lookup refuses the create, same ruling as the code guard', () => {
  // Refusing to answer is not answering no. Waving it through to be caught by
  // the unique index later would re-create the partial-create it just removed.
  assert.match(
    CREATE_ARM,
    /checkAliasAvailable\([\s\S]{0,120}?\.catch\(/,
    'a thrown lookup is not handled at the call site'
  );
  assert.match(CREATE_ARM, /ตรวจสอบ URL Alias ซ้ำไม่สำเร็จ จึงยังไม่ได้สร้างหลักสูตร/);
});

// ── E3: what the page shows, and where ─────────────────────────────────────

test('E3: an alias refusal attaches to the ALIAS field, not to course_id', () => {
  // Putting it on course_id would point the admin at the one field that is not
  // the problem; putting it in the page banner would read as a failed save
  // rather than a field to fix.
  assert.match(CREATE_ARM, /setAliasError\(aliasClash\.error\)/);
  assert.ok(
    !/aliasClash[\s\S]{0,80}?setFieldError\(/.test(CREATE_ARM),
    'the alias error is being routed to the course_id field'
  );
  assert.match(FORM.code, /aliasError=\{aliasError\}/, 'the error never reaches the rail');
  assert.match(RAIL.code, /\{aliasError && \(/, 'the rail never renders it');
});

test('E3: the alias error is tied to the input for screen readers', () => {
  assert.match(RAIL.code, /aria-invalid=\{aliasError \? 'true' : undefined\}/);
  assert.match(RAIL.code, /aria-describedby=\{aliasError \? 'alias-error' : undefined\}/);
});

test('E3: the two field errors stay separate', () => {
  // One state each. Sharing one would make a code refusal blank an alias
  // refusal and vice versa.
  assert.match(FORM.code, /const \[aliasError, setAliasError\] = useState\(null\)/);
  assert.match(FORM.code, /const \[fieldError, setFieldError\] = useState\(null\)/);
});

test('E3: both field errors are cleared when a new submit begins', () => {
  // A stale refusal sitting under a field the admin has since fixed is its own
  // bug — they change the alias, resubmit, and the old message is still there.
  assert.match(CREATE_ARM, /setFieldError\(null\)/);
  assert.match(CREATE_ARM, /setAliasError\(null\)/);
});

// ── E2: the partial-create path survives, because the race does ────────────

test('E2: extOk:false is still reachable — the pre-check has a race the index closes', () => {
  /**
   * The pre-check is not a guarantee: between its read and the write, another
   * admin can take the alias. Only the unique index closes that window, and
   * when it fires the extension write fails with the course already created —
   * exactly the partial-create state. It stops being the ORDINARY route; it
   * does not stop being reachable, so the handling stays.
   */
  assert.match(CREATE_ARM, /extOk:\s*false/, 'the partial-create report is gone');
  assert.match(CREATE_ARM, /if \(createdCourse\)/, 'the retry path is gone');
});

// ── F1: on EDIT, an alias refusal shows BOTH ───────────────────────────────

/**
 * The edit arm: from its `updateCourse` call to the end of the submit handler.
 * Bounded by CODE, like CREATE_ARM — `readSource().code` has comments stripped,
 * so a banner-comment anchor would find nothing and collapse every assertion.
 */
const EDIT_ARM = (() => {
  const start = FORM.code.indexOf('await updateCourse(');
  assert.notEqual(start, -1, 'the edit arm is gone — has submit been rewritten?');
  return FORM.code.slice(start);
})();

test('F1: an alias refusal on EDIT sets the field error AND keeps the report', () => {
  /**
   * Both, because each answers a different question. On edit both writes are
   * attempted and updateCourse runs FIRST, so its half may genuinely have
   * saved — the report is the truthful account of which half landed, and
   * dropping it would tell the admin their save failed when half of it did not.
   * The report does not say WHERE to fix it, which is the field error's job.
   */
  assert.match(
    EDIT_ARM,
    /if \(extRes\?\.field === 'urlAlias'\) setAliasError\(extRes\.error\)/,
    'the edit arm does not put an alias refusal on the alias field'
  );
  assert.match(EDIT_ARM, /setSaveReport\(outcome\)/, 'the partial-save report was dropped');

  // Ordering: the field error must be set on the way to the report, not inside
  // a branch that returns before it.
  const fieldErr = EDIT_ARM.indexOf("setAliasError(extRes.error)");
  const report = EDIT_ARM.indexOf('setSaveReport(outcome)');
  assert.ok(fieldErr < report, 'the alias error is set after the report returns');
});

test('F1: a NON-alias failure on edit produces the report only', () => {
  // The field error is gated on `field === 'urlAlias'`. An MSDB failure, a
  // validation error or a courseId duplicate must not put a red message under
  // the URL Alias box, which would send the admin to the wrong field.
  assert.ok(
    !/setAliasError\((?!null)(?!extRes\.error\b)/.test(EDIT_ARM),
    'something other than an alias refusal can set the alias error'
  );
  assert.match(
    EDIT_ARM,
    /if \(extRes\?\.field === 'urlAlias'\)/,
    'the alias error is not gated on the field at all'
  );
});

test('F1: the edit arm clears the alias error when a new submit begins', () => {
  // Same reason as create: a stale refusal sitting under a field the admin has
  // since fixed is its own bug.
  const beforeTransition = FORM.code.slice(0, FORM.code.indexOf('await updateCourse('));
  assert.ok(
    beforeTransition.lastIndexOf('setAliasError(null)') > beforeTransition.lastIndexOf('setSaveReport(null)') - 200,
    'the edit path does not reset the alias error'
  );
});

test('F1: the CREATE arm still shows only the field error — nothing was written', () => {
  // Deliberately NOT symmetric. On create a refusal means nothing landed
  // anywhere, so there is no partial state to report; adding a report there
  // would invent one.
  const clashBranch = CREATE_ARM.slice(
    CREATE_ARM.indexOf('if (aliasClash)'),
    CREATE_ARM.indexOf('await createCourse(fd)')
  );
  assert.notEqual(clashBranch.length, 0, 'the alias-clash branch is gone');
  assert.match(clashBranch, /setAliasError\(aliasClash\.error\)/);
  assert.ok(!/setSaveReport\(/.test(clashBranch), 'create now reports a partial save that did not happen');
});

test('F1: the index-rejection path carries the field too, so both routes look alike', () => {
  // The race the pre-check cannot close surfaces as E11000 from the unique
  // index. It must reach the caller shaped like the pre-check's refusal, or the
  // edit arm would show the field error for one and not the other.
  assert.match(ACTIONS_EXT.code, /const field = duplicateKeyField\(err\)/);
  assert.match(ACTIONS_EXT.code, /\.\.\.\(field \? \{ field \} : \{\}\)/);
});
