import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Two things the render tier cannot reach, both in async Server Components that
 * await network I/O before rendering anything:
 *
 *   1. RegisterPageContent's diagnostic logging, and the exact SHAPE that makes
 *      it correct — the try wrapping only the fetch.
 *   2. That BOTH course lookups (registration page + resolveCourse path 2) go
 *      through the case-tolerant helper. Fixing only the registration page
 *      leaves five course detail pages 404ing.
 *
 * The helper's own behaviour is tested properly in
 * test/pure/courseIdCaseFallback.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = read('src/app/(public)/registration/public/RegisterPageContent.jsx');
const RESOLVE = read('src/lib/resolveCourse.js');
const ADAPTER = read('src/lib/api/public-courses.js');

// ── Commit 1: the diagnostic warn ──────────────────────────────────────────

test('a lookup MISS is logged with the attempted id and the raw slug', () => {
  assert.match(PAGE, /console\.warn\(\s*`\[registration\] no course for course_id="\$\{attempted\}"/);
  assert.match(PAGE, /from \?course=\$\{courseSlug\}/, 'both casings are in the line');
  assert.match(PAGE, /redirecting to \/training-course/, 'and what happened next');
});

test('a lookup THROW is logged separately, as an upstream failure', () => {
  // The whole point of splitting them: an outage must not read as a bad link.
  assert.match(PAGE, /console\.warn\(\s*`\[registration\] upstream lookup FAILED for course_id="\$\{attempted\}"/);
  assert.match(PAGE, /\$\{err\?\.message\}/, 'the cause is named');
  assert.match(PAGE, /^\s*throw err;$/m, 'and the error still propagates');
});

test('CONTROL: the two log lines are genuinely different strings', () => {
  // A copy-paste that logged the same text for both outcomes would satisfy the
  // two tests above while destroying the distinction they exist for.
  const lines = [...PAGE.matchAll(/\[registration\] ([^`]*)/g)].map((m) => m[1]);
  assert.equal(lines.length, 2, 'exactly two [registration] log lines');
  assert.notEqual(lines[0], lines[1]);
});

test('the try wraps ONLY the fetch — redirect() must stay outside it', () => {
  // redirect() throws NEXT_REDIRECT. Inside the try, the catch swallows it and
  // reports a successful redirect as an upstream failure. This is the shape the
  // comment in that file is defending.
  const tryBlock = /try \{([\s\S]*?)\} catch \(err\) \{/.exec(PAGE);
  assert.ok(tryBlock, 'there is a try/catch around the lookup');
  assert.ok(!tryBlock[1].includes('redirect('), 'no redirect() inside the try');
  assert.match(tryBlock[1], /course = await getCourseByCodeInsensitive\(attempted\)/,
    'and the fetch IS inside it');
});

test('CONTROL: redirect() is present in the file, just not in the try', () => {
  // Without this, the assertion above passes for a file that never redirects.
  assert.match(PAGE, /redirect\('\/training-course'\)/);
});

test('the comment explaining the two-block shape survives', () => {
  // It is the only thing standing between this and a well-meaning "simplify".
  assert.match(PAGE, /NEXT_REDIRECT/, 'the reason is named in the file');
});

// ── Commit 2: both call sites use the case-tolerant helper ─────────────────

test('the registration page looks up through the case-tolerant helper', () => {
  assert.match(PAGE, /import \{ getCourseByCodeInsensitive \} from '@\/lib\/api\/public-courses'/);
  assert.match(PAGE, /await getCourseByCodeInsensitive\(attempted\)/);
});

test('resolveCourse path 2 uses it too — the detail pages need it as much', () => {
  // Import shape is asserted by the alias-path test below, which pins that BOTH
  // lookups are imported; this one pins the call.
  assert.match(RESOLVE, /getCourseByCodeInsensitive/, 'the helper is in scope');
  assert.match(RESOLVE, /await getCourseByCodeInsensitive\(courseId\)\.catch\(\(\) => null\)/);
});

test('the registration page no longer calls the raw case-sensitive lookup', () => {
  // Anchored on the CALL, not the identifier: getCourseByCodeInsensitive
  // contains "getCourseByCode" as a substring, so a naive scan matches itself.
  assert.ok(!/getCourseByCode\(/.test(PAGE), 'no direct exact-match call remains');
});

test('resolveCourse keeps the raw lookup for the ALIAS path only', () => {
  // Path 1 resolves from CourseExtension.courseId — the upstream id as stored,
  // never a lowercased URL fragment — so it has no casing to recover and stays
  // on the exact lookup. Path 2 derives its id from the URL and must not.
  //
  // This is also a live-wire guard: an earlier version of this change swapped
  // the import to the helper alone, leaving path 1 calling an undefined
  // `getCourseByCode`. The `.catch(() => null)` around it swallowed the
  // ReferenceError, so every aliased course page would have 404'd silently.
  assert.match(RESOLVE, /import \{\s*getCourseByCode,\s*getCourseByCodeInsensitive,\s*\} from '@\/lib\/api\/public-courses'/,
    'BOTH are imported');
  assert.match(RESOLVE, /await getCourseByCode\(byAlias\.courseId\)/, 'path 1: exact');
  assert.match(RESOLVE, /await getCourseByCodeInsensitive\(courseId\)/, 'path 2: tolerant');
});

test('CONTROL: every function resolveCourse calls is actually imported', () => {
  // The generalised form of the bug above — a call to a name this module never
  // imported and never defines is a ReferenceError waiting behind a .catch().
  const imported = new Set(
    [...RESOLVE.matchAll(/import \{([^}]*)\} from/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()))
      .filter(Boolean)
  );
  const declared = new Set(
    [...RESOLVE.matchAll(/(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  );
  const called = [...RESOLVE.matchAll(/\bawait ([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]);
  assert.ok(called.length >= 3, 'there are awaited calls to check');
  for (const fn of called) {
    assert.ok(
      imported.has(fn) || declared.has(fn),
      `${fn}() is called but neither imported nor declared in resolveCourse.js`
    );
  }
});

test('CONTROL: that probe DOES match the raw call, and is not fooled by the helper', () => {
  // Both halves matter. The first proves the regex sees a real call; the second
  // proves it does not fire on the helper whose name contains it.
  assert.ok(/getCourseByCode\(/.test('const c = await getCourseByCode(id);'), 'sees the raw call');
  assert.ok(!/getCourseByCode\(/.test('await getCourseByCodeInsensitive(id);'), 'not the helper');
});

test('both callers still uppercase before looking up — that is the happy path', () => {
  // The direct call inside the helper is what 72 of 77 courses hit. Passing the
  // raw lowercased slug would miss it every time and push everything onto the
  // list fallback.
  assert.match(PAGE, /const attempted = courseSlug\.toUpperCase\(\)/);
  assert.match(RESOLVE, /seg\.slice\(0, -SUFFIX\.length\)\.toUpperCase\(\)/);
});

test('the helper tries the direct call FIRST and returns it unconditionally', () => {
  // The cost guarantee, pinned in source because the pure tier proves behaviour
  // but not ordering-by-construction. A fallback that ran first, or a direct hit
  // that still consulted the list, would double every course's upstream traffic.
  const body = /export async function getCourseByCodeInsensitive\(([\s\S]*?)\n\}/.exec(ADAPTER);
  assert.ok(body, 'the helper is where it is expected');
  const directAt = body[1].indexOf('const direct = await fetchByCode(courseId)');
  const listAt = body[1].indexOf('await fetchList()');
  assert.ok(directAt > -1 && listAt > -1, 'both paths are present');
  assert.ok(directAt < listAt, 'the direct call comes first');
  assert.match(body[1], /if \(direct\) return direct;/, 'and short-circuits on a hit');
});

test('the fallback match is exact-except-case, with no normalisation', () => {
  // A trim(), a replace() or a startsWith() here would silently land a typo'd
  // link on the wrong course's registration form.
  assert.match(ADAPTER, /String\(c\?\.course_id \?\? ''\)\.toLowerCase\(\) === wanted/);
  const body = /export async function getCourseByCodeInsensitive\(([\s\S]*?)\n\}/.exec(ADAPTER)[1];
  for (const banned of ['.trim(', '.replace(', '.startsWith(', '.includes(', 'normalize(']) {
    assert.ok(!body.includes(banned), `"${banned}" would make the match fuzzy`);
  }
});

test('CONTROL: those banned tokens are things that DO appear in this repo', () => {
  // Guards against a banned-list of strings that could never match anything —
  // the way an "absent" assertion silently becomes decorative.
  const resolve = read('src/lib/resolveCourse.js');
  assert.ok(resolve.includes('.trim('), '.trim( is real code used nearby');
  assert.ok(resolve.includes('.startsWith('), '.startsWith( likewise');
});
