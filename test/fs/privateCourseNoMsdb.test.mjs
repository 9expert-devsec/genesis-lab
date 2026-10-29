import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * A PRIVATE COURSE MUST NEVER REACH MSDB.
 *
 * The three private actions sit in src/lib/actions/courses.js beside the MSDB
 * ones (they share its module-private `shapePayload`), so "the file imports
 * msdbCreate" proves nothing either way. What is pinned instead is the exact
 * set of functions each private action body CALLS: an ALLOWLIST, not a ban
 * list, so any new call — an msdbCreate, a resolveCourseRefs, a bustUpstream,
 * or something not yet written — turns this red until someone decides it
 * belongs. The store module they call is pinned by its imports.
 *
 * Bodies are read from `code` (comments stripped), so a comment naming
 * msdbCreate neither trips nor satisfies anything.
 */

const ACTIONS = readSource('src/lib/actions/courses.js').code;
const STORE = readSource('src/lib/courses/privateCourseStore.js');
const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx').code;

const MSDB_WRITERS = /\b(msdbCreate|msdbUpdate|msdbDelete|resolveCourseRefs|bustUpstream)\s*\(/;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof']);

/** The body of `[export] async function <name>(` in scrubbed source. */
function functionBody(code, name) {
  const m = new RegExp(`(?:export\\s+)?async\\s+function\\s+${name}\\s*\\(`).exec(code);
  assert.ok(m, `${name} not found`);
  const open = code.indexOf('{', code.indexOf(')', m.index));
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  assert.fail(`unbalanced braces reading ${name}`);
}

/** Every identifier called in a body (`name(` or `.name(`), keywords removed. */
function calledNames(body) {
  return new Set(
    [...body.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter((n) => !KEYWORDS.has(n))
  );
}

const COMMON = ['requireAdmin', 'shapePayload', 'revalidatePath', 'recordAdminActionAfter', 'courseLabel', 'courseFields', 'String'];
// Round 2b: the program/skill split and the exactly-one-program rule — both pure.
const PROGRAM_RULE = ['privateTaxonomyFields', 'exactlyOneProgram'];
const ALLOWED = {
  createPrivateCourse: [...COMMON, ...PROGRAM_RULE, 'courseIdRefusal', 'insertPrivateCourse'],
  // derivedCoursePath only builds '/<code>-training-course' for revalidatePath.
  updatePrivateCourse: [...COMMON, ...PROGRAM_RULE, 'updatePrivateCourseDoc', 'derivedCoursePath'],
  deletePrivateCourse: [...COMMON, 'removePrivateCourse', 'deleteCourseExtension'],
  // The shared duplicate guard. Its MSDB call is the uncached READ the normal
  // create has always made; it writes nothing.
  courseIdRefusal: ['all', 'findCourseCodeInsensitive', 'findCourseExtensionCodeInsensitive',
    'findPrivateCourseCodeInsensitive', 'courseIdConflict'],
};

for (const [name, allowed] of Object.entries(ALLOWED)) {
  test(`${name} calls only what it is allowed to — and no MSDB writer`, () => {
    const body = functionBody(ACTIONS, name);
    assert.doesNotMatch(body, MSDB_WRITERS, `${name} reaches an MSDB writer`);
    const extra = [...calledNames(body)].filter((n) => !allowed.includes(n));
    assert.deepEqual(extra, [], `${name} calls something not on its allowlist`);
  });
}

test('the private store imports no upstream client at all', () => {
  assert.doesNotMatch(
    STORE.withImports,
    /from '@\/lib\/api\/(msdb-write|client|resolveIds|bustUpstream|public-courses)'/,
    'privateCourseStore must not import an MSDB client'
  );
  assert.doesNotMatch(STORE.code, /\b(aiFetch|msdbCreate|msdbUpdate|msdbDelete)\b/);
  assert.match(STORE.code, /import\('@\/models\/PrivateCourse'\)/, 'CONTROL: it does reach its own model');
});

// ── round 2b: custom private programs / skills ─────────────────────────────

const TAXONOMY_ACTIONS = readSource('src/lib/actions/private-taxonomy.js');
const TAXONOMY_STORE = readSource('src/lib/courses/privateTaxonomyStore.js');
const T_COMMON = ['requireAdmin', 'revalidatePath', 'recordAdminActionAfter', 'String', 'fields', 'plain'];
const T_ALLOWED = {
  createPrivateTaxonomyItem: [...T_COMMON, 'validateTaxonomyInput', 'insertTaxonomyItem'],
  updatePrivateTaxonomyItem: [...T_COMMON, 'getTaxonomyItem', 'validateTaxonomyInput', 'updateTaxonomyItem'],
  deletePrivateTaxonomyItem: [...T_COMMON, 'taxonomyDeleteRefusal', 'coursesReferencingTaxonomy', 'removeTaxonomyItem'],
};

for (const [name, allowed] of Object.entries(T_ALLOWED)) {
  test(`${name} calls only what it is allowed to — and no MSDB writer`, () => {
    const body = functionBody(TAXONOMY_ACTIONS.code, name);
    assert.doesNotMatch(body, MSDB_WRITERS, `${name} reaches an MSDB writer`);
    const extra = [...calledNames(body)].filter((n) => !allowed.includes(n));
    assert.deepEqual(extra, [], `${name} calls something not on its allowlist`);
  });
}

test('the taxonomy actions and store import no upstream client', () => {
  for (const src of [TAXONOMY_ACTIONS, TAXONOMY_STORE]) {
    assert.doesNotMatch(src.withImports, /from '@\/lib\/api\/(msdb-write|client|resolveIds|bustUpstream|public-courses)'/);
    assert.doesNotMatch(src.code, /\b(aiFetch|msdbCreate|msdbUpdate|msdbDelete)\b/);
  }
  assert.match(TAXONOMY_STORE.code, /import\('@\/models\/PrivateTaxonomy'\)/, 'CONTROL: it does reach its own model');
});

// ── the NORMAL course payload is untouched ─────────────────────────────────

test("shapePayload's output keys for a normal course are exactly what they were", () => {
  /**
   * The private taxonomy rides OUTSIDE shapePayload — a `private:` value on the
   * shared `program` select, split by the private actions, and `private_skills`
   * inputs shapePayload never reads. So the MSDB body must not have gained a
   * key, and shapePayload must not mention the private store at all.
   */
  const start = ACTIONS.indexOf('function shapePayload(');
  assert.notEqual(start, -1, 'shapePayload moved');
  const ret = ACTIONS.indexOf('return {', start);
  let depth = 0;
  let end = ret + 'return '.length;
  for (; end < ACTIONS.length; end += 1) {
    if (ACTIONS[end] === '{') depth += 1;
    else if (ACTIONS[end] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = ACTIONS.slice(start, end);
  const keys = [...ACTIONS.slice(ret, end).matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys, [
    'course_name', 'course_id', 'course_teaser', 'course_trainingdays', 'course_traininghours',
    'course_levels', 'course_price', 'course_netprice', 'course_cover_url', 'sort_order',
    'course_type_public', 'course_type_inhouse', 'course_workshop_status', 'course_certificate_status',
    'course_promote_status', 'program', 'skills', 'previous_course', 'related_courses',
    'course_objectives', 'course_target_audience', 'course_prerequisites', 'course_system_requirements',
    'training_topics', 'course_outline_th', 'course_outline_en',
  ]);
  assert.doesNotMatch(body, /private/i, 'shapePayload mentions the private store');
});

test('CONTROL: the allowlist scan sees a real body and a real MSDB call', () => {
  // Without this, a body extractor returning '' would pass every test above.
  const create = functionBody(ACTIONS, 'createCourse');
  assert.match(create, MSDB_WRITERS, 'the NORMAL create does call msdbCreate');
  assert.ok(calledNames(functionBody(ACTIONS, 'createPrivateCourse')).has('insertPrivateCourse'));
});

// ── both create paths share the three-store guard ──────────────────────────

test('BOTH create actions run the shared guard before their write', () => {
  for (const [name, write] of [['createCourse', "msdbCreate('public-course'"], ['createPrivateCourse', 'insertPrivateCourse(']]) {
    const body = functionBody(ACTIONS, name);
    const guard = body.indexOf('courseIdRefusal(body)');
    assert.ok(guard > 0, `${name} runs courseIdRefusal`);
    assert.ok(guard < body.indexOf(write), `${name}: the guard runs before the write`);
  }
});

// ── the default type still routes to MSDB ──────────────────────────────────

test('the form defaults to a NORMAL course, which saves through createCourse', () => {
  assert.match(FORM, /privateCourse = false,/, 'the prop defaults to false');
  assert.match(FORM, /useState\(privateCourse \? 'private' : 'normal'\)/);
  assert.match(FORM, /const isPrivate = courseKind === 'private';/);
  assert.match(
    FORM,
    /const courseRes = isPrivate\s*\?\s*await createPrivateCourse\(fd\)[\s\S]{0,200}?:\s*await createCourse\(fd\)/,
    'create picks the store by the type, normal → createCourse'
  );
  assert.match(
    FORM,
    /const courseRes = isPrivate\s*\?\s*await updatePrivateCourse\(initial\?\._id, fd\)[\s\S]{0,200}?:\s*await updateCourse\(initial\?\._id, fd\)/
  );
});

test('only the private edit route opens the form as private', () => {
  assert.match(readSource('src/app/admin/courses/private/[id]/edit/page.jsx').code, /<CourseForm[\s\S]*?privateCourse[\s\S]*?\/>/);
  for (const rel of ['src/app/admin/courses/new/page.jsx', 'src/app/admin/courses/[courseId]/edit/page.jsx']) {
    assert.doesNotMatch(readSource(rel).code, /privateCourse/, `${rel} must not open the private store`);
  }
});
