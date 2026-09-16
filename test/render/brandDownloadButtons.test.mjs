import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import BrandPage from '@/app/(public)/brand/page';
import { ABOUT_PARAGRAPHS, LOGO_SHAPES } from '@/app/(public)/brand/brandContent';

/**
 * /brand — the SVG / PNG download buttons carry a leading download glyph, and
 * the Brand Story lost its third paragraph.
 *
 * Rendered with renderToStaticMarkup and read back through JSDOM, never a
 * client root: everything asserted here is visible in the static markup, and
 * the order of an <svg> against its label is a fact about that markup.
 */

const doc = () => {
  const html = renderToStaticMarkup(createElement(BrandPage));
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
};

/** The six logo download anchors: three shapes × {SVG, PNG}; the wallpaper link is under /files/ci/ too and is excluded by name. */
const logoLinks = (d) =>
  [...d.querySelectorAll('a')].filter((a) => {
    const href = a.getAttribute('href') ?? '';
    return /^\/files\/ci(-svg)?\//.test(href) && !href.includes('wallpaper');
  });

const REMOVED_PARAGRAPH =
  'ตลอดระยะเวลากว่า 21 ปี เราได้ช่วยพัฒนาทักษะให้กับบุคคลและองค์กรจำนวนมาก และเราจะยังคงก้าวต่อไป เพื่อเป็นเข็มทิศนำทางทุกคนไปสู่ความเชี่ยวชาญ';

test('every SVG / PNG button carries exactly one <svg>, BEFORE its label, and the label is unchanged', () => {
  const links = logoLinks(doc());
  assert.equal(links.length, LOGO_SHAPES.length * 2, 'three cards × two formats');

  for (const a of links) {
    const href = a.getAttribute('href');
    const expectedLabel = href.endsWith('.svg') ? 'SVG' : 'PNG';
    assert.equal(a.textContent.trim(), expectedLabel, `${href}: the label text changed`);

    const svgs = a.querySelectorAll('svg');
    assert.equal(svgs.length, 1, `${href}: expected exactly one icon, saw ${svgs.length}`);

    // Order in the markup: the <svg> opens before the label text does.
    const markup = a.innerHTML;
    assert.ok(markup.indexOf('<svg') < markup.indexOf(expectedLabel), `${href}: the icon must precede the label`);
    // And structurally: the icon is the first child, the text comes after it.
    assert.equal(a.firstElementChild?.tagName.toLowerCase(), 'svg', `${href}: the icon is not the first child`);
    assert.ok(svgs[0].compareDocumentPosition(a.lastChild) & 4, `${href}: the label does not FOLLOW the icon`);
  }
});

test('the glyph is decorative and sized to the text — aria-hidden, 16px, currentColor', () => {
  for (const a of logoLinks(doc())) {
    const svg = a.querySelector('svg');
    assert.equal(svg.getAttribute('aria-hidden'), 'true', 'the label already says what the link does');
    const cls = svg.getAttribute('class') ?? '';
    assert.ok(cls.includes('h-4') && cls.includes('w-4'), `expected h-4 w-4, saw "${cls}"`);
    // lucide draws with stroke="currentColor", which is what lets the same
    // glyph read white on the filled SVG button and blue on the outlined PNG one.
    assert.equal(svg.getAttribute('stroke'), 'currentColor');
  }
});

test('the Brand Story reads two paragraphs — the "21 ปี" paragraph is gone from the content and from the page', () => {
  assert.equal(ABOUT_PARAGRAPHS.length, 2);
  assert.equal(ABOUT_PARAGRAPHS.includes(REMOVED_PARAGRAPH), false, 'the paragraph is still in ABOUT_PARAGRAPHS');
  // The other two are untouched.
  assert.ok(ABOUT_PARAGRAPHS[0].startsWith('จุดเริ่มต้นของ 9Expert Training'));
  assert.ok(ABOUT_PARAGRAPHS[1].startsWith('เราจึงมุ่งมั่นพัฒนาหลักสูตร'));

  const text = doc().body.textContent;
  assert.equal(text.includes(REMOVED_PARAGRAPH), false, 'the removed paragraph still renders');
  assert.equal(text.includes('ตลอดระยะเวลากว่า 21 ปี'), false);
  assert.ok(text.includes(ABOUT_PARAGRAPHS[0]) && text.includes(ABOUT_PARAGRAPHS[1]), 'the two kept paragraphs render');
});
