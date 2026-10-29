import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import InstructorCardsSection from '@/components/about/InstructorCardsSection';

/**
 * /about-us instructor cards render the admin-entered data: the specialties
 * line under "เชี่ยวชาญด้าน:" and the program icon row, each only when the
 * instructor has some. Fixture data — no live save.
 */

const card = (over) => ({
  id: 'i1',
  name: 'ชไลเวท พิพัฒพรรณวงศ์',
  title: '9Expert Instructor | Microsoft MVP',
  imageUrl: 'https://res.cloudinary.com/x/instructors/a.png',
  specialties: [],
  programs: [],
  ...over,
});

test('specialties render under "เชี่ยวชาญด้าน:" joined with " | "', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, {
    cards: [card({ specialties: ['Power BI', 'Excel', 'Power Automate'] })],
  }));
  assert.match(html, /เชี่ยวชาญด้าน:/);
  assert.match(html, />Power BI \| Excel \| Power Automate</);
});

test('program icons: a link per program with a page, a plain image without one, in order', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, {
    cards: [card({ programs: [
      { name: 'Power BI', iconUrl: 'https://x/pbi.png', href: '/power-bi-all-courses' },
      { name: 'Excel', iconUrl: 'https://x/xl.png', href: null },
    ] })],
  }));
  assert.match(html, /<a href="\/power-bi-all-courses" title="Power BI" aria-label="ดูหลักสูตร Power BI" class="about-instructor-program"><img src="https:\/\/x\/pbi\.png" alt=""/);
  assert.match(html, /<span title="Excel" class="about-instructor-program"><img src="https:\/\/x\/xl\.png" alt="Excel"/);
  assert.ok(html.indexOf('Power BI') < html.indexOf('"Excel"'), 'stored order');
  assert.equal((html.match(/<a [^>]*about-instructor-program/g) ?? []).length, 1, 'no link without a page');
  assert.equal(html.includes('about-instructor-tile'), false, 'the framed tile is gone');
});

test("each card's photo box takes its own crop; no crop → the default", () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, {
    cards: [card({ id: 'a', crop: { scale: 180, offsetY: 6 } }), card({ id: 'b' })],
  }));
  const boxes = [...html.matchAll(/class="about-instructor-crop" style="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(boxes, ['top:6%;height:180%;width:104%', 'top:2%;height:225%;width:130%']);
});

test('the horizontal offset moves the photo box only — never the watermark', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, {
    cards: [card({ id: 'a', crop: { scale: 200, offsetY: 3, offsetX: -4 } }), card({ id: 'b' })],
  }));
  const boxes = [...html.matchAll(/class="about-instructor-crop" style="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(boxes, ['top:3%;height:200%;width:115.56%;left:46%', 'top:2%;height:225%;width:130%']);
  for (const [, attrs] of html.matchAll(/<svg class="about-instructor-watermark"([^>]*)>/g)) {
    assert.doesNotMatch(attrs, /style=|left/, 'the watermark carries no crop');
  }
});

test('every panel has the watermark, under the photo, untouched by the crop', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, {
    cards: [card({ id: 'a', crop: { scale: 180, offsetY: 6 } }), card({ id: 'b', imageUrl: '' })],
  }));
  const marks = [...html.matchAll(/<svg class="about-instructor-watermark"([^>]*)>/g)];
  assert.equal(marks.length, 2, 'one per panel, photo or not');
  for (const [, attrs] of marks) {
    assert.match(attrs, /aria-hidden="true"/);
    assert.doesNotMatch(attrs, /style=/, 'the crop never reaches the watermark');
  }
  const first = html.indexOf('about-instructor-panel');
  assert.ok(html.indexOf('about-instructor-watermark', first) < html.indexOf('about-instructor-crop', first),
    'watermark before the photo box in source (stacked under it)');
});

test('with no data, neither block renders (no empty label, no empty tiles)', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, { cards: [card()] }));
  assert.equal(html.includes('เชี่ยวชาญด้าน:'), false);
  assert.equal(html.includes('about-instructor-program'), false);
  assert.match(html, /ชไลเวท พิพัฒพรรณวงศ์/);
});
