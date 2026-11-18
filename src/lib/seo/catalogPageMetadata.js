/**
 * Metadata for a program or skill listing page (`/<slug>-all-courses`), from
 * its ProgramPageConfig / SkillPageConfig row and the upstream fallbacks the
 * catch-all page already picked.
 *
 * Extracted from the two branches of generateMetadata in
 * app/(public)/[...slug]/page.jsx so the title rule is one pure, testable
 * call. Everything except the title is exactly what those branches returned
 * before: description, canonical, OG url and images.
 *
 * The title is brand-aware (lib/seo/brandAwareTitle): a stored metaTitle that
 * already ends in `| 9Expert` goes out as `{ absolute }`, so the root template
 * does not render `… | 9Expert | 9Expert Training`. Open Graph gets the base.
 *
 * PURE.
 */

import { brandAwareTitle } from '@/lib/seo/brandAwareTitle';

/**
 * @param {{ metaTitle?: string, name?: string, description?: string,
 *           ogImage?: string, pageUrl: string }} input
 */
export function catalogPageMetadata({ metaTitle, name, description, ogImage, pageUrl }) {
  const { base, title } = brandAwareTitle(metaTitle?.trim() || `${name ?? ''}`);
  return {
    title,
    description: description || '',
    alternates: { canonical: pageUrl },
    openGraph: {
      title: base,
      description: description || '',
      url: pageUrl,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}
