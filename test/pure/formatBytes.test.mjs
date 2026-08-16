import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes } from '@/lib/formatBytes.mjs';

/**
 * THE RULE THAT SHIPPED TWICE AND WAS NEVER ASSERTED ONCE.
 *
 * This body existed as a module-private helper in two 'use client' components
 * (MediaClient, SchedulePDFClient), byte-identical, and in neither could a test
 * reach it — importing either drags React into a pure tier. So the thresholds
 * were unguarded in both copies, and a third call site went its own way and got
 * it wrong.
 *
 * THE DEFECT THAT PROMPTED THE EXTRACTION: the webroot history row rendered
 * `(bytes / 1024 / 1024).toFixed(1)` — every file under ~51 KB read "0.0 MB".
 * 5,812 bytes is a REAL RECORDED ROW, so it is tested at that exact value
 * rather than at a rounder number that would not have caught it.
 */

// ── The two values this extraction exists for ───────────────────────────────

test('5,812 B — a real recorded row — renders in KB, not as 0.0 MB', () => {
  /**
   * The whole point. Under the old webroot formatter this displayed "0.0 MB",
   * which reads as "no file", on a row that records a real replacement.
   */
  assert.equal(formatBytes(5812), '5.7 KB');
});

test('the 42.58 MiB catalog still reads in MB', () => {
  // 44,647,587 B — measured off the live Blob object in phase 1 M2.
  assert.equal(formatBytes(44647587), '42.58 MB');
});

// ── The thresholds, at their exact boundaries ───────────────────────────────

test('below 1 KiB renders as whole bytes, with no decimals', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1), '1 B');
  assert.equal(formatBytes(1023), '1023 B');
});

test('the B→KB boundary is 1024, and it is exclusive on the low side', () => {
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
});

test('the KB→MB boundary is 1 MiB, and it is exclusive on the low side', () => {
  assert.equal(formatBytes(1024 * 1024 - 1), '1024.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.00 MB');
});

test('KB carries one decimal, MB carries two', () => {
  // Preserved from the shipped original rather than re-designed — both existing
  // call sites render unchanged, which is what makes the extraction safe.
  assert.match(formatBytes(5812), /^\d+\.\d KB$/);
  assert.match(formatBytes(44647587), /^\d+\.\d{2} MB$/);
});

// ── Absence is not zero ─────────────────────────────────────────────────────

test('a MISSING size renders empty, and is not confused with a zero-byte file', () => {
  /**
   * Different claims. The callers render this inline beside other facts, where
   * a "0 B" for an unrecorded size would be a statement nobody made.
   */
  for (const missing of [null, undefined, '', NaN]) {
    assert.equal(formatBytes(missing), '', `${String(missing)} did not render empty`);
  }
  assert.equal(formatBytes(0), '0 B', 'a real zero-byte file must still say so');
});

test('a non-numeric value renders empty rather than "[object Object] B"', () => {
  for (const junk of [{}, [], 'abc', true]) {
    assert.equal(formatBytes(junk), '', `${JSON.stringify(junk)} leaked into the output`);
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the old webroot formula really did render 5,812 B as 0.0 MB', () => {
  /**
   * The assertion at the top is only meaningful if the thing it replaced was
   * actually wrong. This reproduces the retired expression rather than trusting
   * the commit message for it.
   */
  const old = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  assert.equal(old(5812), '0.0 MB');
  assert.notEqual(old(5812), formatBytes(5812));
  // and it was NOT wrong for the catalog, which is why it survived this long
  assert.equal(old(44647587), '42.6 MB');
});

test('CONTROL: the output varies across all three units', () => {
  const units = [formatBytes(500), formatBytes(5812), formatBytes(44647587)]
    .map((s) => s.split(' ')[1]);
  assert.deepEqual(units, ['B', 'KB', 'MB']);
});
