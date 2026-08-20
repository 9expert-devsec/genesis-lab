import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import { resolveDateWindow } from '@/lib/registrations/listFilter';

/**
 * THE ตัวกรอง PANEL — the date range and the course.
 *
 * ══ THE ROUND-3 RULING IS SATISFIED, NOT REVERSED ═══════════════════════════
 *
 * The button was removed because "there is nothing left for it to open", and the
 * same note named the condition for its return: "if a filter that is NOT a
 * status ever arrives — a course, a custom date range — the button comes back
 * then, attached to something." Both arrived. The tests below assert the
 * ATTACHED half, because that is the part of the ruling that can regress: a
 * summary with an empty panel behind it would satisfy "the button is back" and
 * be exactly the dead control round 3 deleted.
 *
 * ══ NO REACT ROOT ═══════════════════════════════════════════════════════════
 * renderToStaticMarkup only. The panel is a native `<details>`, so its CONTENTS
 * are in the DOM whether or not it is open — which is why every assertion about
 * the controls inside it is reachable from this tier. Opening it, typing a date
 * and watching the table change is a human test and is on that list.
 */

const EMPTY = { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 };

const render = (props = {}) => renderToStaticMarkup(createElement(RegistrationsClient, {
  initialData: EMPTY,
  status: 'all', q: '', source: 'public', range: 'all',
  counts: { total: 39 }, sourceTotals: { public: 39, inhouse: 9 }, lastEdited: {},
  from: '', to: '', course: '',
  dateWindow: resolveDateWindow({ range: 'all' }),
  courseOptions: [
    { code: 'POWER-BI', label: 'Power BI Desktop for Business Analytics' },
    { code: 'MSE-L2',   label: 'Microsoft Excel Advanced' },
  ],
  ...props,
}));

/** A render with a custom range and a course applied. */
const filtered = (over = {}) => {
  const from = over.from ?? '2026-08-01';
  const to   = over.to   ?? '2026-08-31';
  return render({
    from, to, course: over.course ?? 'MSE-L2', range: over.range ?? 'all',
    dateWindow: resolveDateWindow({ range: over.range ?? 'all', from, to }),
    ...over.props,
  });
};

const PLAIN    = render();
const FILTERED = filtered();
const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** The `<details>` element, from its summary to its close. */
function panel(markup) {
  const at = markup.indexOf('<details');
  assert.notEqual(at, -1, 'there is no ตัวกรอง disclosure on the screen');
  const end = markup.indexOf('</details>', at);
  assert.notEqual(end, -1, 'the disclosure is not closed');
  return markup.slice(at, end + 10);
}

const summary = (markup) => /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(panel(markup))[1];

// ════════════════════════════════════════════════════════════════════════════
// 1. THE BUTTON IS BACK — AND IT OPENS ONTO SOMETHING
// ════════════════════════════════════════════════════════════════════════════

test('the ตัวกรอง disclosure renders, as a native details/summary', () => {
  assert.match(panel(PLAIN), /^<details/, 'the disclosure is not a <details>');
  assert.match(panel(PLAIN), /<summary/, 'the disclosure has no <summary> — it cannot be opened by keyboard');
  assert.ok(textOf(summary(PLAIN)).includes('ตัวกรอง'), 'the summary is not labelled');
});

test('it opens onto TWO REAL FILTERS — the round-3 condition, asserted', () => {
  /**
   * The half of the ruling that can regress. "The button is back" is satisfied
   * by a summary with nothing behind it, which is the dead control round 3
   * removed. So: both controls exist, and neither is a status.
   */
  const p = panel(PLAIN);
  assert.match(p, /<input[^>]*type="date"[^>]*name="from"/, 'no FROM date control');
  assert.match(p, /<input[^>]*type="date"[^>]*name="to"/, 'no TO date control');
  assert.match(p, /<select[^>]*name="course"/, 'no course control');

  // NEITHER IS A STATUS. The overview cards above are still the status filter
  // and this panel must not duplicate them — that duplication is what round 3
  // deleted the chip row for.
  assert.ok(!/name="status"/.test(p), 'the panel grew a status control — the cards already are one');
});

test('the date control names the field it filters', () => {
  // `createdAt` — the date the first column already shows. A control labelled
  // วันที่สมัคร that filtered the training round is the quiet wrongness this
  // screen has shipped before.
  assert.ok(textOf(panel(PLAIN)).includes('วันที่สมัคร'), 'the date fieldset is not labelled');
  assert.match(panel(PLAIN), /<legend/, 'the date pair has no legend — the two inputs are unassociated');
});

test('the course options come from the REGISTRATIONS, not a catalogue', () => {
  // Asserted as: whatever the page hands in is what renders, plus the
  // no-opinion option. The SOURCE of that list is pinned at the action.
  /**
   * ── THE OPTION TAGS CARRY `selected=""` AND THE FIRST DRAFT DID NOT ALLOW IT.
   * React's SSR marks the option matching `defaultValue`, so an exact
   * `<option value="X">label</option>` match fails on the selected one only —
   * which reddened on correct markup and looked like a missing option.
   */
  const p = panel(PLAIN);
  const options = [...p.matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
    .map((m) => [m[1], textOf(m[2])]);
  assert.deepEqual(options, [
    ['', 'ทุกหลักสูตร'],
    ['POWER-BI', 'Power BI Desktop for Business Analytics'],
    ['MSE-L2', 'Microsoft Excel Advanced'],
  ], 'the option list is not the "any" option plus exactly what the page handed in');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ACTIVE FILTERS ARE VISIBLE WHEN THE PANEL IS CLOSED
// ════════════════════════════════════════════════════════════════════════════

test('with no filters set, the summary carries no active marker', () => {
  const s = summary(PLAIN);
  assert.ok(!/rounded-full/.test(s), 'an empty filter set still shows an active badge');
  assert.ok(!/title="/.test(s), 'an empty filter set still carries an active title');
});

test('an ACTIVE filter shows on the SUMMARY — the part visible when closed', () => {
  /**
   * ══ THE REQUIREMENT, AND WHY IT IS ON THE SUMMARY ═════════════════════════
   *
   * A filter you cannot see is one you forget you set, and then an empty table
   * reads as lost data rather than as a narrow question. The obvious mistake
   * would be putting this INSIDE the disclosure — the one state where the reader
   * needs telling is the state where the panel is shut.
   *
   * `<details>` renders its contents whether open or closed, so "inside" and
   * "on the summary" are indistinguishable to a markup scan UNLESS the assertion
   * is scoped to the `<summary>` element. It is.
   */
  const s = summary(FILTERED);
  assert.match(s, /rounded-full/, 'no active badge on the summary');
  assert.match(s, />2</, 'the badge does not count the two active filters');
  // The full text is on the summary too, for a pointer — the 79px slot cannot
  // hold two dates.
  assert.match(s, /title="[^"]*Excel Advanced[^"]*"/, 'the summary does not name the active course');
});

test('the badge counts what is actually set — one filter reads 1', () => {
  // Without this, a hard-coded 2 would satisfy the assertion above.
  const courseOnly = render({ course: 'MSE-L2' });
  assert.match(summary(courseOnly), />1</, 'one active filter does not read 1');
  const dateOnly = filtered({ course: '' });
  assert.match(summary(dateOnly), />1</, 'a date range alone does not read 1');
});

test('an OPEN-ENDED range still counts and still says which end', () => {
  const since = filtered({ to: '', course: '' });
  assert.match(summary(since), />1</, 'an open-ended range is not counted as active');
  assert.match(summary(since), /title="[^"]*ตั้งแต่[^"]*"/, 'the summary does not say it is a "since" range');

  const until = filtered({ from: '', course: '' });
  assert.match(summary(until), /title="[^"]*ถึง[^"]*"/, 'the summary does not say it is an "up to" range');
});

test('the CLEAR control appears only when there is something to clear', () => {
  // A live control that does nothing is the dead control round 3 removed, one
  // size down.
  assert.ok(!textOf(panel(PLAIN)).includes('ล้างตัวกรอง'), 'a clear control renders with nothing set');
  assert.ok(textOf(panel(FILTERED)).includes('ล้างตัวกรอง'), 'there is no way to clear an active filter');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE SWAP IS ANNOUNCED
// ════════════════════════════════════════════════════════════════════════════

test('a REVERSED range is corrected AND the panel says so', () => {
  /**
   * The resolver swaps a backwards range rather than returning nothing — an
   * empty table is indistinguishable from "there are no records". But a
   * correction the reader cannot see is still the screen deciding on their
   * behalf, so the panel has to say it happened.
   *
   * Both halves: the inputs show the CORRECTED order, and the notice is there.
   */
  const reversed = filtered({ from: '2026-08-31', to: '2026-08-01' });
  const p = panel(reversed);
  assert.ok(textOf(p).includes('ระบบสลับให้แล้ว'), 'the swap happened silently');
  assert.match(p, /name="from"[^>]*value="2026-08-01"|value="2026-08-01"[^>]*name="from"/,
    'the FROM input does not show the corrected earlier date');

  // …and a correctly-ordered range says nothing.
  assert.ok(!textOf(panel(FILTERED)).includes('ระบบสลับให้แล้ว'),
    'a correctly-ordered range is reported as swapped');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE CHIPS ARE PRESETS OVER THE SAME WINDOW
// ════════════════════════════════════════════════════════════════════════════

/**
 * Every RANGE chip's `aria-pressed`, in order.
 *
 * ── SCOPED BY LABEL, NOT BY `aria-pressed` ALONE ─────────────────────────
 * The first draft matched every `aria-pressed` button on the page and picked up
 * the SOURCE TOGGLE as well, so "exactly one chip is pressed" counted two and
 * reddened on correct markup. The four range labels are the chip row and nothing
 * else uses them.
 */
const RANGE_LABELS = ['ทั้งหมด', 'วันนี้', '7 วัน', 'เดือนนี้'];

const chipStates = (markup) =>
  [...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)]
    .filter((m) => RANGE_LABELS.includes(textOf(m[2])))
    .map((m) => m[1]);

test('with no custom range, exactly ONE chip is pressed', () => {
  const states = chipStates(PLAIN);
  assert.ok(states.length >= 4, `only ${states.length} range chips found`);
  assert.equal(states.filter((s) => s === 'true').length, 1,
    'the chip row does not have exactly one selected preset');
});

test('a CUSTOM range deselects EVERY chip — one value, two ways in', () => {
  /**
   * ══ THE (a) DECISION, AS AN ASSERTION ═════════════════════════════════════
   *
   * Two independent controls over one field is a screen where the chips say one
   * thing and the panel says another and neither is wrong. The chips are
   * PRESETS: the resolver returns `preset: null` under a custom range and the
   * chip row reads that, not `range`.
   *
   * THE FIXTURE IS THE ONE THAT SEPARATES THEM: `range: 'today'` is still in the
   * URL while a custom from/to is set. Reading `range` would light วันนี้ above a
   * table filtered to August. This is the case a naive implementation passes
   * every other test on.
   */
  const both = filtered({ range: 'today' });
  assert.equal(chipStates(both).filter((s) => s === 'true').length, 0,
    'a chip stayed lit under a custom range — the two controls disagree');

  // CONTROL: the same `range: 'today'` WITHOUT a custom range does light one.
  const chipOnly = render({ range: 'today', dateWindow: resolveDateWindow({ range: 'today' }) });
  assert.equal(chipStates(chipOnly).filter((s) => s === 'true').length, 1,
    'the chip row never lights anything — the assertion above proves nothing');
});
