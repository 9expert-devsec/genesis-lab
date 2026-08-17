import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renameCacheTargets, derivedCoursePath } from '@/lib/courses/renameCacheFanout';
import { UPSTREAM_TAGS, courseTag, publicCourseTag } from '@/lib/api/bustUpstream';

/**
 * WHAT A RENAME HAS TO INVALIDATE.
 *
 * ── WHY THIS IS ASSERTABLE AT ALL ──────────────────────────────────────────
 * A missed tag fails SILENTLY. `revalidateTag` on a string nothing matches
 * throws nothing and logs nothing; the read simply keeps serving the cached
 * value until its hour is up. That silence is how the staleness in
 * docs/admin-staleness-audit.md survived, and a rename makes it worse than
 * stale — the cached rows name a `course_id` that no longer exists, so the
 * catalogue advertises a code whose page 404s.
 *
 * So the target list is computed by a pure function and checked here, rather
 * than being a sequence of calls in an action that nobody can inspect without a
 * request context.
 */

const OLD = 'ZZTEST-EXCEL-01';
const NEW = 'EXCEL-HR-01';
const ANCHOR = '6a7a97f0b830e289fc383406';

const targets = (over = {}) =>
  renameCacheTargets({ oldCode: OLD, newCode: NEW, upstreamId: ANCHOR, ...over });

// ── Both codes, every time ──────────────────────────────────────────────────

test('BOTH codes are busted, not just the old one', () => {
  /**
   * The old entries are the wrong answers now. The NEW ones matter too: any
   * read between the upstream write and this bust cached a correct-but-racing
   * answer — and the rename action performs one itself, as the read-back.
   */
  const { tags } = targets();
  for (const t of [courseTag(OLD), courseTag(NEW), publicCourseTag(OLD), publicCourseTag(NEW)]) {
    assert.ok(tags.includes(t), `missing tag ${t} — that cache entry survives the rename`);
  }
});

test('the list tag every catalogue surface reads from is busted', () => {
  assert.ok(targets().tags.includes(UPSTREAM_TAGS.PUBLIC_COURSES));
});

test('the _id is tagged too, because the admin route reads by ObjectId', () => {
  assert.ok(targets().tags.includes(publicCourseTag(ANCHOR)));
  // and it is omitted rather than tagged as an empty string when absent
  assert.ok(!targets({ upstreamId: '' }).tags.some((t) => t === publicCourseTag('')));
});

// ── Both derived URLs ───────────────────────────────────────────────────────

test('BOTH derived course URLs are revalidated', () => {
  const { paths } = targets();
  assert.ok(paths.includes('/zztest-excel-01-training-course'), 'the OLD url is not invalidated');
  assert.ok(paths.includes('/excel-hr-01-training-course'), 'the NEW url is not invalidated');
});

test('an ALIASED course still busts both derived paths, plus the alias', () => {
  /**
   * With an alias the public URL does not move — but the derived paths are
   * still live routes resolveCourse answers, so a cached entry under the old
   * one outlives the rename just the same.
   */
  const { paths } = targets({ alias: '/excel-dashboard-for-hr-training-course' });
  assert.ok(paths.includes('/excel-dashboard-for-hr-training-course'), 'the alias is not busted');
  assert.ok(paths.includes(derivedCoursePath(OLD)));
  assert.ok(paths.includes(derivedCoursePath(NEW)));
});

test('the surfaces that render the code are revalidated by path', () => {
  // `revalidateTag` does not reach a route cache — these need paths.
  const { paths } = targets();
  for (const p of ['/', '/training-course', '/schedule', '/search', '/admin/courses']) {
    assert.ok(paths.includes(p), `${p} renders the code and is never invalidated`);
  }
});

// ── Shape ───────────────────────────────────────────────────────────────────

test('the lists are deduped, so a case-only rename does not bust twice', () => {
  const { tags, paths } = renameCacheTargets({ oldCode: 'MSE-L1', newCode: 'mse-l1' });
  assert.equal(new Set(tags).size, tags.length, `duplicate tags: ${tags.join(', ')}`);
  assert.equal(new Set(paths).size, paths.length, `duplicate paths: ${paths.join(', ')}`);
});

test('an empty code never produces a garbage path', () => {
  // `/-training-course` is a real route that would be revalidated for nothing.
  const { paths } = renameCacheTargets({ oldCode: '', newCode: NEW });
  assert.ok(!paths.includes('/-training-course'), `garbage path present: ${paths.join(', ')}`);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the targets vary with the codes and are not a constant list', () => {
  const a = targets();
  const b = renameCacheTargets({ oldCode: 'MSE-L1', newCode: 'MSE-L2' });
  assert.notDeepEqual(a.tags, b.tags);
  assert.notDeepEqual(a.paths, b.paths);
  // and the fixed part really is shared
  assert.ok(a.tags.includes(UPSTREAM_TAGS.PUBLIC_COURSES) && b.tags.includes(UPSTREAM_TAGS.PUBLIC_COURSES));
});

test('CONTROL: the tag builders are the SHIPPED ones, not re-implemented here', () => {
  /**
   * A tag is a string that has to match on both sides. If this test built its
   * expectations with its own template literal, a change to the read-side
   * builder would leave both this file and the fan-out wrong together.
   */
  assert.equal(courseTag('X'), 'course:X');
  assert.equal(publicCourseTag('X'), 'public-course:X');
  assert.equal(derivedCoursePath('MSE-L1'), '/mse-l1-training-course');
});
