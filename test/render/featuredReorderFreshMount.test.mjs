import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeaturedCourseList } from '@/app/admin/featured-courses/_components/FeaturedCourseList';
import { FeaturedOnlineCourseList } from '@/app/admin/featured-online-courses/_components/FeaturedOnlineCourseList';
import { FeaturedReviewList } from '@/app/admin/featured-reviews/_components/FeaturedReviewList';

/**
 * SSR only — there is no jsdom in this runner (see
 * test/render/courseEditorUnsavedGuard.test.mjs's header for the same
 * limit), so a drag/drop or a save click cannot be simulated. What CAN be
 * checked: `dirty` defaults to false, so a server-rendered (freshly loaded)
 * screen shows neither the unsaved-changes banner nor a leftover error —
 * the single most important claim for a feature that is opt-in-by-editing:
 * a screen that showed its own banner on mount would satisfy every "the
 * banner exists" test ever written while being useless, exactly the
 * reasoning test/render/courseEditorUnsavedGuard.test.mjs's own CONTROL
 * makes for the course editor's dialog.
 */

const COURSE = { _id: '1', course_id: 'A', course_name: 'Course A', active: true, sort_order: 0 };
const REVIEW = {
  _id: '1', review_id: 'r1', active: true, sort_order: 0,
  review: { reviewerName: 'Somchai', comment: 'ดีมาก', courseName: 'X', rating: 5, avatarUrl: '' },
};

test('CONTROL: FeaturedCourseList mounts with no unsaved-changes banner', () => {
  const html = renderToStaticMarkup(createElement(FeaturedCourseList, { courses: [COURSE] }));
  assert.doesNotMatch(html, /ยังไม่บันทึกลำดับ/, 'the dirty banner is open on a screen nobody has dragged anything on');
  assert.doesNotMatch(html, /role="alert"/, 'an error banner is open with nothing having failed yet');
  assert.match(html, /Course A/, 'the row itself failed to render — this control would be vacuous otherwise');
});

test('CONTROL: FeaturedOnlineCourseList mounts with no unsaved-changes banner', () => {
  const html = renderToStaticMarkup(createElement(FeaturedOnlineCourseList, { courses: [COURSE] }));
  assert.doesNotMatch(html, /ยังไม่บันทึกลำดับ/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(html, /Course A/);
});

test('CONTROL: FeaturedReviewList mounts with no unsaved-changes banner', () => {
  const html = renderToStaticMarkup(createElement(FeaturedReviewList, { items: [REVIEW] }));
  assert.doesNotMatch(html, /ยังไม่บันทึกลำดับ/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(html, /Somchai/);
});
