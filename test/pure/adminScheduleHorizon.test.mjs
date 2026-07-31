import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  ADMIN_SCHEDULE_MONTHS,
  adminScheduleMonthCols,
  adminScheduleWindow,
} from '@/lib/adminScheduleHorizon';

// The admin schedule grid's horizon was the literal `4` in three places that
// must agree — the MSDB `to` bound, the column loop, and the Thai subtitle —
// and in a fourth, `calendarMonths`, that must NOT. Two failure modes:
//
//   1. The three drift apart. Nothing enforced their agreement; they agreed
//      only because one person wrote them in one sitting.
//   2. Someone "unifies" all four. `calendarMonths` bounds the modal date
//      picker's scroll — a coincidentally-equal number, not the same concept.
//      Coupling it to the grid renders a 12-month day-grid scroll inside a
//      max-h-80 box.
//
// They also never actually agreed. The old bound was `today + N months`
// (2026-07-29 → 2026-11-29) while the last column was the month containing
// `today + N-1 months` (October). November rows were fetched and then dropped
// by `monthKey(s.dates[0])` matching no column — an over-fetch plus a silent
// client-side drop, the same shape as the /schedule join incident (see
// test/pure/joinCourseSchedules.test.mjs). The bound is now DERIVED from the
// last column, so the assertions below confirm a structural property rather
// than police two parallel computations.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE_REL = 'src/app/admin/schedules/page.jsx';
const CLIENT_REL = 'src/app/admin/schedules/_components/SchedulesAdminClient.jsx';
const HORIZON_MODULE = '@/lib/adminScheduleHorizon';

const pageSrc = read(PAGE_REL);
const clientSrc = read(CLIENT_REL);

/**
 * Slice the source between two anchors. THROWS when an anchor is missing
 * rather than returning '' — an empty slice passes every "does not contain"
 * assertion below, so a rename would silently disarm this file. Same lesson as
 * the sticky-bar ancestor model in test/render/stickyBarButtonCoordination.
 */
function sliceBlock(src, label, startAnchor, endAnchor) {
  const start = src.indexOf(startAnchor);
  assert.notEqual(
    start, -1,
    `[${label}] anchor not found in source: ${JSON.stringify(startAnchor)}. ` +
    `This test cannot see the block it exists to guard — re-point the anchor, ` +
    `do not delete the assertion.`,
  );
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  assert.notEqual(
    end, -1,
    `[${label}] end anchor not found after start: ${JSON.stringify(endAnchor)}.`,
  );
  return src.slice(start, end);
}

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

// ── 1. the horizon is single-sourced ──────────────────────────────────────

test('page.jsx takes its fetch window from the horizon module, not its own arithmetic', () => {
  assert.match(
    pageSrc,
    new RegExp(`from '${HORIZON_MODULE.replace('/', '\\/')}'`),
    `${PAGE_REL} must import the shared horizon module`,
  );
  assert.match(pageSrc, /adminScheduleWindow\(/, 'page must call adminScheduleWindow()');

  // The old bound, in either spelling. Both must be gone: `to` is now the last
  // day of the last rendered column, not an offset from today.
  assert.doesNotMatch(
    pageSrc, /setMonth\s*\(/,
    `${PAGE_REL} still shifts a Date by months itself — that is the horizon ` +
    `computed a second time, in parallel with the columns.`,
  );
  assert.doesNotMatch(
    pageSrc, /getMonth\s*\(\)\s*\+\s*\d/,
    `${PAGE_REL} still adds a literal month offset — use adminScheduleWindow().`,
  );
});

test('the grid column loop takes its count from the horizon module, not a literal', () => {
  assert.match(
    clientSrc,
    new RegExp(`ADMIN_SCHEDULE_MONTHS[\\s\\S]{0,200}from '${HORIZON_MODULE.replace('/', '\\/')}'`),
    `${CLIENT_REL} must import ADMIN_SCHEDULE_MONTHS from the shared module`,
  );

  const block = sliceBlock(
    clientSrc, 'monthCols',
    'const monthCols = useMemo(',
    '// ── lookups',
  );
  assert.match(
    block, /adminScheduleMonthCols\(/,
    'monthCols must be built by the shared helper',
  );
  assert.doesNotMatch(
    block, /i\s*<\s*\d+/,
    'monthCols still counts to a hardcoded literal — that is the duplicate this ' +
    'change removed.',
  );
});

// ── 2. the false friend stays separate ────────────────────────────────────

test('calendarMonths keeps its OWN literal and does not import the grid constant', () => {
  const block = sliceBlock(
    clientSrc, 'calendarMonths',
    'const calendarMonths = useMemo(',
    '}, [initialMonthKey]);',
  );

  const loop = block.match(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*(\d+)\s*;/);
  assert.ok(
    loop,
    'calendarMonths no longer bounds its loop with a numeric literal. If it now ' +
    'reads ADMIN_SCHEDULE_MONTHS, REVERT: this is the modal date picker\'s scroll ' +
    'window, not the grid horizon. It was equal to the old horizon (4) by ' +
    'coincidence. A 12-month day-grid scroll inside a max-h-80 box is not a ' +
    'cleanup.\n\nBlock as found:\n' + block.slice(0, 400),
  );

  for (const forbidden of [
    'ADMIN_SCHEDULE_MONTHS',
    'adminScheduleMonthCols',
    'adminScheduleWindow',
    'adminScheduleHorizon',
  ]) {
    assert.ok(
      !block.includes(forbidden),
      `calendarMonths references ${forbidden} — the date picker must not be ` +
      `coupled to the table's horizon.`,
    );
  }

  // Recorded, not enforced as policy: this number may change on its own
  // evidence (picker ergonomics). It must simply never change BECAUSE the grid
  // horizon changed.
  assert.equal(loop[1], '4', `calendarMonths currently spans ${loop[1]} months`);
});

// ── 3. fetch bound ⇔ column count, provably ───────────────────────────────
// Nothing below hardcodes 12. Change ADMIN_SCHEDULE_MONTHS and these still
// pass — that IS the property: the two sides move together.

test('the `to` bound is the last day of the last rendered column', () => {
  const cases = [
    new Date(2026, 6, 29),  // today at time of writing — 2026-07-29
    new Date(2026, 0, 1),   // first of a month, first of a year
    new Date(2026, 11, 15), // December start — the window crosses a year
    new Date(2026, 2, 31),  // 31st into shorter target months
    new Date(2027, 2, 15),  // target lands in a leap February at N=12
  ];

  for (const now of cases) {
    const cols = adminScheduleMonthCols(now);
    const { from, to } = adminScheduleWindow(now);
    const last = cols[cols.length - 1];

    assert.equal(cols.length, ADMIN_SCHEDULE_MONTHS, `column count for ${iso(now)}`);
    assert.equal(cols[0].key, iso(now).slice(0, 7), `first column is now's month (${iso(now)})`);
    assert.equal(from, iso(now), `from is today (${iso(now)})`);

    // the assertion the whole file exists for
    assert.equal(
      to.slice(0, 7), last.key,
      `to (${to}) must fall in the LAST rendered column (${last.key}) for today ${iso(now)} — ` +
      `a row upstream returns after the last column has no cell to render into and is ` +
      `dropped silently by monthKey().`,
    );
    assert.equal(
      to, iso(new Date(last.year, last.month + 1, 0)),
      `to must be the LAST DAY of ${last.key}, or rows late in that month are missed`,
    );

    // columns are consecutive, no gaps — otherwise "within the window" is not
    // the same as "has a column"
    for (let i = 1; i < cols.length; i++) {
      const prev = cols[i - 1];
      assert.equal(
        cols[i].key,
        iso(new Date(prev.year, prev.month + 1, 1)).slice(0, 7),
        `column ${i} does not follow column ${i - 1}`,
      );
    }
  }
});

test('the window crosses a year boundary — with a 12-month horizon that is the normal case', () => {
  assert.ok(
    ADMIN_SCHEDULE_MONTHS >= 2,
    'this case needs a horizon of at least 2 months to be able to cross a year',
  );
  const now = new Date(2026, 11, 15); // 2026-12-15
  const cols = adminScheduleMonthCols(now);
  const { to } = adminScheduleWindow(now);
  const last = cols[cols.length - 1];

  assert.ok(
    last.year > now.getFullYear(),
    `expected the last column (${last.key}) to land in a later year than ${now.getFullYear()}`,
  );
  assert.equal(to.slice(0, 4), String(last.year), 'the bound crossed the year with the columns');

  // and at the current horizon, concretely:
  if (ADMIN_SCHEDULE_MONTHS === 12) {
    assert.equal(last.key, '2027-11');
    assert.equal(to, '2027-11-30');
  }
});

test('CONTROL: the old `today + N months` bound would NOT satisfy the assertion above', () => {
  // Replicates the pre-fix arithmetic. If this ever equals the derived bound
  // for a mid-month today, the test above has stopped discriminating and its
  // green means nothing.
  const now = new Date(2026, 6, 29); // 2026-07-29
  const old = new Date(now);
  old.setMonth(old.getMonth() + ADMIN_SCHEDULE_MONTHS);

  const { to } = adminScheduleWindow(now);
  assert.notEqual(iso(old), to, 'derived bound is indistinguishable from the old one');

  const lastCol = adminScheduleMonthCols(now).at(-1);
  assert.notEqual(
    iso(old).slice(0, 7), lastCol.key,
    'the old bound overshot the last column by a whole month — that overshoot is ' +
    'the over-fetch whose rows were then dropped client-side',
  );
});

test('CONTROL: the helpers are live, not constants', () => {
  const a = adminScheduleWindow(new Date(2026, 0, 10));
  const b = adminScheduleWindow(new Date(2026, 5, 10));
  assert.notEqual(a.to, b.to, 'adminScheduleWindow ignores its input');
  assert.notEqual(
    adminScheduleMonthCols(new Date(2026, 0, 10))[0].key,
    adminScheduleMonthCols(new Date(2026, 5, 10))[0].key,
    'adminScheduleMonthCols ignores its input',
  );
});

// ── 4. the subtitle is derived ────────────────────────────────────────────

test('the subtitle interpolates the constant instead of naming a digit', () => {
  assert.match(
    clientSrc, /แสดง \{ADMIN_SCHEDULE_MONTHS\} เดือนข้างหน้า/,
    'the subtitle must read the constant',
  );
  assert.doesNotMatch(
    clientSrc, /แสดง\s*\d+\s*เดือน/,
    'the subtitle still hardcodes a digit — it will lie the next time the horizon ' +
    'changes, and it is the only place a human is told what the grid shows.',
  );
});

// ── the value itself ──────────────────────────────────────────────────────
// Deliberately the ONLY test that pins the number, and deliberately separate
// from every agreement assertion above: flipping ADMIN_SCHEDULE_MONTHS is a
// product decision that should fail exactly one test, here, and not look like
// a structural break.

test('the horizon is 12 months', () => {
  assert.equal(
    ADMIN_SCHEDULE_MONTHS, 12,
    'the admin grid must reach at least as far as the public /schedule page, ' +
    'which shows through December — schedules the public can see must be visible ' +
    'to whoever manages them.',
  );
});
