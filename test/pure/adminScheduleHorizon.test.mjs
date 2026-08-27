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
import {
  EDITOR_RANGE_MONTHS_BACK,
  EDITOR_RANGE_MONTHS_FORWARD,
  rangeFor,
} from '@/lib/schedule/editorCalendarRange';
import { scrubSource } from '../sourceScan.mjs';

// The admin schedule grid's horizon was the literal `4` in three places that
// must agree — the MSDB `to` bound, the column loop, and the Thai subtitle —
// and in a fourth, the modal's date picker, that must NOT. Two failure modes:
//
//   1. The three drift apart. Nothing enforced their agreement; they agreed
//      only because one person wrote them in one sitting.
//   2. Someone "unifies" all four. The picker bounds what a user may PICK — a
//      coincidentally-equal number, not the same concept as what the table can
//      DISPLAY.
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
const RANGE_REL = 'src/lib/schedule/editorCalendarRange.js';
const HORIZON_MODULE = '@/lib/adminScheduleHorizon';

const pageSrc = read(PAGE_REL);
const clientSrc = read(CLIENT_REL);

/**
 * The grid's vocabulary. Any of these appearing where the PICKER's range is
 * decided means the two concepts have been fused.
 */
const GRID_IDENTIFIERS = [
  'ADMIN_SCHEDULE_MONTHS',
  'adminScheduleMonthCols',
  'adminScheduleWindow',
  'adminScheduleHorizon',
];

/**
 * Source with comments and imports removed — the suite's standing rule (see
 * test/sourceScan.mjs, defects 1, 2 and 5: a docstring that NAMES a symbol, or
 * a sentence saying a module does NOT use one, satisfies a bare `includes()`
 * and turns a guard green for the wrong reason).
 *
 * It matters here specifically: the range block in SchedulesAdminClient.jsx
 * carries a comment explaining WHY it must not touch the grid, and that comment
 * necessarily names the very identifiers this file forbids.
 */
const scrub = (text) => scrubSource(text, { stripImports: true });

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

// The picker's range now lives in its own module, so the guard is in two
// parts: a WHOLE-FILE scan of that module, and a SLICED scan of the modal's
// call site. They catch different things and neither subsumes the other.

test('the picker range module names no grid identifier ANYWHERE in the file', () => {
  // Whole-file, no anchors. This module answers "what can be picked"; there is
  // no legitimate reason for any grid identifier to appear in it, at any depth,
  // in any function. A scan with no anchors cannot rot the way a sliced one can
  // — which is exactly why the old anchored version of this assertion had to be
  // re-pointed the moment the picker was redesigned.
  const src = scrub(read(RANGE_REL));

  for (const forbidden of GRID_IDENTIFIERS) {
    assert.ok(
      !src.includes(forbidden),
      `${RANGE_REL} references ${forbidden}.\n\n` +
      `FALSE FRIEND. The grid horizon and the picker's range are both "a number ` +
      `of months" and they are not the same concept: the horizon decides what the ` +
      `admin TABLE displays, the range decides what a user may PICK. Fusing them ` +
      `means a round outside the table's reach can no longer be corrected — which ` +
      `is the defect this module was written to remove (15 of 90 live rounds were ` +
      `uneditable on 2026-08-27).\n\n` +
      `If the picker's reach should change, change the constants in this module ` +
      `on their own evidence.`,
    );
  }
});

test('the modal does not PASS the grid horizon into the picker range', () => {
  // Sliced, and it has to be: SchedulesAdminClient.jsx legitimately imports
  // ADMIN_SCHEDULE_MONTHS and adminScheduleMonthCols for the table's own
  // columns and for the out-of-grid save warning, so a whole-file scan here
  // would be a false positive. What is forbidden is those values reaching the
  // RANGE — as an argument, a default, or a clamp.
  const block = sliceBlock(
    scrub(clientSrc), 'picker range',
    'const calendarRange = useMemo(',
    'const todayIso =',
  );

  for (const forbidden of GRID_IDENTIFIERS) {
    assert.ok(
      !block.includes(forbidden),
      `the modal passes ${forbidden} into the picker's range.\n\n` +
      `FALSE FRIEND — see the note on the range module's own guard. The range ` +
      `must be derived from the DATA BEING EDITED and the clock, never from how ` +
      `far the table happens to reach.\n\n` +
      `The opposite direction is fine and is deliberate: the save-time ` +
      `out-of-grid warning DOES call the grid helper, because "will this round ` +
      `appear in the table" genuinely is a question about the grid. That call ` +
      `lives in outOfGridDates, outside this block.\n\n` +
      `Block as found:\n${block.slice(0, 400)}`,
    );
  }
});

// Replaces the old source-regex that asserted the picker bounded its loop with
// a numeric literal. Importing the module and exercising it is strictly
// stronger: it pins BEHAVIOUR rather than the shape of an expression, so a
// reformulation that keeps the behaviour no longer reddens anything, and one
// that breaks it reddens this whether or not a literal is still present.
// (test/sourceScan.mjs calls that failure mode defect 7.)
test('the picker range is its own concept, with its own constants and its own reach', () => {
  assert.notEqual(
    EDITOR_RANGE_MONTHS_FORWARD, ADMIN_SCHEDULE_MONTHS,
    'the picker\'s forward reach is now numerically equal to the grid horizon. That ' +
    'is not automatically wrong, but it is how the previous coincidence started — ' +
    'the old picker span and the old horizon were both 4. If this equality is ' +
    'intended, say so here explicitly rather than leaving it to be read as shared.',
  );

  const now = new Date(2026, 7, 27);
  const { min, max } = rangeFor({ now, selectedDates: [] });
  assert.equal(min, '2025-08', `expected ${EDITOR_RANGE_MONTHS_BACK} months back`);
  assert.equal(max, '2028-08', `expected ${EDITOR_RANGE_MONTHS_FORWARD} months forward`);

  // THE INVARIANT, asserted here too and not only in the module's own file:
  // this is the guard that would catch someone "simplifying" the range back
  // onto the clock. A date past the grid's last column must still be pickable.
  const pastTheGrid = adminScheduleWindow(now).to.slice(0, 4) + '-12-31';
  const widened = rangeFor({ now, selectedDates: [pastTheGrid] });
  assert.ok(
    pastTheGrid.slice(0, 7) <= widened.max,
    `a stored date past the grid's last column (${pastTheGrid}) must remain pickable — ` +
    'the table\'s reach does not bound the picker\'s.',
  );
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
