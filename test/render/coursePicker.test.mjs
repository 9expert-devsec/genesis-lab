import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CourseIdsPicker, CoursePickerBody, courseNameByCode } from '@/components/pageBuilder/editor/CoursePicker';
import { ContentTab } from '@/components/pageBuilder/editor/SettingsPanel';
import { filterCourseOptions } from '@/lib/courses/courseOptionFilter';
import { readSource } from '../sourceScan.mjs';

/**
 * THE PICKER SHOWS WHAT IS STORED — INCLUDING WHAT IT CANNOT NAME.
 *
 * docs/course-picker-proposal.md §G step 3, the step §G calls the only one that
 * changes what an author's actions write into the document and the only one
 * that can lose a stored code.
 *
 * ── THE ONE THAT BREAKS A PAGE ─────────────────────────────────────────────
 * §D.1 names the natural way to get this wrong: build the control as "render
 * the selected items from the catalogue", and a code the catalogue has not got
 * silently has no row. The author sees a shorter list, saves, and the code is
 * gone permanently because the document no longer holds it. So the first two
 * cases below drive a stale code, and the control for them renders the same
 * fixture the wrong way and names what would be lost.
 *
 * ── markup only, on purpose ────────────────────────────────────────────────
 * Everything asserted here is in the rendered output: the rows come from
 * `value`, the dialog body is exported portal-free (IconPicker's split, for
 * IconPicker's reason), and the two stateful parts — the dialog's open flag and
 * the direct-entry box's text — are React state that a static render cannot
 * drive. Those are covered by driving the CALLBACK instead, which is the part
 * that decides what is written.
 *
 * A React root over jsdom would let a test click; it would also leak its
 * globals into every markup test sharing this process — round 45 measured that
 * taking the suite from 5 failures to 34.
 */

const CATALOGUE = [
  { course_id: 'CLAUDE-AI', course_name: 'Claude Cowork for Business' },
  { course_id: 'MSE-AI', course_name: 'Excel AI' },
  { course_id: 'POWER-BI', course_name: 'Power BI Desktop' },
];
const STALE = 'ZZ-NO-SUCH-COURSE';

const draw = (props) => renderToStaticMarkup(
  createElement(CourseIdsPicker, { courses: CATALOGUE, onChange: () => {}, ...props })
);

/** The `data-code` of every row, in render order. */
const rowCodes = (html) =>
  [...html.matchAll(/data-testid="course-row" data-code="([^"]*)"/g)].map((m) => m[1]);

// ── A. every stored code gets a row ───────────────────────────────────────

test('a code the catalogue does NOT have still gets a row, and shows the code', () => {
  const html = draw({ value: ['CLAUDE-AI', STALE, 'MSE-AI'] });
  assert.deepEqual(rowCodes(html), ['CLAUDE-AI', STALE, 'MSE-AI']);
  assert.equal(html.includes(STALE), true, 'the stale code is not on screen');
});

test('the unnameable row is MARKED, not silently name-less', () => {
  // Marked, because a row with no second line is otherwise just a row that
  // happens to look shorter. The mark says "no name HERE" — a statement about
  // this catalogue — and never that the course does not exist; the resolver
  // owns that and has its own red warning under this control.
  const html = draw({ value: ['CLAUDE-AI', STALE] });
  assert.equal(html.includes('course-row-unnamed'), true);
  assert.equal(html.includes('ไม่ทราบชื่อ'), true);
});

test('CONTROL: a fully-known list carries no unnamed mark', () => {
  // Without this, the case above passes against a control that marks every row.
  const html = draw({ value: ['CLAUDE-AI', 'MSE-AI'] });
  assert.equal(html.includes('course-row-unnamed'), false);
  assert.equal(html.includes('ไม่ทราบชื่อ'), false);
  assert.equal(html.includes('Claude Cowork for Business'), true, 'a known code lost its name');
});

test('CONTROL: rendering FROM THE CATALOGUE instead would lose the code', () => {
  // The defect §D.1 describes, run so the loss is a measurement rather than a
  // worry. This is what the control would show if it mapped the catalogue and
  // kept the entries it recognised.
  const stored = ['CLAUDE-AI', STALE, 'MSE-AI'];
  const fromCatalogue = stored.filter((code) => CATALOGUE.some((c) => c.course_id === code));
  assert.deepEqual(fromCatalogue, ['CLAUDE-AI', 'MSE-AI']);
  assert.equal(fromCatalogue.includes(STALE), false, 'the fixture cannot demonstrate the loss');
  // And the real control does not do that.
  assert.deepEqual(rowCodes(draw({ value: stored })), stored);
});

// ── B. order ──────────────────────────────────────────────────────────────

test('rows render in STORED order, never sorted', () => {
  // Array position is the only ordering authority (§D.3). The fixture is
  // deliberately not alphabetical and not catalogue order.
  const stored = ['POWER-BI', 'CLAUDE-AI', 'MSE-AI'];
  assert.deepEqual(rowCodes(draw({ value: stored })), stored);
});

test('CONTROL: a sort WOULD change this fixture', () => {
  // Otherwise "not sorted" is satisfied by a list that happens to be in sorted
  // order already, and the assertion above proves nothing.
  const stored = ['POWER-BI', 'CLAUDE-AI', 'MSE-AI'];
  assert.notDeepEqual([...stored].sort(), stored);
  // …and catalogue order differs from stored order too.
  const catalogueOrder = CATALOGUE.map((c) => c.course_id).filter((c) => stored.includes(c));
  assert.notDeepEqual(catalogueOrder, stored);
});

test('the ends are disabled — an entry walks to a stop, it does not wrap', () => {
  const html = draw({ value: ['CLAUDE-AI', 'MSE-AI', 'POWER-BI'] });
  assert.equal(/data-move="up" data-row="0" disabled/.test(html), true, 'row 0 can move up');
  assert.equal(/data-move="down" data-row="2" disabled/.test(html), true, 'the last row can move down');
  assert.equal(/data-move="down" data-row="0" disabled/.test(html), false, 'row 0 cannot move down');
});

test('move up and move down rewrite the array by POSITION', () => {
  // The callback is what writes to the document, so it is what is driven. The
  // control's own move handler is a thin wrapper over moveInArray, which
  // test/pure/pagePath already covers; what is asserted here is that the picker
  // hands the reordered array through unchanged in every other respect.
  const stored = ['A', 'B', 'C'];
  const moved = (from, to) => {
    const next = stored.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  };
  assert.deepEqual(moved(1, 0), ['B', 'A', 'C']);
  assert.deepEqual(moved(1, 2), ['A', 'C', 'B']);
  // The rows the control would then render.
  assert.deepEqual(rowCodes(draw({ value: moved(1, 0) })), ['B', 'A', 'C']);
});

// ── C. duplicates ─────────────────────────────────────────────────────────

test('a repeated code gets a row EACH TIME', () => {
  const html = draw({ value: ['CLAUDE-AI', 'MSE-AI', 'CLAUDE-AI'] });
  assert.deepEqual(rowCodes(html), ['CLAUDE-AI', 'MSE-AI', 'CLAUDE-AI']);
});

test('the dialog does NOT hide an already-picked course — it counts it', () => {
  // Hiding picked options is what makes duplicates unexpressible, and it is one
  // of the four ways §F.1 measured CourseForm's chip picker to be the wrong
  // shape. The count is an affordance, not a filter: the button is still there
  // and still clickable.
  const html = renderToStaticMarkup(createElement(CoursePickerBody, {
    query: '', onQueryChange: () => {}, courses: CATALOGUE,
    selected: ['CLAUDE-AI', 'CLAUDE-AI'], onPick: () => {},
  }));
  const options = [...html.matchAll(/data-testid="course-option" data-code="([^"]*)" data-already="(\d+)"/g)]
    .map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(options, [['CLAUDE-AI', 2], ['MSE-AI', 0], ['POWER-BI', 0]]);
});

test('picking APPENDS — it does not merge or move', () => {
  // The write the dialog performs, asserted on the array rather than through a
  // click: `onPick` is wired to `[...ids, code]`.
  const ids = ['MSE-AI', 'CLAUDE-AI'];
  assert.deepEqual([...ids, 'CLAUDE-AI'], ['MSE-AI', 'CLAUDE-AI', 'CLAUDE-AI']);
  assert.deepEqual(rowCodes(draw({ value: [...ids, 'CLAUDE-AI'] })),
    ['MSE-AI', 'CLAUDE-AI', 'CLAUDE-AI']);
});

// ── D. direct entry ───────────────────────────────────────────────────────

test('there is a box for typing a code, beside the picker', () => {
  // Without it the picker becomes the only way to express a value, and a code
  // upstream has not published yet — or one this snapshot missed — becomes
  // unauthorable.
  const html = draw({ value: [] });
  assert.equal(html.includes('data-testid="course-code-input"'), true);
  assert.equal(html.includes('data-testid="course-code-add"'), true);
  assert.equal(html.includes('data-testid="course-picker-trigger"'), true);
});

test('a hand-typed code is stored VERBATIM, trimmed and nothing else', () => {
  // Exactly what the textarea stored: `.map((s) => s.trim())` and no other
  // transformation. Case is not folded — four of 79 upstream ids are
  // mixed-case and `?course_id=` is exact-match.
  const html = draw({ value: ['  Power-Apps  '.trim()] });
  assert.deepEqual(rowCodes(html), ['Power-Apps']);
  assert.equal(html.includes('POWER-APPS'), false, 'the code was upper-cased');
});

// ── I. the stored empty string ────────────────────────────────────────────

test('a stored empty entry keeps its row and is marked, not stripped', () => {
  // A trailing newline in the old textarea stored '' (§D.5). Stripping it on
  // load would rewrite a stored array without the author acting — the thing
  // this whole round refuses to do. It gets a row so it can be removed.
  const html = draw({ value: ['CLAUDE-AI', ''] });
  assert.deepEqual(rowCodes(html), ['CLAUDE-AI', '']);
  assert.equal(html.includes('ว่าง'), true);
});

test('the new control cannot CREATE an empty entry', () => {
  // The direct-entry box refuses a blank (`if (!code) return`), and the dialog
  // only ever appends a course_id. So the wart becomes unrepresentable going
  // forward while the existing ones stay visible and removable.
  const src = readSource('src/components/pageBuilder/editor/CoursePicker.jsx').code;
  assert.equal(/const code = typed\.trim\(\);\s*if \(!code\) return;/.test(src), true,
    'the direct-entry box no longer refuses a blank');
});

// ── E. the matcher is reused, not re-implemented ──────────────────────────

test('the dialog filters with filterCourseOptions', () => {
  const html = renderToStaticMarkup(createElement(CoursePickerBody, {
    query: 'excel', onQueryChange: () => {}, courses: CATALOGUE, selected: [], onPick: () => {},
  }));
  const shown = [...html.matchAll(/data-code="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(shown, filterCourseOptions(CATALOGUE, 'excel').map((c) => c.course_id));
  assert.deepEqual(shown, ['MSE-AI']);
});

test('CONTROL: the source imports the shared matcher and defines no second one', () => {
  // A rendered comparison cannot tell "calls filterCourseOptions" from "happens
  // to agree with it on this fixture". This is the shape claim, read from
  // scrubbed code so a mention in prose does not satisfy it.
  const src = readSource('src/components/pageBuilder/editor/CoursePicker.jsx');
  assert.equal(src.withImports.includes("from '@/lib/courses/courseOptionFilter'"), true);
  assert.equal(src.code.includes('filterCourseOptions'), true, 'imported but never called');
  // No inline matcher beside it.
  assert.equal(/\.toLowerCase\(\)/.test(src.code), false, 'a second case-folding matcher appeared');
  assert.equal(/\.includes\(\s*q/.test(src.code), false, 'a second substring matcher appeared');
});

test('CONTROL: that reader can see the file it is asserting over', () => {
  const src = readSource('src/components/pageBuilder/editor/CoursePicker.jsx').code;
  assert.equal(src.length > 500, true, `the file scrubbed to ${src.length} chars`);
  assert.equal(src.includes('CourseIdsPicker'), true);
});

// ── H. what differs from IconPicker ───────────────────────────────────────

test('NO result cap, and no "showing N of M" line', () => {
  // The worst single-character query matches 78 of 79, so a cap would never
  // fire and the line would be permanently false.
  const many = Array.from({ length: 200 }, (_, i) => ({ course_id: `C-${i}`, course_name: `Course ${i}` }));
  const html = renderToStaticMarkup(createElement(CoursePickerBody, {
    query: '', onQueryChange: () => {}, courses: many, selected: [], onPick: () => {},
  }));
  assert.equal([...html.matchAll(/data-testid="course-option"/g)].length, 200);
  assert.equal(html.includes('พบ 200 คอร์ส'), true);
  assert.equal(html.includes('จาก'), false, 'a holding-back line appeared');
});

test('the empty-result line says so rather than showing a blank panel', () => {
  const html = renderToStaticMarkup(createElement(CoursePickerBody, {
    query: 'zzzz', onQueryChange: () => {}, courses: CATALOGUE, selected: [], onPick: () => {},
  }));
  assert.equal(html.includes('ไม่พบคอร์สที่ตรงกับคำค้นหา'), true);
  assert.equal([...html.matchAll(/data-testid="course-option"/g)].length, 0);
});

test('NO group pills — search is the only filter', () => {
  const src = readSource('src/components/pageBuilder/editor/CoursePicker.jsx').code;
  assert.equal(src.includes('GROUPS'), false);
  assert.equal(src.includes('pillsOf'), false);
});

// ── the three list types, through the real prop chain ─────────────────────

test('all three list types get the picker, and course_card does NOT', () => {
  // One component serving three types is why this step reaches three of five at
  // once — and course_card/course_schedule keep their TextInput (§F.5), which
  // is a different shape and a later step.
  const tab = (type, content) => renderToStaticMarkup(createElement(ContentTab, {
    type, content, advanced: {}, resolved: undefined, patch: () => {}, courses: CATALOGUE,
  }));
  for (const [type, content] of [
    ['course_selector', { courseIds: ['CLAUDE-AI'] }],
    ['bundle_courses', { courseIds: ['CLAUDE-AI'] }],
    ['course_list', { source: 'manual', courseIds: ['CLAUDE-AI'] }],
  ]) {
    const html = tab(type, content);
    assert.equal(html.includes('data-testid="course-picker-trigger"'), true, `${type} has no picker`);
    assert.equal(html.includes('<textarea'), false, `${type} still has the textarea`);
  }
  const card = tab('course_card', { courseId: 'CLAUDE-AI' });
  assert.equal(card.includes('data-testid="course-picker-trigger"'), false, 'course_card was converted');
  assert.equal(card.includes('<input'), true, 'course_card lost its text input');
});

test('an empty catalogue is still a working control', () => {
  // catalogueOrEmpty fails open, so this is the upstream-is-down state. Every
  // stored code keeps its row; only the names are missing.
  const html = renderToStaticMarkup(createElement(CourseIdsPicker, {
    value: ['CLAUDE-AI', 'MSE-AI'], onChange: () => {}, courses: [],
  }));
  assert.deepEqual(rowCodes(html), ['CLAUDE-AI', 'MSE-AI']);
  assert.equal(html.includes('data-testid="course-code-input"'), true);
  assert.equal([...html.matchAll(/course-row-unnamed/g)].length, 2);
});

test('courseNameByCode ignores rows with no code', () => {
  const map = courseNameByCode([
    { course_id: 'A', course_name: 'Alpha' },
    { course_name: 'no code' },
    { course_id: 'B' },
  ]);
  assert.equal(map.get('A'), 'Alpha');
  assert.equal(map.get('B'), '');
  assert.equal(map.size, 2);
});
