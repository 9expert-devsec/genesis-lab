/**
 * The canonical public URL of one article — one implementation, for every
 * surface that has to name it.
 *
 * ── WHY THIS IS ITS OWN MODULE FOR THREE LINES ──────────────────────────────
 * Two JSON-LD blocks now name the same article: the `Article` on
 * /articles/[slug] (buildJsonLd.js) and the `ItemList` on /articles
 * (buildListJsonLd.js). A crawler that reads both and gets two spellings of the
 * same page does not see one page described twice — it sees two pages, and the
 * ItemList's entries stop resolving to the detail documents they are supposed
 * to point at. The two URLs are therefore not "similar code", they are one
 * value that must be byte-identical, which is what a shared helper is for. It
 * is the same argument, and the same failure, as lib/seo/metaDescription.js.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CHANGE ──────────────────────────────────
 * The expression is EXACTLY what buildJsonLd.js already emitted, including two
 * things worth naming rather than quietly fixing while moving it:
 *
 *   · THE ORIGIN IS NOT `NEXT_PUBLIC_SITE_URL`. The article page's
 *     `alternates.canonical` and `openGraph.url` are built from that variable,
 *     so on any deployment where it is not this literal, the page's canonical
 *     tag and the page's own JSON-LD `url` already disagree — today, before
 *     this module existed. Aligning them changes what is emitted on the live
 *     site for every published article, which is a decision about canonical
 *     URLs and not a side effect of extracting a helper. Recorded, not taken.
 *
 *   · THE SLUG IS NOT PERCENT-ENCODED. Slugs here are Thai, so the result is an
 *     IRI rather than an ASCII URI. That is valid in JSON-LD and is what the
 *     detail page has emitted all along; encoding it here would change every
 *     existing article's structured-data URL in the same undiscussed way.
 *
 * Both are stated here so the next reader finds the reasoning at the value
 * rather than having to reconstruct it from two call sites.
 */

/** The origin buildJsonLd has always defaulted to. Kept as its own export so
 *  the two builders cannot drift onto different defaults. */
export const ARTICLE_SITE_URL = 'https://genesis-lab.9expert.app';

/**
 * @param {string} slug the article's `slug` field, as stored
 * @param {string} [siteUrl] origin without a trailing slash
 * @returns {string}
 */
export function articleCanonicalUrl(slug, siteUrl = ARTICLE_SITE_URL) {
  return `${siteUrl}/articles/${slug}`;
}
