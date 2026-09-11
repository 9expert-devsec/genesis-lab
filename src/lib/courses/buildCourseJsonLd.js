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
import { courseCanonicalUrl } from '@/lib/courses/courseCanonicalPath';
import { SITE_URL } from '@/lib/seo/siteUrl';

export function buildCourseJsonLd({ course, extension, schedules = [], siteUrl }) {
  if (!course?.course_name) return null;

  /**
   * The last link in this chain used to be the literal
   * `'https://genesis-lab.9expert.app'` — the preview host, reachable only when
   * BOTH the argument and the env var were absent. It never fired in production
   * and that is exactly what made it worth removing: a fallback that is dormant
   * everywhere it is tested is a fallback nobody notices is wrong, waiting for
   * the one environment that does not set the variable.
   *
   * SITE_URL reads NEXT_PUBLIC_SITE_URL through siteConfig, so the middle term
   * is now redundant with the last rather than contradicting it. It is kept
   * because callers passing nothing and callers relying on the env are two
   * different call sites, and collapsing them is not this round's change.
   */
  const base = siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL;

  /**
   * THE ONE CANONICAL RULE, not a local copy of it.
   *
   * This file used to hold its own: `extension?.urlAlias || <code>-training-course`,
   * joined as `${base}/${slug}`. It picked the right URL and spelled it wrong —
   * aliases are stored WITH a leading slash, so an aliased course emitted
   *     https://site//build-business-apps-with-claude-code-training-course
   * with a double slash, for every one of the 80 courses that has an alias.
   * That resolves to the same page, which is why it went unnoticed, and it is a
   * THIRD spelling of a URL this round exists to have exactly one of.
   *
   * courseCanonicalUrl trims the base and returns the normalised path, so the
   * join cannot double. The page's `alternates.canonical` calls the same
   * function, and test/render/courseCanonicalMetadata asserts the two are EQUAL
   * rather than merely both plausible.
   */
  const courseUrl = courseCanonicalUrl(course, extension, base);

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
    // NO aggregateRating, NO review — deliberately absent, not missing.
    //
    // This builder used to emit a site-wide AggregateRating (4.9 / 5, with
    // the "90K+ learners" marketing count standing in for ratingCount) on
    // every course page, identical on all 77, with no rating rendered
    // anywhere in visible content. That asserts 90,000 reviews of each course
    // that do not exist. Google's review-snippet policy requires the markup
    // to reflect a real rating of THIS item that is visible on the page; a
    // site-wide number pasted into every Course is a structured-data policy
    // violation, not a missed rich result.
    //
    // The repo already forbids it: lib/schemas/pageBuilder.js keeps Review and
    // AggregateRating out of JSONLD_TYPES ("must NEVER be emitted"), and the
    // JSON-LD hook point in app/(public)/[...slug]/page.jsx repeats it. This
    // file predates both. test/fs/noAggregateRatingJsonLd guards the whole of
    // src/. The key may return ONLY when real per-course ratings exist AND
    // are rendered in the page's visible content — both, not either.
    image: course.course_cover_url || undefined,
    inLanguage: 'th',
  };
}
