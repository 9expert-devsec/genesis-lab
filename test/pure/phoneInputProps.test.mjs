import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldReformatOnInput,
  maxDigitsFor,
  wouldExceedCap,
} from '@/lib/registration/phoneInputProps';

/**
 * The runner has no jsdom, so these test the pure decision functions
 * phoneInputProps.js's DOM listeners call — not the DOM wiring itself. See
 * src/lib/registration/phoneInputProps.js for the full reasoning behind
 * each rule.
 */

// ── shouldReformatOnInput — Commit 9a ───────────────────────────────────────

test('shouldReformatOnInput: true when the caret is at the end, not a delete, no leading +', () => {
  assert.equal(
    shouldReformatOnInput({ value: '08123', selectionStart: 5, selectionEnd: 5, inputType: 'insertText' }),
    true
  );
});

test('shouldReformatOnInput: false when the caret is mid-string — the legacy caret-jump defect', () => {
  assert.equal(
    shouldReformatOnInput({ value: '08123', selectionStart: 2, selectionEnd: 2, inputType: 'insertText' }),
    false
  );
});

test('shouldReformatOnInput: false when either end of a selection is not at the end of the value', () => {
  assert.equal(
    shouldReformatOnInput({ value: '08123', selectionStart: 3, selectionEnd: 5, inputType: 'insertText' }),
    false,
    'selectionStart short of the end must block, even though selectionEnd reaches it'
  );
});

test('shouldReformatOnInput: false for any inputType starting with "delete"', () => {
  for (const inputType of ['deleteContentBackward', 'deleteContentForward', 'deleteByCut']) {
    assert.equal(
      shouldReformatOnInput({ value: '08123', selectionStart: 5, selectionEnd: 5, inputType }),
      false,
      `inputType "${inputType}" should have blocked the reformat`
    );
  }
});

test('shouldReformatOnInput: an inputType that merely contains, but does not start with, "delete" is not treated as a delete', () => {
  assert.equal(
    shouldReformatOnInput({ value: '08123', selectionStart: 5, selectionEnd: 5, inputType: 'insertDeleteMe' }),
    true
  );
});

test('shouldReformatOnInput: false when the value starts with "+"', () => {
  assert.equal(
    shouldReformatOnInput({ value: '+6681', selectionStart: 5, selectionEnd: 5, inputType: 'insertText' }),
    false
  );
});

test('CONTROL: all three gates independently matter — flip one at a time from an otherwise-true case', () => {
  const base = { value: '08123', selectionStart: 5, selectionEnd: 5, inputType: 'insertText' };
  assert.equal(shouldReformatOnInput(base), true, 'the base case itself must be true, or this control proves nothing');
  assert.equal(shouldReformatOnInput({ ...base, selectionStart: 0 }), false);
  assert.equal(shouldReformatOnInput({ ...base, inputType: 'deleteContentBackward' }), false);
  // Same LENGTH as base's value ("+8123", not "+08123") so the caret (still
  // at 5,5) stays at the end of the new value too — isolating the "+" gate
  // from the caret gate, which a longer prefixed value would not do.
  assert.equal(shouldReformatOnInput({ ...base, value: '+8123' }), false);
});

// ── maxDigitsFor — Commit 9b ─────────────────────────────────────────────

test('maxDigitsFor: a "+"-led value caps at 15 digits after the "+"', () => {
  assert.equal(maxDigitsFor('+66 81 234 5'), 15);
});

test('maxDigitsFor: fewer than 2 digits so far caps at 15 — class not yet known', () => {
  assert.equal(maxDigitsFor(''), 15);
  assert.equal(maxDigitsFor('0'), 15);
});

test('maxDigitsFor: a mobile prefix (06/08/09) caps at 10', () => {
  assert.equal(maxDigitsFor('06'), 10);
  assert.equal(maxDigitsFor('081'), 10);
  assert.equal(maxDigitsFor('09123'), 10);
});

test('maxDigitsFor: a landline prefix (01/02/03/04/05/07) caps at 14 — 9 base + up to 5 extension digits', () => {
  for (const prefix of ['01', '02', '03', '04', '05', '07']) {
    assert.equal(maxDigitsFor(`${prefix}2`), 14, `prefix ${prefix} should cap at 14`);
  }
});

test('maxDigitsFor: an unmatched prefix falls back to the permissive 15 cap', () => {
  assert.equal(maxDigitsFor('00123'), 15);
  assert.equal(maxDigitsFor('99'), 15);
});

// ── wouldExceedCap — Commit 9b ───────────────────────────────────────────

test('wouldExceedCap: false while the prospective digit count is under the cap', () => {
  assert.equal(wouldExceedCap('08123', '4'), false); // 6 digits so far, mobile cap 10
});

test('wouldExceedCap: false exactly AT the cap — only strictly over refuses', () => {
  assert.equal(wouldExceedCap('081234567', '8'), false); // -> 10 digits, mobile cap 10
});

test('wouldExceedCap: true one digit past a mobile number\'s 10-digit cap', () => {
  assert.equal(wouldExceedCap('0812345678', '9'), true); // -> 11 digits, mobile cap 10
});

test('wouldExceedCap: true one digit past a landline number\'s 14-digit cap', () => {
  assert.equal(wouldExceedCap('02219430412345', '6'), true); // -> 15 digits, landline cap 14
});

test('wouldExceedCap: counts DIGITS in insertedText, not characters — separators do not count', () => {
  // 13 digits already present (landline cap 14); inserting "-6" adds exactly
  // ONE digit, landing exactly AT the cap (14) — must NOT exceed. Counting
  // the 2 CHARACTERS of "-6" instead would put it at 15, over the cap — the
  // two counting strategies disagree here, which is what makes this a real
  // test of "digits, not characters", not just a same-answer-either-way case.
  assert.equal(wouldExceedCap('0221943041234', '-6'), false);
});

test('wouldExceedCap: counts DIGITS already in currentValue, not characters — existing separators do not inflate the count', () => {
  // '02-219-4304 ต่อ 1234' has 13 digits despite being 20 characters long
  // (dashes, a space, and the 3-character ต่อ marker). One more digit lands
  // exactly AT the landline 14 cap — must NOT exceed. Counting the 20
  // CHARACTERS instead would already be over the cap before any insertion,
  // so a broken character-counting implementation says "exceeds" here no
  // matter what is inserted — the two strategies disagree, unlike a value
  // with no separators, where they'd coincidentally agree.
  assert.equal(wouldExceedCap('02-219-4304 ต่อ 1234', '5'), false);
});

test('CONTROL: the exact same insertion is refused under the tighter mobile cap but allowed under the looser landline cap', () => {
  // 10 digits already present in both — over a mobile cap, under a landline one.
  assert.equal(wouldExceedCap('0812345678', '1'), true, 'mobile: 11th digit should be refused');
  assert.equal(wouldExceedCap('0221943041', '1'), false, 'landline: 11th digit (an extension digit) should be allowed');
});
