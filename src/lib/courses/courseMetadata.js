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
  const title = extension?.metaTitle?.trim() || `${course.course_name}`;
  const description =
    extension?.metaDescription?.trim() || course.course_teaser?.slice(0, 160) || '';
  const ogImage = extension?.ogImage?.trim() || course.course_cover_url || '';

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: ogImage ? [{ url: ogImage }] : [],
    },
    ...(isPrivate ? { robots: { index: false, follow: false } } : {}),
  };
}
