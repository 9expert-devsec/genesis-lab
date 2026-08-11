import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseListQuery, withListQuery, COURSE_LIST_PARAMS } from '@/lib/courses/adminListQuery';

/**
 * The course list's filter state, carried in the URL.
 *
 * A filter only survives the round trip if the way BACK reproduces it, so these
 * pin both halves: reading the filter off a URL, and putting it onto the ←
 * links. The controls are about the two ways this quietly stops working — an
 * empty filter leaking a `?` into every link, and the same filters producing
 * different strings depending on how they were typed.
 */

test('reads the three filter params from a URLSearchParams', () => {
  const q = courseListQuery(new URLSearchParams('q=excel&program=p1&type=public'));
  assert.equal(q, 'q=excel&program=p1&type=public');
});

test("reads Next's plain searchParams object too", () => {
  // Server components get an object, client components a URLSearchParams.
  assert.equal(courseListQuery({ q: 'excel', type: 'inhouse' }), 'q=excel&type=inhouse');
});

test('takes the first value when a param repeats', () => {
  assert.equal(courseListQuery({ q: ['excel', 'word'] }), 'q=excel');
});

test('order is fixed by COURSE_LIST_PARAMS, not by insertion', () => {
  // Two links to the same filtered list must be the same string, or "did the
  // filter survive?" becomes an order-dependent question.
  assert.equal(
    courseListQuery({ type: 'public', q: 'excel', program: 'p1' }),
    courseListQuery({ q: 'excel', program: 'p1', type: 'public' })
  );
  assert.deepEqual(COURSE_LIST_PARAMS, ['q', 'program', 'type']);
});

test('CONTROL: no filters produces an EMPTY string, not "?"', () => {
  // A bare `?` rides into every ← link and makes an unfiltered list look
  // filtered. Empty and whitespace-only values are dropped for the same reason.
  assert.equal(courseListQuery({}), '');
  assert.equal(courseListQuery({ q: '', program: '', type: '' }), '');
  assert.equal(courseListQuery({ q: '   ' }), '');
  assert.equal(courseListQuery(null), '');
  assert.equal(courseListQuery(undefined), '');
});

test('CONTROL: params that are not filters are dropped', () => {
  // Only the three belong in a ← link; anything else is somebody's tracking
  // param riding along forever.
  assert.equal(courseListQuery({ q: 'excel', page: '3', utm_source: 'x' }), 'q=excel');
});

test('withListQuery appends, and appends correctly to a href that has a query', () => {
  assert.equal(withListQuery('/admin/courses', 'q=excel'), '/admin/courses?q=excel');
  assert.equal(withListQuery('/admin/courses?a=1', 'q=excel'), '/admin/courses?a=1&q=excel');
});

test('CONTROL: withListQuery leaves the href untouched when there is no filter', () => {
  // The case that runs on most page loads. A trailing `?` here would be on
  // every back link in the admin.
  assert.equal(withListQuery('/admin/courses', ''), '/admin/courses');
  assert.equal(withListQuery('/admin/courses', null), '/admin/courses');
  assert.equal(withListQuery('/admin/courses', undefined), '/admin/courses');
});

test('a leading ? on the query is not doubled', () => {
  assert.equal(withListQuery('/admin/courses', '?q=excel'), '/admin/courses?q=excel');
});

test('the round trip survives: list URL → link → back', () => {
  // The whole point, end to end.
  const fromList = courseListQuery(new URLSearchParams('?q=excel&type=inhouse'));
  const editHref = withListQuery('/admin/courses/abc123/edit', fromList);
  assert.equal(editHref, '/admin/courses/abc123/edit?q=excel&type=inhouse');

  const backOnEdit = courseListQuery(new URL(`https://x${editHref}`).searchParams);
  assert.equal(withListQuery('/admin/courses', backOnEdit), '/admin/courses?q=excel&type=inhouse');
});
