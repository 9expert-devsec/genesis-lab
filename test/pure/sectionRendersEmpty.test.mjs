import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';

const empty = (type, content, advanced) => sectionRendersEmpty({ type, content, advanced });

test('heading empty iff no text', () => {
  assert.equal(empty('heading', {}), true);
  assert.equal(empty('heading', { text: 'hi' }), false);
});
test('image empty iff no src', () => {
  assert.equal(empty('image', {}), true);
  assert.equal(empty('image', { src: 'u' }), false);
});
test('custom_css empty without a valid Section ID, non-empty with one', () => {
  assert.equal(empty('custom_css', { css: '.a{}' }, { sectionId: '' }), true);
  assert.equal(empty('custom_css', { css: '.a{}' }, { sectionId: 'sec1' }), false);
});
test('data-backed: no reference set → empty (statically knowable)', () => {
  assert.equal(empty('course_card', {}), true);
  assert.equal(empty('instructor_card', {}), true);
  assert.equal(empty('course_selector', { courseIds: [] }), true);
});
test('data-backed: reference set → NOT statically empty (needs the fetch)', () => {
  assert.equal(empty('course_card', { courseId: 'A' }), false);
  assert.equal(empty('course_selector', { courseIds: ['A'] }), false);
});
test('2C.2b course_list: derived keys off filter, manual off courseIds', () => {
  // manual: empty iff no ids
  assert.equal(empty('course_list', { source: 'manual', courseIds: [] }), true);
  assert.equal(empty('course_list', { source: 'manual', courseIds: ['A'] }), false);
  // derived: empty iff no filter — a stale courseIds must NOT keep it "non-empty"
  assert.equal(empty('course_list', { source: 'skill', filter: '', courseIds: ['A'] }), true);
  assert.equal(empty('course_list', { source: 'skill', filter: 'S1' }), false);
  assert.equal(empty('course_list', { source: 'program', filter: 'P1' }), false);
});
test('2C.2b course_schedule: empty iff no course code', () => {
  assert.equal(empty('course_schedule', {}), true);
  assert.equal(empty('course_schedule', { courseId: 'MSE-AI' }), false);
});
