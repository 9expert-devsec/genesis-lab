import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseForm } from '@/app/admin/courses/_components/CourseForm';

/**
 * The course rich body field's label, renamed from "เนื้อหาแบบ Rich text" to
 * "คำอธิบายหลักสูตร" — and the readOnly เนื้อหา (title) textarea it replaced,
 * confirmed absent from the rendered form. SSR-only, same limit
 * test/render/courseEditorUnsavedGuard.test.mjs states: no jsdom in this
 * runner, so this checks markup, not interaction.
 */

const COURSE = {
  _id: '692d39b52ee07293c9131fd8',
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio',
  course_price: 7500,
  course_trainingdays: 1,
};

const html = () =>
  renderToStaticMarkup(
    createElement(CourseForm, {
      mode: 'edit',
      initial: COURSE,
      skills: [],
      programs: [],
      allCourses: [COURSE],
      extension: { courseId: 'COPILOT-STU', urlAlias: '/x', gallery: [], isPublished: true },
    })
  );

test('the rich body field is labelled คำอธิบายหลักสูตร', () => {
  // Matched at its element boundary, not as a bare substring — a Thai
  // matcher bound to `>label<` catches a label that gained trailing text
  // (e.g. a stray asterisk or hint concatenation) that a substring match
  // would miss.
  assert.match(html(), />คำอธิบายหลักสูตร</, 'the renamed label is not on the page');
});

test('CONTROL: the old label is gone, not merely superseded', () => {
  assert.doesNotMatch(html(), /เนื้อหาแบบ Rich text/, 'the pre-rename label text survives somewhere');
});

test('the hint about replacing the short description survived the rename', () => {
  assert.match(
    html(),
    /แสดงแทนคำอธิบายสั้นด้านบนบนหน้าคอร์ส เมื่อมีการพิมพ์เนื้อหาที่นี่/,
    'the hint explaining the fallback-to-teaser behaviour is gone or reworded unexpectedly'
  );
});

test('the readOnly เนื้อหา (title) textarea is gone', () => {
  const out = html();
  assert.doesNotMatch(out, /name="title"/, 'the read-blind textarea still renders');
  assert.doesNotMatch(out, /MSDB ไม่ส่งค่านี้กลับมา/, 'its note still renders');
});

test('CONTROL: the form still renders at all, and still has its other rail fields', () => {
  // Without this, an empty/crashed render would satisfy every doesNotMatch
  // above for the wrong reason.
  const out = html();
  assert.match(out, /name="course_teaser"/, 'the form did not render its normal fields');
  assert.match(out, /name="course_name"/);
});
