import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseForm } from '@/app/admin/courses/_components/CourseForm';
import { parseBulletLines } from '@/lib/courses/bulletLines';
import { legacyFallbackCount, legacyFallbackNote } from '@/lib/courses/legacyPlainFallback';

/**
 * ADM-1 — section 6 hides the four LEGACY PLAIN textareas and keeps the four
 * rich editors. THE PLAIN DATA MUST SURVIVE A SAVE.
 *
 * Why the payload is the thing to prove: `shapePayload` always emits the four
 * keys through `linesOf`, which turns a MISSING key into `[]`, and MSDB's
 * `findByIdAndUpdate(id, body)` writes what it is given. So "not rendered" can
 * only be safe if the value still reaches FormData unchanged. `parseBulletLines`
 * is `linesOf`'s pinned mirror (test/pure/bulletLines), so feeding it the form's
 * own FormData value is the payload `linesOf` would build.
 */

const FIELDS = [
  ['course_objectives', 'objectivesRich'],
  ['course_target_audience', 'targetAudienceRich'],
  ['course_prerequisites', 'prerequisitesRich'],
  ['course_system_requirements', 'systemRequirementsRich'],
];

const COURSE = {
  _id: '692d39b52ee07293c9131fd8',
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio',
  course_price: 7500,
  course_trainingdays: 1,
  course_objectives: ['เข้าใจ Copilot Studio', 'สร้าง Agent & เชื่อม "Power Automate"'],
  course_target_audience: ['ผู้ใช้งานทั่วไป'],
  course_prerequisites: [],
  course_system_requirements: ['Windows 11', 'Edge <latest>'],
};

const EXTENSION = {
  courseId: 'COPILOT-STU', urlAlias: '/x', gallery: [], isPublished: true,
  objectivesRich: '',                       // empty, plain has 2 → note "2"
  targetAudienceRich: '<p>มีเนื้อหา</p>',      // rich has content → no note
  prerequisitesRich: '',                    // plain empty → no note
  systemRequirementsRich: '<p><br></p>',    // Tiptap "empty", plain has 2 → note "2"
};

const render = (props) =>
  renderToStaticMarkup(createElement(CourseForm, {
    skills: [], programs: [], allCourses: [COURSE], ...props,
  }));

const editHtml = () => render({ mode: 'edit', initial: COURSE, extension: EXTENSION });

const unescape = (s) => s
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** What `new FormData(form).get(name)` would return: every control named `name`. */
function namedValues(html, name) {
  const controls = [...html.matchAll(new RegExp(`<(input|textarea)\\b[^>]*\\bname="${name}"[^>]*>`, 'g'))];
  return controls.map(([tag, kind]) => ({ kind, tag, value: unescape(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? '') }));
}

test('the four plain textareas are not rendered', () => {
  const html = editHtml();
  for (const [field] of FIELDS) {
    assert.doesNotMatch(html, new RegExp(`<textarea\\b[^>]*name="${field}"`), `${field} textarea still renders`);
  }
  assert.doesNotMatch(html, /แต่ละบรรทัดคือหนึ่งวัตถุประสงค์/, 'the plain objectives helper still renders');
});

test('the four rich editors still render', () => {
  const html = editHtml();
  assert.equal(html.match(/\(รูปแบบ Rich text\)/g)?.length, 4, 'expected exactly four section-6 rich editor labels');
});

test('SAVE PAYLOAD: each plain field submits exactly its loaded value — never blanked', () => {
  const html = editHtml();
  for (const [field] of FIELDS) {
    const controls = namedValues(html, field);
    assert.equal(controls.length, 1, `${field}: expected exactly one named control, got ${controls.length}`);
    assert.match(controls[0].tag, /type="hidden"/, `${field} is not a hidden carrier`);
    assert.deepEqual(parseBulletLines(controls[0].value), COURSE[field], `${field} would not round-trip unchanged`);
  }
});

test('CONTROL: a non-empty plain list really is non-empty in the payload', () => {
  // Without this, a form that submitted '' for every field would only fail the
  // deepEqual above for the populated fields — this names the blanking case.
  const value = namedValues(editHtml(), 'course_objectives')[0].value;
  assert.notEqual(value, '');
  assert.equal(parseBulletLines(value).length, 2);
});

test('create: no initial → each plain field submits [] exactly as an empty textarea did', () => {
  const html = render({ mode: 'create', initial: null, extension: null });
  for (const [field] of FIELDS) {
    const controls = namedValues(html, field);
    assert.equal(controls.length, 1, `${field}: create form lost the control`);
    assert.deepEqual(parseBulletLines(controls[0].value), []);
  }
});

test('the fallback note shows only for rich-empty + plain-non-empty', () => {
  const html = editHtml();
  const notes = [...html.matchAll(/data-legacy-fallback-note=""[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(notes, [
    'หน้าเว็บกำลังแสดงรายการเดิม 2 รายการ — กรอกในช่องนี้เพื่อแทนที่',
    'หน้าเว็บกำลังแสดงรายการเดิม 2 รายการ — กรอกในช่องนี้เพื่อแทนที่',
  ]);
});

test('legacyFallbackCount: rich content, empty plain, and Tiptap-empty rich', () => {
  assert.equal(legacyFallbackCount('', ['a', 'b', 'c']), 3);
  assert.equal(legacyFallbackCount(undefined, ['a']), 1);
  assert.equal(legacyFallbackCount('<p>&nbsp;</p>', ['a']), 1, 'whitespace-only rich is empty');
  assert.equal(legacyFallbackCount('<p>x</p>', ['a']), 0, 'rich has content → no note');
  assert.equal(legacyFallbackCount('', []), 0, 'plain empty → no note');
  assert.equal(legacyFallbackCount('', ['a', '  ', '']), 1, 'counts what linesOf sends, not raw items');
  assert.equal(legacyFallbackNote(0), null);
});
