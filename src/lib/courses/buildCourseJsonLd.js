/**
 * Schema.org JSON-LD builder for Course pages.
 *
 * Returns a Course schema object ready to be stringified into
 * <script type="application/ld+json">. Returns null if required
 * data is missing.
 *
 * Docs: https://schema.org/Course
 * Google rich results: https://developers.google.com/search/docs/appearance/structured-data/course
 */
export function buildCourseJsonLd({ course, extension, schedules = [], siteUrl }) {
  if (!course?.course_name) return null;

  const base = siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://genesis-lab.9expert.app';

  // Resolve the canonical URL — prefer urlAlias from CourseExtension if available,
  // fall back to the standard slug pattern.
  const slug = extension?.urlAlias || `${course.course_id?.toLowerCase?.()}-training-course`;
  const courseUrl = `${base}/${slug}`;

  // Build hasCourseInstance from live schedules (open/nearly_full only).
  // Each schedule becomes a CourseInstance with startDate/endDate/location.
  const instances = schedules
    .filter((s) => s.status !== 'closed' && s.status !== 'cancelled')
    .slice(0, 5) // cap at 5 to keep payload reasonable
    .map((s) => ({
      '@type': 'CourseInstance',
      courseMode: s.scheduleType === 'online' ? ['Online'] : ['Onsite', 'Blended'],
      startDate: s.start_date ?? s.startDate ?? undefined,
      endDate:   s.end_date   ?? s.endDate   ?? undefined,
      location: {
        '@type': 'Place',
        name:    '9Expert Training',
        address: {
          '@type':           'PostalAddress',
          streetAddress:     'สามเสนใน พญาไท',
          addressLocality:   'กรุงเทพมหานคร',
          postalCode:        '10400',
          addressCountry:    'TH',
        },
      },
      offers: {
        '@type':         'Offer',
        price:           String(s.price_override ?? course.course_price ?? ''),
        priceCurrency:   'THB',
        availability:    'https://schema.org/InStock',
        validFrom:       s.start_date ?? s.startDate ?? undefined,
      },
    }));

  return {
    '@context': 'https://schema.org',
    '@type':    'Course',
    name:        course.course_name,
    description: course.course_teaser?.slice(0, 300) || course.course_name,
    url:         courseUrl,
    provider: {
      '@type':  'Organization',
      name:     '9Expert Training',
      sameAs:   base,
    },
    // Top-level offers (price summary — shown in Google search snippets)
    offers: course.course_price
      ? {
          '@type':       'Offer',
          price:         String(course.course_price),
          priceCurrency: 'THB',
          category:      'Public Training',
        }
      : undefined,
    // Live schedule instances
    hasCourseInstance: instances.length > 0 ? instances : undefined,
    // Site-wide aggregate rating (hardcoded marketing number — same source
    // as TestimonialStats.jsx STATS array)
    aggregateRating: {
      '@type':       'AggregateRating',
      ratingValue:   '4.9',
      bestRating:    '5',
      worstRating:   '1',
      ratingCount:   '90000', // 90K+ learners used as proxy for review count
    },
    image: course.course_cover_url || undefined,
    inLanguage: 'th',
  };
}
