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
const ALLOWED = {
  createPrivateCourse: [...COMMON, 'courseIdRefusal', 'insertPrivateCourse'],
  updatePrivateCourse: [...COMMON, 'updatePrivateCourseDoc'],
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
