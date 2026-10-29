import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import FormatsSection from '@/components/about/FormatsSection';

/**
 * /about-us "เรียนกับเราได้หลายรูปแบบ": round AB-3c grouped the six format
 * links into "in the room" and "online" icon cards. The links themselves —
 * count, order, hrefs and new-tab behaviour — are unchanged.
 */

const html = (props = {}) => renderToStaticMarkup(createElement(FormatsSection, props));
const links = (out) => [...out.matchAll(/<a ([^>]*class="[^"]*about-format[^"]*"[^>]*)>/g)].map(([, attrs]) => attrs);

test('six format links, in the same order, with the same hrefs as before', () => {
  const hrefs = links(html()).map((a) => /href="([^"]+)"/.exec(a)[1]);
  assert.deepEqual(hrefs, [
    '/training-course',
    '/registration/in-house',
    '/masterclass',
    '/career-path-project',
    'https://academy.9experttraining.com',
    'https://academy.9experttraining.com/bundles',
  ]);
});

test('only the two academy links open in a new tab, each announced', () => {
  const out = html();
  const external = links(out).filter((a) => /target="_blank"/.test(a));
  assert.equal(external.length, 2);
  for (const a of external) assert.match(a, /rel="noopener noreferrer"/);
  assert.equal((out.match(/\(เปิดในแท็บใหม่\)/g) ?? []).length, 2);
});

test('two groups: in the room (4 links) then online (2 links)', () => {
  const out = html();
  const room = out.indexOf('aria-label="เรียนในห้องอบรม"');
  const online = out.indexOf('aria-label="เรียนออนไลน์"');
  assert.ok(room > -1 && online > room, 'room group first, online second');
  assert.equal(links(out.slice(room, online)).length, 4);
  assert.equal(links(out.slice(online)).length, 2);
});

test('the Career Path count shows only when the loader supplied one', () => {
  assert.match(html({ careerPathCount: 12 }), /12 เส้นทางสายอาชีพ/);
  assert.doesNotMatch(html({ careerPathCount: null }), /\d+ เส้นทางสายอาชีพ/);
});
