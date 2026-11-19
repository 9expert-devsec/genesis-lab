import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseJsonLd } from '@/lib/courses/buildCourseJsonLd';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';

/**
 * D12 — standing ruling (2026-09-29): the normal course detail page emits a
 * bare Course with NO hasCourseInstance; Masterclass detail keeps its own.
 * The builder used to emit up to five CourseInstance nodes with a hard-coded,
 * wrong address and no real dates. A stray `schedules` argument (the old call
 * shape) must not bring them back.
 */

const BASE = 'https://www.example.test';
const course = {
  course_id: 'PBI-BA',
  course_name: 'Power BI Desktop for Business Analytics',
  course_teaser: 'teaser',
  course_price: 9900,
};
const rounds = [
  { _id: 'a', status: 'open', dates: ['2026-12-01'] },
  { _id: 'b', status: 'nearly_full', dates: ['2026-12-08'] },
];

test('a bare Course: no hasCourseInstance, provider by the home @id, no hard-coded address', () => {
  const node = buildCourseJsonLd({ course, extension: null, schedules: rounds, siteUrl: BASE });
  assert.equal(node['@type'], 'Course');
  assert.equal('hasCourseInstance' in node, false, 'hasCourseInstance is back on course detail');
  assert.doesNotMatch(JSON.stringify(node), /CourseInstance|สามเสนใน/);
  // The provider is a REFERENCE to the Organization the home graph declares.
  assert.deepEqual(node.provider, { '@id': homeGraphIds(BASE).organization });
  // CONTROL: the id the test compares against is the real, non-empty one.
  assert.equal(homeGraphIds(BASE).organization, `${BASE}/#organization`);
});
