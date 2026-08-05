import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseCarousel, PromotionCarousel } from '@/components/chat/ChatCards';

// Paging controls that have nowhere to page to.
//
// Both carousels are the same component underneath — they differ only in card
// width and key — so the guard is written once and asserted on both, which is
// also how the defect reached both in the first place.

const html = (Comp, items) => renderToStaticMarkup(createElement(Comp, { items }));
const chevrons = (markup) =>
  (markup.match(/aria-label="(?:ก่อนหน้า|ถัดไป)"/g) ?? []).length;

const COURSES = [
  { course_id: 'GEN-AI-L1', title: 'Generative AI', image_url: '', price: '14,900 ฿' },
  { course_id: 'CC-AI', title: 'AI Content Creator', image_url: '', price: '14,900 ฿' },
];
const PROMOS = [
  { id: 'p1', title: 'โปรโมชันที่ 1', image_url: '' },
  { id: 'p2', title: 'โปรโมชันที่ 2', image_url: '' },
];

test('a single card renders no paging controls', () => {
  assert.equal(chevrons(html(CourseCarousel, COURSES.slice(0, 1))), 0, 'course carousel');
  assert.equal(chevrons(html(PromotionCarousel, PROMOS.slice(0, 1))), 0, 'promotion carousel');
});

test('CONTROL: two cards DO render both controls', () => {
  // Without this, "no chevrons" would pass for a carousel that lost its
  // controls entirely, or for one that renders nothing at all.
  assert.equal(chevrons(html(CourseCarousel, COURSES)), 2, 'course carousel');
  assert.equal(chevrons(html(PromotionCarousel, PROMOS)), 2, 'promotion carousel');
});

test('CONTROL: the single-card case still renders its card', () => {
  // The other way the assertion above could pass for the wrong reason: hiding
  // the whole carousel rather than just its controls.
  const course = html(CourseCarousel, COURSES.slice(0, 1));
  assert.ok(course.includes('Generative AI'), 'the one course is still shown');
  const promo = html(PromotionCarousel, PROMOS.slice(0, 1));
  assert.ok(promo.includes('โปรโมชันที่ 1'), 'and the one promotion is too');
  // …and an empty list is still nothing at all.
  assert.equal(html(CourseCarousel, []), '');
  assert.equal(html(PromotionCarousel, []), '');
});
