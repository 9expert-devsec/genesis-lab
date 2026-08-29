import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CourseSelectPicker } from '@/components/pageBuilder/editor/CoursePicker';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { filterCourseOptions, courseOptionLabel } from '@/lib/courses/courseOptionFilter';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 51 — step 4: the SINGLE-VALUE course picker.
 *
 * `course_card` and `course_schedule` reference one course, not an ordered
 * list. §F.5 deferred them out of step 3 on purpose — a different shape, no
 * shared code with the list control beyond the catalogue prop — so this is work
 * that had not been done rather than work being redone.
 *
 * ── THE RULE THAT BREAKS A PAGE IF IT IS MISSED, AGAIN ────────────────────
 * The stored code is the authority; the catalogue is consulted only for a NAME.
 * A control built the natural way — "render the selection from the catalogue" —
 * shows nothing for a code the catalogue lacks, and the author then saves an
 * empty field over a code that was fine. §D.2 measured the downstream cost: a
 * `course_card` with no resolvable code renders 84 bytes, byte-identical to a
 * section that draws nothing.
 *
 * That loss is MEASURED here rather than asserted — the catalogue-driven answer
 * is computed beside the shipped one, so the test can name the code that would
 * have gone.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ─────────────────────────────────────
 * Markup only, via `renderToStaticMarkup`. The listbox is closed until focus,
 * so nothing here can open it — the click sequence (open, pick, type, and what
 * each writes) is driven in its own process by
 * scripts/_probe-round51-single-picker-drive.mjs, because a React root over
 * jsdom in THIS process leaks globals into every markup test sharing it (round
 * 45 measured 5 failures becoming 34).
 */

const CATALOGUE = [
  { course_id: 'CLAUDE-AI', course_name: 'Claude Cowork for Business' },
  { course_id: 'MSE-AI', course_name: 'Excel AI' },
  { course_id: 'POWER-BI', course_name: 'Power BI Desktop' },
];

const STALE = 'ZZ-NO-SUCH-COURSE';

const draw = (props) => renderToStaticMarkup(createElement(CourseSelectPicker, {
  value: '', onChange: () => {}, courses: CATALOGUE, label: 'คอร์ส', ...props,
}));

/** The visible combobox's value attribute, which is what the author reads. */
const boxValue = (html) => {
  const m = html.match(/role="combobox"[^>]*?value="([^"]*)"/)
    ?? html.match(/value="([^"]*)"[^>]*?role="combobox"/);
  return m ? m[1] : null;
};

// ── C. THE STALE-CODE RULE ─────────────────────────────────────────────────

test('a stored code the catalogue has never heard of is SHOWN, not blanked', () => {
  const html = draw({ value: STALE });
  assert.ok(html.includes(STALE), `the stored code ${STALE} vanished from the control — a save would write the blank back`);
  assert.equal(boxValue(html), STALE, 'the box did not show the stored code verbatim');
});

test('…and it is MARKED, in the house wording', () => {
  const html = draw({ value: STALE });
  assert.ok(html.includes('data-testid="course-select-unnamed"'), 'the unknown-name mark is gone');
  assert.ok(html.includes('ไม่ทราบชื่อ'), 'the mark lost its wording');
});

test('CONTROL — rendering FROM the catalogue would have LOST this exact code', () => {
  /**
   * The measurement, not an assertion. This computes what the natural-but-wrong
   * control would have displayed, and names the code that would have gone. If
   * this ever comes out equal to the shipped answer, the shipped control has
   * stopped being driven by the stored value.
   */
  const fromCatalogue = CATALOGUE.find((c) => c.course_id === STALE) ?? null;
  const catalogueWouldShow = fromCatalogue ? courseOptionLabel(fromCatalogue) : '';
  assert.equal(catalogueWouldShow, '', 'the fixture code is IN the catalogue — this control proves nothing');

  const shipped = boxValue(draw({ value: STALE }));
  assert.notEqual(shipped, catalogueWouldShow,
    `a catalogue-driven control would show ${JSON.stringify(catalogueWouldShow)} here, LOSING the stored code ${STALE} on the next save`);
  assert.equal(shipped, STALE, `the code that would have been lost is ${STALE}`);
});

test('a code IN the catalogue reads as its name plus its code', () => {
  const html = draw({ value: 'MSE-AI' });
  assert.equal(boxValue(html), courseOptionLabel(CATALOGUE[1]));
  assert.ok(!html.includes('data-testid="course-select-unnamed"'),
    'a resolvable code was marked as unnamed');
});

test('an EMPTY value is not "unknown" — the two say different things', () => {
  const html = draw({ value: '' });
  assert.ok(!html.includes('data-testid="course-select-unnamed"'),
    'no course set was reported as a name that could not be found');
});

test('the mark is about THIS CATALOGUE, so an empty catalogue marks everything', () => {
  // A catalogue that failed to load must not silently rename every code
  // "missing" in a way that reads as "this course does not exist" — the
  // resolver owns existence and keeps its own warning. Same code, both ways.
  assert.ok(draw({ value: 'MSE-AI', courses: [] }).includes('ไม่ทราบชื่อ'));
  assert.ok(!draw({ value: 'MSE-AI', courses: CATALOGUE }).includes('ไม่ทราบชื่อ'));
});

// ── D. DIRECT ENTRY ────────────────────────────────────────────────────────

test('direct entry is offered beside the list, with its own control', () => {
  const html = draw({ value: '' });
  assert.ok(html.includes('data-testid="course-select-code-input"'), 'the direct-entry box is gone');
  assert.ok(html.includes('data-testid="course-select-code-use"'), 'the direct-entry button is gone');
  assert.ok(html.includes('ใช้รหัสนี้'), 'the button lost its label');
});

test('the direct-entry box is NOT the search box — they are two controls', () => {
  /**
   * The distinction is the whole reason direct entry had to be added: the
   * combobox's visible input is a SEARCH box, so a code the catalogue lacks
   * filters to nothing and cannot be committed through it.
   */
  const html = draw({ value: '' });
  assert.ok(html.includes('role="combobox"'), 'the search combobox is gone');
  const combos = [...html.matchAll(/role="combobox"/g)].length;
  assert.equal(combos, 1, 'the direct-entry box became a second combobox');
});

// ── E. THE MATCHING RULE IS NOT RE-IMPLEMENTED ─────────────────────────────

test('matching comes from filterCourseOptions, and no second matcher sits beside it', () => {
  // A rendered comparison cannot tell "calls filterCourseOptions" from "happens
  // to agree with it on this fixture", and the difference is the whole point of
  // there being one matcher. So the source says it.
  const src = readSource('src/components/pageBuilder/editor/CoursePicker.jsx').code;
  assert.ok(src.includes('filterCourseOptions'), 'the shared matcher is not referenced');
  assert.equal(/\.toLowerCase\(\)/.test(src), false, 'a second case-folding matcher appeared');
  assert.equal(/\.includes\(\s*q\b/.test(src), false, 'a second substring matcher appeared');

  const shared = readSource('src/app/admin/courses/_components/CourseSearchSelect.jsx').code;
  assert.ok(shared.includes('filterCourseOptions'), 'the reused combobox stopped using the shared matcher');
});

test('CONTROL: those readers can see the files they assert over', () => {
  for (const rel of [
    'src/components/pageBuilder/editor/CoursePicker.jsx',
    'src/app/admin/courses/_components/CourseSearchSelect.jsx',
  ]) {
    const src = readSource(rel).code;
    assert.ok(src.length > 500, `${rel} scrubbed to ${src.length} chars`);
  }
  assert.ok(readSource('src/components/pageBuilder/editor/CoursePicker.jsx').code
    .includes('CourseSelectPicker'), 'the reader cannot see the new component');
});

// ── A. THE ONE CHANGE THE SHARED COMPONENT NEEDED, AND ITS BLAST RADIUS ────

test('CourseSearchSelect still caps at 50 by default — CourseForm is untouched', () => {
  /**
   * `limit` became a prop so the page builder could turn the cap off. Its
   * DEFAULT is the number that was hardcoded, which is what keeps the admin
   * course form byte-identical. If this changes, that form's dropdown changed
   * with it and its own tests are the ones that should have said so.
   */
  const src = readSource('src/app/admin/courses/_components/CourseSearchSelect.jsx').code;
  assert.match(src, /limit\s*=\s*50/, 'the shared default cap moved — CourseForm shifted');
});

test('the page-builder control turns the cap OFF, and the cap would have withheld courses', () => {
  /**
   * The defect avoided, measured rather than described. 79 courses, a broad
   * query: with the shared default of 50 the list silently holds back 29 and
   * nothing on screen says so.
   */
  const many = Array.from({ length: 79 }, (_, i) => ({ course_id: `C-${i}`, course_name: `Course ${i}` }));
  const capped = filterCourseOptions(many, '', { limit: 50 });
  const uncapped = filterCourseOptions(many, '', { limit: null });
  assert.equal(capped.length, 50);
  assert.equal(uncapped.length, 79);
  assert.equal(uncapped.length - capped.length, 29, 'the number withheld by the default cap');

  const src = readSource('src/components/pageBuilder/editor/CoursePicker.jsx').code;
  assert.match(src, /limit=\{null\}/, 'the page-builder control stopped turning the cap off');
});

// ── B / G. BOTH EDITORS, AND THE WARNINGS THEY ALREADY HAD ────────────────

const panel = (type, content, resolved) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type, content, patch: () => {}, resolved, courses: CATALOGUE,
}));

test('course_card uses the picker and reads the catalogue from the editor context', () => {
  const html = panel('course_card', { courseId: 'MSE-AI' }, CATALOGUE[1]);
  assert.ok(html.includes('role="combobox"'), 'course_card still has a bare text box');
  assert.ok(html.includes(courseOptionLabel(CATALOGUE[1])), 'the catalogue name did not reach the control');
});

test('course_schedule uses the picker too', () => {
  const html = panel('course_schedule', { courseId: 'MSE-AI' }, [{ id: 'r1' }]);
  assert.ok(html.includes('role="combobox"'), 'course_schedule still has a bare text box');
  assert.ok(html.includes(courseOptionLabel(CATALOGUE[1])));
});

test('G — course_card still warns when the code does not resolve, unchanged', () => {
  // The tri-state is unchanged: only the RESOLUTION warning consults `resolved`,
  // and null means fetched-and-not-found. undefined (still fetching) must not
  // warn, or every panel would flash red on open.
  assert.ok(panel('course_card', { courseId: STALE }, null).includes('ไม่พบคอร์สรหัสนี้'),
    'the not-found warning stopped firing with the new control');
  assert.ok(!panel('course_card', { courseId: STALE }, undefined).includes('ไม่พบคอร์สรหัสนี้'),
    'a still-fetching panel warned');
  assert.ok(panel('course_card', { courseId: '' }, undefined).includes('ยังไม่ได้ระบุคอร์ส'),
    'the no-course warning is gone');
});

test('G — course_schedule keeps its own, differently-worded warnings', () => {
  assert.ok(panel('course_schedule', { courseId: STALE }, []).includes('ไม่พบรอบที่เปิดรับสมัคร'),
    'the empty-sample warning stopped firing');
  assert.ok(!panel('course_schedule', { courseId: STALE }, undefined).includes('ไม่พบรอบที่เปิดรับสมัคร'),
    'a still-fetching schedule panel warned');
  assert.ok(panel('course_schedule', { courseId: 'MSE-AI' }, [{ id: 'r1' }]).includes('ตัวอย่าง ณ เวลาแก้ไข'),
    'the 2C.2b sample label is gone');
});

test('a stale code reaches BOTH the control and the warning, saying different things', () => {
  /**
   * The two are read at different moments through different caches and are
   * allowed to disagree (§G step 2). What must never happen is the control
   * dropping the code while the warning talks about it.
   */
  const html = panel('course_card', { courseId: STALE }, null);
  assert.ok(html.includes(STALE), 'the control lost the code the warning is about');
  assert.ok(html.includes('ไม่ทราบชื่อ'), 'no name in this catalogue');
  assert.ok(html.includes('ไม่พบคอร์สรหัสนี้'), 'the resolver warning');
});

test('round 50 price switch is still there and still defaults to on', () => {
  // Its BEHAVIOUR is covered by test/render/courseCardPriceToggle — this only
  // pins that moving the course control did not displace or unwire it. No
  // parallel assertions about what the toggle does.
  const html = panel('course_card', { courseId: 'MSE-AI' }, CATALOGUE[1]);
  assert.ok(html.includes('แสดงราคาบนการ์ด'), 'the price switch left the tab');
  /**
   * ROUND 52 amended the line below, and the CLAIM is unchanged: the switch is
   * still there and still defaults to on. It read `/type="checkbox"[^>]*checked/`
   * — a bare attribute NAME — and round 52 made that vacuous, because the
   * toggle emits `aria-checked`, which contains "checked". Measured: it matched
   * even the OFF state, where no `checked` attribute exists. Value, not name.
   */
  assert.match(html, /data-state="on"/, 'the switch stopped defaulting to on');
});
