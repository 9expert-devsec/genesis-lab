import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVisibleExtension,
  planVisibilityRevalidation,
} from '@/lib/courses/publishVisibilityPlan';

/**
 * Flipping the เผยแพร่ / ซ่อน toggle must regenerate the pages that baked the
 * old answer.
 *
 * ── WHY THE EXISTING FOUR PATHS WERE NOT ENOUGH ─────────────────────────────
 * `saveCourseExtension` already revalidated the admin list, the editor, the
 * alias and /<code>-training-course. That covered everything while
 * `isPublished` gated only URL resolution. Now hiding a course also removes it
 * from the mega menu, the home page, /training-course, /schedule, every
 * catalog page, the article rails and every page-builder course_list — none of
 * which sits under those four paths. The visible symptom without this: the
 * course page 404s the moment the toggle is saved, and the listings keep
 * advertising it for up to the ISR window (up to 3h more for the two snapshot
 * surfaces).
 *
 * ── AND WHY IT IS CONDITIONAL ───────────────────────────────────────────────
 * `('/', 'layout')` drops the whole public layout cache. On every save, a typo
 * fixed in a meta description would cost the site its rendered output — a toll
 * every visitor pays for a change none of them can see. So the plan fires on a
 * FLIP and on nothing else, and the no-flip cases below are as load-bearing as
 * the flip ones.
 */

const HIDDEN = { courseId: 'COPILOT-STU', isPublished: false };
const SHOWN = { courseId: 'COPILOT-STU', isPublished: true };

const LAYOUT = [{ path: '/', type: 'layout' }];

// ── the visibility reading ─────────────────────────────────────────────────

test('no extension row at all is VISIBLE', () => {
  // A course nobody has opened the SEO editor for has never been hidden by
  // anybody. Reading absence as hidden would take every such course off the
  // site the first time anything consulted this.
  assert.equal(isVisibleExtension(null), true);
  assert.equal(isVisibleExtension(undefined), true);
});

test('an extension with no isPublished FIELD is visible too', () => {
  // Matches the schema default, resolveCourse's `isPublished !== false` and the
  // hidden-set query's explicit `{ isPublished: false }`. All four have to
  // agree or a course vanishes from one surface and not another.
  assert.equal(isVisibleExtension({ courseId: 'X' }), true);
});

test('only an EXPLICIT false is hidden', () => {
  assert.equal(isVisibleExtension(HIDDEN), false);
  assert.equal(isVisibleExtension(SHOWN), true);
});

// ── the flips ──────────────────────────────────────────────────────────────

test('publish → hide regenerates the whole public layout', () => {
  const plan = planVisibilityRevalidation({ before: SHOWN, after: HIDDEN });
  assert.equal(plan.flipped, true);
  assert.deepEqual(plan.paths, LAYOUT);
});

test('hide → publish regenerates it too — the listings have to put it back', () => {
  const plan = planVisibilityRevalidation({ before: HIDDEN, after: SHOWN });
  assert.equal(plan.flipped, true);
  assert.deepEqual(plan.paths, LAYOUT);
});

test('creating an extension ALREADY hidden is a flip', () => {
  // `before: null` is a course with no extension, which is visible. Saving one
  // with the toggle off takes it off the site, and the first save is exactly
  // when it is easiest to forget that nothing existed to change.
  const plan = planVisibilityRevalidation({ before: null, after: HIDDEN });
  assert.equal(plan.flipped, true);
  assert.deepEqual(plan.paths, LAYOUT);
});

test('deleting a HIDDEN extension is a flip — the course comes back', () => {
  // The removed row carried the only isPublished:false there was.
  const plan = planVisibilityRevalidation({ before: HIDDEN, after: null });
  assert.equal(plan.flipped, true);
  assert.deepEqual(plan.paths, LAYOUT);
});

// ── the non-flips, which are what keep the cost honest ─────────────────────

test('an ordinary SEO save revalidates nothing extra', () => {
  const plan = planVisibilityRevalidation({
    before: { ...SHOWN, metaTitle: 'old' },
    after: { ...SHOWN, metaTitle: 'new' },
  });
  assert.equal(plan.flipped, false);
  assert.deepEqual(plan.paths, []);
});

test('a save that leaves the course hidden revalidates nothing extra', () => {
  const plan = planVisibilityRevalidation({
    before: HIDDEN,
    after: { ...HIDDEN, metaTitle: 'edited while hidden' },
  });
  assert.equal(plan.flipped, false);
  assert.deepEqual(plan.paths, []);
});

test('creating a normal, published extension is not a flip', () => {
  // null → visible is the overwhelmingly common create, and it must not drop
  // the site's rendered output every time an admin first sets a meta title.
  const plan = planVisibilityRevalidation({ before: null, after: SHOWN });
  assert.equal(plan.flipped, false);
  assert.deepEqual(plan.paths, []);
});

test('deleting a PUBLISHED extension is not a flip either', () => {
  const plan = planVisibilityRevalidation({ before: SHOWN, after: null });
  assert.equal(plan.flipped, false);
  assert.deepEqual(plan.paths, []);
});

test('CONTROL: the plan really can return both answers from this harness', () => {
  // Without this, every deepEqual above would also pass against a planner that
  // always returned one of them — half the tests assert [] and half assert the
  // layout entry, so a constant would satisfy exactly one half and the reader
  // would have to notice which.
  const flip = planVisibilityRevalidation({ before: SHOWN, after: HIDDEN });
  const noFlip = planVisibilityRevalidation({ before: SHOWN, after: SHOWN });
  assert.notDeepEqual(flip.paths, noFlip.paths);
  assert.equal(flip.paths.length, 1);
  assert.equal(noFlip.paths.length, 0);
});

test('the scope is layout at root, not a bare path', () => {
  // The measured requirement, inherited from the cache-writer round:
  // PublicHeader mounts from three places with no shared URL prefix — the
  // (public) layout, the home page inline, and not-found. `revalidatePath('/')`
  // alone reaches only the home page, leaving the mega menu stale on most of
  // the site.
  const [entry] = planVisibilityRevalidation({ before: SHOWN, after: HIDDEN }).paths;
  assert.equal(entry.path, '/');
  assert.equal(entry.type, 'layout');
});

test('missing arguments do not throw — they read as no change', () => {
  assert.deepEqual(planVisibilityRevalidation().paths, []);
  assert.deepEqual(planVisibilityRevalidation({}).paths, []);
});
