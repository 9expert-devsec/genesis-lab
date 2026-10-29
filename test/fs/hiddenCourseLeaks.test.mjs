import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * WIRING for the hidden-course leaks closed after listPublicCourses learned to
 * drop hidden courses. The units themselves are proved in
 * test/pure/hiddenCourseLeaks; every call site below is an async server
 * component, route handler or 'use server' action that awaits network or Mongo,
 * so what CAN be pinned is that each one goes through the hidden-aware unit and
 * not around it. Each assertion reads `code` (comments and imports stripped),
 * so a comment or an import line alone cannot satisfy it.
 *
 * The admin side is pinned in the other direction at the end: the rule is
 * "gone from everything PUBLIC", and an admin screen that started filtering
 * would lose data silently.
 */

/** The body of `[export] [async] function <name>(` in scrubbed source. */
function functionBody(code, name) {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(code);
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

test('related courses: the detail page drops hidden rows before they reach the rail', () => {
  const { code } = readSource('src/app/(public)/[...slug]/page.jsx');
  assert.match(
    code,
    /relatedCoursesWithAliases=\{attachAliases\(\s*dropHiddenCourses\(course\.related_courses,\s*await loadHiddenCourseIds\(\)\)/
  );
});

test('MCP: the tools\' by-code resolver is the PUBLIC one, and rounds get the hidden set', () => {
  const { code } = readSource('src/lib/mcp/register.js');
  const deps = /export const productionDeps = \{([\s\S]*?)\};/.exec(code);
  assert.ok(deps, 'productionDeps is still one object literal');
  assert.match(deps[1], /getCourseByCodeInsensitive:\s*getPublicCourseByCode,/);
  assert.match(deps[1], /\bloadHiddenCourseIds,/);
  assert.ok(!/getCourseByCodeInsensitive,/.test(deps[1]), 'not the plain resolver by shorthand');
});

test('MCP list_training_rounds drops a hidden course\'s rounds in the row loop', () => {
  const { code } = readSource('src/lib/mcp/tools/listTrainingRounds.js');
  assert.match(code, /deps\.loadHiddenCourseIds\(\)/);
  assert.match(code, /if \(isHiddenCourse\(hidden, row\.course\.course_id\)\) continue;/);
});

test('mega-menu hover card: getCoursePreview uses the PUBLIC lookup only', () => {
  const body = functionBody(readSource('src/lib/actions/nav-course-preview.js').code, 'getCoursePreview');
  assert.match(body, /getPublicCourseByCode\(courseId\)/);
  assert.ok(!/\bgetCourseByCode\(/.test(body), 'never the raw upstream getter');
});

test('page-builder: resolveSectionData resolves every course through fetchCourses', () => {
  const { code } = readSource('src/lib/pageBuilder/resolveSectionData.js');
  assert.match(code, /fetchCourses\(allCourseIds\)/);
  assert.equal(countCallSites(code, 'getCourseByCode'), 0, 'no direct by-code call outside the default dep');
});

test('promotions corpus: the built items pass through the hidden filter', () => {
  const { code } = readSource('src/lib/corpus/promotions.js');
  assert.match(code, /items:\s*sortItems\(dropHiddenPromotionCourses\(items, await loadHidden\(\)\)\)/);
});

test('career paths: the PUBLIC getters drop hidden courses; the admin getter does not', () => {
  const { code } = readSource('src/lib/career-paths/getCareerPaths.js');
  assert.match(functionBody(code, 'getActiveCareerPaths'), /dropHiddenCurriculumCourses\(doc, hidden\)/);
  assert.match(functionBody(code, 'getCareerPathBySlug'), /dropHiddenCurriculumCourses\(/);
  assert.ok(!/Hidden/.test(functionBody(code, 'getAllCareerPaths')), 'admin list stays unfiltered');
});

test('career-path registration: the form and its submit check read the filtered curriculum', () => {
  const body = functionBody(readSource('src/lib/actions/career-paths.js').code, 'getCareerPathWithSchedules');
  assert.match(body, /const cp = dropHiddenCurriculumCourses\(stored, hidden\);/);
});

test('public registration page: a hidden course is a miss, so it bounces', () => {
  const { code } = readSource('src/app/(public)/registration/public/RegisterPageContent.jsx');
  assert.match(code, /course = await getPublicCourseByCode\(attempted\);/);
  assert.ok(!/getCourseByCodeInsensitive\(/.test(code));
});

test('public + in-house registration POSTs refuse a hidden course BEFORE writing', () => {
  for (const [rel, arg, model] of [
    ['src/app/api/registration/public/route.js', /namesHiddenCourse\(\[data\.courseId, data\.courseCode\]\)/, 'RegisterPublic.create('],
    ['src/app/api/registration/inhouse/route.js', /namesHiddenCourse\(data\.coursesInterested\)/, 'RegisterInhouse.create('],
  ]) {
    const { code } = readSource(rel);
    const guard = arg.exec(code);
    assert.ok(guard, `${rel} calls the guard`);
    const write = code.indexOf(model);
    assert.ok(write > 0, `${rel} still writes`);
    assert.ok(guard.index < write, `${rel}: the guard runs before the write`);
  }
});

test('checkout pricing resolves the course through the PUBLIC lookup', () => {
  const { code } = readSource('src/lib/registration/resolve-price.js');
  assert.match(code, /getPublicCourseByCode\(courseCode\)/);
  assert.ok(!/\bgetCourseByCode\(/.test(code));
});

// ── the admin side keeps seeing hidden courses ─────────────────────────────

test('TRAP: admin registration screens still resolve a hidden course', () => {
  // An existing registration for a since-hidden course must still show its
  // course to staff; the round-change action must still verify the round.
  assert.match(readSource('src/app/admin/registrations/[id]/page.jsx').code, /getCourseByCodeInsensitive\(doc\.courseId\)/);
  assert.match(readSource('src/lib/actions/registrations.js').code, /getCourseByCodeInsensitive\(doc\.courseId\)/);
});

test('CONTROL: functionBody really captures a body, not an empty match', () => {
  const body = functionBody(readSource('src/lib/actions/nav-course-preview.js').code, 'getCoursePreview');
  assert.ok(body.length > 100);
  assert.match(body, /course_cover_url/);
});
