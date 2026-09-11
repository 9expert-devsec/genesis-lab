import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts } from '@/lib/articlePublishTime';

/**
 * THE FROZEN CELLS ARE OPAQUE IN DARK MODE — every row, both stripes, header.
 *
 * ── THE DEFECT, OBSERVED ON PRODUCTION ─────────────────────────────────────
 * The four left-hand columns are `sticky` and the month columns scroll under
 * them. In dark mode a date pill ("19-20 ลงทะเบียน") scrolled straight through
 * the course name and the price. Light mode was fine. The cause was colour,
 * not stacking: the odd zebra stripe's fill was `dark:bg-[#0a1424]/40` — a
 * 40% alpha that reads as a tint on the <tr> but, on a sticky <td>, is a mask
 * with a hole in it. The even stripe (`dark:bg-[#111d2c]`) and the <th>
 * (`dark:bg-[#0f1e30]`) were already solid, which is why the bleed showed on
 * alternate rows only.
 *
 * ── WHAT THIS TIER PINS, SAID PLAINLY ──────────────────────────────────────
 * Class strings, not pixels. jsdom applies no CSS and there is no compositor
 * here, so nothing below can see a pill through a cell. What IS observable is
 * the class attribute React emits on each sticky cell, and the rule is one
 * that can be read off it: every sticky cell carries a `dark:bg-…` utility,
 * and none of those utilities ends in a `/NN` alpha modifier. Two courses are
 * rendered so BOTH stripes are on the page — a fixture with one row would
 * never reach the stripe that was broken.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
const OPTIONS = rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON);
const DEFAULTS = defaultScheduleFilters(now);
const CURRENT_YEAR = siteDateParts(now).year;

const course = (id, name) => ({
  _id: `c-${id}`,
  course_id: id,
  course_name: name,
  course_price: 8500,
  course_trainingdays: 2,
  program: { program_name: 'Data' },
  schedules: [{ _id: `s-${id}`, dates: [`${WINDOW[1]}-08`], type: 'classroom', status: 'open' }],
});

// Two courses → row 0 (even stripe) and row 1 (odd stripe, the broken one).
const html = renderToStaticMarkup(
  createElement(ScheduleBoard, {
    courses: [course('POWER-BI', 'Power BI'), course('EXCEL', 'Excel')],
    programs: [{ _id: 'p1', program_name: 'Data' }],
    schedulePDF: null,
    earlyBirdMap: {},
    filters: DEFAULTS,
    defaults: DEFAULTS,
    currentYear: CURRENT_YEAR,
    monthOptions: OPTIONS,
    onFilterChange() {},
    onReset() {},
    sheetOpen: false,
    onSheetOpenChange() {},
  }),
);

const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const table = doc.querySelector('table');
assert.ok(table, 'no <table> rendered — the desktop layout is gone');

const classes = (el) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const stickyOf = (sel) => [...table.querySelectorAll(sel)].filter((el) => classes(el).includes('sticky'));

const stickyTh = stickyOf('thead th');
const stickyTd = stickyOf('tbody td');

/** The `dark:bg-…` utilities on an element. */
const darkBg = (el) => classes(el).filter((c) => c.startsWith('dark:bg-'));
/** The light (unprefixed) `bg-…` utilities on an element. */
const lightBg = (el) => classes(el).filter((c) => /^bg-/.test(c));
/** Tailwind's alpha modifier: `bg-x/40`, `dark:bg-[#hex]/40`. */
const hasAlpha = (util) => /\/\d+$/.test(util);

test('the fixture reaches both stripes and the header', () => {
  assert.equal(stickyTh.length, 4, 'four frozen <th>');
  // Two single-lane rows × four frozen columns.
  assert.equal(stickyTd.length, 8, 'eight frozen <td> — two rows, both stripes');
  const rows = [...table.querySelectorAll('tbody tr')];
  assert.equal(rows.length, 2);
  assert.notDeepEqual(classes(rows[0]), classes(rows[1]), 'the two rows are not striped differently');
});

test('every frozen <th> has a dark background with no alpha', () => {
  for (const th of stickyTh) {
    const d = darkBg(th);
    assert.equal(d.length, 1, `th has ${d.length} dark:bg utilities: ${classes(th).join(' ')}`);
    assert.equal(hasAlpha(d[0]), false, `th dark background carries alpha: ${d[0]}`);
    assert.equal(lightBg(th).length, 1, 'th light background missing or doubled');
  }
});

test('every frozen <td> — BOTH stripes — has a dark background with no alpha', () => {
  for (const td of stickyTd) {
    const d = darkBg(td);
    assert.equal(d.length, 1, `td has ${d.length} dark:bg utilities: ${classes(td).join(' ')}`);
    assert.equal(hasAlpha(d[0]), false, `td dark background carries alpha: ${d[0]}`);
    assert.equal(lightBg(td).length, 1, 'td light background missing or doubled');
  }
});

test('the odd stripe is the header fill, not the alpha tint it used to be', () => {
  // Row 1 is the stripe that bled. Its sticky cells now share the <th>'s
  // dark fill — a token already on this table, not a new colour.
  const rows = [...table.querySelectorAll('tbody tr')];
  const oddCells = [...rows[1].querySelectorAll('td')].filter((td) => classes(td).includes('sticky'));
  assert.equal(oddCells.length, 4);
  for (const td of oddCells) {
    assert.deepEqual(darkBg(td), ['dark:bg-[#0f1e30]']);
    assert.deepEqual(lightBg(td), ['bg-[#FAFBFC]'], 'the light stripe changed');
  }
  assert.deepEqual(darkBg(stickyTh[0]), ['dark:bg-[#0f1e30]']);
});

test('the even stripe is unchanged: white / card', () => {
  const rows = [...table.querySelectorAll('tbody tr')];
  const evenCells = [...rows[0].querySelectorAll('td')].filter((td) => classes(td).includes('sticky'));
  for (const td of evenCells) {
    assert.deepEqual(lightBg(td), ['bg-white']);
    assert.deepEqual(darkBg(td), ['dark:bg-[#111d2c]']);
  }
});

test('no sticky cell reintroduces alpha through a hover or stripe variant', () => {
  // Any `…:bg-…/NN` on a sticky cell — hover:, odd:, even:, dark:hover: —
  // would be a mask with a hole in one state. There are none.
  for (const el of [...stickyTh, ...stickyTd]) {
    const alpha = classes(el).filter((c) => /(^|:)bg-[^\s]*\/\d+$/.test(c));
    assert.deepEqual(alpha, [], `alpha background on a sticky cell: ${alpha.join(' ')}`);
  }
});

test('the frozen cells stack above the month cells — colour was the defect, not order', () => {
  for (const el of [...stickyTh, ...stickyTd]) {
    assert.ok(classes(el).includes('z-10'), 'a sticky cell lost its z-10');
  }
  const monthTd = [...table.querySelectorAll('tbody td')].filter((td) => !classes(td).includes('sticky'));
  assert.ok(monthTd.length > 0);
  for (const td of monthTd) {
    assert.equal(classes(td).some((c) => /^(sticky|relative|absolute|z-)/.test(c)), false,
      'a month cell became positioned — it could then paint over the frozen block');
  }
});

test('CONTROL: the alpha matcher DOES flag an alpha utility', () => {
  // Without this, "no alpha" could pass because hasAlpha() matches nothing.
  assert.equal(hasAlpha('dark:bg-[#0a1424]/40'), true);
  assert.equal(hasAlpha('dark:bg-9e-navy/90'), true);
  assert.equal(hasAlpha('dark:bg-[#0f1e30]'), false);
});
