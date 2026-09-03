import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { courseTag, publicCourseTag, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';

/**
 * `updateCourse` (src/lib/actions/courses.js) is the only write path for an
 * admin course edit. Before this guard, it called `revalidatePath` for the
 * two ADMIN routes only — never a `revalidateTag`/`bustUpstream` — so
 * `getCourseByCode` and `getPublicCourse` kept serving the pre-edit row from
 * the Data Cache for up to 3600s. The gap is masked today by MSDB's
 * `course.updated` webhook (src/lib/webhooks/handlers.js) busting the same
 * tags on its own delivery, but this domain is not a confirmed production
 * subscriber, so the write side has to close it on its own.
 *
 * ── WHAT THIS FILE CAN AND CANNOT PROVE ─────────────────────────────────────
 * There is no request context here, so nothing in this suite can show a
 * cached read actually going stale-then-fresh across a real revalidateTag
 * call — that would need a running Next server. What IS checkable without one
 * is the thing that silently breaks this kind of fix: a tag string retyped by
 * hand at the write site drifting from the literal the read site actually
 * registers. `revalidateTag('course:' + id)` and a read tagged
 * `` `course:${id}` `` look identical in a diff and bust nothing for each
 * other the moment either side reformats. So this is a NAME-LEVEL proof only:
 * (a) updateCourse calls the shared builders, not retyped literals, and
 * (b) those builders produce the exact string the read side's own template
 * would produce for the same input — checked byte-for-byte, not by pattern.
 */

const ACTIONS = readSource('src/lib/actions/courses.js');
const READS = readSource('src/lib/api/public-courses.js');

/** The body of `updateCourse`, isolated from `createCourse` and `deleteCourse`. */
const UPDATE_COURSE = (() => {
  const start = ACTIONS.code.indexOf('export async function updateCourse(');
  assert.notEqual(start, -1, 'updateCourse is gone — has this file been rewritten?');
  const end = ACTIONS.code.indexOf('export async function deleteCourse(', start);
  assert.notEqual(end, -1, 'deleteCourse is gone, so the updateCourse body cannot be bounded');
  return ACTIONS.code.slice(start, end);
})();

// ── R1: updateCourse busts the tags a stale read would otherwise serve ──────

test('updateCourse busts the list tag, both per-record tags, and the ObjectId form', () => {
  assert.match(
    UPDATE_COURSE,
    /UPSTREAM_TAGS\.PUBLIC_COURSES/,
    'the catalogue list tag is never busted — every list surface keeps the stale row'
  );
  assert.match(
    UPDATE_COURSE,
    /courseTag\(\s*body\.course_id\s*\)/,
    'courseTag(body.course_id) is missing — getCourseByCode(course_id) keeps serving the pre-edit row'
  );
  assert.match(
    UPDATE_COURSE,
    /publicCourseTag\(\s*body\.course_id\s*\)/,
    'publicCourseTag(body.course_id) is missing — getPublicCourse(code) keeps serving the pre-edit row'
  );
  assert.match(
    UPDATE_COURSE,
    /publicCourseTag\(\s*id\s*\)/,
    'publicCourseTag(id) is missing — the admin edit route hands getPublicCourse an ObjectId, not the code'
  );
});

test('the bust runs through the shared bustUpstream/courseTag/publicCourseTag builders, not retyped strings', () => {
  // A hand-typed `'course:' + body.course_id` or `revalidateTag('public-courses')`
  // would satisfy a looser "contains the word course" check while being exactly
  // the drift this guard exists to catch. Requiring the CALL forms means any
  // retyping shows up as a text change here too.
  assert.match(UPDATE_COURSE, /\bbustUpstream\(/, 'updateCourse no longer calls bustUpstream at all');
  assert.doesNotMatch(
    UPDATE_COURSE,
    /revalidateTag\(\s*['"`]/,
    'a literal string was passed to revalidateTag directly instead of a shared tag builder'
  );
});

test('the derived public course path is revalidated too', () => {
  assert.match(
    UPDATE_COURSE,
    /revalidatePath\(\s*derivedCoursePath\(\s*body\.course_id\s*\)\s*\)/,
    'the public detail page (Full Route cache) is never revalidated by path'
  );
});

// ── R2: byte-identical to what the read side actually registers ────────────

/**
 * Pull the literal tag TEMPLATE off one read function in public-courses.js —
 * e.g. `` tags: [`course:${courseId}`] `` — and normalise the interpolated
 * part away, the same technique test/pure/upstreamTagBusters.test.mjs uses to
 * compare the read-tag vocabulary against its busters.
 */
function readSideTemplate(functionName) {
  const start = READS.code.indexOf(`export async function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} is gone from public-courses.js`);
  const end = READS.code.indexOf('\n}', start);
  const body = READS.code.slice(start, end);
  const m = /tags:\s*\[`([^`]*)`\]/.exec(body);
  assert.ok(m, `${functionName} no longer tags its read with a template literal`);
  return m[1]; // e.g. "course:${courseId}"
}

const normalise = (s) => s.replace(/\$\{[^}]*\}/g, '<id>');

test('courseTag(x) is byte-identical, for any x, to what getCourseByCode tags its read with', () => {
  const template = readSideTemplate('getCourseByCode');
  assert.equal(normalise(template), 'course:<id>', 'the read-side template shape moved — update this guard');
  // The real byte-for-byte check: instantiate the READ SIDE's own template
  // string with a probe value and compare against the WRITE SIDE's builder
  // output for that same value. Equal here means a read tagged by this
  // template is guaranteed to be busted by this builder — and unequal would
  // mean they resolve to two different tag strings that never bust each
  // other, silently, forever.
  assert.equal(courseTag('MSE-L1'), template.replace('${courseId}', 'MSE-L1'));
});

test('publicCourseTag(x) is byte-identical, for any x, to what getPublicCourse tags its read with', () => {
  const template = readSideTemplate('getPublicCourse');
  assert.equal(normalise(template), 'public-course:<id>', 'the read-side template shape moved — update this guard');
  assert.equal(publicCourseTag('6a7a97f0b830e289fc383406'), template.replace('${idOrCode}', '6a7a97f0b830e289fc383406'));
});

test('UPSTREAM_TAGS.PUBLIC_COURSES is byte-identical to the list read\'s literal tag', () => {
  assert.match(READS.code, /tags:\s*\[\s*'public-courses'\s*\]/, 'listPublicCourses no longer tags with the literal \'public-courses\'');
  assert.equal(UPSTREAM_TAGS.PUBLIC_COURSES, 'public-courses');
});

// ── CONTROL: proves the presence checks above can actually go red ──────────

test('CONTROL: a pre-fix updateCourse (admin-path revalidation only) fails every presence check', () => {
  // Reconstructs exactly the code this guard replaced: two revalidatePath
  // calls for the admin routes, nothing that touches the read-side tags.
  const preFix = `
export async function updateCourse(id, formData) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };
  const body = shapePayload(formData);
  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbUpdate('public-course', id, payload);
    revalidatePath(ADMIN_PATH);
    revalidatePath(\`\${ADMIN_PATH}/\${id}/edit\`);
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'error' };
  }
}
export async function deleteCourse(id) {`;

  assert.doesNotMatch(preFix, /UPSTREAM_TAGS\.PUBLIC_COURSES/);
  assert.doesNotMatch(preFix, /courseTag\(\s*body\.course_id\s*\)/);
  assert.doesNotMatch(preFix, /publicCourseTag\(\s*body\.course_id\s*\)/);
  assert.doesNotMatch(preFix, /publicCourseTag\(\s*id\s*\)/);
  assert.doesNotMatch(preFix, /\bbustUpstream\(/);
  assert.doesNotMatch(preFix, /revalidatePath\(\s*derivedCoursePath\(/);
});
