import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleMetaTitle,
  ARTICLE_TITLE_SUFFIX,
  TITLE_MAX_WITH_SUFFIX,
} from '@/lib/articles/articleTitle';
import { TITLE_BRAND_SUFFIX } from '@/lib/seo/brandAwareTitle';

/**
 * The article page's brand-aware <title>. The root template appends
 * ` | 9Expert Training` to any plain-string title; article detail pages carry
 * ` | 9Expert` instead (SEO-META R2c), so the helper must ALWAYS hand Next an
 * `{ absolute }` title. A plain string would let the template add its brand.
 */

test('article suffix is ` | 9Expert`, not the template suffix; 65 the threshold', () => {
  assert.equal(ARTICLE_TITLE_SUFFIX, ' | 9Expert');
  assert.equal(TITLE_BRAND_SUFFIX, ' | 9Expert Training', 'courses / programs / skills keep the template brand');
  assert.equal(TITLE_MAX_WITH_SUFFIX, 65);
});

test('base already names the brand (any case) → absolute, untouched', () => {
  for (const seoTitle of ['สอน Excel | 9Expert', 'คอร์ส AI โดย 9EXPERT', '9expert สอน Power BI']) {
    assert.deepEqual(articleMetaTitle({ seoTitle, title: 'x' }), {
      base: seoTitle,
      title: { absolute: seoTitle },
    });
  }
});

test('base + ` | 9Expert` past 65 characters → absolute bare base', () => {
  // 56 + 10 = 66 → over; 55 + 10 = 65 → still gets the suffix (boundary).
  const over = 'a'.repeat(56);
  const at = 'a'.repeat(55);
  assert.deepEqual(articleMetaTitle({ title: over }), { base: over, title: { absolute: over } });
  assert.deepEqual(articleMetaTitle({ title: at }), { base: at, title: { absolute: `${at} | 9Expert` } });
});

test('short, unbranded → absolute `… | 9Expert`, never a plain string', () => {
  const m = articleMetaTitle({ title: 'สูตร Excel ที่ใช้บ่อย' });
  assert.deepEqual(m, {
    base: 'สูตร Excel ที่ใช้บ่อย',
    title: { absolute: 'สูตร Excel ที่ใช้บ่อย | 9Expert' },
  });
  assert.notEqual(typeof m.title, 'string', 'a plain string would get the template\'s second brand');
});

test('every branch returns { absolute }', () => {
  for (const t of ['x', 'a'.repeat(55), 'a'.repeat(56), 'x | 9Expert', 'ไทย']) {
    assert.equal(typeof articleMetaTitle({ title: t }).title.absolute, 'string', t);
  }
});

test('seoTitle wins over title; empty seoTitle falls back to title', () => {
  assert.equal(articleMetaTitle({ seoTitle: 'SEO', title: 'T' }).base, 'SEO');
  assert.equal(articleMetaTitle({ seoTitle: '', title: 'T' }).base, 'T');
});
