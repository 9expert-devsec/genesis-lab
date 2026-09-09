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
 * ── THE ORIGIN: A DECISION THIS MODULE DEFERRED, AND WHO TOOK IT ────────────
 * This module used to default to the literal `https://genesis-lab.9expert.app`
 * and said so under the heading "what this deliberately does not change". The
 * reasoning is kept here rather than deleted, because it was right and it is
 * why the value survived as long as it did:
 *
 *     THE ORIGIN IS NOT `NEXT_PUBLIC_SITE_URL`. The article page's
 *     `alternates.canonical` and `openGraph.url` are built from that variable,
 *     so on any deployment where it is not this literal, the page's canonical
 *     tag and the page's own JSON-LD `url` already disagree. Aligning them
 *     changes what is emitted on the live site for every published article,
 *     which is a decision about canonical URLs and not a side effect of
 *     extracting a helper. Recorded, not taken.
 *
 * That was a deferral to someone with the authority to decide, not a technical
 * constraint. TAKEN BY Pirasak S. ON 2026-09-09, round ORIGIN-1: the origin is
 * now `lib/seo/siteUrl`'s SITE_URL, the site's one origin, so the canonical tag
 * and the JSON-LD agree on every deployment instead of only on the one where
 * the env happened to match.
 *
 * What the deferral was protecting against had already happened. After the
 * cutover, production served `<link rel="canonical">` on www.9experttraining.com
 * while this file's JSON-LD named the preview host — measured on /articles (78
 * occurrences) and on an article detail page (9) on 2026-09-09. The `logo.png`
 * that `publisher.logo` pointed at was being fetched from the preview host and
 * 404ing there as recently as that morning.
 *
 * ── WHAT THIS STILL DELIBERATELY DOES NOT CHANGE ────────────────────────────
 *   · THE SLUG IS NOT PERCENT-ENCODED. Slugs here are Thai, so the result is an
 *     IRI rather than an ASCII URI. That is valid in JSON-LD and is what the
 *     detail page has emitted all along; encoding it here would change every
 *     existing article's structured-data URL in the same undiscussed way.
 *
 * Stated here so the next reader finds the reasoning at the value rather than
 * having to reconstruct it from two call sites.
 */

import { SITE_URL } from '@/lib/seo/siteUrl';

/**
 * @param {string} slug the article's `slug` field, as stored
 * @param {string} [siteUrl] origin without a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test, which is what
 *   proves the URL is composed rather than restated.
 * @returns {string}
 */
export function articleCanonicalUrl(slug, siteUrl = SITE_URL) {
  return `${siteUrl}/articles/${slug}`;
}
