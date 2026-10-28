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

test('program icons render one titled tile each, in order', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, {
    cards: [card({ programs: [{ name: 'Power BI', iconUrl: 'https://x/pbi.png' }, { name: 'Excel', iconUrl: 'https://x/xl.png' }] })],
  }));
  const titles = [...html.matchAll(/<li title="([^"]+)" class="about-instructor-tile"/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Power BI', 'Excel']);
  assert.match(html, /<img src="https:\/\/x\/pbi\.png" alt="Power BI"/);
});

test('with no data, neither block renders (no empty label, no empty tiles)', () => {
  const html = renderToStaticMarkup(createElement(InstructorCardsSection, { cards: [card()] }));
  assert.equal(html.includes('เชี่ยวชาญด้าน:'), false);
  assert.equal(html.includes('about-instructor-tile'), false);
  assert.match(html, /ชไลเวท พิพัฒพรรณวงศ์/);
});
