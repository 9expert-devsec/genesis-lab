import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { CourseOutline } from '@/app/(public)/[...slug]/_components/CourseOutline';

/**
 * A training topic with nothing under it is a heading, not an accordion: no
 * chevron, no button, no aria-expanded. A topic with bullets keeps all three.
 * The ซ่อน/แสดงทั้งหมด toggle counts only openable rows and is absent when
 * there are none.
 */

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const render = (course, richHtml = null) =>
  docOf(renderToStaticMarkup(createElement(CourseOutline, { course, richHtml })));

const MIXED = {
  course_id: 'C',
  training_topics: [
    { title: 'มีหัวข้อย่อย', bullets: ['x'] },
    { title: 'ไม่มีหัวข้อย่อย', bullets: [] },
  ],
};

/** The row box for each topic, in order. */
const rows = (doc) => [...doc.querySelectorAll('#outline .space-y-2 > div')];
const toggleAllOf = (doc) =>
  [...doc.querySelectorAll('#outline button')].find((b) => /ทั้งหมด/.test(b.textContent));

test('an empty topic has no chevron and no aria-expanded; a non-empty one keeps both', () => {
  const [full, empty] = rows(render(MIXED));

  const btn = full.querySelector('button');
  assert.ok(btn, 'the non-empty row lost its toggle button');
  assert.ok(btn.hasAttribute('aria-expanded'), 'the non-empty row lost aria-expanded');
  assert.ok(btn.querySelector('svg'), 'the non-empty row lost its chevron');

  assert.ok(empty.textContent.includes('2. ไม่มีหัวข้อย่อย'), 'the empty row lost its numbered heading');
  assert.equal(empty.querySelector('button'), null, 'the empty row is still a button');
  assert.equal(empty.querySelector('[aria-expanded]'), null, 'the empty row still carries aria-expanded');
  assert.equal(empty.querySelector('[aria-controls]'), null, 'the empty row still carries aria-controls');
  assert.equal(empty.querySelector('[tabindex]'), null, 'the empty row is in the tab order');
  assert.equal(empty.querySelector('svg'), null, 'the empty row still shows a chevron');
  assert.ok(!/hover:/.test(empty.innerHTML), 'the empty row still has a hover affordance');
});

test('an empty row keeps the collapsed row\'s box, so the list stays even', () => {
  const [full, empty] = rows(render(MIXED));
  const head = (row) => row.firstElementChild.className.split(/\s+/);
  for (const cls of ['flex', 'items-center', 'bg-[var(--surface-raised)]', 'px-5', 'py-3']) {
    assert.ok(head(full).includes(cls), `CONTROL: the toggle no longer carries "${cls}"`);
    assert.ok(head(empty).includes(cls), `the empty row dropped "${cls}"`);
  }
  assert.equal(empty.className, full.className, 'the row frame differs');
});

test('a rich body with no visible text is empty too', () => {
  const [, empty] = rows(render(MIXED, ['<ul><li>x</li></ul>', '<p>&nbsp;</p>']));
  assert.equal(empty.querySelector('button'), null);
  assert.equal(empty.querySelector('.topic-rich'), null, 'an empty rich wrapper rendered');
});

test('the toggle-all control is present while any row can open, absent when none can', () => {
  assert.ok(toggleAllOf(render(MIXED)), 'CONTROL: the toggle-all vanished from a course with bullets');

  const allEmpty = {
    course_id: 'E',
    training_topics: [
      { title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] },
      { title: 'สรุปเนื้อหาทั้งหมด', bullets: ['', ' '] },
    ],
  };
  const doc = render(allEmpty);
  assert.equal(toggleAllOf(doc), undefined, 'toggle-all shown with nothing to open');
  assert.equal(doc.querySelectorAll('#outline button').length, 0);
  assert.ok(doc.body.textContent.includes('Part 9. สรุปเนื้อหา และ Q&A'), 'CONTROL: the section rendered');
});
