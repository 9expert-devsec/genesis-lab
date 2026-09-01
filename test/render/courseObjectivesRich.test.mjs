import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseObjectives } from '@/app/(public)/[...slug]/_components/CourseObjectives';

/**
 * The render swap for `objectivesRich`: the plain `course_objectives` list in
 * place of the rich body when it is absent, the rich body instead of the
 * plain list when it holds real content. Same shape as
 * test/render/courseDescription.test.mjs's fallback suite, applied to this
 * field — every trigger gets its own test so a broken field names itself.
 */

const COURSE = {
  course_name: 'Power BI',
  course_objectives: ['เข้าใจพื้นฐาน Power BI', 'สร้างแดชบอร์ดได้ด้วยตนเอง'],
};

const render = (extension) =>
  renderToStaticMarkup(createElement(CourseObjectives, { course: COURSE, extension }));

test('FALLBACK: no extension row renders the plain list and does not throw', () => {
  const html = render(null);
  assert.ok(html.includes('เข้าใจพื้นฐาน Power BI'), 'the plain list did not render');
  assert.ok(!html.includes('article-content'), 'the rich-body wrapper rendered with no rich body');
});

test('FALLBACK: objectivesRich absent from the extension renders the plain list', () => {
  const html = render({ gallery: [] }); // a real extension row, just never touched this field
  assert.ok(html.includes('เข้าใจพื้นฐาน Power BI'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: whitespace-only objectivesRich renders the plain list', () => {
  const html = render({ objectivesRich: '   \n\t  ' });
  assert.ok(html.includes('เข้าใจพื้นฐาน Power BI'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: a bare <p></p> renders the plain list', () => {
  const html = render({ objectivesRich: '<p></p>' });
  assert.ok(html.includes('เข้าใจพื้นฐาน Power BI'));
  assert.ok(!html.includes('article-content'));
});

test('the rich body renders INSTEAD OF the plain list when it has real content', () => {
  const html = render({ objectivesRich: '<ul><li>Real rich objective</li></ul>' });
  assert.ok(html.includes('Real rich objective'), 'the rich body did not render');
  assert.ok(html.includes('article-content'), 'the rich-body wrapper is missing');
  assert.ok(!html.includes('เข้าใจพื้นฐาน Power BI'), 'the plain list rendered ALONGSIDE the rich body');
});

test('CONTROL: no plain list and no rich body renders nothing', () => {
  const html = renderToStaticMarkup(
    createElement(CourseObjectives, {
      course: { course_name: 'X', course_objectives: [] },
      extension: { objectivesRich: '<p></p>' },
    })
  );
  assert.equal(html, '');
});

test('SECURITY: a stored <script> does not reach the page', () => {
  const html = render({ objectivesRich: '<p>ok</p><script>alert(1)</script>' });
  assert.ok(!html.includes('<script'), 'a script tag reached the rendered page');
  assert.ok(html.includes('ok'), 'sanitising also ate the real content');
});

test('a course with no CourseExtension row renders the plain list and does not throw', () => {
  const html = render(undefined);
  assert.ok(html.includes('เข้าใจพื้นฐาน Power BI'));
});
