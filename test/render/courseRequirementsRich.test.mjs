import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseRequirements } from '@/app/(public)/[...slug]/_components/CourseRequirements';

/**
 * The render swap for `systemRequirementsRich`. Same shape as
 * courseObjectivesRich.test.mjs, applied to this field.
 */

const COURSE = {
  course_name: 'Power BI',
  course_system_requirements: ['1.3GHz or faster core speed', '8GB RAM or more'],
};

const render = (extension) =>
  renderToStaticMarkup(createElement(CourseRequirements, { course: COURSE, extension }));

test('FALLBACK: no extension row renders the plain list and does not throw', () => {
  const html = render(null);
  assert.ok(html.includes('1.3GHz or faster core speed'), 'the plain list did not render');
  assert.ok(!html.includes('article-content'), 'the rich-body wrapper rendered with no rich body');
});

test('FALLBACK: systemRequirementsRich absent from the extension renders the plain list', () => {
  const html = render({ gallery: [] });
  assert.ok(html.includes('1.3GHz or faster core speed'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: whitespace-only systemRequirementsRich renders the plain list', () => {
  const html = render({ systemRequirementsRich: '   \n\t  ' });
  assert.ok(html.includes('1.3GHz or faster core speed'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: a bare <p></p> renders the plain list', () => {
  const html = render({ systemRequirementsRich: '<p></p>' });
  assert.ok(html.includes('1.3GHz or faster core speed'));
  assert.ok(!html.includes('article-content'));
});

test('the rich body renders INSTEAD OF the plain list when it has real content', () => {
  const html = render({ systemRequirementsRich: '<ul><li>Real rich requirement</li></ul>' });
  assert.ok(html.includes('Real rich requirement'), 'the rich body did not render');
  assert.ok(html.includes('article-content'), 'the rich-body wrapper is missing');
  assert.ok(!html.includes('1.3GHz or faster core speed'), 'the plain list rendered ALONGSIDE the rich body');
});

test('CONTROL: no plain list and no rich body renders nothing', () => {
  const html = renderToStaticMarkup(
    createElement(CourseRequirements, {
      course: { course_name: 'X', course_system_requirements: [] },
      extension: { systemRequirementsRich: '<p></p>' },
    })
  );
  assert.equal(html, '');
});

test('SECURITY: a stored <script> does not reach the page', () => {
  const html = render({ systemRequirementsRich: '<p>ok</p><script>alert(1)</script>' });
  assert.ok(!html.includes('<script'), 'a script tag reached the rendered page');
  assert.ok(html.includes('ok'), 'sanitising also ate the real content');
});

test('a course with no CourseExtension row renders the plain list and does not throw', () => {
  const html = render(undefined);
  assert.ok(html.includes('1.3GHz or faster core speed'));
});
