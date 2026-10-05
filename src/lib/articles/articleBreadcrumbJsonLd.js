/**
 * Schema.org `BreadcrumbList` for one article page:
 *   หน้าแรก (site root) → บทความ (/articles) → the article.
 *
 * Same `ListItem` shape as the trails already emitted by lib/seo/
 * infoPageJsonLd, courseListJsonLd, masterclassListJsonLd and scheduleJsonLd
 * (position / name / item, absolute URLs). None of those export a builder —
 * each inlines its trail inside an `@graph` — so this reuses their LABELS
 * rather than re-spelling them, and their shape rather than their code.
 *
 * ── WHY NOT INSIDE buildJsonLd ─────────────────────────────────────────────
 * buildJsonLd returns null for a disabled / raw-override / draft article, and
 * the trail must not depend on any of that: it describes where the page sits
 * in the site, not the article's content. It is also imported by the admin
 * ArticleForm on the client, and this module pulls the home label from
 * lib/seo/infoPageJsonLd, which the admin bundle has no reason to carry.
 *
 * ── ORIGIN ─────────────────────────────────────────────────────────────────
 * SITE_URL, through articleCanonicalUrl, exactly as buildJsonLd does, so the
 * last crumb and the Article's `url` / `mainEntityOfPage` are byte-identical.
 *
 * PURE: no I/O, no env reads beyond SITE_URL's module constant.
 */

import { articleCanonicalUrl } from '@/lib/articles/articleUrl';
import { ARTICLE_LIST_NAME } from '@/lib/articles/buildListJsonLd';
import { HOME_BREADCRUMB_LABEL } from '@/lib/seo/infoPageJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';

/**
 * @param {{ slug: string, title?: string }} article
 * @param {string} [siteUrl] origin without a trailing slash; tests pass one
 * @returns {object|null} null when there is no slug to name
 */
export function buildArticleBreadcrumbJsonLd(article, siteUrl = SITE_URL) {
  if (!article?.slug) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: HOME_BREADCRUMB_LABEL,
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: ARTICLE_LIST_NAME,
        item: `${siteUrl}/articles`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.title,
        item: articleCanonicalUrl(article.slug, siteUrl),
      },
    ],
  };
}
