import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * THE ANCHOR REACHES THE DATABASE, AND CANNOT BE ERASED BY A CALLER THAT DOES
 * NOT KNOW IT.
 *
 * A shape guard, stated as one: it proves the calls are written, not that they
 * run. What the anchor MEANS — set into an empty field, never over a value,
 * never guessed — is pure and is driven for real in
 * test/pure/upstreamAnchorPlan. This file is the seam neither that tier nor the
 * render tier can see: that the one caller holding the upstream `_id` actually
 * hands it over, and that the field is not in the blanket write.
 */

const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';
const ACTION = 'src/lib/actions/course-extensions.js';
const MODEL = 'src/models/CourseExtension.js';
const BACKFILL = 'scripts/backfill-extension-upstream-id.mjs';
const AUDIT = 'scripts/audit-extension-upstream-id.mjs';

// ══ ASSERTION: THE ANCHOR IS WRITTEN ON THE CREATE PATH ═══════════════════

test('the CREATE path hands over the _id MSDB just returned', () => {
  /**
   * `newId` is the id from the SAME response the redirect is built from. The
   * alternative — letting the action look the course up by code — is the very
   * lookup the anchor exists to stop depending on, and it would happily anchor
   * a renamed row to whatever now holds its old code.
   */
  const { code } = readSource(FORM);
  assert.match(code, /await saveExtensionFor\(code, newId\)/,
    'the create path writes the extension without the upstream id');
  assert.match(code, /const newId = courseRes\.id \?\? courseRes\.item\?\._id \?\? null;/,
    'newId no longer comes from the create response');
});

test('the create RETRY anchors to the course that was actually created', () => {
  // Not to whatever the code resolves to now — the retry runs after a failure,
  // which is exactly when the two can differ.
  const { code } = readSource(FORM);
  assert.match(code, /saveExtensionFor\(createdCourse\.code, createdCourse\.id\)/,
    'the retry path drops the anchor');
});

test('the EDIT path anchors from the ObjectId the route was opened with', () => {
  const { code } = readSource(FORM);
  assert.match(code, /saveExtensionFor\(courseId, initial\?\._id\)/,
    'the edit save cannot anchor a row that has none');
});

test('EVERY saveExtensionFor call site passes an id — none is left one-argument', () => {
  /**
   * The three above are named individually so a rename cannot satisfy the set;
   * this one catches a FOURTH call site added later with the argument omitted,
   * which would write nothing and look fine.
   */
  const { code } = readSource(FORM);
  const calls = [...code.matchAll(/saveExtensionFor\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    // the definition itself, `(code, upstreamId) =>`
    .filter((args) => args !== 'code, upstreamId');
  assert.ok(calls.length >= 3, `expected at least the three call sites, found ${calls.length}`);
  for (const args of calls) {
    assert.ok(args.includes(','), `saveExtensionFor(${args}) is called without an upstream id`);
  }
});

test('the payload carries it under the name the action reads', () => {
  const { code } = readSource(FORM);
  assert.match(code, /upstreamId: String\(upstreamId \?\? ''\)/,
    'the id is passed but never lands in the payload');
});

// ── It cannot be erased by a caller that does not have it ──────────────────

test('upstreamId is NOT in the blanket `update` object', () => {
  /**
   * THE FAILURE THIS FORBIDS. `update` names every field it writes, and a field
   * it names is written whether or not the caller supplied one — that is how an
   * omitted value becomes ''. Two of this action's three callers cannot know
   * the upstream `_id`: ExtensionEditor (the payment tab) is routed by the CODE
   * and has never seen one. With `upstreamId` in that object literal, saving
   * the payment toggle would erase the anchor of every course it touched.
   */
  const { code } = readSource(ACTION);
  const start = code.indexOf('const update = {');
  assert.notEqual(start, -1, 'the update object is gone — has the action been rewritten?');
  const literal = code.slice(start, code.indexOf('};', start));
  assert.ok(!/upstreamId/.test(literal),
    'upstreamId sits in the blanket write — a caller that omits it would blank every anchor');
  // and the literal really is the whole-document write it is being checked for
  assert.match(literal, /metaTitle:/);
  assert.match(literal, /isPublished:/);
});

test('the anchor is decided against what is STORED, and only added on SET', () => {
  const { code } = readSource(ACTION);
  assert.equal(countCallSites(code, 'resolveAnchorWrite'), 1, 'the decision is not made exactly once');
  assert.match(code, /stored: beforeDoc\?\.upstreamId/,
    'the decision does not consult the row that is already there');
  assert.match(code, /supplied: data\?\.upstreamId/);
  assert.match(code, /if \(anchor\.action === ANCHOR\.SET\) \{\s*update\.upstreamId = anchor\.value;/,
    'the anchor is written on some verdict other than SET');
});

test('a CONFLICT on the write path is logged and neither value is written', () => {
  const { code } = readSource(ACTION);
  const at = code.indexOf('ANCHOR.CONFLICT');
  assert.notEqual(at, -1, 'the write path no longer recognises a disagreement');
  const branch = code.slice(at, at + 400);
  assert.match(branch, /console\.error\(/, 'a disagreeing anchor is swallowed silently');
  assert.ok(!/update\.upstreamId\s*=/.test(branch), 'the conflict branch writes the anchor anyway');
});

// ── The field itself ───────────────────────────────────────────────────────

test('the model declares upstreamId as a plain indexed string, not a ref', () => {
  // The referent is in a DIFFERENT database reached over HTTP; a `ref` invites
  // a populate() that can never resolve.
  const { code } = readSource(MODEL);
  assert.match(code, /upstreamId: \{ type: String, default: '', trim: true, index: true \}/,
    'upstreamId is not declared the way the anchor is written and read');
  assert.ok(!/upstreamId[\s\S]{0,80}ref:/.test(code), 'upstreamId carries a ref across databases');
});

// ── The backfill writes only what the plan sanctioned ──────────────────────

test('the backfill writes ONLY plan.write, and only the one field', () => {
  const { code } = readSource(BACKFILL);
  assert.match(code, /for \(const entry of plan\.write\)/,
    'the backfill iterates something other than the sanctioned set');
  // A METHOD call, so counted here rather than with countCallSites — that
  // helper excludes dotted calls on purpose and would report 0 forever.
  const writes = [...code.matchAll(/\.(updateOne|updateMany|bulkWrite|deleteOne|deleteMany|save)\s*\(/g)];
  assert.deepEqual(writes.map((m) => m[1]), ['updateOne'],
    `the backfill performs ${writes.length} writes: ${writes.map((m) => m[1]).join(', ')}`);
  assert.match(code, /\{ \$set: \{ upstreamId: entry\.upstreamId \} \}/,
    'the backfill writes more than the anchor');
  // It re-checks emptiness IN THE FILTER, so a row anchored between the read
  // and the write is skipped rather than overwritten.
  assert.match(code, /\$or: \[\{ upstreamId: \{ \$exists: false \} \}, \{ upstreamId: '' \}, \{ upstreamId: null \}\]/,
    'the write does not re-assert that the field is still empty');
});

test('a DRY RUN returns before the write — writing is opt-in', () => {
  const { code } = readSource(BACKFILL);
  const guard = code.indexOf('if (!APPLY)');
  const write = code.indexOf('CourseExtension.updateOne');
  assert.notEqual(guard, -1, 'the dry-run guard is gone');
  assert.notEqual(write, -1, 'the write is gone');
  assert.ok(guard < write, 'the write happens before the dry-run guard can stop it');
  assert.match(code, /const APPLY = process\.argv\.includes\('--apply'\)/);
});

test('the AUDIT script writes nothing at all', () => {
  /**
   * It is what the decision to backfill rests on. A write in the measurement
   * would mean the number it reports was partly produced by itself.
   */
  const { code } = readSource(AUDIT);
  for (const verb of [
    'save', 'create', 'insertOne', 'insertMany', 'bulkWrite', 'updateOne', 'updateMany',
    'findOneAndUpdate', 'deleteOne', 'deleteMany', 'msdbCreate', 'msdbUpdate', 'msdbDelete',
  ]) {
    assert.ok(
      !new RegExp(String.raw`(?<![\w$])${verb}\s*\(`).test(code),
      `the anchor audit can reach ${verb}( — it must only read`
    );
  }
  assert.ok(!/--apply/.test(code), 'the audit gained an apply mode');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the sources were read and the matchers are live', () => {
  for (const rel of [FORM, ACTION, MODEL, BACKFILL, AUDIT]) {
    const { code } = readSource(rel);
    assert.ok(code.length > 500, `${rel} scrubbed to ${code.length} chars`);
  }
  // countCallSites finds nothing for a name that is not there, so the counts
  // above are measurements rather than constants.
  assert.equal(countCallSites(readSource(ACTION).code, 'resolveAnchorNothing'), 0);
  // and the ban list in the audit test can fire: it finds writes in a writer.
  const writer = readSource('src/lib/actions/course-rename.js').code;
  const found = ['updateOne', 'updateMany'].filter((v) => new RegExp(String.raw`(?<![\w$])${v}\s*\(`).test(writer));
  assert.ok(found.length >= 2, `the ban list found only ${found.length} write verbs in a known writer`);
});

/**
 * ══ THIS CONTROL WAS DELIBERATELY INVERTED ═════════════════════════════════
 *
 * It used to assert that NOTHING consumed the anchor — the scope line of the
 * round that backfilled it, and correct while the field was being made true
 * ahead of its readers. That round is over: the anchor is now the identity
 * proof the rename write is addressed by.
 *
 * The property that replaces it is the one that still matters — the anchor is
 * consumed in the SANCTIONED places and nowhere else. `resolveCourse` and the
 * public read path in particular must not start routing on it: it is an
 * identity signal for the admin write path, not a lookup key, and a public
 * reader that fell back to it would be resolving courses by a field with no
 * uniqueness constraint.
 */
test('the anchor is consumed ONLY where the rename needs it', () => {
  const SANCTIONED = [
    'src/lib/actions/course-rename-preview.js',   // reads it onto the preview
    'src/lib/actions/course-rename.js',           // addresses the upstream write by it
    'src/lib/courses/upstreamAnchorPlan.js',      // the backfill decisions
    'src/lib/actions/course-extensions.js',       // writes it
    'src/models/CourseExtension.js',              // declares it
    'src/app/admin/courses/_components/CourseForm.jsx',
  ];
  const FORBIDDEN = [
    // Public resolution must never route on the anchor.
    'src/lib/resolveCourse.js',
    'src/lib/search/searchCorpus.js',
    'src/lib/api/public-courses.js',
  ];
  for (const rel of FORBIDDEN) {
    const { code } = readSource(rel);
    assert.ok(!/upstreamId/.test(code), `${rel} reads the anchor — it is not a public lookup key`);
  }
  // and the sanctioned set really does use it, so the ban above is a boundary
  // rather than a description of a field nobody touches.
  const users = SANCTIONED.filter((rel) => /upstreamId/.test(readSource(rel).code));
  assert.ok(users.length >= 5, `only ${users.length} sanctioned modules use the anchor: ${users.join(', ')}`);
});
