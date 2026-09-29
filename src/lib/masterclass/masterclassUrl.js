/**
 * The canonical public URL of one Masterclass — one implementation, for every
 * surface that has to name it.
 *
 * ══ WHY THIS EXISTS: THREE ORIGINS IN ONE GRAPH ═════════════════════════════
 * Before this module, the detail page and its own structured data disagreed about
 * what host a masterclass lives on, and the graph disagreed with itself:
 *
 *   · `alternates.canonical` said `${siteConfig.url}/masterclass/<slug>` — www,
 *     built inline in the page and importable by nothing;
 *   · `lib/masterclass/generateJsonLd` built every `@id` and every registration
 *     URL from a hardcoded `BASE_URL = 'https://masterclass.9experttraining.com'`;
 *   · its `provider.url` was a third spelling, the www literal.
 *
 * So one page declared www canonical while its machine-readable description
 * named a different host, on every masterclass, and neither side could be changed
 * without someone noticing the other. That is the same failure, and the same
 * argument, as lib/articles/articleUrl.js and lib/seo/siteUrl.js.
 *
 * ── WHY www WINS, AND WHY THAT WAS NOT OBVIOUS FROM THE REPO ────────────────
 * The subdomain used to serve these pages itself, and next.config.mjs still
 * carried a warning saying so — which is why this was ruled rather than assumed.
 * Since the 2026-09-08 cutover, `masterclass.9experttraining.com` is configured
 * at the Vercel domain level as a 308 to www preserving the path. Verified
 * 2026-09-29:
 *
 *     curl -sI https://masterclass.9experttraining.com/masterclass/mas-ai-dmc
 *       → HTTP/1.1 308 Permanent Redirect
 *         Location: https://www.9experttraining.com/masterclass/mas-ai-dmc
 *         Server: Vercel
 *
 * The subdomain is therefore not an origin any more, it is a forwarder, and the
 * canonical tag was already right. Ruled by Pirasak S. on 2026-09-29.
 *
 * PURE: no I/O, no database, no env, no React — so the page's metadata, the
 * detail graph and the listing graph can all call it.
 */

import { SITE_URL } from '@/lib/seo/siteUrl';

/**
 * A masterclass's canonical URL.
 *
 * ── THE SLUG IS NOT PERCENT-ENCODED ─────────────────────────────────────────
 * Same decision, for the same reason, as articleCanonicalUrl: the value emitted
 * has to be byte-identical to what the page's `<link rel="canonical">` carries,
 * and that tag is built from this function. Encoding here would change every
 * existing URL. Masterclass slugs are ASCII today (`mas-ai-dmc`), so this is a
 * statement of intent rather than a live concern.
 *
 * The base is trimmed of trailing slashes so `${base}/masterclass/...` cannot
 * produce a double slash — the defect this repo has shipped three times
 * elsewhere (the mega menu, the Course JSON-LD, a BreadcrumbList).
 *
 * @param {string} slug the masterclass's `slug` field, as stored
 * @param {string} [siteUrl] origin without a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test, which is what
 *   proves the URL is composed rather than restated.
 * @returns {string}
 */
export function masterclassCanonicalUrl(slug, siteUrl = SITE_URL) {
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  return `${base}/masterclass/${slug}`;
}

/**
 * The `@id` of a masterclass's `Course` node.
 *
 * ── WHY THE `#course` FRAGMENT IS KEPT ──────────────────────────────────────
 * The shape `<canonical>#course` is what the detail graph has always emitted, and
 * it is retained deliberately: only the ORIGIN was wrong. Changing the fragment
 * too would retire every `@id` a crawler has already seen for a reason unrelated
 * to the defect being fixed.
 *
 * It is a function rather than a convention each caller applies, because the
 * listing's ItemList must name the SAME entity as the detail page's Course. Two
 * places appending `#course` is two places to get it wrong; this is one.
 *
 * @param {string} slug
 * @param {string} [siteUrl]
 * @returns {string}
 */
export function masterclassCourseId(slug, siteUrl = SITE_URL) {
  return `${masterclassCanonicalUrl(slug, siteUrl)}#course`;
}
