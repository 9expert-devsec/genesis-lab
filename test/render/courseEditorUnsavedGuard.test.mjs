import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseForm } from '@/app/admin/courses/_components/CourseForm';
import { UnsavedChangesDialog } from '@/app/admin/courses/_components/UnsavedChangesDialog';

/**
 * The unsaved-changes dialog: what it says, and when it is absent.
 *
 * SSR only — there is no jsdom in this runner, so typing and clicking cannot be
 * simulated here. The DECISION (is this edited?) is a pure function and is
 * tested exhaustively in test/pure/courseFormDirty. What this file pins is the
 * half SSR can actually see: a freshly-rendered editor shows no dialog, the
 * dialog reads correctly in Thai when it is open, and "ดูหน้าจริง" (formerly
 * labelled "Preview") is a new tab so it can never be an exit that prompts.
 *
 * "ดูหน้าจริง"'s own dirty-warn confirm() and the post-save "เปิดหน้าจริง"
 * reveal are NOT covered here for the same reason — both need a real click and
 * `dirty`/`previewReady` state, neither of which exists in a static SSR pass.
 */

const COURSE = {
  _id: '692d39b52ee07293c9131fd8',
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio',
  course_price: 7500,
  course_trainingdays: 1,
};

const renderEdit = () =>
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

// ── the control that matters ────────────────────────────────────────────────

test('CONTROL: a freshly opened editor shows NO dialog', () => {
  // The single most important assertion here. A guard that renders its dialog
  // on mount would satisfy every "the dialog exists" test ever written and be
  // useless — worse than useless, since admins would learn to dismiss it.
  const html = renderEdit();
  assert.doesNotMatch(html, /ยังไม่ได้บันทึกการแก้ไข/, 'the dialog is open on a page nobody has edited');
  assert.doesNotMatch(html, /role="dialog"/);
});

test('CONTROL: ดูหน้าจริง opens a new tab, so it is not an exit', () => {
  // The click interceptor skips any anchor with a target other than _self. If
  // ดูหน้าจริง ever loses target="_blank" it becomes an in-page exit and this
  // assumption silently stops holding.
  const html = renderEdit();
  assert.match(
    html,
    /<a href="[^"]*"[^>]*target="_blank"[^>]*>.*?ดูหน้าจริง/s,
    'ดูหน้าจริง is no longer target="_blank" — it is now an exit the guard must handle'
  );
});

// ── the dialog itself ───────────────────────────────────────────────────────

test('the dialog is Thai, with a Yes/No pair', () => {
  const html = renderToStaticMarkup(
    createElement(UnsavedChangesDialog, { open: true, onLeave() {}, onStay() {} })
  );
  assert.match(html, /ยังไม่ได้บันทึกการแก้ไข/);
  assert.match(html, /ใช่ ออกโดยไม่บันทึก/, 'no "leave" choice');
  assert.match(html, /ไม่ อยู่หน้านี้ต่อ/, 'no "stay" choice');
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
});

test('CONTROL: closed renders nothing at all', () => {
  const html = renderToStaticMarkup(
    createElement(UnsavedChangesDialog, { open: false, onLeave() {}, onStay() {} })
  );
  assert.equal(html, '', 'a closed dialog still emitted markup');
});

test('both buttons are type="button" — neither may submit the form', () => {
  // The dialog renders INSIDE the <form>, so an unqualified <button> would
  // default to type="submit" and "stay on this page" would save the course.
  const html = renderToStaticMarkup(
    createElement(UnsavedChangesDialog, { open: true, onLeave() {}, onStay() {} })
  );
  assert.equal((html.match(/<button type="button"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button(?![^>]*type=)/, 'a button with no explicit type');
});
