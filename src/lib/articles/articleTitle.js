/**
 * The article page's `<title>`, aware of the brand the root layout appends.
 *
 * The root layout's `title.template` is `%s | ${siteConfig.name}` and applies
 * to every child that returns a plain string. Editors very often put the brand
 * in `seoTitle` themselves, so the page shipped `… | 9Expert | 9Expert
 * Training`. And a long title plus the suffix is cut by the SERP somewhere in
 * the brand anyway, which spends the visible characters on a half-word.
 *
 * So:
 *   · base already names 9Expert (any case)   → absolute, no suffix
 *   · base + suffix longer than 65 characters → absolute, no suffix
 *   · otherwise                               → plain string; template appends
 *
 * `base` alone is what Open Graph / Twitter carry: a share card already shows
 * the site name separately, and the template never applied to them.
 *
 * The suffix is restated from the template's FORM with the template's INPUT
 * (siteConfig.name) — layout.jsx cannot be imported here (fonts, app shell).
 * Same arrangement as lib/seo/infoPageJsonLd's renderedTitle.
 *
 * The rule itself now lives in lib/seo/brandAwareTitle, shared with courses,
 * programs and skills; this only picks the article's base. The constants are
 * re-exported so existing importers keep working.
 *
 * PURE. Changes nothing stored: seoTitle values are not edited by this.
 */

import { brandAwareTitle, TITLE_BRAND_SUFFIX, TITLE_MAX_WITH_SUFFIX } from '@/lib/seo/brandAwareTitle';

export { TITLE_BRAND_SUFFIX, TITLE_MAX_WITH_SUFFIX };

/**
 * @param {{ seoTitle?: string, title?: string }} article
 * @returns {{ base: string, title: string | { absolute: string } }}
 *   `title` goes to metadata.title; `base` to openGraph/twitter titles.
 */
export function articleMetaTitle(article) {
  return brandAwareTitle(article?.seoTitle || article?.title || '');
}
