import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import { resolveDateWindow } from '@/lib/registrations/listFilter';

/**
 * THE IN-HOUSE COURSE DROPDOWN SHOWS NAMES, AND NEVER DROPS A CODE.
 *
 * ══ THE LABEL CHANGES; THE VALUE DOES NOT ═══════════════════════════════════
 *
 * In-house documents store CODES only — `coursesInterested` holds `course_id`
 * values with no title, unlike public which carries `courseName` denormalised —
 * so the dropdown read as a list of SKUs. It now reads names, resolved from the
 * catalogue map page.jsx already fetches for the in-house table.
 *
 * `value` STAYS THE CODE. It is what the documents hold, what `?course=` means
 * and what `courseClause` matches. Changing it would break every existing link
 * and every bookmark, so both halves are asserted at every option below.
 *
 * ══ THE CLAIM THAT MATTERS MOST: NOTHING IS DROPPED ═════════════════════════
 *
 * A code the catalogue cannot name still appears, labelled with its code, and is
 * selectable. `ZZTEST-EXCEL-01` is the live case; round 6 measured the general
 * shape at 26 of 39 registrations holding a round the schedule endpoint would
 * not return. AN OPTION LIST THAT DROPS WHAT IT CANNOT NAME HIDES ROWS WHILE
 * LOOKING COMPLETE — the rows exist, no filter reaches them, and nothing says so.
 *
 * ══ WHAT THIS TIER CANNOT SEE ═══════════════════════════════════════════════
 *
 * The RESOLUTION happens in page.jsx, which is an async server component this
 * runner cannot render. So this file is given options in the shape page.jsx
 * produces, and asserts only what reaches the SCREEN from there.
 *
 * ── AND THAT LIMIT IS SHARPER THAN IT LOOKS. MEASURED, NOT ESTIMATED. ─────
 * Two round-10 controls break the join in page.jsx — `drop-unresolvable` removes
 * options the catalogue could not name, `label-as-value` writes the resolved
 * name into `code` — and BOTH LEFT THIS FILE GREEN, along with the whole suite.
 * The properties they break are the two this file is named for, and it cannot
 * see either of them, because it never runs the code that produces the options.
 *
 * So this file proves the PANEL renders correct options correctly. That page.jsx
 * PRODUCES correct options — no filter, `code` untouched, one shared map, no
 * per-code lookup — is asserted at source in fs/perSourceFilterWiring §2b, which
 * exists because those two controls were run rather than assumed. An earlier
 * draft of this header claimed that coverage before it had been written; a
 * pointer to coverage that does not exist is worse than a stated gap, because it
 * stops the next reader from looking.
 *
 * renderToStaticMarkup only — `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none').
 */

const BASE = {
  initialData: { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 },
  status: 'all', q: '', range: 'all',
  counts: { total: 9 }, sourceTotals: { public: 39, inhouse: 9 }, lastEdited: {},
  from: '', to: '', course: '',
  dateWindow: resolveDateWindow({ range: 'all' }),
};

/**
 * The in-house options exactly as page.jsx hands them over: the label resolved
 * where the catalogue knew the code, and FALLING BACK TO THE CODE where it did
 * not. `ZZTEST-EXCEL-01` is the unresolvable one.
 */
const INHOUSE_OPTIONS = [
  { code: 'EXCEL-01',        label: 'Excel for Business' },
  { code: 'PBI-101',         label: 'Power BI Desktop' },
  { code: 'ZZTEST-EXCEL-01', label: 'ZZTEST-EXCEL-01' },
];

const render = (extra) => renderToStaticMarkup(
  createElement(RegistrationsClient, { ...BASE, source: 'inhouse', courseNames: {}, ...extra }));

const HTML = render({ courseOptions: INHOUSE_OPTIONS });

/** Every `<option>` in the markup, as `{value, label}`. */
function optionsOf(html) {
  return [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
    .map((m) => ({ value: m[1], label: m[2] }));
}

// ── 1. Names on screen, codes in the value ──────────────────────────────────

test('a resolved course shows its NAME and keeps its CODE as the value', () => {
  const opts = optionsOf(HTML);
  const excel = opts.find((o) => o.value === 'EXCEL-01');
  assert.ok(excel, 'the resolved course is not in the dropdown at all');
  assert.equal(excel.label, 'Excel for Business', 'the option still renders a bare code');
});

test('every option keeps a code as its value — no label ever becomes the value', () => {
  /**
   * The regression that would break every bookmark. Asserted across ALL
   * options rather than the one under test, because a mapping bug that swapped
   * the two would do it uniformly.
   */
  const codes = INHOUSE_OPTIONS.map((o) => o.code);
  for (const o of optionsOf(HTML)) {
    if (o.value === '') continue; // the "ทั้งหมด" placeholder
    assert.ok(codes.includes(o.value),
      `an option's value is \`${o.value}\`, which is not a course code — every existing ?course= link would break`);
  }
});

// ── 2. Nothing is dropped ───────────────────────────────────────────────────

test('AN UNRESOLVABLE CODE STILL APPEARS, LABELLED WITH ITS CODE, AND IS SELECTABLE', () => {
  const opts = optionsOf(HTML);
  const zz = opts.find((o) => o.value === 'ZZTEST-EXCEL-01');

  assert.ok(zz, 'ZZTEST-EXCEL-01 was dropped — its registrations become unreachable by filter');
  assert.equal(zz.label, 'ZZTEST-EXCEL-01', 'the fallback label is not the code');
  // Selectable: it is a real option with a value, not a disabled hint.
  assert.match(HTML, /<option value="ZZTEST-EXCEL-01"(?![^>]*\bdisabled\b)/,
    'the unresolvable option is rendered disabled — it must be choosable');
});

test('every code handed to the panel reaches the dropdown', () => {
  // The general form of the claim above: the option list is the code list, in
  // order, with nothing filtered out on the way.
  const values = optionsOf(HTML).map((o) => o.value).filter(Boolean);
  assert.deepEqual(values, INHOUSE_OPTIONS.map((o) => o.code));
});

// ── 3. The degrade path: no catalogue at all ────────────────────────────────

test('AN OUTAGE FALLS BACK TO CODES FOR EVERYTHING, and the dropdown still works', () => {
  /**
   * `buildCourseNameMap` catches its own failure and returns `{}`, so page.jsx's
   * join leaves every label as its code. The requirement is that the control
   * still functions — it must never block the page or empty the list.
   */
  const allCodes = INHOUSE_OPTIONS.map((o) => ({ code: o.code, label: o.code }));
  const html = render({ courseOptions: allCodes });

  const opts = optionsOf(html).filter((o) => o.value);
  assert.equal(opts.length, INHOUSE_OPTIONS.length, 'options were lost when no name resolved');
  for (const o of opts) assert.equal(o.label, o.value, 'a label survived an outage that should not have');
});

test('no options at all renders a working control, not a crash', () => {
  // An in-house collection with no course codes yet. The panel must still render.
  const html = render({ courseOptions: [] });
  assert.ok(html.length > 2000, 'the page did not render with an empty option list');
  assert.match(html, /<select/, 'the course control disappeared entirely');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the option parser really reads options, and can see a dropped one', () => {
  /**
   * "ZZTEST is present" and "nothing was dropped" both pass on a parser that
   * returns everything it is given rather than what the markup holds. So the
   * parser is pointed at markup with a KNOWN omission.
   */
  const parsed = optionsOf(HTML).map((o) => o.value);
  assert.ok(parsed.includes('ZZTEST-EXCEL-01'), 'the parser is not reading the real markup');

  const dropped = '<select><option value="EXCEL-01">Excel for Business</option></select>';
  assert.deepEqual(optionsOf(dropped).map((o) => o.value), ['EXCEL-01']);
  assert.equal(optionsOf(dropped).some((o) => o.value === 'ZZTEST-EXCEL-01'), false,
    'the parser reports an option that is not in the markup');
});

test('CONTROL: a label-as-value swap WOULD be caught', () => {
  // The exact regression the value assertions defend against, rendered.
  const swapped = render({
    courseOptions: INHOUSE_OPTIONS.map((o) => ({ code: o.label, label: o.code })),
  });
  const codes = INHOUSE_OPTIONS.map((o) => o.code);
  const bad = optionsOf(swapped).filter((o) => o.value && !codes.includes(o.value));
  assert.ok(bad.length > 0, 'a swapped label/value renders identically — the value assertion is vacuous');
});
