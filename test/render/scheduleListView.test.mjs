import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import { decemberOf, windowBetween } from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { siteDateParts, siteMonthKey } from '@/lib/articlePublishTime';

/**
 * /schedule?view=list — the legacy /register-public layout as a second desktop
 * view: one block per course, one <li> per round with its date, status and a
 * ลงทะเบียน link; no link on a full round; a no-round course says so.
 */

const now = new Date();
const RANGE_START = siteMonthKey(now);
const RANGE_END = decemberOf(RANGE_START, 0);
const WINDOW = windowBetween(RANGE_START, RANGE_END);
const DEFAULTS = defaultScheduleFilters(now, RANGE_END);
const CURRENT_YEAR = siteDateParts(now).year;
const NO_ROUND = 'ยังไม่มีรอบอบรมที่เปิดรับ';

const course = (id, code, name, schedules) => ({
  _id: id,
  course_id: code,
  course_name: name,
  course_price: 12900,
  course_trainingdays: 2,
  urlAlias: null,
  program: { program_name: 'Microsoft SQL Server' },
  schedules,
});
const LATER = { _id: 's2', dates: [`${WINDOW[0]}-24`, `${WINDOW[0]}-25`], type: 'hybrid', status: 'nearly_full' };
const EARLIER = { _id: 's1', dates: [`${WINDOW[0]}-20`, `${WINDOW[0]}-21`], type: 'classroom', status: 'open' };
const FULL = { _id: 's3', dates: [`${WINDOW[0]}-27`], type: 'classroom', status: 'full' };
const COURSES = [
  // Rounds deliberately out of date order — the list must sort them.
  course('a', 'SQL-WITH', 'With rounds', [LATER, EARLIER]),
  course('b', 'SQL-FULL', 'Only full', [FULL]),
  course('c', 'SQL-BI-ETL', 'No round at all', []),
];

const render = (view) =>
  new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(ScheduleBoard, {
    courses: COURSES,
    programs: [{ _id: 'p1', program_name: 'Microsoft SQL Server' }],
    schedulePDF: null,
    earlyBirdMap: {},
    filters: DEFAULTS,
    defaults: DEFAULTS,
    currentYear: CURRENT_YEAR,
    monthOptions: WINDOW,
    onFilterChange() {},
    onReset() {},
    sheetOpen: false,
    onSheetOpenChange() {},
    view,
  }))}</body>`).window.document;

const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const LIST = render('list');
/**
 * Each program group's desktop wrapper — the cards beside it are `sm:hidden`
 * and not under test. The view toggle's own `hidden sm:block` wrapper in the
 * filter bar is excluded by what it contains.
 */
const desktop = (doc) =>
  [...doc.querySelectorAll('div.hidden.sm\\:block')].filter((d) => !d.querySelector('[role="tablist"]'));
const blockFor = (doc, code) =>
  desktop(doc).flatMap((d) => [...d.querySelectorAll(':scope > ul > li')]).find((li) => text(li).includes(code));
/** The list prints EVERY round's year — `showYear: true`, not the card's 'auto'. */
const dateOf = (s) => formatRoundDays(s.dates, { showMonth: true, showYear: true });
/** What the mobile card prints for the same round: no year in the current year. */
const cardDateOf = (s) => formatRoundDays(s.dates, { showMonth: true, showYear: 'auto', currentYear: CURRENT_YEAR });

test('a course with rounds: title link, code, and one <li> per round in date order', () => {
  const block = blockFor(LIST, 'SQL-WITH');
  assert.ok(block, 'the course block is missing');
  assert.ok(block.querySelector('a[href]')?.textContent.includes('With rounds'), 'the title is not a link');
  const rounds = [...block.querySelectorAll('ul > li')];
  assert.equal(rounds.length, 2);
  assert.ok(text(rounds[0]).startsWith(dateOf(EARLIER)), 'rounds are not in date order / date format differs');
  assert.ok(text(rounds[1]).startsWith(dateOf(LATER)));
  // The fixture rounds are in the current month, so the card would drop the
  // year; the list must not. The year is the one extra token the list adds.
  assert.notEqual(dateOf(EARLIER), cardDateOf(EARLIER), 'CONTROL: the fixture is a current-year round');
  assert.ok(
    text(rounds[0]).startsWith(`${cardDateOf(EARLIER)} `) && /\s\d{2}$/.test(dateOf(EARLIER)),
    'a current-year round in the list is missing its year',
  );
  assert.ok(text(rounds[1]).includes('ใกล้เต็ม'), 'the status label is missing');
  // The pill says what the round IS (state); the separate link is the action.
  const pill = (li) => [...li.querySelectorAll('span.rounded-full')].map(text).find(Boolean);
  assert.equal(pill(rounds[0]), 'เปิดรับ', 'an open round\'s pill repeats the link\'s ลงทะเบียน');
  assert.ok(text(rounds[0]).includes('Classroom') && text(rounds[1]).includes('Hybrid'), 'the type is missing');

  const link = rounds[0].querySelector('a');
  assert.equal(link.getAttribute('href'), '/registration/public?course=sql-with&class=s1');
  assert.equal(text(link), 'ลงทะเบียน');
  assert.equal(link.getAttribute('aria-label'), `ลงทะเบียน With rounds ${dateOf(EARLIER)}`);
});

test('a full round is listed with its status and NO link', () => {
  const round = blockFor(LIST, 'SQL-FULL').querySelector('ul > li');
  assert.ok(text(round).includes('เต็ม'), 'the full status is missing');
  assert.equal(round.querySelector('a'), null, 'a full round has a registration link');
});

test('a course with no round says so instead of listing rounds', () => {
  const block = blockFor(LIST, 'SQL-BI-ETL');
  assert.ok(text(block).includes(NO_ROUND));
  assert.equal(block.querySelector('ul'), null);
});

test('the list keeps the program group, its badge and the grid', () => {
  const heading = [...LIST.querySelectorAll('h2')].find((h) => text(h) === 'Microsoft SQL Server');
  assert.equal(text(heading.nextElementSibling), '3');
  const grid = desktop(LIST)[0].querySelector(':scope > ul');
  assert.ok(grid.className.includes('xl:grid-cols-2'), 'not a 1/2-column grid');
});

test('CONTROL: the default view is still the table, with no list blocks', () => {
  const table = render(undefined);
  assert.ok(desktop(table)[0].querySelector('table'), 'the table view is gone');
  assert.equal(blockFor(table, 'SQL-WITH'), undefined);
  assert.equal(desktop(LIST)[0].querySelector('table'), null, 'the list view still draws the table');
});

test('the toggle marks the active view', () => {
  const selected = (doc) =>
    [...doc.querySelectorAll('[role="tab"][aria-selected="true"]')].map((b) => b.getAttribute('aria-label'));
  assert.ok(selected(LIST).every((l) => l === 'มุมมองรายการ') && selected(LIST).length > 0);
  assert.ok(selected(render(undefined)).every((l) => l === 'มุมมองตาราง'));
});
