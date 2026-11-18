import { brandAwareTitle } from '@/lib/seo/brandAwareTitle';
import { truncateForMeta } from '@/lib/seo/metaDescription';

/**
 * The course detail page's metadata — public and private — from the resolved
 * course, its CourseExtension row, and the canonical URL the page already
 * computes (courseCanonicalUrl).
 *
 * A NORMAL course gets exactly the object generateMetadata always returned:
 * title, description, canonical, openGraph.
 *
 * A PRIVATE course gets the same, plus `robots: { index: false, follow: false }`.
 * It is reached only by a link sent to one client and must never be findable,
 * so it is not indexed and its links are not followed. Everything else stays
 * NORMAL on purpose — the OG title, description and image are what make a link
 * pasted into LINE or Facebook unfurl into a card. The canonical is the course's
 * own canonical URL (its alias, or its code path), never another page.
 * Not added to robots.txt: a disallowed URL cannot have its noindex read.
 */
export function courseMetadata({ course, extension, canonicalUrl, isPrivate = false }) {
  // Brand-aware: a stored title that already ends in `| 9Expert` goes out as
  // `{ absolute }` so the root template does not append the brand a second
  // time. Open Graph gets the bare base. See lib/seo/brandAwareTitle.
  const { base, title } = brandAwareTitle(extension?.metaTitle?.trim() || `${course.course_name}`);
  // D06 (R2): the authored metaDescription goes out as written; only the
  // teaser FALLBACK is cut, and on a word boundary (no mid-word / mid-Thai-
  // syllable slice, ellipsis within the 160 budget) — the article helper.
  const description =
    extension?.metaDescription?.trim() || truncateForMeta(course.course_teaser ?? '') || '';
  const ogImage = extension?.ogImage?.trim() || course.course_cover_url || '';

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: base,
      description,
      url: canonicalUrl,
      images: ogImage ? [{ url: ogImage }] : [],
    },
    ...(isPrivate ? { robots: { index: false, follow: false } } : {}),
  };
}
