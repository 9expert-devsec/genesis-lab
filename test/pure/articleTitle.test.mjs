import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleMetaTitle,
  TITLE_BRAND_SUFFIX,
  TITLE_MAX_WITH_SUFFIX,
} from '@/lib/articles/articleTitle';

/**
 * The article page's brand-aware <title>. The root template appends
 * ` | 9Expert Training` to any plain-string title; these pin when the page
 * opts out of it with `{ absolute }`.
 */

test('suffix is the root template form, 65 the threshold', () => {
  assert.equal(TITLE_BRAND_SUFFIX, ' | 9Expert Training');
  assert.equal(TITLE_MAX_WITH_SUFFIX, 65);
});

test('base already names the brand (any case) → absolute, no double brand', () => {
  for (const seoTitle of ['สอน Excel | 9Expert', 'คอร์ส AI โดย 9EXPERT', '9expert สอน Power BI']) {
    assert.deepEqual(articleMetaTitle({ seoTitle, title: 'x' }), {
      base: seoTitle,
      title: { absolute: seoTitle },
    });
  }
});

test('base + suffix past 65 characters → absolute', () => {
  // 47 + 19 = 66 → over; 46 + 19 = 65 → still templated (boundary).
  const over = 'a'.repeat(47);
  const at = 'a'.repeat(46);
  assert.deepEqual(articleMetaTitle({ title: over }), { base: over, title: { absolute: over } });
  assert.deepEqual(articleMetaTitle({ title: at }), { base: at, title: at });
});

test('short, unbranded → plain string so the template appends the brand', () => {
  assert.deepEqual(articleMetaTitle({ title: 'สูตร Excel ที่ใช้บ่อย' }), {
    base: 'สูตร Excel ที่ใช้บ่อย',
    title: 'สูตร Excel ที่ใช้บ่อย',
  });
});

test('seoTitle wins over title; empty seoTitle falls back to title', () => {
  assert.equal(articleMetaTitle({ seoTitle: 'SEO', title: 'T' }).base, 'SEO');
  assert.equal(articleMetaTitle({ seoTitle: '', title: 'T' }).base, 'T');
});
