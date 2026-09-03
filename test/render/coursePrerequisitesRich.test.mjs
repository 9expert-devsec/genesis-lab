import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoursePrerequisites } from '@/app/(public)/[...slug]/_components/CoursePrerequisites';

/**
 * The render swap for `prerequisitesRich`. Same shape as
 * courseObjectivesRich.test.mjs, applied to this field.
 */

const COURSE = {
  course_name: 'Power BI',
  course_prerequisites: ['ใช้งาน Excel เบื้องต้นได้', 'มีคอมพิวเตอร์ส่วนตัว'],
};

const render = (extension) =>
  renderToStaticMarkup(createElement(CoursePrerequisites, { course: COURSE, extension }));

test('FALLBACK: no extension row renders the plain list and does not throw', () => {
  const html = render(null);
  assert.ok(html.includes('ใช้งาน Excel เบื้องต้นได้'), 'the plain list did not render');
  assert.ok(!html.includes('article-content'), 'the rich-body wrapper rendered with no rich body');
});

test('FALLBACK: prerequisitesRich absent from the extension renders the plain list', () => {
  const html = render({ gallery: [] });
  assert.ok(html.includes('ใช้งาน Excel เบื้องต้นได้'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: whitespace-only prerequisitesRich renders the plain list', () => {
  const html = render({ prerequisitesRich: '   \n\t  ' });
  assert.ok(html.includes('ใช้งาน Excel เบื้องต้นได้'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: a bare <p></p> renders the plain list', () => {
  const html = render({ prerequisitesRich: '<p></p>' });
  assert.ok(html.includes('ใช้งาน Excel เบื้องต้นได้'));
  assert.ok(!html.includes('article-content'));
});

test('the rich body renders INSTEAD OF the plain list when it has real content', () => {
  const html = render({ prerequisitesRich: '<ul><li>Real rich prerequisite</li></ul>' });
  assert.ok(html.includes('Real rich prerequisite'), 'the rich body did not render');
  assert.ok(html.includes('article-content'), 'the rich-body wrapper is missing');
  assert.ok(!html.includes('ใช้งาน Excel เบื้องต้นได้'), 'the plain list rendered ALONGSIDE the rich body');
});

test('CONTROL: no plain list and no rich body renders nothing', () => {
  const html = renderToStaticMarkup(
    createElement(CoursePrerequisites, {
      course: { course_name: 'X', course_prerequisites: [] },
      extension: { prerequisitesRich: '<p></p>' },
    })
  );
  assert.equal(html, '');
});

test('SECURITY: a stored <script> does not reach the page', () => {
  const html = render({ prerequisitesRich: '<p>ok</p><script>alert(1)</script>' });
  assert.ok(!html.includes('<script'), 'a script tag reached the rendered page');
  assert.ok(html.includes('ok'), 'sanitising also ate the real content');
});

test('a course with no CourseExtension row renders the plain list and does not throw', () => {
  const html = render(undefined);
  assert.ok(html.includes('ใช้งาน Excel เบื้องต้นได้'));
});
