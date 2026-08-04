import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ScheduleBoard,
  ScheduleFilterPanel,
} from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  monthKey,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import {
  activeScheduleFilterCount,
  defaultScheduleFilters,
} from '@/lib/schedule/scheduleFilters';

/**
 * The mobile filter sheet, rendered.
 *
 * ── WHAT A STATIC RENDER CAN AND CANNOT PROVE HERE ──────────────────────────
 * There is no jsdom in this suite, so nothing can click a control. What CAN be
 * proved — and is the actual claim the sheet has to satisfy — is that no state
 * exists in which the sheet shows a filter value the list has not already
 * applied. `ScheduleClient` owns the filter state and `ScheduleBoard` renders
 * both the results and the sheet from it, so a single static render at a given
 * filter value shows BOTH sides at once. If the sheet held draft state, the
 * selected `<option>` and the rendered list would be able to disagree; here
 * they are two readings of one prop, and each test below asserts they agree.
 *
 * A draft-then-apply implementation is therefore not something these tests
 * merely fail to observe — it is a shape ScheduleBoard cannot represent, and
 * the fs tier pins that no `useState` reappears inside the panel.
 *
 * The panel is rendered directly in places because `createPortal` has no server
 * renderer; the component falls back to rendering in place when there is no
 * `document`, which is what lets ScheduleBoard be rendered with the sheet open.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
const OPTIONS = rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON);
const DEFAULTS = defaultScheduleFilters(now);

const dayIn = (key, day) => `${key}-${String(day).padStart(2, '0')}`;

const course = (id, name, program, schedules) => ({
  _id: id,
  course_id: id.toUpperCase(),
  course_name: name,
  course_price: 8500,
  course_trainingdays: 2,
  program: { program_name: program },
  schedules,
});

/**
 * Three courses chosen so each control moves the count by a different amount:
 * `hybrid` leaves one, `nearly_full` leaves one, program `Data` leaves two.
 */
const COURSES = [
  course('c1', 'Power BI', 'Data', [
    { _id: 's1', dates: [dayIn(WINDOW[0], 3)], type: 'classroom', status: 'open' },
  ]),
  course('c2', 'Excel', 'Data', [
    { _id: 's2', dates: [dayIn(WINDOW[1], 3)], type: 'hybrid', status: 'nearly_full' },
  ]),
  course('c3', 'Photoshop', 'Design', [
    { _id: 's3', dates: [dayIn(WINDOW[2], 3)], type: 'classroom', status: 'open' },
  ]),
];

const PROGRAMS = [
  { _id: 'p1', program_name: 'Data' },
  { _id: 'p2', program_name: 'Design' },
];

const renderBoard = (overrides = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: COURSES,
      programs: PROGRAMS,
      schedulePDF: null,
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: true,
      onSheetOpenChange() {},
      ...overrides,
    }),
  );

const renderPanel = (overrides = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleFilterPanel, {
      filters: DEFAULTS,
      safeMonthTo: DEFAULTS.monthTo,
      programs: PROGRAMS,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      onClose() {},
      resultCount: 3,
      activeCount: 0,
      ...overrides,
    }),
  );

/** The sheet's own markup — the dialog and its backdrop. */
const sheetRegion = (html) => {
  const start = html.indexOf('<div class="fixed inset-0 z-[9999] lg:hidden">');
  assert.notEqual(start, -1, 'the sheet did not render — is `open` set?');
  return html.slice(start);
};
const pageRegion = (html) => html.slice(0, html.indexOf('<div class="fixed inset-0 z-[9999] lg:hidden">'));

/** Every rendered ผลลัพธ์การค้นหา number, in document order. */
const resultCounts = (html) =>
  [...html.matchAll(/ผลลัพธ์การค้นหา[\s\S]{0,120}?>(\d+)<\/span>/g)].map((m) => Number(m[1]));

/** The `<select aria-label="…">` block, and the value its selected option holds. */
const selectFor = (html, ariaLabel) => {
  const re = new RegExp(`<select aria-label="${ariaLabel}"[\\s\\S]*?</select>`, 'g');
  return [...html.matchAll(re)].map((m) => m[0]);
};
const selectedValue = (selectHtml) =>
  selectHtml.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1] ?? null;

/** Course rows visible in the mobile cards. */
const cardNames = (html) =>
  (html.match(/<article[\s\S]*?<\/article>/g) ?? []).map(
    (a) => a.match(/>([^<]+)<\/a>/)?.[1] ?? '',
  );

// ── The sheet exists, holds all five controls, and is a dialog ──────────────

test('the sheet holds all five controls', () => {
  const html = sheetRegion(renderBoard());
  for (const label of ['โปรแกรม', 'รูปแบบ', 'สถานะ', 'เดือนเริ่มต้น', 'เดือนสุดท้าย']) {
    assert.equal(
      selectFor(html, label).length,
      1,
      `the sheet must contain exactly one ${label} control`,
    );
  }
});

test('the sheet is a modal dialog labelled by its own heading', () => {
  const html = sheetRegion(renderBoard());
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(labelledBy, 'the dialog must name its label');
  assert.ok(
    html.includes(`id="${labelledBy}"`),
    'aria-labelledby must point at an element that exists',
  );
  assert.match(html, /ปิดตัวกรอง/, 'a close control, labelled as closing');
});

/** The ตัวกรอง trigger's own `<button>` element. */
const triggerButton = (html) =>
  (html.match(/<button[^>]*aria-haspopup="dialog"[\s\S]*?<\/button>/g) ?? [])[0] ?? '';

test('the trigger button carries aria-expanded, and it tracks the sheet', () => {
  const closed = triggerButton(pageRegion(renderBoard({ sheetOpen: false })));
  assert.ok(closed, 'the ตัวกรอง button did not render');
  assert.ok(closed.includes('aria-expanded="false"'), 'closed state');
  assert.ok(closed.includes('ตัวกรอง'), 'and it is the ตัวกรอง button');

  const open = triggerButton(pageRegion(renderBoard({ sheetOpen: true })));
  assert.ok(open.includes('aria-expanded="true"'), 'open state');
});

test('the sheet paints above the header, not under the sticky bar it lives in', () => {
  /**
   * The filter bar is `sticky top-20 z-20`, which creates a stacking context;
   * a `fixed` sheet rendered inside it is capped at z:20 and paints under the
   * site header (z:60). The portal + z-[9999] is the same escape the site's
   * mobile drawer uses.
   */
  const html = renderBoard();
  assert.ok(html.includes('z-[9999]'), 'the sheet must out-rank the header');
  assert.equal(html.includes('z-[60]'), false, 'and must not be trying to tie with it');
});

// ── LIVE, NOT DRAFT ─────────────────────────────────────────────────────────

test('a filter value shown in the sheet is ALREADY applied to the list', () => {
  /**
   * THE draft-vs-live assertion. One render, two readings of one prop: what the
   * sheet's `<select>` says, and what the card list contains. A draft-then-apply
   * sheet is exactly the state where these two disagree.
   */
  const html = renderBoard({ filters: { ...DEFAULTS, type: 'hybrid' } });
  const sheet = sheetRegion(html);
  const page = pageRegion(html);

  assert.equal(selectedValue(selectFor(sheet, 'รูปแบบ')[0]), 'hybrid', 'the sheet shows hybrid');
  assert.deepEqual(cardNames(page), ['Excel'], 'and the list already shows only the hybrid course');
});

test('every control moves the list with no apply step', () => {
  const cases = [
    [{ type: 'hybrid' }, ['Excel']],
    [{ status: 'nearly_full' }, ['Excel']],
    [{ program: 'Design' }, ['Photoshop']],
    [{ monthFrom: WINDOW[0], monthTo: WINDOW[0] }, ['Power BI']],
  ];
  for (const [patch, expected] of cases) {
    const html = renderBoard({ filters: { ...DEFAULTS, ...patch } });
    assert.deepEqual(
      cardNames(pageRegion(html)),
      expected,
      `changing ${JSON.stringify(patch)} did not move the list`,
    );
  }
});

test('CONTROL: the default filters DO show every course', () => {
  // Without this, a board that rendered no cards at all would pass every
  // narrowing assertion above.
  assert.deepEqual(cardNames(pageRegion(renderBoard())), ['Power BI', 'Excel', 'Photoshop']);
});

test('there is no ใช้ตัวกรอง button — the only actions are reset and close', () => {
  const html = sheetRegion(renderBoard());
  assert.equal(html.includes('ใช้ตัวกรอง'), false, 'a button applying what is already applied');
  assert.ok(html.includes('>ล้างตัวกรอง<'), 'the reset control');
  assert.ok(html.includes('aria-label="ปิดตัวกรอง"'), 'the dismiss control, labelled as closing');
});

// ── The live count inside the sheet ─────────────────────────────────────────

test('the count inside the sheet equals the count on the page', () => {
  /**
   * The sheet covers the results, so the count is the only feedback a change
   * gives while it is open. Asserted across ALL three renderings of the line in
   * ONE markup — the mobile bar, the desktop column, and the sheet — because
   * "equal" is the whole claim: a second count derived from a parallel filter
   * path is precisely what would drift.
   */
  for (const patch of [{}, { type: 'hybrid' }, { program: 'Data' }, { status: 'full' }]) {
    const html = renderBoard({ filters: { ...DEFAULTS, ...patch } });
    const counts = resultCounts(html);
    assert.equal(counts.length, 3, 'expected the result line on the bar, the page and the sheet');
    assert.equal(new Set(counts).size, 1, `counts disagree for ${JSON.stringify(patch)}: ${counts}`);
    assert.equal(counts[0], cardNames(pageRegion(html)).length, 'and it counts the cards actually rendered');
  }
});

test('CONTROL: the count probe DOES move between filter states', () => {
  // Without this, a probe that always returned the same number (or nothing)
  // would satisfy the equality above.
  assert.equal(resultCounts(renderBoard())[0], 3);
  assert.equal(resultCounts(renderBoard({ filters: { ...DEFAULTS, type: 'hybrid' } }))[0], 1);
});

// ── ล้างตัวกรอง restores the ROLLING window ────────────────────────────────

test('the reset target is the rolling window, not January–December', () => {
  /**
   * The defect monthWindow.js exists to remove was a "default" that silently
   * meant "the rest of this calendar year". A ล้างตัวกรอง that restored
   * มกราคม–ธันวาคม would be that same bug wearing a button — and it would look
   * right in January and only in January.
   */
  const year = now.getFullYear();
  assert.equal(DEFAULTS.monthFrom, monthKey(now), 'starts at the current month');
  assert.equal(DEFAULTS.monthTo, WINDOW[WINDOW.length - 1], 'and runs the default window');
  assert.equal(WINDOW.length, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
  assert.notDeepEqual(
    [DEFAULTS.monthFrom, DEFAULTS.monthTo],
    [`${year}-01`, `${year}-12`],
    'the reset target must not be the calendar year',
  );
});

test('the page opens on exactly that window', () => {
  // The rendered proof that the reset target and the initial state are the same
  // object: the two month selects come up on the rolling window's ends.
  const html = pageRegion(renderBoard({ sheetOpen: false }));
  assert.equal(selectedValue(selectFor(html, 'เดือนเริ่มต้น')[0]), DEFAULTS.monthFrom);
  assert.equal(selectedValue(selectFor(html, 'เดือนสุดท้าย')[0]), DEFAULTS.monthTo);
});

test('the ถึง options below `from` are disabled by KEY, not by index', () => {
  // `disabled` is a substring of `disabled:opacity-30`, so this matches the
  // ATTRIBUTE form React emits for a real boolean prop.
  const html = sheetRegion(renderBoard({ filters: { ...DEFAULTS, monthFrom: WINDOW[2] } }));
  const to = selectFor(html, 'เดือนสุดท้าย')[0];
  const disabled = [...to.matchAll(/<option value="([^"]+)"[^>]*disabled=""/g)].map((m) => m[1]);
  assert.deepEqual(disabled, OPTIONS.filter((k) => k < WINDOW[2]));
  assert.ok(disabled.length > 0, 'nothing was disabled — the guard has no subject');
  assert.equal(disabled.includes(WINDOW[2]), false, 'the selected month itself stays enabled');
});

// ── The active-filter badge ─────────────────────────────────────────────────

test('the active-filter count is 0 at defaults and non-zero after a change', () => {
  assert.equal(activeScheduleFilterCount(DEFAULTS, DEFAULTS), 0);
  assert.equal(activeScheduleFilterCount({ ...DEFAULTS, type: 'hybrid' }, DEFAULTS), 1);
  assert.equal(activeScheduleFilterCount({ ...DEFAULTS, monthTo: WINDOW[0] }, DEFAULTS), 1);
  assert.equal(
    activeScheduleFilterCount({ ...DEFAULTS, monthFrom: WINDOW[1], monthTo: WINDOW[2] }, DEFAULTS),
    1,
    'a month RANGE is one decision, not two',
  );
  assert.equal(
    activeScheduleFilterCount(
      { program: 'Data', type: 'hybrid', status: 'open', monthFrom: WINDOW[1], monthTo: WINDOW[1] },
      DEFAULTS,
    ),
    4,
  );
});

test('the badge is absent at defaults and rendered after a change', () => {
  const plain = pageRegion(renderBoard({ sheetOpen: false }));
  assert.match(plain, /ตัวกรอง/, 'the button is there');
  assert.equal(
    /bg-9e-action px-1\.5 text-xs font-bold text-white/.test(plain),
    false,
    'no badge should render with nothing filtered',
  );

  const filtered = pageRegion(
    renderBoard({ sheetOpen: false, filters: { ...DEFAULTS, type: 'hybrid', status: 'open' } }),
  );
  assert.match(filtered, /bg-9e-action px-1\.5 text-xs font-bold text-white">2</, 'badge should read 2');
});

// ── The legend's mobile home ────────────────────────────────────────────────

test('the legend and its explanations live in the sheet', () => {
  /**
   * The legend is what makes the dots on the round rows mean anything, and its
   * desktop home is the inline bar that no longer renders below `lg`. Touch has
   * no hover, so the tooltip's explanations are shown outright rather than
   * behind the `?`.
   */
  const html = sheetRegion(renderBoard());
  assert.ok(html.includes('Classroom'), 'Classroom missing from the sheet legend');
  assert.ok(html.includes('Hybrid'), 'Hybrid missing from the sheet legend');
  assert.ok(html.includes('อบรมที่ห้องอบรม 9Expert'), 'the explanation is not shown');
  assert.match(html, /background-color:#00CCFF/, 'the legend swatch uses the row colour');
  assert.match(html, /background-color:#8B5CF6/);
});

test('the schedule PDF keeps a mobile home in the hero', () => {
  // It was never in the filter bar, so collapsing the bar does not strand it —
  // asserted rather than assumed, because "it is already fine" is the claim
  // most likely to stop being true.
  const html = renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: COURSES,
      programs: PROGRAMS,
      schedulePDF: { url: 'https://example.com/schedule.pdf' },
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: false,
      onSheetOpenChange() {},
    }),
  );
  const hero = html.slice(0, html.indexOf('sticky top-20'));
  assert.match(hero, /href="https:\/\/example\.com\/schedule\.pdf"/, 'the PDF link is in the hero');
  assert.ok(hero.includes('ดาวน์โหลดตารางการฝึกอบรม'));
  assert.equal(
    /class="[^"]*\blg:block\b[^"]*"[^>]*>\s*<a href="https:\/\/example\.com/.test(hero),
    false,
    'and it is not gated to a breakpoint',
  );
});

// ── The panel renders standalone ────────────────────────────────────────────

test('the panel is a plain component — no portal, no state, needed to render it', () => {
  // The seam this file leans on: the panel is reachable without a DOM, so the
  // sheet's contents are testable at all.
  const html = renderPanel({ activeCount: 2, resultCount: 7 });
  assert.match(html, /role="dialog"/);
  assert.equal(resultCounts(html)[0], 7, 'the panel prints the count it is handed');
  assert.match(html, /bg-9e-action px-1\.5 text-xs font-bold text-white">2</, 'and the active count');
});
