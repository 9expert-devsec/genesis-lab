/**
 * Schema.org JSON-LD builder + validator for CustomPage documents.
 *
 * Used in two places:
 *   1. Public custom-page route — server-side, the resulting object gets
 *      stringified into a <script type="application/ld+json"> block so
 *      search engines pick it up.
 *   2. Admin CustomPageForm preview — client-side, the same builder runs
 *      against unsaved form state so editors can review the output before
 *      committing.
 *
 * Returns `null` if the page is a draft, JSON-LD is disabled, or the
 * rawOverride flag is on with invalid JSON. Callers should treat `null`
 * as "render nothing" and lean on validatePageJsonLd() for the human-facing
 * status.
 */
export function buildPageJsonLd(page, siteUrl = 'https://9experttraining.com') {
  if (!page?.jsonLd?.enabled) return null;
  if (page.status !== 'published') return null;

  // Raw-JSON escape hatch (superadmin) — take it as-is if it parses,
  // otherwise return null so the page omits the script tag entirely.
  if (page.jsonLd.rawOverrideEnabled && page.jsonLd.rawOverride) {
    try {
      return JSON.parse(page.jsonLd.rawOverride);
    } catch {
      return null;
    }
  }

  const ov = page.jsonLd.overrides ?? {};
  const canonicalUrl = page.canonicalUrl || `${siteUrl}/${page.slug}`;
  const publisherName = '9Expert Training';

  const datePublished = ov.datePublished
    || (page.createdAt ? new Date(page.createdAt).toISOString() : '');
  const dateModified = ov.dateModified
    || (page.updatedAt ? new Date(page.updatedAt).toISOString() : '');

  const name        = ov.name        || page.title;
  const description  = ov.description || page.metaDescription || '';
  const image       = ov.image       || page.ogImage || '';

  const publisher = {
    '@type': 'Organization',
    name:    publisherName,
    url:     siteUrl,
  };

  const schemaType = page.jsonLd.schemaType ?? 'WebPage';

  switch (schemaType) {
    case 'FAQPage':
      // No structured FAQ data yet — a visual FAQ editor is phase 2. Emit
      // a minimal valid object with an empty mainEntity for now.
      return {
        '@context': 'https://schema.org',
        '@type':    'FAQPage',
        name,
        description,
        url: canonicalUrl,
        image,
        publisher,
        datePublished,
        dateModified,
        mainEntity: [],
      };

    case 'Article':
      return {
        '@context': 'https://schema.org',
        '@type':    'Article',
        headline:   name,
        description,
        image,
        author: {
          '@type': 'Organization',
          name:    publisherName,
        },
        publisher,
        datePublished,
        dateModified,
        url: canonicalUrl,
      };

    case 'BreadcrumbList':
      // Placeholder — real breadcrumb wiring comes with the public route.
      return {
        '@context': 'https://schema.org',
        '@type':    'BreadcrumbList',
        itemListElement: [],
      };

    case 'WebPage':
    default:
      return {
        '@context': 'https://schema.org',
        '@type':    'WebPage',
        name,
        description,
        url: canonicalUrl,
        image,
        publisher,
        datePublished,
        dateModified,
      };
  }
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
export function validatePageJsonLd(jsonLd) {
  if (!jsonLd) return { status: 'disabled', message: 'JSON-LD ถูกปิดใช้งาน' };
  const warnings = [];
  if (!jsonLd.name && !jsonLd.headline) warnings.push('ไม่มี name');
  if (!jsonLd.description)              warnings.push('ไม่มี description');
  if (!jsonLd.url)                      warnings.push('ไม่มี url');
  if (warnings.length > 2) return { status: 'error',   message: warnings.join(', ') };
  if (warnings.length > 0) return { status: 'warning', message: warnings.join(', ') };
  return { status: 'valid', message: 'JSON-LD ถูกต้องและครบถ้วน' };
}
