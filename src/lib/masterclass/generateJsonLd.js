/**
 * Build @graph JSON-LD (Course + FAQPage) for a Masterclass detail page.
 * Rendered server-side as <script type="application/ld+json">.
 *
 * ── THE ORIGIN IS NO LONGER SPELLED HERE ────────────────────────────────────
 * This module used to open with `const BASE_URL =
 * 'https://masterclass.9experttraining.com'` and build every `@id` and every
 * registration URL from it, while the page's own `<link rel="canonical">` named
 * www — so each masterclass page declared one host canonical and described
 * itself on another. `provider.url` was a third spelling of the origin.
 *
 * All of it now comes from lib/masterclass/masterclassUrl, which the page's
 * canonical also calls, so the tag and the graph cannot disagree. See that
 * module for the ruling and the verified 308 that settled which host wins.
 *
 * `provider` and `instructor[].worksFor` are now `@id` REFERENCES to the
 * organisation the home graph declares, rather than two more inline Organization
 * objects: an organisation spelled out in three places is three organisations to
 * a crawler, and none of them resolves to the one with the address and the logo.
 */

import { SITE_URL } from '@/lib/seo/siteUrl';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';
import { masterclassCanonicalUrl, masterclassCourseId } from '@/lib/masterclass/masterclassUrl';

/** Format a date + "HH:mm" time into an ISO 8601 string with the +07:00 offset. */
function toThaiIso(dateValue, timeStr) {
  const d = new Date(dateValue);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const [hh, min] = (timeStr || '00:00').split(':');
  return `${yyyy}-${mm}-${dd}T${hh.padStart(2, '0')}:${min.padStart(2, '0')}:00+07:00`;
}

/** Strip HTML tags and collapse whitespace from an answer string. */
function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise an early-bird deadline into an ISO 8601 string with +07:00 offset. */
function deadlineToIso(deadline) {
  if (!deadline) return null;
  if (typeof deadline === 'string' && !deadline.includes('T')) {
    return `${deadline}T23:59:59+07:00`;
  }
  return new Date(deadline).toISOString();
}

/**
 * @param {object} course
 * @param {object[]} instructors
 * @param {object[]} faqs
 * @param {string} [siteUrl] origin without a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test, which is what
 *   proves every URL here is composed rather than restated.
 */
export function generateMasterclassJsonLd(course, instructors, faqs, siteUrl) {
  // ONE trimmed base, handed to every builder below, so a caller passing a
  // trailing slash cannot produce a clean course URL and a `//#organization`
  // beside it.
  const base = String(siteUrl ?? SITE_URL).replace(/\/+$/, '');

  // The page's canonical, character for character — the same function
  // generateMetadata calls for `alternates.canonical`.
  const courseUrl = masterclassCanonicalUrl(course.slug, base);
  const organizationId = homeGraphIds(base).organization;

  // ── Course node ──────────────────────────────────────────────────────────
  const courseNode = {
    '@type': 'Course',
    '@id': masterclassCourseId(course.slug, base),
    /**
     * ADDED 2026-09-29. This node carried an `@id` and no `url` at all, so a
     * crawler had an identity for the course and no statement of where it is
     * published — the exact mirror image of lib/courses/buildCourseJsonLd, which
     * emits a `url` and no `@id`. It is the canonical, so it equals the page's
     * own tag and the `@id` above minus the fragment.
     */
    url: courseUrl,
    name: `${course.title_th} | Masterclass`,
    description: course.subtitle_th || '',
    courseCode: course.course_code || '',
    educationalCredentialAwarded: 'e-Certificate',
    // A REFERENCE to the organisation the home graph declares, not a third
    // inline copy of its name and URL.
    provider: { '@id': organizationId },
  };

  // instructor array (omit key entirely when empty)
  if (instructors?.length) {
    courseNode.instructor = instructors.map((inst) => ({
      '@type': 'Person',
      name: inst.name,
      jobTitle: inst.title || '',
      image: inst.image_url || '',
      // Was a bare `{'@type':'Organization', name:'9Expert Training'}` with no
      // url and no @id — an anonymous fourth organisation that resolved to
      // nothing. Now the same entity the provider names.
      worksFor: { '@id': organizationId },
    }));
  }

  // hasCourseInstance array
  const batches = (course.batches || []).filter((b) => b.status !== 'cancelled');
  if (batches.length) {
    courseNode.hasCourseInstance = batches.map((batch) => {
      const registrationUrl = `${courseUrl}/register?batch=${batch._id}`;
      const dates = batch.dates || [];

      const instance = {
        '@type': 'CourseInstance',
        name: `${course.title_th} - รุ่นที่ ${batch.batch_no}`,
        courseMode: 'onsite',
      };

      if (dates.length) {
        instance.startDate = toThaiIso(dates[0]?.date, course.time_start);
        instance.endDate = toThaiIso(dates[dates.length - 1]?.date, course.time_end);
      }

      instance.location = {
        '@type': 'Place',
        name: batch.venue_name || '',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Bangkok',
          addressRegion: 'Bangkok',
          addressCountry: 'TH',
        },
      };

      /**
       * ── NO `availability` ON ANY OFFER, DELIBERATELY ────────────────────
       *
       * Every Offer below used to carry one: the Early Bird's was computed from
       * the deadline, the Regular Price's from `batch.status === 'open'`. Both
       * were removed 2026-09-29.
       *
       * THE PAGE CANNOT HONESTLY MAKE THE CLAIM. This route is ISR with
       * `revalidate = 3600` (see the page's own note on why the declaration is
       * real), so the HTML a crawler reads can be up to an hour old. A batch
       * that sells its last seat — or whose early-bird deadline passes — keeps
       * serving `https://schema.org/InStock` until the window turns over or a
       * registration action revalidates the path. `availability` is the one
       * field in an Offer that flips on a timescale shorter than the cache, and
       * an InStock on a sold-out batch is a wrong answer to the exact question
       * the field exists to answer.
       *
       * PRICE STAYS. It changes when an admin edits the batch, not when a seat
       * sells, so an hour-old price is the price. The Early Bird offer also
       * carries `priceValidUntil`, which states its own expiry as a DATE rather
       * than as a boolean computed at render time — a stale document and a fresh
       * one say the same thing, and the reader works out the rest.
       *
       * /schedule's Course nodes omit availability for this same reason. Same
       * line, same argument: the facts a buyer acts on in real time belong to
       * the live page, not to cached structured data.
       */
      const offers = [];

      // Early Bird offer
      if (batch.is_early_bird === true && typeof batch.price_early_bird === 'number' && batch.price_early_bird > 0) {
        const ebOffer = {
          '@type': 'Offer',
          name: 'Early Bird Price',
          price: batch.price_early_bird,
          priceCurrency: 'THB',
        };

        const priceValidUntil = deadlineToIso(batch.early_bird_deadline);
        if (priceValidUntil) ebOffer.priceValidUntil = priceValidUntil;

        ebOffer.priceSpecification = {
          '@type': 'PriceSpecification',
          valueAddedTaxIncluded: false,
        };
        ebOffer.url = registrationUrl;

        offers.push(ebOffer);
      }

      // Regular Price offer (always)
      offers.push({
        '@type': 'Offer',
        name: 'Regular Price',
        price: batch.price_normal,
        priceCurrency: 'THB',
        priceSpecification: {
          '@type': 'PriceSpecification',
          valueAddedTaxIncluded: false,
        },
        url: registrationUrl,
      });

      instance.offers = offers;

      return instance;
    });
  }

  // ── FAQPage node ─────────────────────────────────────────────────────────
  let faqNode = null;
  if (faqs?.length) {
    faqNode = {
      '@type': 'FAQPage',
      '@id': `${courseUrl}#faq`,
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question_th,
        acceptedAnswer: {
          '@type': 'Answer',
          text: stripHtml(faq.answer_html),
        },
      })),
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [courseNode, ...(faqNode ? [faqNode] : [])],
  };
}
