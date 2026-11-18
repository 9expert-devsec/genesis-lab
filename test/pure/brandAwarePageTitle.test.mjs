import { test } from 'node:test';
import assert from 'node:assert/strict';

import { brandAwareTitle } from '@/lib/seo/brandAwareTitle';
import { articleMetaTitle } from '@/lib/articles/articleTitle';
import { courseMetadata } from '@/lib/courses/courseMetadata';
import { catalogPageMetadata } from '@/lib/seo/catalogPageMetadata';

/**
 * Course, program and skill pages get the article page's brand-aware <title>.
 *
 * The approved SEO sheet ends every title in `| 9Expert`, and the root layout's
 * template appends ` | 9Expert Training` to any plain-string title, so without
 * this a page renders `… | 9Expert | 9Expert Training`. A branded title must
 * come back as `{ absolute }`; a short unbranded one stays a plain string so
 * the template still adds the brand. og:title carries the bare base.
 *
 * WHAT THIS CANNOT SEE: it does not render the root layout, so it never applies
 * `title.template` itself. It pins the shape handed to Next (`{ absolute }` vs
 * a string), not the final `<title>` text. The rendered tag is verified on a
 * live or local page fetch.
 */

const BRANDED = 'อบรม Excel Advanced หลักสูตรสูตรซับซ้อน | 9Expert';
const SHORT = 'Microsoft Excel Advanced';
const URL = 'https://www.9experttraining.com/excel-advanced-training-course';

test('articles diverge from the shared rule only where the template would apply', () => {
  // Branded and over-cap: both opt out of the template, identically.
  // (56 is over the cap for both: 56 + 10 = 66, 56 + 19 = 75.)
  for (const t of [BRANDED, 'คอร์ส 9EXPERT', 'x'.repeat(56)]) {
    assert.deepEqual(articleMetaTitle({ seoTitle: t, title: 'fallback' }), brandAwareTitle(t));
  }
  // Short and unbranded: courses / programs / skills hand the template a plain
  // string (→ ` | 9Expert Training`); articles bake in ` | 9Expert` (R2c).
  assert.deepEqual(brandAwareTitle(SHORT), { base: SHORT, title: SHORT });
  assert.deepEqual(articleMetaTitle({ seoTitle: SHORT }), { base: SHORT, title: { absolute: `${SHORT} | 9Expert` } });
});

test('course: a stored title ending in | 9Expert → absolute, og:title the bare base', () => {
  const m = courseMetadata({
    course: { course_name: 'Microsoft Excel Advanced', course_teaser: 'teaser' },
    extension: { metaTitle: BRANDED },
    canonicalUrl: URL,
  });
  assert.deepEqual(m.title, { absolute: BRANDED }, 'the template would add a second brand');
  assert.equal(m.openGraph.title, BRANDED);
});

test('course: a short unbranded title stays a plain string (template appends the brand)', () => {
  const m = courseMetadata({
    course: { course_name: SHORT, course_teaser: 'teaser' },
    extension: { metaTitle: '' },
    canonicalUrl: URL,
  });
  assert.equal(m.title, SHORT);
  assert.equal(m.openGraph.title, SHORT);
  assert.equal(m.description, 'teaser', 'description untouched');
  assert.equal(m.alternates.canonical, URL, 'canonical untouched');
});

for (const kind of ['program', 'skill']) {
  const pageUrl = `https://www.9experttraining.com/${kind}-all-courses`;

  test(`${kind}: a stored title ending in | 9Expert → absolute, og:title the bare base`, () => {
    const m = catalogPageMetadata({ metaTitle: ` ${BRANDED} `, name: 'Excel', description: 'd', ogImage: 'https://x/i.png', pageUrl });
    assert.deepEqual(m, {
      title: { absolute: BRANDED },
      description: 'd',
      alternates: { canonical: pageUrl },
      openGraph: { title: BRANDED, description: 'd', url: pageUrl, images: [{ url: 'https://x/i.png' }] },
    });
  });

  test(`${kind}: no stored title → the upstream name as a plain string, same object as before`, () => {
    const m = catalogPageMetadata({ metaTitle: '', name: 'หลักสูตร อบรม Data', description: '', ogImage: '', pageUrl });
    // The exact object the inline branch returned before this round.
    assert.deepEqual(m, {
      title: 'หลักสูตร อบรม Data',
      description: '',
      alternates: { canonical: pageUrl },
      openGraph: { title: 'หลักสูตร อบรม Data', description: '', url: pageUrl, images: [] },
    });
  });
}
