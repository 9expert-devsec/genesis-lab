/**
 * Schema.org JSON-LD builder + validator for Article documents.
 *
 * Used in two places:
 *   1. Public article detail page — server-side, the resulting object
 *      gets stringified into a <script type="application/ld+json">
 *      block so search engines pick it up.
 *   2. Admin ArticleForm preview — client-side, the same builder runs
 *      against unsaved form state so editors can review the output
 *      before committing.
 *
 * Returns `null` if the article is a draft, JSON-LD is disabled, or
 * the rawOverride flag is on with invalid JSON. Callers should treat
 * `null` as "render nothing" and lean on validateJsonLd() for the
 * human-facing status.
 */

import { toMetaDescription } from '@/lib/seo/metaDescription';

export function buildJsonLd(article, siteUrl = 'https://genesis-lab.9expert.app') {
  if (!article?.jsonLd?.enabled) return null;
  if (!article.active || !article.publishedAt) return null;

  // Raw-JSON escape hatch (superadmin) — take it as-is if it parses,
  // otherwise return null so the page omits the script tag entirely.
  if (article.jsonLd.rawOverrideEnabled && article.jsonLd.rawOverride) {
    try {
      return JSON.parse(article.jsonLd.rawOverride);
    } catch {
      return null;
    }
  }

  const ov = article.jsonLd.overrides ?? {};
  const canonicalUrl = `${siteUrl}/articles/${article.slug}`;
  const publisherName = '9Expert Training';
  const publisherLogo = `${siteUrl}/logo.png`;

  return {
    '@context': 'https://schema.org',
    '@type':    article.jsonLd.schemaType ?? 'Article',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id':   canonicalUrl,
    },
    headline:    ov.headline    || article.title,
    // Same helper as the <meta> tag, deliberately. The same sentence goes to
    // the same consumer through two channels; two truncation rules would let
    // the structured data and the meta tag disagree about what the page is
    // about. `ov.description` is uncapped in the schema, so it is truncated
    // here too — see the helper for why that is accepted.
    description: toMetaDescription(ov.description, article.excerpt),
    image:       ov.image       || article.coverUrl || '',
    author: {
      '@type': 'Person',
      name: ov.authorName || article.author || publisherName,
    },
    publisher: {
      '@type': 'Organization',
      name:    publisherName,
      logo: {
        '@type': 'ImageObject',
        url:     publisherLogo,
      },
    },
    // NO datePublished / dateModified. The owner wants the publish date
    // invisible everywhere, not only on our own pages — a date in JSON-LD is
    // rendered by Google in the search result, so leaving it here would put
    // back on the SERP exactly what was removed from the article.
    //
    // THE PRICE, recorded rather than re-argued: Google's Article structured-
    // data guidance lists datePublished as recommended, so eligibility for
    // some rich-result types may narrow. That is the owner's call and it has
    // been made.
    //
    // `publishedAt` itself is untouched — it still orders the sitemap, the
    // search results and the landing fetch, and it still gates publication.
    url: canonicalUrl,
  };
}

/**
 * Lightweight completeness check used by the admin preview. Returns
 * `{ status, message }` shaped for direct rendering as a chip.
 *
 *   valid    — every required field present
 *   warning  — 1–2 missing
 *   error    — 3+ missing (search engines will likely reject)
 *   disabled — caller passed `null` (jsonLd was off / draft / etc.)
 */
export function validateJsonLd(jsonLd) {
  if (!jsonLd) return { status: 'disabled', message: 'JSON-LD ถูกปิดใช้งาน' };
  const warnings = [];
  if (!jsonLd.headline)      warnings.push('ไม่มี headline');
  if (!jsonLd.description)   warnings.push('ไม่มี description');
  if (!jsonLd.image)         warnings.push('ไม่มี image');
  // datePublished is deliberately not emitted (see above), so it is not
  // checked here — a completeness warning for a field we removed on purpose
  // would fire on every article and train admins to ignore this chip.
  if (warnings.length > 2) return { status: 'error',   message: warnings.join(', ') };
  if (warnings.length > 0) return { status: 'warning', message: warnings.join(', ') };
  return { status: 'valid', message: 'JSON-LD ถูกต้องและครบถ้วน' };
}