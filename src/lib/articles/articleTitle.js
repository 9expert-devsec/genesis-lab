/**
 * The article page's `<title>`, aware of the brand the root layout appends.
 *
 * The root layout's `title.template` is `%s | ${siteConfig.name}`
 * (` | 9Expert Training`) and applies to every child that returns a plain
 * string. Article detail pages carry a SHORTER brand, ` | 9Expert`, the same
 * form the approved meta titles use (SEO-META R2c). The template is not changed
 * for this, because every other page keeps ` | 9Expert Training`. So an article
 * ALWAYS returns `{ absolute }`: a plain string would get the template's
 * suffix on top of, or in place of, the article's own.
 *
 * So:
 *   · base already names 9Expert (any case)           → absolute, no suffix
 *   · base + ARTICLE_TITLE_SUFFIX longer than 65 chars → absolute, no suffix
 *   · otherwise                                       → absolute, base + ARTICLE_TITLE_SUFFIX
 *
 * Editors very often put the brand in `seoTitle` themselves (that used to ship
 * `… | 9Expert | 9Expert Training`). And a long title plus the suffix is cut
 * by the SERP somewhere in the brand anyway, which spends the visible
 * characters on a half-word. So both of those keep the bare base.
 *
 * `base` alone is what Open Graph / Twitter carry: a share card already shows
 * the site name separately, and the template never applied to them.
 *
 * This no longer delegates to lib/seo/brandAwareTitle. That helper stays the
 * rule for courses, programs and skills, which still render ` | 9Expert
 * Training` through the template. Only the 65 cap is shared.
 *
 * PURE. Changes nothing stored: seoTitle values are not edited by this.
 */

import { TITLE_MAX_WITH_SUFFIX } from '@/lib/seo/brandAwareTitle';

export { TITLE_MAX_WITH_SUFFIX };

/**
 * The brand an article detail page's `<title>` ends in. Deliberately NOT the
 * root template's ` | ${siteConfig.name}` (` | 9Expert Training`): the
 * article pages alone take the shorter brand. It is applied here as part of
 * an `{ absolute }` title, never through the template.
 */
export const ARTICLE_TITLE_SUFFIX = ' | 9Expert';

const BRAND_RE = /9expert/i;

/**
 * @param {{ seoTitle?: string, title?: string }} article
 * @returns {{ base: string, title: { absolute: string } }}
 *   `title` goes to metadata.title; `base` to openGraph/twitter titles.
 */
export function articleMetaTitle(article) {
  const base = String(article?.seoTitle || article?.title || '');
  if (BRAND_RE.test(base)) return { base, title: { absolute: base } };
  if (base.length + ARTICLE_TITLE_SUFFIX.length > TITLE_MAX_WITH_SUFFIX) {
    return { base, title: { absolute: base } };
  }
  return { base, title: { absolute: `${base}${ARTICLE_TITLE_SUFFIX}` } };
}
