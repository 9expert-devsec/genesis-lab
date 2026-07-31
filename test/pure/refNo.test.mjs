import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refNo, isObjectIdLike, displayRecordId } from '@/lib/refNo';

// The short reference number, extracted from fourteen copies (§8.7 scheduled
// the extraction for when Phase 3 became the seventh caller; the real count was
// fourteen — see the fs guard in test/fs/refNoSingleSource).
//
// WHAT THIS FILE CANNOT SEE: that the fourteen call sites now render the same
// string they used to. Behaviour is byte-identical by construction, and the fs
// guard proves no copy survived, but the screens themselves are a click-test.

// A real ObjectId from the live audit trail, so these cannot drift into
// asserting a shape this file made up.
const REAL_ID = '6a2fb23a505532a1ed4c3439';

test('refNo is the last eight characters, uppercased', () => {
  assert.equal(refNo(REAL_ID), 'ED4C3439');
  assert.equal(refNo('692d39b52ee07293c9131fd8'), 'C9131FD8');
});

test('CONTROL: it truncates AND uppercases — neither alone would pass', () => {
  // A non-truncating implementation returns the whole id; a non-uppercasing one
  // returns lowercase. Both are caught here rather than by inspection.
  const out = refNo(REAL_ID);
  assert.equal(out.length, 8, 'truncated');
  assert.equal(out, out.toUpperCase(), 'uppercased');
  assert.notEqual(out, REAL_ID.slice(-8), 'and the raw slice is lowercase, so this differs');
});

test('a short input is returned whole, not padded or truncated to nothing', () => {
  assert.equal(refNo('abc'), 'ABC');
  assert.equal(refNo('12345678'), '12345678');
});

test('empty, null and undefined give an empty string — never "NDEFINED"', () => {
  // generateMetadata reaches this with a missing route param. The original
  // one-liner rendered a page titled "ใบสมัคร NDEFINED" — not even the whole
  // word, because slice(-8) eats the leading "u". This is the one behaviour the
  // extraction deliberately changes.
  assert.equal(refNo(undefined), '');
  assert.equal(refNo(null), '');
  assert.equal(refNo(''), '');
});

test('CONTROL: the naive expression really did produce that, and it is worse than expected', () => {
  // Proves the guard above defends against a real outcome, not a hypothetical
  // one — and pins the exact string, because "UNDEFINED" is the plausible guess
  // and it is wrong: slice(-8) takes the last eight of nine characters.
  assert.equal(String(undefined).slice(-8).toUpperCase(), 'NDEFINED');
  assert.equal(String(null).slice(-8).toUpperCase(), 'NULL');
});

test('a number id is coerced, like the original did', () => {
  assert.equal(refNo(123456789), '23456789');
});

// ── ObjectId detection ─────────────────────────────────────────────

test('isObjectIdLike accepts a 24-hex string and nothing else', () => {
  assert.equal(isObjectIdLike(REAL_ID), true);
  assert.equal(isObjectIdLike(REAL_ID.toUpperCase()), true, 'case-insensitive');
  for (const bad of ['COPILOT-STU', 'schedule_pdf', 'roles', '', REAL_ID.slice(0, 23), `${REAL_ID}0`, null, 42]) {
    assert.equal(isObjectIdLike(bad), false, `${JSON.stringify(bad)} is not an ObjectId`);
  }
});

// ── displayRecordId — the polymorphic one ──────────────────────────

test('displayRecordId shortens an ObjectId', () => {
  assert.equal(displayRecordId(REAL_ID), 'ED4C3439');
});

test('displayRecordId leaves a human-readable recordId ALONE', () => {
  // The whole reason this is not just refNo(). `recordId` is polymorphic by
  // design: a course_id CODE, a role key, a stable literal. Blind truncation
  // turns COPILOT-STU into ILOT-STU — a value that matches nothing and reads
  // as a typo.
  for (const id of ['COPILOT-STU', 'schedule_pdf', 'about-config', 'registration_admin']) {
    assert.equal(displayRecordId(id), id, `${id} must survive untouched`);
  }
});

test('CONTROL: refNo WOULD have mangled those, which is why the two differ', () => {
  // Pairs with the test above. If displayRecordId were an alias for refNo, this
  // is the damage it would do.
  assert.equal(refNo('COPILOT-STU'), 'ILOT-STU');
  assert.notEqual(displayRecordId('COPILOT-STU'), refNo('COPILOT-STU'));
});

test('displayRecordId handles the empty cases without inventing text', () => {
  assert.equal(displayRecordId(null), '');
  assert.equal(displayRecordId(undefined), '');
  assert.equal(displayRecordId(''), '');
});
