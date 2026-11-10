import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActiveAdminDoc, isWellFormedAdminId } from '@/lib/auth/adminStatus';

/** The decision alone. Every case that is not plainly active must read as no. */

test('a deleted admin is inactive', () => {
  assert.equal(isActiveAdminDoc(null), false);
  assert.equal(isActiveAdminDoc(undefined), false);
});

test('a disabled admin is inactive', () => {
  assert.equal(isActiveAdminDoc({ active: false }), false);
});

test('a row with no flag, or a flag that is not a boolean, is inactive', () => {
  assert.equal(isActiveAdminDoc({}), false);
  assert.equal(isActiveAdminDoc({ active: 'true' }), false);
  assert.equal(isActiveAdminDoc({ active: 1 }), false);
});

test('CONTROL: an active admin is active', () => {
  assert.equal(isActiveAdminDoc({ active: true }), true);
});

for (const [name, id] of [
  ['missing', undefined],
  ['null', null],
  ['empty', ''],
  ['short', '68da60bb87a228e4c5f4c2c'],
  ['long', '68da60bb87a228e4c5f4c2c77'],
  ['not hex', 'zzzz60bb87a228e4c5f4c2c7'],
  ['a 12-character string Mongo would accept', 'twelve-chars'],
  ['an object', { $ne: null }],
  ['a number', 123456789012],
]) {
  test(`a malformed id is refused, never read: ${name}`, () => {
    assert.equal(isWellFormedAdminId(id), false);
  });
}

test('CONTROL: a real ObjectId string is well formed, in either case', () => {
  assert.equal(isWellFormedAdminId('68da60bb87a228e4c5f4c2c7'), true);
  assert.equal(isWellFormedAdminId('68DA60BB87A228E4C5F4C2C7'), true);
});
