import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepPreview } from '@/components/registration/RegisterWizard';

/**
 * T1 (Nutto ticket 5 follow-up): the "ผู้ประสานงานเข้าอบรม" (ใช่/ไม่) row is
 * removed from StepPreview — the customer's toggle-OFF step-2 review screen —
 * for BOTH values of coordinator.isAttending, not merely gated on false.
 *
 * ReviewAndPayStep.jsx carries the identical row and is deliberately NOT
 * touched this round (the user's own dirty file — see the ticket).
 *
 * Matched at ELEMENT TEXT BOUNDARIES, not a bare substring: Thai negates by
 * prefix, and a naive `.includes()` for "ไม่" would also match inside
 * unrelated strings elsewhere on the page.
 */

const LABEL = 'ผู้ประสานงานเข้าอบรม';

const BASE_DATA = {
  courseId: 'DA-PBI',
  courseCode: 'DA-PBI',
  courseName: 'Power BI Essentials',
  classDate: '10-11 ส.ค. 2569',
  scheduleType: 'classroom',
  coordinator: {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    email: 'somchai@example.com',
    phone: '0812345678',
  },
  attendeesCount: 1,
  attendeesListProvided: false,
  attendees: [],
};

const noop = () => {};

const previewHtml = (isAttending) =>
  renderToStaticMarkup(
    createElement(StepPreview, {
      data: { ...BASE_DATA, coordinator: { ...BASE_DATA.coordinator, isAttending } },
      onBack: noop,
      onConfirm: noop,
      submitting: false,
      error: null,
    }),
  );

/** Text as an ELEMENT's own content, not a loose substring elsewhere. */
const hasLabel = (out, label) => out.includes(`>${label}<`);

test('the label is absent when coordinator.isAttending is true', () => {
  const html = previewHtml(true);
  assert.equal(hasLabel(html, LABEL), false, 'the row is still on screen for isAttending: true');
});

test('the label is absent when coordinator.isAttending is false', () => {
  const html = previewHtml(false);
  assert.equal(hasLabel(html, LABEL), false, 'the row is still on screen for isAttending: false');
});

test('CONTROL: every OTHER coordinator row is still on screen — this is a targeted removal, not a section wipe', () => {
  const html = previewHtml(true);
  assert.ok(html.includes('ข้อมูลผู้ประสานงาน'), 'the section heading is gone');
  assert.ok(html.includes('สมชาย'), 'the name is gone');
  assert.ok(html.includes('somchai@example.com'), 'the email is gone');
  assert.ok(html.includes('0812345678'), 'the phone is gone');
});

