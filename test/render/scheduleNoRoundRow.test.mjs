import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import { decemberOf, windowBetween } from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts, siteMonthKey } from '@/lib/articlePublishTime';

/**
 * A public course with no round still gets its row: "—" in every month cell on
 * the table, and ยังไม่มีรอบอบรมที่เปิดรับ in place of the round list on the card,
 * with the card's link to the course detail page kept.
 */

const now = new Date();
const RANGE_START = siteMonthKey(now);
const RANGE_END = decemberOf(RANGE_START, 0);
const WINDOW = windowBetween(RANGE_START, RANGE_END);
const DEFAULTS = defaultScheduleFilters(now, RANGE_END);
const NO_ROUND = 'ยังไม่มีรอบอบรมที่เปิดรับ';

const course = (id, code, name, schedules) => ({
  _id: id,
  course_id: code,
  course_name: name,
  course_price: 12900,
  course_trainingdays: 3,
  urlAlias: null,
  program: { program_name: 'Microsoft SQL Server' },
  schedules,
});
const COURSES = [
  course('a', 'SQL-WITH', 'With a round', [
    { _id: 's1', dates: [`${WINDOW[0]}-20`], type: 'classroom', status: 'open' },
  ]),
  course('b', 'SQL-BI-ETL', 'ETL with SQL Server Integration Service (SSIS)', []),
];

const doc = new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(ScheduleBoard, {
  courses: COURSES,
  programs: [{ _id: 'p1', program_name: 'Microsoft SQL Server' }],
  schedulePDF: null,
  earlyBirdMap: {},
  filters: DEFAULTS,
  defaults: DEFAULTS,
  currentYear: siteDateParts(now).year,
  monthOptions: WINDOW,
  onFilterChange() {},
  onReset() {},
  sheetOpen: false,
  onSheetOpenChange() {},
}))}</body>`).window.document;

const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();

test('desktop: the no-round course has a row, and every month cell is "—"', () => {
  const tr = [...doc.querySelectorAll('table tbody tr')].find((r) => text(r).includes('SQL-BI-ETL'));
  assert.ok(tr, 'the no-round course has no table row');
  const monthCells = [...tr.querySelectorAll('td')].filter((td) => !td.className.includes('sticky'));
  assert.equal(monthCells.length, WINDOW.length, 'one cell per visible month');
  for (const td of monthCells) assert.equal(text(td), '—');
  assert.ok(text(tr).includes('ETL with SQL Server Integration Service (SSIS)'), 'the title is missing');
});

test('CONTROL: the course with a round still renders a round cell', () => {
  const tr = [...doc.querySelectorAll('table tbody tr')].find((r) => text(r).includes('SQL-WITH'));
  const monthCells = [...tr.querySelectorAll('td')].filter((td) => !td.className.includes('sticky'));
  assert.ok(monthCells.some((td) => text(td) !== '—'), 'the round cell is missing');
});

test('mobile: the no-round card says so, keeps its detail link, and lists no round', () => {
  const card = [...doc.querySelectorAll('article')].find((a) => text(a).includes('SQL-BI-ETL'));
  assert.ok(card, 'the no-round course has no card');
  assert.ok(text(card).includes(NO_ROUND), 'the no-round line is missing');
  assert.equal(card.querySelector('ul'), null, 'an empty round list rendered');
  assert.ok(
    [...card.querySelectorAll('a')].some((a) => text(a).includes('ดูรายละเอียดคอร์ส')),
    'the detail link is gone',
  );
});

test('CONTROL: the card with a round does not say it has none', () => {
  const card = [...doc.querySelectorAll('article')].find((a) => text(a).includes('SQL-WITH'));
  assert.equal(text(card).includes(NO_ROUND), false);
  assert.ok(card.querySelector('ul li'), 'its round list is missing');
});

test('the group badge counts both rows', () => {
  const heading = [...doc.querySelectorAll('h2')].find((h) => text(h) === 'Microsoft SQL Server');
  assert.equal(text(heading.nextElementSibling), '2');
});
