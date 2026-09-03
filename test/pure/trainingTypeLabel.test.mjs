import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAINING_TYPE_LABEL, trainingTypeLabel } from '@/lib/schedule/trainingTypeLabel';

/**
 * The one shared training-type label map — Commit C. Every string below is
 * copied verbatim from the ticket, em dashes included.
 */

test('classroom label, exact string', () => {
  assert.equal(trainingTypeLabel('classroom'), 'Classroom — อบรมที่ห้องอบรม 9Expert');
});

test('hybrid label, exact string', () => {
  assert.equal(
    trainingTypeLabel('hybrid'),
    'Hybrid — เลือกอบรมได้ 1 รูปแบบ ระหว่าง Classroom หรือ MS Teams'
  );
});

test('online label, exact string', () => {
  assert.equal(trainingTypeLabel('online'), 'Online — อบรมออนไลน์ผ่าน Microsoft Teams');
});

test('an unrecognised type falls back to the raw type value, never to "Classroom"', () => {
  assert.equal(trainingTypeLabel('webinar'), 'webinar');
  assert.notEqual(trainingTypeLabel('webinar'), 'Classroom — อบรมที่ห้องอบรม 9Expert');
});

test('CONTROL: TRAINING_TYPE_LABEL itself carries exactly these three keys', () => {
  // Guards against a fourth key sneaking in unnoticed, or one of the three
  // being renamed — either would silently change which types this module
  // recognises without any test above necessarily catching it.
  assert.deepEqual(Object.keys(TRAINING_TYPE_LABEL).sort(), ['classroom', 'hybrid', 'online']);
});

test('undefined/null/empty-string types all fall back to themselves, not to "Classroom"', () => {
  assert.equal(trainingTypeLabel(undefined), undefined);
  assert.equal(trainingTypeLabel(null), null);
  assert.equal(trainingTypeLabel(''), '');
});
