import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicateKeyMessage,
  duplicateKeyField,
  DUPLICATE_KEY_FIELDS,
  GENERIC_DUPLICATE_MESSAGE,
} from '@/lib/db/duplicateKeyMessage';

/**
 * `course_extensions` has TWO unique indexes, so an E11000 no longer says which
 * constraint failed.
 *
 * The branch this replaces returned the ALIAS message for any 11000 — and while
 * urlAlias had no unique index, the only error it could actually receive was a
 * `courseId` collision. So the one reachable case was the one it described
 * wrongly. Both branches are pinned below, in both directions.
 *
 * The fixtures are shaped like the real driver errors: `keyPattern` +
 * `keyValue` on modern drivers, message-only on older ones.
 */

/** A duplicate-key error as the current Node driver raises it. */
const e11000 = (field, value) => Object.assign(new Error(
  `E11000 duplicate key error collection: 9exp_genesis.course_extensions ` +
  `index: ${field}_1 dup key: { ${field}: "${value}" }`
), {
  code: 11000,
  keyPattern: { [field]: 1 },
  keyValue: { [field]: value },
});

// ── D3: the right message for each index ───────────────────────────────────

test('an ALIAS collision says the alias is taken', () => {
  const err = e11000('urlAlias', '/power-apps-for-business-training-course');
  assert.equal(duplicateKeyField(err), 'urlAlias');
  assert.equal(duplicateKeyMessage(err), 'URL Alias นี้ถูกใช้แล้วโดยหลักสูตรอื่น');
});

test('a COURSE ID collision does NOT say the alias is taken', () => {
  // The exact mislabelling this replaces: courseId_1 was the only unique index,
  // so this error was the only one the old branch could receive — and it
  // answered "URL Alias นี้ถูกใช้แล้ว".
  const err = e11000('courseId', 'POWER-APPS');
  assert.equal(duplicateKeyField(err), 'courseId');
  const msg = duplicateKeyMessage(err);
  assert.equal(msg, 'หลักสูตรนี้มีข้อมูลส่วนขยายอยู่แล้ว');
  assert.ok(!msg.includes('URL Alias'), 'a courseId collision is still reported as an alias problem');
});

test('the two messages are genuinely different strings', () => {
  // A copy-paste that returned the same text for both would satisfy the pair
  // above while destroying the distinction they exist for.
  assert.notEqual(
    duplicateKeyMessage(e11000('urlAlias', '/x')),
    duplicateKeyMessage(e11000('courseId', 'X')),
  );
});

// ── identification, in each of the three ways ──────────────────────────────

test('keyPattern is used when present', () => {
  const err = Object.assign(new Error('E11000 duplicate key error'), {
    code: 11000,
    keyPattern: { urlAlias: 1 },
  });
  assert.equal(duplicateKeyField(err), 'urlAlias');
});

test('keyValue is used when keyPattern is absent', () => {
  const err = Object.assign(new Error('E11000 duplicate key error'), {
    code: 11000,
    keyValue: { courseId: 'MSE-AI' },
  });
  assert.equal(duplicateKeyField(err), 'courseId');
});

test('the index NAME in the message is the last resort', () => {
  // Older drivers give neither structured field.
  const err = Object.assign(new Error(
    'E11000 duplicate key error collection: db.course_extensions index: urlAlias_1 dup key: { : "/x" }'
  ), { code: 11000 });
  assert.equal(duplicateKeyField(err), 'urlAlias');
  assert.equal(duplicateKeyMessage(err), 'URL Alias นี้ถูกใช้แล้วโดยหลักสูตรอื่น');
});

test('a descending or compound index name still yields the field', () => {
  const err = Object.assign(new Error(
    'E11000 duplicate key error collection: db.c index: urlAlias_-1 dup key: { : "/x" }'
  ), { code: 11000 });
  assert.equal(duplicateKeyField(err), 'urlAlias');
});

// ── it must not guess ──────────────────────────────────────────────────────

test('an UNKNOWN unique index gets the generic message, not a wrong specific one', () => {
  // The lesson of the branch this replaces: a wrong specific message is worse
  // than an honest vague one.
  const err = e11000('someFutureField', 'v');
  assert.equal(duplicateKeyField(err), 'someFutureField');
  assert.equal(duplicateKeyMessage(err), GENERIC_DUPLICATE_MESSAGE);
});

test('an unidentifiable duplicate is still reported AS a duplicate', () => {
  const err = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
  assert.equal(duplicateKeyField(err), null);
  assert.equal(duplicateKeyMessage(err), GENERIC_DUPLICATE_MESSAGE);
});

test('an _id duplicate is not blamed on a field the admin can act on', () => {
  const err = e11000('_id', '507f1f77bcf86cd799439011');
  assert.equal(duplicateKeyField(err), null);
  assert.equal(duplicateKeyMessage(err), GENERIC_DUPLICATE_MESSAGE);
});

// ── everything that is NOT a duplicate key ─────────────────────────────────

test('CONTROL: a non-11000 error returns null so the caller keeps its own handling', () => {
  assert.equal(duplicateKeyMessage(Object.assign(new Error('boom'), { code: 121 })), null);
  assert.equal(duplicateKeyMessage(new Error('validation failed')), null);
  assert.equal(duplicateKeyMessage(null), null);
  assert.equal(duplicateKeyMessage(undefined), null);
});

test('CONTROL: a message merely CONTAINING 11000 is not treated as one', () => {
  // The code is the signal, never the text.
  const err = new Error('E11000 duplicate key error collection: db.c index: urlAlias_1 dup key');
  assert.equal(duplicateKeyMessage(err), null, 'a message-only lookalike was accepted');
});

// ── the map stays honest ───────────────────────────────────────────────────

test('every field this module names is one of the collection\'s unique indexes', () => {
  // If a third unique index is added, it belongs here — otherwise it silently
  // takes the generic message.
  assert.deepEqual([...DUPLICATE_KEY_FIELDS].sort(), ['courseId', 'urlAlias']);
});
