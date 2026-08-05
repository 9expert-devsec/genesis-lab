import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantText } from '@/components/chat/AssistantText';

// What the assistant's message body actually renders.
//
// The pure tier proves the SEGMENTATION is right. This proves the segments
// become the elements they should — and, more importantly, that upstream text
// reaching the DOM is escaped rather than interpreted. React does that for text
// nodes and anchor children, which is the whole reason this path emits data and
// not markup.

const render = (text) => renderToStaticMarkup(createElement(AssistantText, { text }));
const anchors = (html) => [...html.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map((m) => m[0]);

test('each contact shape renders as the anchor it should', () => {
  const html = render('ติดต่อ info@9expert.co.th โทร 02-219-4304 ดูที่ https://x.example.com/a');
  const a = anchors(html);
  assert.equal(a.length, 3, 'three links, one per shape');
  assert.ok(a.some((t) => t.includes('href="mailto:info@9expert.co.th"')), 'mailto');
  assert.ok(a.some((t) => t.includes('href="tel:022194304"')), 'tel, digits normalised');
  assert.ok(a.some((t) => t.includes('href="https://x.example.com/a"')), 'the url');
  // The surrounding prose survives.
  assert.ok(html.includes('ติดต่อ') && html.includes('โทร') && html.includes('ดูที่'));
});

test('only the external URL opens a new tab, and it opens one safely', () => {
  const html = render('a@b.co และ 02-219-4304 และ https://x.example.com/a');
  for (const tag of anchors(html)) {
    if (tag.includes('href="https://')) {
      assert.ok(tag.includes('target="_blank"'), 'external links open in a new tab');
      assert.ok(tag.includes('rel="noopener noreferrer"'), 'and cannot reach back through window.opener');
    } else {
      // mailto:/tel: hand off to another app; target="_blank" would leave a
      // blank tab behind on every tap.
      assert.ok(!tag.includes('target='), `no target on ${tag.slice(0, 40)}`);
    }
  }
});

test('a dangerous scheme renders as plain text, with no anchor at all', () => {
  const html = render('อย่ากด javascript:alert(1) นะครับ');
  assert.deepEqual(anchors(html), [], 'no link was produced');
  assert.ok(html.includes('javascript:alert(1)'), 'and the text is still shown, escaped');
  assert.ok(!html.includes('<script'), 'nothing became markup');
});

test('bullets and links render together on one line', () => {
  // The interaction, at the render tier this time: the glyph substitution runs
  // first and the link split second, inside one component.
  const html = render('*   ติดต่อ info@9expert.co.th ครับ');
  assert.ok(html.includes('•'), 'the bullet glyph is there');
  assert.ok(!html.includes('*   '), 'and the raw marker is gone');
  assert.equal(anchors(html).length, 1, 'the email on that same line still linkified');
  assert.ok(anchors(html)[0].includes('mailto:info@9expert.co.th'));
});

test('CONTROL: upstream markup is escaped, never interpreted', () => {
  // The claim the whole design rests on. If this ever fails, the path has grown
  // a dangerouslySetInnerHTML somewhere and the boundary notes are fiction.
  const html = render('<img src=x onerror=alert(1)> และ <b>ตัวหนา</b>');
  assert.ok(!html.includes('<img'), 'no img element was created');
  assert.ok(!html.includes('<b>'), 'no bold element either');
  assert.ok(html.includes('&lt;img'), 'it is escaped text');
  assert.ok(html.includes('&lt;b&gt;'), 'and so is the bold tag');
});
