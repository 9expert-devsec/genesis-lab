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
    description: ov.description || article.excerpt || '',
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
    datePublished: ov.datePublished
      || (article.publishedAt ? new Date(article.publishedAt).toISOString() : ''),
    dateModified:  ov.dateModified
      || (article.updatedAt ? new Date(article.updatedAt).toISOString() : ''),
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
  if (!jsonLd.datePublished) warnings.push('ไม่มี datePublished');
  if (warnings.length > 2) return { status: 'error',   message: warnings.join(', ') };
  if (warnings.length > 0) return { status: 'warning', message: warnings.join(', ') };
  return { status: 'valid', message: 'JSON-LD ถูกต้องและครบถ้วน' };
}