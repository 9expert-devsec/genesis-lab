import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseIdConflict, normaliseCourseId } from '@/lib/courses/courseIdAvailability';

/**
 * A course_id already in use must refuse the whole create.
 *
 * Not a validation nicety. `saveCourseExtension` upserts a WHOLE document keyed
 * by the code, so creating a course with a taken code overwrites a DIFFERENT
 * course's SEO, alias, gallery and `omisePaymentEnabled` (→ false, which kills
 * that course's card/PromptPay flow) with nothing on screen to say so.
 */

test('a matching MSDB course blocks the create', () => {
  const c = courseIdConflict({ code: 'MSE-L1', existingCourseId: 'MSE-L1' });
  assert.equal(c?.field, 'course_id');
  assert.match(c.error, /MSE-L1/);
});

test('an orphan EXTENSION row blocks it too, with no MSDB course', () => {
  // An extension outlives its course — deleting a course upstream leaves the
  // row. Checking MSDB alone would let a new course inherit a dead row's alias
  // and gallery and look pre-configured with someone else's SEO.
  const c = courseIdConflict({ code: 'GONE-01', existingExtensionId: 'GONE-01' });
  assert.equal(c?.field, 'course_id');
  assert.match(c.error, /SEO/);
});

test('the refusal names the STORED spelling, not the typed one', () => {
  // The case that matters when the collision is only capitalisation: the admin
  // typed MSE-L1 and needs to see that "mse-l1" is what is already there.
  const c = courseIdConflict({ code: 'MSE-L1', existingCourseId: 'mse-l1' });
  assert.match(c.error, /mse-l1/);
});

test('a free code returns null', () => {
  assert.equal(courseIdConflict({ code: 'BRAND-NEW' }), null);
});

test('an empty code is not a conflict — "required" is a different error', () => {
  // Returning a conflict here would report "already in use" for a blank field.
  assert.equal(courseIdConflict({ code: '' }), null);
  assert.equal(courseIdConflict({}), null);
});

test('normaliseCourseId trims and uppercases', () => {
  assert.equal(normaliseCourseId('  mse-l1 '), 'MSE-L1');
  assert.equal(normaliseCourseId(null), '');
});
