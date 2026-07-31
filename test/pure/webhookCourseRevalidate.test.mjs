import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coursePathFromId,
  planCourseRevalidation,
} from '@/lib/webhooks/courseRevalidatePlan';

// The webhook cache-revalidation planner. Pure (no next/cache, no db) so the
// tag/path plan is verifiable without a Next request context. The alias LOOKUP
// (db) and EXECUTION (next/cache) are wired in handlers.js and proven by the
// integration evidence script; this tier locks the plan itself.

const ALIAS = '/microsoft365-training-course'; // MS365-L1's admin urlAlias (the stale page)
const LEGACY = '/ms365-l1-training-course';     // derived -training-course URL

test('coursePathFromId lowercases + underscores→dashes, or null', () => {
  assert.equal(coursePathFromId('MS365-L1'), LEGACY);
  assert.equal(coursePathFromId('POWER_BI'), '/power-bi-training-course');
  assert.equal(coursePathFromId(''), null);
  assert.equal(coursePathFromId(null), null);
});

test('updated WITH an alias revalidates BOTH the alias and the legacy path', () => {
  const { tags, paths } = planCourseRevalidation('course.updated', 'MS365-L1', [ALIAS]);
  // the fix: the alias page the public actually visits is revalidated
  assert.ok(paths.includes(ALIAS), 'alias path revalidated');
  // no regression: the legacy URL still works too
  assert.ok(paths.includes(LEGACY), 'legacy path still revalidated');
  // the detail-page data tag + the list tag
  assert.ok(tags.includes('course:MS365-L1'), 'course tag busted');
  assert.ok(tags.includes('public-courses'), 'list tag busted');
  assert.ok(paths.includes('/search') && paths.includes('/'), 'list surfaces revalidated');
});

test('edge: legacy-only course (NO extension) behaves exactly as before', () => {
  const { tags, paths } = planCourseRevalidation('course.created', 'SQL-ADM', []);
  assert.deepEqual(paths, ['/sql-adm-training-course', '/search', '/']);
  assert.ok(tags.includes('course:SQL-ADM') && tags.includes('public-courses'));
  // never invents an alias when none exists
  assert.ok(!paths.some((p) => p !== '/sql-adm-training-course' && p.endsWith('-training-course')));
});

test('edge: MULTIPLE aliases are ALL revalidated (plus legacy), de-duplicated', () => {
  const a2 = '/office365-training-course';
  const { paths } = planCourseRevalidation('course.updated', 'MS365-L1', [ALIAS, a2, ALIAS /* dup */]);
  assert.ok(paths.includes(ALIAS) && paths.includes(a2) && paths.includes(LEGACY));
  assert.equal(paths.filter((p) => p === ALIAS).length, 1, 'duplicate alias collapsed');
});

test('delete only nudges list surfaces (unchanged behaviour)', () => {
  const { tags, paths } = planCourseRevalidation('course.deleted', 'MS365-L1', [ALIAS]);
  assert.deepEqual(tags, ['public-courses']);
  assert.deepEqual(paths, ['/search', '/']);
  assert.ok(!tags.includes('course:MS365-L1'), 'no detail tag on delete');
  assert.ok(!paths.includes(ALIAS) && !paths.includes(LEGACY), 'no detail path on delete');
});

// CONTROL — proves the alias assertion above is not vacuous. This replicates the
// PRE-FIX behaviour (derive the legacy path from course_id, never resolve the
// urlAlias). The very check that PASSES for the fixed plan must FAIL here; if it
// didn't, the test would pass even with the bug present.
test('CONTROL: pre-fix (legacy-path-only) plan FAILS the alias assertion', () => {
  const preFixPaths = (courseId) => [coursePathFromId(courseId), '/search', '/'].filter(Boolean);
  const old = preFixPaths('MS365-L1');
  assert.ok(!old.includes(ALIAS), 'pre-fix plan misses the alias page — this is the bug');
  // and the fixed plan flips exactly that assertion to true:
  const fixed = planCourseRevalidation('course.updated', 'MS365-L1', [ALIAS]).paths;
  assert.ok(fixed.includes(ALIAS), 'fixed plan covers the alias the pre-fix one missed');
});
