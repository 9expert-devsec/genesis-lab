import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * WHERE the version writers are called from — the half no unit test can reach.
 *
 * The writer's behaviour is proved directly in test/pure/courseVersionWriter.
 * What that cannot show is whether anything CALLS it, whether it is called at
 * the right point in a save, and whether something that is NOT a course save
 * has quietly started minting course versions. Those are questions about the
 * shape of the call graph, so they are asked of the source.
 *
 * WHAT A SOURCE SCAN CANNOT SEE, stated so it is not mistaken for more than it
 * is: whether the call RUNS. A call inside an `if (false)`, or after an early
 * return, satisfies every assertion here. Same limit the audit-coverage guard
 * names, and the same answer: this is a shape guard, and the behaviour it
 * guards the shape of is tested elsewhere.
 */

const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';
const OUTLINES = 'src/lib/actions/course-outlines.js';
const ACTIONS = 'src/lib/actions/course-versions.js';
const WRITER = 'src/lib/courses/courseVersionWriter.js';

/**
 * `readSource` hands back three forms of one file and each assertion has to say
 * which it uses — see the note on that function. All three are used here:
 *
 *   code — comments AND imports stripped. For "this file CALLS x", and for
 *          ordering claims, where an import line at the top of the file would
 *          come before every call and make the comparison meaningless.
 *   raw  — untouched. ONLY for the import-line assertions at the bottom, which
 *          are about the literal text of a statement.
 *   refs — see below.
 *
 * Choosing wrong passes vacuously in one direction and fails spuriously in the
 * other, so the three are named here once rather than picked per assertion.
 */
const code = (rel) => readSource(rel).code;
const raw = (rel) => readSource(rel).raw;
/**
 * Comments stripped, import lines kept — the form a "this file never REFERENCES
 * x" claim needs.
 *
 * `.raw` is wrong for that and the difference is not academic: these files
 * explain at length WHY they are not the audit log, so every such assertion
 * read from `.raw` fails on its own documentation. `.code` is wrong the other
 * way, because it drops the import lines that are half of what "references"
 * means.
 */
const refs = (rel) => readSource(rel).withImports;

/** How many times a bare identifier appears — countCallSites only sees calls. */
const occurrences = (text, needle) => text.split(needle).length - 1;

/** The edit branch of handleSubmit, which is NOT the first one in the file. */
function editBranch() {
  const src = code(FORM);
  const at = src.indexOf('const wantsPreviewAfterSave');
  assert.ok(at > 0, 'CONTROL: the edit branch is still identifiable');
  return src.slice(at);
}

// ── V7 — a schedule edit must NOT mint a course version ─────────────────────

/**
 * RULING 1: a course version is the MSDB public-course row plus its
 * course_extensions row, and nothing else. Schedules, promo links, early-bird
 * and local FAQs are related records with their own identity and their own
 * audit entities. A schedule edit that produced a course version would make the
 * history unreadable — a course would appear to change on days nobody touched
 * it.
 *
 * Asserted by ABSENCE across the whole source tree rather than by naming
 * schedules.js alone: the point is that the writer has exactly the callers it
 * was designed to have, so a fifth one added later is caught rather than merely
 * a schedule-shaped one.
 */
test('V7: nothing outside the two intended call sites writes a course version', () => {
  const found = [];

  for (const file of walkSources('src')) {
    if (file.rel === WRITER) continue;
    // `.withImports`, deliberately: a caller is found by its import line as
    // well as by its call, so a file that imports the writer and reaches it
    // through a helper is still caught.
    if (/recordCourseContentVersion|recordCourseFileReplacement/.test(file.withImports)) {
      found.push(file.rel);
    }
  }

  assert.deepEqual(
    found.sort(),
    [ACTIONS, OUTLINES].sort(),
    'the version writer has exactly the callers it was designed to have'
  );
});

test('V7: the schedule actions reach no part of the version machinery', () => {
  const source = refs('src/lib/actions/schedules.js');
  for (const name of [
    'recordCourseContentVersion',
    'recordCourseFileReplacement',
    'commitCourseVersion',
    'captureCoursePreImage',
    'CourseVersion',
  ]) {
    assert.equal(source.includes(name), false, `schedules.js must not reference ${name}`);
  }
});

test('CONTROL: the scan DOES see the writer where it really is called', () => {
  // Guards the two cases above: if the matcher or the reader changed shape,
  // both would pass by finding nothing anywhere.
  assert.ok(code(OUTLINES).includes('recordCourseFileReplacement'));
  assert.ok(code(ACTIONS).includes('recordCourseContentVersion'));
});

test('V7: the related-record actions are untouched by this work', () => {
  for (const file of [
    'src/lib/actions/course-promos.js',
    'src/lib/actions/local-faqs.js',
    'src/lib/actions/program-order.js',
  ]) {
    assert.equal(
      /CourseVersion|courseVersion/i.test(refs(file)),
      false,
      `${file} must stay out of it`
    );
  }
});

// ── the joint point (RULING 1, second half) ─────────────────────────────────

/**
 * The version must be written where BOTH writes have completed, not inside
 * either one. Asserted as absence from both actions plus presence in the form,
 * because "inside either one" is exactly what a well-meaning later edit would
 * do to save a round trip.
 */
test('neither save action writes a version itself', () => {
  for (const file of ['src/lib/actions/courses.js', 'src/lib/actions/course-extensions.js']) {
    assert.equal(
      /commitCourseVersion|recordCourseContentVersion/.test(refs(file)),
      false,
      `${file} must not write a version — one press is two writes and this is only half of it`
    );
  }
});

test('the form commits the version AFTER both writes have returned', () => {
  /**
   * SCOPED TO THE EDIT BRANCH. The create arm appears EARLIER in the file and
   * has commits of its own, so a plain indexOf over the whole file finds one of
   * those and the ordering claim becomes accidental — it passed against the
   * wrong call site until this slice was added.
   */
  const branch = editBranch();

  const update = branch.indexOf('updateCourse(initial?._id, fd)');
  const ext = branch.indexOf('saveExtensionFor(courseId, initial?._id)');
  const commit = branch.indexOf('commitCourseVersion');

  assert.ok(update > 0 && ext > 0 && commit > 0, 'all three call sites are in the edit branch');
  assert.ok(commit > update, 'the commit follows the MSDB write');
  assert.ok(commit > ext, 'the commit follows the extension write');
});

test('the pre-image is captured BEFORE the first write, or it cannot exist', () => {
  const branch = editBranch();
  const capture = branch.indexOf('captureCoursePreImage');
  const update = branch.indexOf('updateCourse(initial?._id, fd)');

  assert.ok(capture > 0 && update > 0);
  assert.ok(
    capture < update,
    'MSDB is written over HTTP — after the PUT the previous state is unrecoverable'
  );
});

test('every create arm commits a version too, not just the edit path', () => {
  // Three: the edit save, the create, and the create RETRY. A create whose rail
  // write failed still created a course, and it still has to have a version.
  assert.equal(countCallSites(code(FORM), 'commitCourseVersion'), 3);
});

test('a create passes ABSENT, never letting the missing flag fire on a new course', () => {
  const src = code(FORM);
  assert.equal(occurrences(src, 'PRE_IMAGE.ABSENT'), 2, 'the create and its retry');
  assert.equal(
    src.includes('PRE_IMAGE.UNAVAILABLE'),
    false,
    'the form never asserts a failed read — only the action that did the reading can'
  );
});

// ── V8 — the upload path records without any save ───────────────────────────

/**
 * The case a save-time-only hook misses ENTIRELY.
 *
 * The outline public_id is derived and signed `overwrite: true`, so the live
 * file changes the moment it is picked. An admin who replaces the PDF and then
 * closes the form without saving has changed what customers download.
 *
 * The chain asserted here is: the file input's onChange → recordCourseOutlineUpload
 * → recordCourseFileReplacement. Nothing in it is a save, which is the claim.
 * That the writer then produces a row standing alone is proved in
 * test/pure/courseVersionWriter.
 */
test('V8: the version write sits in the UPLOAD action, not the save path', () => {
  const src = code(OUTLINES);
  const record = src.indexOf('export async function recordCourseOutlineUpload');
  const call = src.indexOf('recordCourseFileReplacement(');

  assert.ok(record > 0, 'the upload-recording action is there');
  assert.ok(call > record, 'and the version write is inside it');
});

test('V8: the upload fires from the file input, with no save between', () => {
  const src = refs('src/components/admin/CourseOutlineUpload.jsx');
  assert.ok(src.includes('onChange={onPick}'), 'the picker is the trigger');
  assert.ok(src.includes('recordCourseOutlineUpload('), 'and onPick records the upload');
  for (const save of ['updateCourse', 'createCourse', 'saveCourseExtension']) {
    assert.equal(src.includes(save), false, `no ${save} stands between the pick and the record`);
  }
});

test('V8: the file row is written with the RAW code, so both writers share a history', () => {
  const src = code(OUTLINES);
  const call = src.slice(src.indexOf('recordCourseFileReplacement('));
  // `target.courseId` is lower-cased for the Cloudinary path; the save path
  // keys on the code as typed. Passing the derived one would file the two
  // writers into two histories of one course.
  assert.match(call.slice(0, 200), /courseId,/, 'the raw argument, canonicalised by the writer');
  assert.equal(
    call.slice(0, 200).includes('target.courseId'),
    false,
    'not the path-normalised form'
  );
});

// ── the never-block-a-save contract ─────────────────────────────────────────

test('the form swallows both version calls — history can never fail a save', () => {
  const src = code(FORM);
  const calls = src.split('captureCoursePreImage').slice(1)
    .concat(src.split('commitCourseVersion').slice(1));
  assert.ok(calls.length >= 4, 'CONTROL: there are call sites to inspect');
  for (const tail of calls) {
    assert.match(
      tail.slice(0, 300),
      /\.catch\(/,
      'every version call on the save path is caught'
    );
  }
});

test('the WRITE actions never throw out to the save path', () => {
  const src = code(ACTIONS);
  /**
   * Scoped to the two WRITE exports, which is a narrowing the read side forced
   * and an improvement on what stood here. This used to count `requireAdmin`
   * across the whole file and read that as "both exports swallow" — a count
   * that says nothing about WHICH function did the swallowing, and that would
   * have gone on passing if a writer had lost its guard while a reader gained
   * two.
   *
   * The read half deliberately does NOT swallow: an empty answer there would
   * read as "this course has no history" to someone who merely lacks
   * permission. That difference is asserted in test/fs/courseVersionReadSide.
   */
  const writeHalf = src.slice(0, src.indexOf('export async function listCourseVersions'));
  assert.ok(writeHalf.length > 0, 'CONTROL: the write half is still identifiable');
  assert.equal(countCallSites(writeHalf, 'requireAdmin'), 2);
  assert.ok(writeHalf.includes('catch'), 'and both wrap their work');
});

test('the writer is imported, not re-implemented, wherever a version is written', () => {
  for (const file of [ACTIONS, OUTLINES]) {
    assert.match(
      raw(file),
      /from '@\/lib\/courses\/courseVersionWriter'/,
      `${file} must go through the one writer`
    );
  }
});

// ── visibility follows the existing menu permission (B6) ────────────────────

/**
 * No new permission was invented. Both actions gate on `requireAdmin('courses')`
 * — the same page key `updateCourse`, `saveCourseExtension` and
 * `recordCourseOutlineUpload` already use, and the same key the audit log files
 * these rows under. A separate key would mean an admin who can edit a course
 * cannot record a version of their own edit.
 */
test('B6: the version actions gate on the SAME menu key the save path uses', () => {
  const src = code(ACTIONS);
  /**
   * FOUR since the read side landed: the two writers plus `listCourseVersions`
   * and `getCourseVersionDiff`. The count is pinned rather than floored so that
   * an export added WITHOUT a gate reddens this — an ungated read of this
   * collection would hand one admin another's course history.
   *
   * The read half's own guards live in test/fs/courseVersionReadSide, including
   * the part this cannot express: that a refusal is REPORTED there rather than
   * swallowed into an empty list, which is the opposite of what the write half
   * must do.
   */
  assert.equal(occurrences(src, "requireAdmin('courses')"), 4);
  assert.equal(
    /requireAdmin\('(?!courses')/.test(src),
    false,
    'no second page key was introduced'
  );
  // The key really is the one the save path holds.
  assert.ok(code('src/lib/actions/courses.js').includes("requireAdmin('courses')"));
  assert.ok(code(OUTLINES).includes("requireAdmin('courses')"));
});

// ── the standing import rule ────────────────────────────────────────────────

/**
 * Every identifier this work introduced at a call site has an import line of
 * its own. test/fs/libImportsResolved is the general guard; this names them
 * specifically, because the defect it exists for is an edit that REPLACES an
 * import line rather than adding one, and all of these landed beside
 * pre-existing statements.
 */
test('every identifier this round added is imported where it is used', () => {
  const form = raw(FORM);
  assert.match(form, /import \{ captureCoursePreImage, commitCourseVersion \} from '@\/lib\/actions\/course-versions';/);
  assert.match(form, /import \{ PRE_IMAGE \} from '@\/lib\/courses\/courseSnapshot';/);
  // The statements they were added BESIDE are still intact.
  assert.match(form, /import \{ createCourse, updateCourse \} from '@\/lib\/actions\/courses';/);
  assert.match(form, /saveCourseExtension,\s*\n\s*checkAliasAvailable,\s*\n\} from '@\/lib\/actions\/course-extensions';/);

  const outlines = raw(OUTLINES);
  assert.match(outlines, /import \{ recordCourseFileReplacement \} from '@\/lib\/courses\/courseVersionWriter';/);
  assert.match(
    outlines,
    /outlinePublicPath,\s*\n\} from '@\/lib\/courses\/courseOutline';/,
    'the statement it was added beside survived'
  );
  assert.match(outlines, /import CourseOutlineFile from '@\/models\/CourseOutlineFile';/);
});

// ── the audit log is untouched ──────────────────────────────────────────────

test('no audit row, schema or writer was changed by this work', () => {
  // The two pre-existing audit calls in the outline file are still there,
  // unchanged in count — the version write was added beside them, not in place
  // of one.
  assert.equal(countCallSites(code(OUTLINES), 'recordAdminActionAfter'), 2);

  assert.equal(
    /recordAdminAction|AdminAuditLog/.test(refs(ACTIONS)),
    false,
    'the version history writes nothing to the audit trail'
  );
});

test('the version collection is its own, and reuses no audit model', () => {
  const model = refs('src/models/CourseVersion.js');
  assert.match(model, /collection: 'course_versions'/);
  assert.equal(model.includes('admin_audit_logs'), false);
  assert.equal(model.includes('page_versions'), false);
});

test('the version model is not wired into the audit contract', () => {
  const contract = refs('src/lib/audit/auditContract.js');
  assert.equal(contract.includes('course_version'), false);
  assert.equal(contract.includes('CourseVersion'), false);
});
