import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ContentTab } from '@/components/pageBuilder/editor/SettingsPanel';
import { readSource } from '../sourceScan.mjs';

/**
 * A REPEATED COURSE CODE SAYS SO, AND SAYS IT WITHOUT WAITING FOR A FETCH.
 *
 * ── WHAT WAS MISSING ───────────────────────────────────────────────────────
 * Duplicates were unconsidered, not permitted-with-a-note: nothing anywhere
 * mentioned them. They RENDER — `assembleResolved` maps positionally, so `[A,A]`
 * draws the same course twice — which is a layout an author can want and can
 * equally arrive at by pasting a list twice. The difference between those two
 * is a sentence, and there was no sentence.
 *
 * ── THE PART THAT IS EASY TO GET WRONG ─────────────────────────────────────
 * `CourseIdsWarnings` used to open with `if (resolved === undefined) return
 * null` — the tri-state guard that stops the resolve warning flashing during
 * the 350ms debounce. Adding the duplicate line BELOW that guard would inherit
 * it, and a duplicate is a synchronous fact about a local array with no fetch
 * involved: the warning would blank for a third of a second after every
 * keystroke, for nothing. So the guard was narrowed to the `missing` count
 * rather than left as an early return, and the middle test below is what pins
 * that — it renders with `resolved: undefined` and requires the duplicate line
 * to be there.
 *
 * ── RENDERED THROUGH ContentTab, NOT THROUGH THE WARNING COMPONENT ─────────
 * `CourseIdsWarnings` is private and stays private. `ContentTab` is the
 * exported body the settings panel renders (see settingsPanelTabs for why that
 * split exists), and it is the real path: ContentTab → SectionContentEditor →
 * the per-type editor → CourseIdsField + CourseIdsWarnings. Driving the real
 * chain is what makes "all three list types get it" a measurement rather than
 * three copies of one assertion.
 *
 * `renderToStaticMarkup`, deliberately: none of this needs effects, and a React
 * root over jsdom in this process leaks its globals into every other
 * markup test sharing it — round 45 measured that taking the suite from 5
 * failures to 34.
 */

const DUP = 'รหัสซ้ำ';
const MISSING = 'ไม่พบคอร์ส';
const NOT_CHOSEN = 'ยังไม่ได้เลือกคอร์ส';

/** The three types whose editor uses the shared CourseIdsField. */
const LIST_TYPES = [
  ['course_selector', (courseIds) => ({ courseIds })],
  ['bundle_courses', (courseIds) => ({ courseIds })],
  ['course_list', (courseIds) => ({ source: 'manual', courseIds })],
];

const course = (id) => ({ course_id: id, course_name: `Course ${id}`, program: {} });

const draw = (type, content, resolved) => renderToStaticMarkup(
  createElement(ContentTab, { type, content, advanced: {}, resolved, patch: () => {} })
);

// ── the warning ───────────────────────────────────────────────────────────

test('a repeated code warns, on all three list types', () => {
  for (const [type, mk] of LIST_TYPES) {
    const html = draw(type, mk(['A', 'B', 'A']), [course('A'), course('B'), course('A')]);
    assert.equal(html.includes(DUP), true, `${type} does not warn about the repeat`);
    assert.equal(html.includes('A'), true);
  }
});

test('CONTROL: a clean list warns about nothing', () => {
  // Without this, the assertion above passes against a component that always
  // renders the line.
  for (const [type, mk] of LIST_TYPES) {
    const html = draw(type, mk(['A', 'B']), [course('A'), course('B')]);
    assert.equal(html.includes(DUP), false, `${type} warns about a repeat that is not there`);
    assert.equal(html.includes(MISSING), false, `${type} warns about a missing code that is not there`);
  }
});

test('the warning NAMES the repeated code', () => {
  // A count alone ("มี 1 รหัสซ้ำ") would make the author re-read their own list
  // to find which. The list is theirs; the code is the thing they can act on.
  const html = draw('course_selector', { courseIds: ['MSE-AI', 'CLAUDE-AI', 'MSE-AI'] },
    [course('MSE-AI'), course('CLAUDE-AI'), course('MSE-AI')]);
  assert.equal(html.includes('รหัสซ้ำ: MSE-AI'), true);
  assert.equal(html.includes('CLAUDE-AI —'), false, 'a code that is NOT repeated was named');
});

// ── the tri-state: one warning waits, the other does not ──────────────────

test('THE DUPLICATE WARNING FIRES MID-FETCH — it is not gated on the tri-state', () => {
  // `resolved: undefined` is the debounce window. The resolve warning must be
  // silent here (that is what the tri-state is for) and the duplicate warning
  // must not be, because it never needed the fetch.
  const html = draw('course_selector', { courseIds: ['A', 'B', 'A'] }, undefined);
  assert.equal(html.includes(DUP), true, 'the duplicate warning is gated on the fetch');
  assert.equal(html.includes(MISSING), false, 'the resolve warning fired before the fetch returned');
});

test('CONTROL: the resolve warning DOES wait — same input, fetched', () => {
  // The other half. If the resolve warning fired in both states, the test above
  // would prove nothing about gating; it has to be silent in one and loud in
  // the other on otherwise identical input.
  const html = draw('course_selector', { courseIds: ['A', 'B', 'A'] }, [course('A'), course('A')]);
  assert.equal(html.includes(MISSING), true);
  assert.equal(html.includes(DUP), true);
});

test('BOTH warnings show at once, and neither hides the other', () => {
  // Three authored, one unresolvable, one repeated. Two different facts about
  // one list; the author needs both.
  const html = draw('course_selector', { courseIds: ['A', 'A', 'GONE'] }, [course('A'), course('A')]);
  assert.equal(html.includes(DUP), true);
  assert.equal(html.includes(MISSING), true);
  assert.equal(html.includes('มี 1 รหัสที่ไม่พบคอร์ส'), true, 'the missing COUNT is wrong');
});

test('a duplicate does NOT inflate the missing count', () => {
  // The finding this design rests on (§D.4): the fetch de-dupes but
  // `assembleResolved` maps POSITIONALLY, so four authored resolvable codes
  // give four resolved entries even when two are the same. If the two counts
  // interfered, this list would falsely report a missing code.
  const html = draw('course_selector', { courseIds: ['A', 'B', 'A', 'C'] },
    [course('A'), course('B'), course('A'), course('C')]);
  assert.equal(html.includes(DUP), true);
  assert.equal(html.includes(MISSING), false, 'a duplicate was counted as a missing code');
});

test('an empty list still says only that it is empty', () => {
  // The pre-existing first branch, unchanged. `['', '']` is what a trailing
  // newline stores, and it is not a duplicate anyone can act on.
  for (const ids of [[], ['', '']]) {
    const html = draw('course_selector', { courseIds: ids }, undefined);
    assert.equal(html.includes(NOT_CHOSEN), true);
    assert.equal(html.includes(DUP), false);
    assert.equal(html.includes(MISSING), false);
  }
});

// ── warn, never edit ──────────────────────────────────────────────────────

test('the field still shows BOTH copies — nothing de-duplicates the control', () => {
  // The textarea's value is the stored array joined. If anything de-duplicated
  // on the way to the control, the author would see one line where they wrote
  // two and their next save would store one.
  const html = draw('course_selector', { courseIds: ['A', 'B', 'A'] }, [course('A')]);
  const textarea = html.slice(html.indexOf('<textarea'), html.indexOf('</textarea>'));
  assert.equal(textarea.includes('A\nB\nA'), true, `the control rewrote the list: ${textarea}`);
});

test('SOURCE: nothing in the warnings path sorts, filters or de-duplicates', () => {
  // The rendered assertions above can only see one fixture at a time. This is
  // the shape claim: the editor may READ the array and may not REWRITE it.
  // Read from `code`, so a mention in prose does not satisfy it.
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  const region = src.slice(src.indexOf('function CourseIdsField'), src.indexOf('function CourseCardEditor'));
  assert.equal(/\.sort\s*\(/.test(region), false, 'the field or its warnings sort the array');
  assert.equal(/new Set\s*\(/.test(region), false, 'the field or its warnings de-duplicate the array');
  assert.equal(/\.filter\s*\(\s*Boolean\s*\)\s*\)/.test(region), false, 'onChange gained a filter(Boolean)');
});

test('CONTROL: that reader can see the region it is asserting over', () => {
  // A slice that came back empty — a renamed function, a moved block — would
  // satisfy every "does not contain" line above vacuously. That is defect 4 in
  // sourceScan's header, pointed at this file.
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  const region = src.slice(src.indexOf('function CourseIdsField'), src.indexOf('function CourseCardEditor'));
  assert.equal(region.length > 200, true, `the region is ${region.length} chars`);
  assert.equal(region.includes('duplicateCourseCodes'), true);
  assert.equal(region.includes('resolved === undefined'), true);
});

test('SOURCE: the tri-state guard is no longer an early return', () => {
  // The regression this round is most likely to acquire later: someone
  // "tidying" the two warnings back into one early return would silently
  // re-gate the duplicate line, and every rendered assertion above except the
  // mid-fetch one would stay green.
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  const region = src.slice(src.indexOf('function CourseIdsWarnings'), src.indexOf('function CourseCardEditor'));
  assert.equal(/resolved === undefined\)\s*return null/.test(region), false,
    'the tri-state is an early return again — the duplicate warning is gated');
  assert.equal(region.includes('resolved === undefined'), true, 'the tri-state is gone entirely');
});
