import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseDescription } from '@/app/(public)/[...slug]/_components/CourseDescription';

/**
 * The render swap: `course_teaser` in place of the rich body when it is
 * present, the teaser otherwise. Every fallback trigger gets its own test —
 * a loop over "empty shapes" would hide which shape broke.
 */

const COURSE = { course_name: 'Power BI', course_teaser: 'The teaser text' };

const render = (extension) =>
  renderToStaticMarkup(createElement(CourseDescription, { course: COURSE, extension }));

// ── the fallback fires — each trigger on its own ────────────────────────────

test('FALLBACK: no extension row renders the teaser and does not throw', () => {
  const html = render(null);
  assert.ok(html.includes('The teaser text'), 'the teaser did not render');
  assert.ok(!html.includes('article-content'), 'the rich-body wrapper rendered with no rich body');
});

test('FALLBACK: descriptionRich absent from the extension renders the teaser', () => {
  const html = render({ gallery: [] }); // a real extension row, just never touched this field
  assert.ok(html.includes('The teaser text'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: whitespace-only descriptionRich renders the teaser', () => {
  const html = render({ descriptionRich: '   \n\t  ' });
  assert.ok(html.includes('The teaser text'));
  assert.ok(!html.includes('article-content'));
});

test('FALLBACK: a bare <p></p> renders the teaser', () => {
  const html = render({ descriptionRich: '<p></p>' });
  assert.ok(html.includes('The teaser text'));
  assert.ok(!html.includes('article-content'));
});

// ── the fallback does NOT fire on real content ──────────────────────────────

test('the rich body renders INSTEAD OF the teaser when it has real content', () => {
  const html = render({ descriptionRich: '<p>Real course content</p>' });
  assert.ok(html.includes('Real course content'), 'the rich body did not render');
  assert.ok(html.includes('article-content'), 'the rich-body wrapper is missing');
  assert.ok(!html.includes('The teaser text'), 'the teaser rendered ALONGSIDE the rich body');
});

// ── neither renders when both are absent ────────────────────────────────────

test('CONTROL: no teaser and no rich body renders nothing', () => {
  const html = renderToStaticMarkup(
    createElement(CourseDescription, {
      course: { course_name: 'X', course_teaser: '' },
      extension: { descriptionRich: '<p></p>' },
    })
  );
  assert.equal(html, '');
});

// ── sanitised at render, defence in depth ───────────────────────────────────

test('SECURITY: a stored <script> does not reach the page', () => {
  const html = render({ descriptionRich: '<p>ok</p><script>alert(1)</script>' });
  assert.ok(!html.includes('<script'), 'a script tag reached the rendered page');
  assert.ok(html.includes('ok'), 'sanitising also ate the real content');
});

test('SECURITY: a stored inline event handler does not reach the page', () => {
  const html = render({
    descriptionRich: '<img src="https://x.test/a.png" onerror="alert(1)">',
  });
  assert.ok(!html.includes('onerror'), 'an inline event handler reached the rendered page');
});

// ── images and tables survive the round trip ────────────────────────────────

test('an image authored in the editor survives to the rendered page', () => {
  // Paired with real prose, not image-only: an image carries no TEXT of its
  // own, and isEmptyRichHtml's contract (test/pure/richTextEmpty.test.mjs)
  // is explicitly text-based — an image-only body is empty by that
  // definition and would take the teaser fallback instead, which is a
  // separate, deliberate case, not this test's concern.
  const html = render({
    descriptionRich: '<p>See the diagram below.</p>'
      + '<img src="https://res.cloudinary.com/x/body.png" alt="diagram" width="400">',
  });
  assert.match(html, /<img[^>]*src="https:\/\/res\.cloudinary\.com\/x\/body\.png"/);
  assert.match(html, /<img[^>]*alt="diagram"/);
});

test('FALLBACK EDGE CASE: an image with no surrounding text is EMPTY, by the given definition', () => {
  // Documented, not incidental: constraint #3 defines empty as "markup with
  // no text content", which an image-only body satisfies — it has real
  // embedded content but no prose. This test pins the behaviour so a future
  // change to isEmptyRichHtml's contract shows up here too.
  const html = render({
    descriptionRich: '<img src="https://res.cloudinary.com/x/body.png" alt="diagram">',
  });
  assert.ok(html.includes('The teaser text'), 'an image-only body did not fall back to the teaser');
  assert.ok(!html.includes('res.cloudinary.com'), 'the image rendered despite the fallback');
});

test('a table authored in the editor survives to the rendered page, wrapped for overflow', () => {
  const html = render({
    descriptionRich: '<table><tbody><tr><th>Col</th><td>Val</td></tr></tbody></table>',
  });
  assert.match(html, /<table>/);
  assert.match(html, /<th>Col<\/th>/);
  assert.match(html, /<td>Val<\/td>/);
  // wrapArticleTables — the same overflow-scroll fix Article.content gets,
  // reused rather than left unfixed for a second field.
  assert.ok(html.includes('article-table-scroll'), 'the table is not wrapped for horizontal scroll');
});
