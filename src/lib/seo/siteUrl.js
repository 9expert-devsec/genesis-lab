/**
 * THE site origin. One spelling, for every `@id`, `url` and canonical that has
 * to name this site.
 *
 * ── WHY THIS IS A MODULE AND NOT A LITERAL ─────────────────────────────────
 * Structured data addresses entities by `@id`, and an `@id` is only an identity
 * if it is byte-identical everywhere it appears. Two spellings of the host do
 * not describe one organisation twice — they describe two organisations, and
 * every cross-page reference (`publisher`, `isPartOf`, `about`, `location`)
 * stops resolving. That is the same argument, and the same failure, as
 * lib/articles/articleUrl.js and lib/seo/metaDescription.js.
 *
 * www ONLY. A non-www spelling is a different origin to a crawler.
 *
 * ── WHY IT DERIVES FROM siteConfig.url RATHER THAN RESTATING THE HOST ───────
 * The rule this constant exists to serve is that a page's JSON-LD `url` equals
 * that page's `<link rel="canonical">` CHARACTER FOR CHARACTER. Home's canonical
 * is `alternates.canonical: siteConfig.url` (app/page.jsx), so the only value
 * that satisfies the rule in EVERY environment is that same value — not a second
 * expression that happens to agree with it in production.
 *
 * Writing `'https://www.9experttraining.com'` here instead would hold in
 * production and break everywhere else: with NEXT_PUBLIC_SITE_URL pointing at
 * localhost (as .env.local does), the canonical tag would say localhost and the
 * graph would say the live host — the exact mismatch this module is meant to
 * make impossible. Measured on a production build 2026-09-09: the emitted tag is
 * `https://www.9experttraining.com`, with NO trailing slash, so callers append
 * their own path separator and MUST NOT assume one is present.
 *
 * In production the env var is the live host and this resolves to
 * `https://www.9experttraining.com`.
 *
 * ── KNOWN FUTURE CONSUMERS — NOT MIGRATED YET, AND NOT INTENTIONAL ──────────
 * Two live spellings of this origin are NON-WWW. Neither is a deliberate choice;
 * both predate this module and both are scheduled to be absorbed by it. They are
 * named here so the next reader does not mistake them for a decision:
 *
 *   · lib/customPages/buildPageJsonLd.js:17  `siteUrl = 'https://9experttraining.com'`
 *   · app/admin/pages/_components/CustomPageForm.jsx:97  `const SITE_URL = 'https://9experttraining.com'`
 *
 * The second already holds the name `SITE_URL` in the admin bundle. It is the
 * interloper; this module keeps the name and that one is absorbed later.
 *
 * DELIBERATELY OUT OF SCOPE for the round that introduced this: app/sitemap.js,
 * articles/[slug]/_components/ArticleDetailClient.jsx and lib/articles/buildJsonLd.js
 * are NOT migrated. The latter two resolve to `https://genesis-lab.9expert.app`,
 * a staging host — a production build publishes article canonicals on the live
 * domain while their JSON-LD names staging. Recorded, not fixed: cutting the whole
 * site over at once is a blast radius, and this module's first consumer is Home.
 */

import { siteConfig } from '@/config/site';

/** The site origin, without a trailing slash. */
export const SITE_URL = siteConfig.url;
