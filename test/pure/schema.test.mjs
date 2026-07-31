import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionSchema, pageBuilderSchema } from '@/lib/schemas/pageBuilder';

const parses = (type, content) => {
  try { sectionSchema.parse({ id: 'x', type, content }); return true; } catch { return false; }
};

// ── Promotion mode Phase 1 — page-schema parity with the model ───────────────
const basePage = { slug: 'promo-x', title: 'Promo X', pageType: 'promotion' };
test('page schema round-trips promotionOrder + promotionCover', () => {
  const out = pageBuilderSchema.parse({ ...basePage, promotionOrder: 3, promotionCover: 'https://cdn/x.jpg' });
  assert.equal(out.promotionOrder, 3);
  assert.equal(out.promotionCover, 'https://cdn/x.jpg');
});
test('page schema defaults the two promotion fields (order 0, cover empty)', () => {
  const out = pageBuilderSchema.parse(basePage);
  assert.equal(out.promotionOrder, 0);
  assert.equal(out.promotionCover, '');
});
// CONTROL: a wrong type for promotionOrder must fail validation (proves the
// number rule is real, not incidental).
test('control: a string promotionOrder fails validation', () => {
  assert.throws(() => pageBuilderSchema.parse({ ...basePage, promotionOrder: 'first' }));
});

test('embed rejects provider="script" (dropped in 2C)', () => {
  assert.equal(parses('embed', { provider: 'script', url: '' }), false);
});
test('embed accepts provider="youtube"', () => {
  assert.equal(parses('embed', { provider: 'youtube', url: '' }), true);
});
test('course_list accepts source="manual" (2C.2a)', () => {
  assert.equal(parses('course_list', { source: 'manual', courseIds: ['A'] }), true);
});
// 2C.2b widened the enum: the derived sources are now honoured (rendered +
// labelled), so they must validate. These flipped from the 2C.2a narrowing
// guards — the enum opens ONLY because the render + label landed in the same pass.
test('course_list accepts source="skill" with a filter (2C.2b)', () => {
  assert.equal(parses('course_list', { source: 'skill', filter: 'x' }), true);
});
test('course_list accepts source="program" with a filter (2C.2b)', () => {
  assert.equal(parses('course_list', { source: 'program', filter: 'p' }), true);
});
test('course_list still rejects an unhonoured source (enum is closed)', () => {
  assert.equal(parses('course_list', { source: 'category' }), false);
});
test('course_schedule accepts courseId + limit (2C.2b)', () => {
  assert.equal(parses('course_schedule', { courseId: 'MSE-AI', limit: 3 }), true);
});
