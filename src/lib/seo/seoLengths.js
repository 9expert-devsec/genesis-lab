/**
 * SEO field lengths as the admin form shows them — WARNINGS, not limits.
 *
 * The owner's ruling (SEO-1): the SEO Title and SEO Description are never cut
 * while typing. Past the guideline the counter turns amber with a hint, and the
 * value still saves. The schema keeps only a sanity cap far above the guideline
 * (seoTitle 120, seoDescription 320; lib/schemas/article.js).
 *
 * COUNTED IN GRAPHEMES. Thai vowels and tone marks are separate UTF-16 units
 * but not separate characters, so `.length` overstates every Thai string and
 * would put the counter in amber long before the text is actually long.
 *
 * The public page is unaffected by any of this: the <meta> description is
 * built by lib/seo/metaDescription.js, which truncates at render whatever is
 * stored.
 *
 * PURE: no React, no DB.
 */

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** User-perceived character count. */
export function graphemeLength(value) {
  let n = 0;
  for (const _ of segmenter.segment(String(value ?? ''))) n += 1;
  return n;
}

export const SEO_TITLE_GUIDE = 60;
export const SEO_DESCRIPTION_GUIDE = 160;

export const SEO_TITLE_OVER_HINT = 'เกิน 60 ตัวอักษร Google อาจตัดชื่อในผลค้นหา — บันทึกได้';
export const SEO_DESCRIPTION_OVER_HINT = 'เกิน 160 ตัวอักษร Google อาจตัดคำอธิบาย — บันทึกได้';

/**
 * Counter state for one field.
 * @returns {{ length: number, guide: number, over: boolean }}
 */
export function seoLengthState(value, guide) {
  const length = graphemeLength(value);
  return { length, guide, over: length > guide };
}
