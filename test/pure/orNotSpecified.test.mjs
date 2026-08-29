import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_SPECIFIED_LABEL, orNotSpecified, isBlankValue } from '@/lib/orNotSpecified';

/**
 * T2 (Nutto ticket 5): orNotSpecified — the ONE render-time substitution for
 * a blank attendee email/phone. null/undefined/''/whitespace-only -> the
 * label; a real value -> returned BYTE-IDENTICALLY, never trimmed.
 */

test('the label is the exact specified string', () => {
  assert.equal(NOT_SPECIFIED_LABEL, 'ไม่ได้ระบุ');
});

test('null, undefined, empty string, and whitespace-only all substitute the label', () => {
  assert.equal(orNotSpecified(null), NOT_SPECIFIED_LABEL);
  assert.equal(orNotSpecified(undefined), NOT_SPECIFIED_LABEL);
  assert.equal(orNotSpecified(''), NOT_SPECIFIED_LABEL);
  assert.equal(orNotSpecified('   '), NOT_SPECIFIED_LABEL);
  assert.equal(orNotSpecified('\t\n  '), NOT_SPECIFIED_LABEL);
});

test('a real value is returned BYTE-IDENTICALLY — not trimmed, not touched', () => {
  assert.equal(orNotSpecified('somchai@example.com'), 'somchai@example.com');
  assert.equal(orNotSpecified('081-234-5678'), '081-234-5678');
  // Leading/trailing whitespace inside an otherwise-real value must survive —
  // trimming here would be the same class of silent rewrite this repo has
  // already been burned by (see this module's own header comment).
  assert.equal(orNotSpecified('  somchai@example.com  '), '  somchai@example.com  ');
});

test('CONTROL: a trimmed copy would NOT be byte-identical — proves the byte-identity assertion above is real', () => {
  const withPadding = '  somchai@example.com  ';
  const trimmedCopy = withPadding.trim();
  assert.notEqual(trimmedCopy, withPadding, 'trim() must actually change this fixture, or the control below proves nothing');
  assert.notEqual(orNotSpecified(withPadding), trimmedCopy, 'orNotSpecified must not have quietly trimmed');
});

test('isBlankValue agrees with orNotSpecified on what counts as blank', () => {
  for (const v of [null, undefined, '', '   ']) {
    assert.equal(isBlankValue(v), true, `${JSON.stringify(v)} should be blank`);
  }
  for (const v of ['a', '0', ' a ']) {
    assert.equal(isBlankValue(v), false, `${JSON.stringify(v)} should not be blank`);
  }
});

test('the number 0 and the string "0" are NOT blank — only null/undefined/whitespace are', () => {
  // Not a case this module is actually asked to handle for attendee
  // email/phone (always strings), but a boundary worth pinning explicitly:
  // isBlankValue must not treat every falsy JS value as blank.
  assert.equal(orNotSpecified('0'), '0');
});
