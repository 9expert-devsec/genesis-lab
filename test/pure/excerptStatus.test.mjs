import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  excerptStatus,
  fieldFromActionError,
  EXCERPT_WARN_AT,
  EXCERPT_BLOCK_AT,
} from '@/lib/articles/excerptStatus';
import { ARTICLE_EXCERPT_MAX } from '@/lib/schemas/article';
import { META_DESCRIPTION_MAX } from '@/lib/seo/metaDescription';

/**
 * The excerpt field's live state, and where a server rejection belongs.
 *
 * These exist as a module rather than as JSX conditions because the rule IS the
 * change — warn where something is truncated, block only where the server
 * rejects — and a rule written into a client component cannot be tested here:
 * the render tier uses renderToStaticMarkup, has no interaction, and cannot
 * type 1,200 characters into a textarea and read the result back.
 */

const at = (n) => 'ก'.repeat(n);

// ── the thresholds come from their owners ───────────────────────────────────

test('the block threshold IS the schema cap, not a copy of it', () => {
  // The form must never refuse text the server would accept. A second literal
  // is a second number to forget, and the failure is silent in the direction
  // that matters: a form stuck at the old value blocks work that would save.
  assert.equal(EXCERPT_BLOCK_AT, ARTICLE_EXCERPT_MAX);
});

test('the warn threshold IS the meta-description limit', () => {
  assert.equal(EXCERPT_WARN_AT, META_DESCRIPTION_MAX);
});

// ── block ───────────────────────────────────────────────────────────────────

test('exactly at the cap is allowed — the server accepts it', () => {
  const s = excerptStatus(at(EXCERPT_BLOCK_AT), { seoDescription: 'x' });
  assert.equal(s.blocked, false);
  assert.equal(s.level, 'ok');
  assert.equal(s.length, EXCERPT_BLOCK_AT);
});

test('one over the cap blocks, and says by how many', () => {
  const s = excerptStatus(at(EXCERPT_BLOCK_AT + 1), { seoDescription: 'x' });
  assert.equal(s.blocked, true);
  assert.equal(s.level, 'block');
  assert.equal(s.over, 1);
  assert.match(s.message, /1 ตัวอักษร/, 'the count over is the actionable part');
});

test('the over-count is the real distance, not a flag', () => {
  // "too long" leaves the admin to count. This is the number they act on.
  const s = excerptStatus(at(EXCERPT_BLOCK_AT + 340), { seoDescription: 'x' });
  assert.equal(s.over, 340);
  assert.match(s.message, /340/);
});

test('blocking measures the TRIMMED length, matching the schema', () => {
  /**
   * articleSchema is `.trim().max(N)` — trim runs first. Counting untrimmed
   * would block a save the server accepts, over whitespace the admin cannot
   * see, which is the most infuriating possible version of this bug.
   */
  const padded = `\n\n   ${at(EXCERPT_BLOCK_AT)}   \n`;
  assert.ok(padded.length > EXCERPT_BLOCK_AT);
  const s = excerptStatus(padded, { seoDescription: 'x' });
  assert.equal(s.blocked, false);
  assert.equal(s.length, EXCERPT_BLOCK_AT);
});

// ── warn ────────────────────────────────────────────────────────────────────

test('over the meta limit with an EMPTY seoDescription warns, and does not block', () => {
  const s = excerptStatus(at(EXCERPT_WARN_AT + 1), { seoDescription: '' });
  assert.equal(s.level, 'warn');
  assert.equal(s.blocked, false, 'a warning must never gate the save');
  assert.match(s.message, /meta description/);
});

test('the same length with seoDescription FILLED says nothing', () => {
  /**
   * The conditional half of the rule, and the reason it is conditional: the
   * median stored excerpt is 186 characters, so an unconditional 160 warning
   * fires on most articles, and a warning that is usually on is a warning
   * nobody reads. It is only TRUE when the excerpt is what becomes the meta
   * description, which is only when this sibling field is empty.
   */
  const s = excerptStatus(at(EXCERPT_WARN_AT + 1), { seoDescription: 'มีคำอธิบาย SEO แล้ว' });
  assert.equal(s.level, 'ok');
  assert.equal(s.message, null);
});

test('a whitespace-only seoDescription counts as empty', () => {
  const s = excerptStatus(at(EXCERPT_WARN_AT + 1), { seoDescription: '   \n ' });
  assert.equal(s.level, 'warn', 'spaces in the SEO field do not make a description');
});

test('exactly at the meta limit does not warn — the boundary is inclusive', () => {
  assert.equal(excerptStatus(at(EXCERPT_WARN_AT), { seoDescription: '' }).level, 'ok');
});

test('block outranks warn when both apply', () => {
  // Over the cap AND no SEO description. The blocking message is the one that
  // stops the save, so it is the one shown.
  const s = excerptStatus(at(EXCERPT_BLOCK_AT + 10), { seoDescription: '' });
  assert.equal(s.level, 'block');
  assert.match(s.message, /10 ตัวอักษร/);
});

// ── the ordinary cases ──────────────────────────────────────────────────────

test('empty and short excerpts are silent', () => {
  for (const v of ['', '   ', undefined, null, at(20), at(EXCERPT_WARN_AT)]) {
    const s = excerptStatus(v, { seoDescription: '' });
    assert.equal(s.level, 'ok', `${JSON.stringify(String(v).slice(0, 12))} should be silent`);
    assert.equal(s.message, null);
  }
});

test('the options argument is optional', () => {
  // Called with one argument the sibling is unknown, so the safe reading is
  // "not filled" — warn rather than stay quiet about a real truncation.
  assert.equal(excerptStatus(at(EXCERPT_WARN_AT + 1)).level, 'warn');
  assert.equal(excerptStatus(at(10)).level, 'ok');
});

// ── routing a server rejection to its field ─────────────────────────────────

test('a zod rejection is split into the field and the message', () => {
  // firstZodMessage formats every rejection as `${path}: ${message}`.
  const { field, message } = fieldFromActionError(
    'excerpt: String must contain at most 2000 character(s)'
  );
  assert.equal(field, 'excerpt');
  assert.equal(message, 'String must contain at most 2000 character(s)');
});

test('a nested zod path is kept whole', () => {
  const { field } = fieldFromActionError('jsonLd.overrides.headline: Required');
  assert.equal(field, 'jsonLd.overrides.headline');
});

test('a message that names no field stays unattributed', () => {
  /**
   * The important half. Guessing a field for these would draw a red message on
   * something that is not wrong — so they return `field: null` and the caller
   * keeps them in the banner.
   */
  for (const msg of ['ไม่พบบทความ', 'บันทึกไม่สำเร็จ', 'Network request failed']) {
    assert.equal(fieldFromActionError(msg).field, null, msg);
    assert.equal(fieldFromActionError(msg).message, msg, 'the text must survive intact');
  }
});

test('a colon inside a message does not fake a field name', () => {
  // The pattern requires an ASCII identifier at the START, not a colon anywhere.
  assert.equal(fieldFromActionError('เวลา 10:30 ไม่ถูกต้อง').field, null);
  assert.equal(fieldFromActionError('ดูที่ https://example.com/x').field, null);
});

test('empty input is empty, not a phantom field', () => {
  assert.deepEqual(fieldFromActionError(''), { field: null, message: '' });
  assert.deepEqual(fieldFromActionError(null), { field: null, message: '' });
});
