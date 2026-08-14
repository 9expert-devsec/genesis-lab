/**
 * Schema.org `ItemList` for the /articles LISTING.
 *
 * ── WHAT THIS IS FOR, AND WHY IT IS NOT A DUPLICATE OF buildJsonLd ──────────
 * buildJsonLd.js describes ONE article, on its own page. This describes the
 * SET a listing request returned, on the listing page. They are different
 * schema types answering different questions, and the listing had no answer at
 * all: /articles, /training-course and /schedule emitted zero JSON-LD blocks
 * (measured against the production build, 2026-08-14).
 *
 * The consumer this is aimed at is any reader that does not run the page's
 * JavaScript — a crawler, an LLM fetching the URL, a preview bot. For those,
 * a `<script type="application/ld+json">` is content in the first byte of the
 * response, independent of what the body markup does or of whether the grid
 * hydrates. That independence is the point: even if the list rendering
 * regressed to a client-only bailout tomorrow, a URL-bearing description of the
 * page would survive it.
 *
 * ── EVERY ENTRY CARRIES A URL, AND IT IS THE DETAIL PAGE'S OWN ──────────────
 * Through `articleCanonicalUrl`, the same helper buildJsonLd resolves its
 * `url` and `@id` with. An ItemList whose entries point at URLs the detail
 * pages do not claim is worse than no ItemList: it asserts a set of documents
 * that, as far as a crawler can tell, are not the ones it can already fetch.
 *
 * ── POSITION IS THE POSITION IN THE WHOLE RESULT, NOT ON THE PAGE ───────────
 * `position` is 1-based and offset by the page, so page 2 starts at 13 rather
 * than restating 1–12. Two pages both claiming positions 1–12 of the same named
 * list is a contradiction a crawler is entitled to resolve by trusting neither.
 *
 * ── WHAT IS OMITTED, DELIBERATELY ──────────────────────────────────────────
 *   · `numberOfItems` is the TOTAL across pages, not the length of this page's
 *     array, and it is only emitted when the caller supplies a total. A count
 *     that silently means "how many fitted on this page" is a wrong number
 *     dressed as a right one.
 *   · No `datePublished` on the entries. Same reason as buildJsonLd: the owner
 *     wants the publish date invisible on the SERP, and structured data is
 *     exactly where Google picks it back up. The rule would be pointless if the
 *     listing put back what the detail page withholds.
 *   · No `image` key when the article has no cover. buildJsonLd emits `''` for
 *     a missing image because its admin preview grades completeness on that
 *     field (validateJsonLd); this has no such surface, and an empty string is
 *     a claim that the image is the empty URL rather than that there isn't one.
 */

import { toMetaDescription } from '@/lib/seo/metaDescription';
import { ARTICLE_SITE_URL, articleCanonicalUrl } from '@/lib/articles/articleUrl';

/** What the page's own <h1> says, so the list is named the same thing a reader sees. */
export const ARTICLE_LIST_NAME = 'บทความ';

/**
 * @param {object[]} articles the items THIS request rendered, in render order
 * @param {object}   [opts]
 * @param {number}   [opts.page=1]     1-based page number, for `position`
 * @param {number}   [opts.pageSize]   items per page; defaults to the array length
 * @param {number}   [opts.total]      total across all pages, for `numberOfItems`
 * @param {string}   [opts.siteUrl]
 * @returns {object|null} null when there is nothing to describe
 */
export function buildListJsonLd(articles, opts = {}) {
  const items = Array.isArray(articles) ? articles.filter((a) => a?.slug) : [];
  // Nothing to describe → no script tag, the same "render nothing" contract
  // buildJsonLd's callers already follow. An ItemList with an empty
  // itemListElement is a positive assertion that the set is empty, which is not
  // what a filtered listing with no matches means to a crawler.
  if (items.length === 0) return null;

  const {
    page = 1,
    pageSize = items.length,
    total,
    siteUrl = ARTICLE_SITE_URL,
  } = opts;

  const offset = (Math.max(1, page) - 1) * pageSize;

  return {
    '@context': 'https://schema.org',
    '@type':    'ItemList',
    name:        ARTICLE_LIST_NAME,
    url:         `${siteUrl}/articles`,
    ...(Number.isFinite(total) ? { numberOfItems: total } : {}),
    itemListElement: items.map((article, i) => {
      const url = articleCanonicalUrl(article.slug, siteUrl);
      // Same helper as the meta tag and as the detail page's structured data,
      // so one article does not get two different one-line descriptions
      // depending on which page a reader found it from.
      const description = toMetaDescription(article.seoDescription, article.excerpt);
      return {
        '@type':   'ListItem',
        position:  offset + i + 1,
        url,
        item: {
          '@type':   'Article',
          '@id':     url,
          url,
          headline:  article.title,
          ...(description ? { description } : {}),
          ...(article.coverUrl ? { image: article.coverUrl } : {}),
        },
      };
    }),
  };
}
