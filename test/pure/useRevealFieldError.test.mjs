import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShouldShowError } from '@/lib/registration/useRevealFieldError';

/**
 * Commit 10 — the phone fields' error surfaces on blur and on submit, not
 * per keystroke. The hook itself (useState/useCallback) needs a React
 * renderer to exercise directly; this pure predicate is the actual decision,
 * factored out so it can be unit tested without one.
 */

test('neither blurred nor submitted: error stays hidden', () => {
  assert.equal(computeShouldShowError(false, false), false);
});

test('blurred, not submitted: error shows', () => {
  assert.equal(computeShouldShowError(true, false), true);
});

test('submitted, not (yet) blurred: error shows too', () => {
  assert.equal(computeShouldShowError(false, true), true);
});

test('both: error shows', () => {
  assert.equal(computeShouldShowError(true, true), true);
});

test('undefined isSubmitted (a form that never threads it) does not crash and reads as false', () => {
  assert.equal(computeShouldShowError(false, undefined), false);
});
