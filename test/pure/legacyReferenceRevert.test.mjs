import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REVERT, decideRevert, firstDifference, readFieldPath, verifyReverted,
} from '../../scripts/lib/legacy-reference-revert.mjs';

// ── WHAT THIS FILE PINS ─────────────────────────────────────────────────────
//
// The revert is the thing we will reach for on the worst day: legacy server
// off, 1651 references already rewritten, something wrong. It gets exercised
// exactly once before then — in Stage A — so every branch it can take needs to
// be pinned here rather than discovered in production.
//
// The branch that matters most is CONFLICT. Between the apply and the revert
// someone may have edited that article in the admin. Their edit is newer and
// more valuable than our rollback. A revert that silently overwrites it is
// WORSE THAN NO REVERT, because it destroys work while reporting success.

const REC = {
  runId: 'run-1',
  collection: 'articles',
  documentId: 'abc',
  fieldPath: 'content',
  originalValue: '<img src="https://www.9experttraining.com/images/a.png">',
  newValue: '<img src="/images/a.png">',
};

const docWith = (value) => ({ _id: 'abc', content: value });

// ── THE HAPPY PATH ──────────────────────────────────────────────────────────

test('restores when the field still holds exactly what the run wrote', () => {
  const d = decideRevert(REC, docWith(REC.newValue));
  assert.equal(d.action, REVERT.RESTORE);
});

// ── IDEMPOTENCE ─────────────────────────────────────────────────────────────

test('a field already holding the original is a no-op, not a conflict', () => {
  // This is what a SECOND revert run sees. Reporting hundreds of conflicts
  // here would make a correct, idempotent revert look like a disaster.
  const d = decideRevert(REC, docWith(REC.originalValue));
  assert.equal(d.action, REVERT.ALREADY_REVERTED);
});

test('reverting twice changes nothing the second time', () => {
  let field = REC.newValue;
  // pass 1
  let d = decideRevert(REC, docWith(field));
  assert.equal(d.action, REVERT.RESTORE);
  field = REC.originalValue;
  // pass 2
  d = decideRevert(REC, docWith(field));
  assert.equal(d.action, REVERT.ALREADY_REVERTED);
  assert.equal(field, REC.originalValue, 'the second pass must not alter the field');
});

// ── THE BRANCH THAT PROTECTS HUMAN WORK ─────────────────────────────────────

test('CONFLICT when the field was edited after the run wrote it', () => {
  const edited = '<img src="/images/a.png"> <p>an editor added this</p>';
  const d = decideRevert(REC, docWith(edited));
  assert.equal(d.action, REVERT.CONFLICT);
  assert.match(d.reason, /refusing to clobber/);
});

test('CONFLICT even when the edit is a single character', () => {
  const d = decideRevert(REC, docWith(`${REC.newValue} `));
  assert.equal(d.action, REVERT.CONFLICT);
});

test('CONFLICT when the field is no longer a string', () => {
  const d = decideRevert(REC, { _id: 'abc', content: { blocks: [] } });
  assert.equal(d.action, REVERT.CONFLICT);
  assert.match(d.reason, /no longer a string/);
});

// ── THINGS THAT VANISHED ────────────────────────────────────────────────────

test('MISSING when the document was deleted', () => {
  assert.equal(decideRevert(REC, null).action, REVERT.MISSING);
});

test('MISSING when the field was removed, and it is NOT recreated', () => {
  const d = decideRevert(REC, { _id: 'abc' });
  assert.equal(d.action, REVERT.MISSING);
  // Recreating a field someone deleted would be inventing data.
  assert.match(d.reason, /no longer exists/);
});

// ── DOTTED FIELD PATHS ──────────────────────────────────────────────────────

test('reads a nested dotted path, including array indices', () => {
  const doc = { payload: { data: { blocks: ['zero', 'one'] } } };
  assert.deepEqual(readFieldPath(doc, 'payload.data.blocks.1'), { found: true, value: 'one' });
});

test('reports a missing nested path as not-found rather than undefined', () => {
  const doc = { payload: {} };
  assert.deepEqual(readFieldPath(doc, 'payload.data.blocks.1'), { found: false, value: undefined });
});

test('restores a nested field the same way as a top-level one', () => {
  const rec = { ...REC, fieldPath: 'promo.detail.html' };
  const doc = { _id: 'abc', promo: { detail: { html: rec.newValue } } };
  assert.equal(decideRevert(rec, doc).action, REVERT.RESTORE);
});

// ── VERIFICATION IS A SEPARATE PASS ─────────────────────────────────────────

test('verification passes only on byte-identity with the original', () => {
  assert.equal(verifyReverted(REC, docWith(REC.originalValue)).ok, true);
});

test('verification FAILS on a one-byte difference and says where', () => {
  const nearly = `${REC.originalValue.slice(0, -1)}X`;
  const v = verifyReverted(REC, docWith(nearly));
  assert.equal(v.ok, false);
  assert.equal(v.firstDifferenceAt, REC.originalValue.length - 1);
});

test('CONTROL — verification does not accept the NEW value as reverted', () => {
  // The failure this guards: a revert that ran, wrote nothing, and reported
  // success because it checked the wrong string.
  const v = verifyReverted(REC, docWith(REC.newValue));
  assert.equal(v.ok, false);
});

test('firstDifference locates the divergence, and returns -1 when identical', () => {
  assert.equal(firstDifference('abcdef', 'abcdef'), -1);
  assert.equal(firstDifference('abcdef', 'abXdef'), 2);
  assert.equal(firstDifference('abc', 'abcdef'), 3);
});
