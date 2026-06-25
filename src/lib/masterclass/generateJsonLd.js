/**
 * Build @graph JSON-LD (Course + FAQPage) for a Masterclass detail page.
 * Rendered server-side as <script type="application/ld+json">.
 */

const BASE_URL = 'https://masterclass.9experttraining.com';

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

export function generateMasterclassJsonLd(course, instructors, faqs) {
  const courseUrl = `${BASE_URL}/masterclass/${course.slug}`;

  // ── Course node ──────────────────────────────────────────────────────────
  const courseNode = {
    '@type': 'Course',
    '@id': `${courseUrl}#course`,
    name: `${course.title_th} | Masterclass`,
    description: course.subtitle_th || '',
    courseCode: course.course_code || '',
    educationalCredentialAwarded: 'e-Certificate',
    provider: {
      '@type': 'Organization',
      name: '9Expert Training',
      url: 'https://www.9experttraining.com',
    },
  };

  // instructor array (omit key entirely when empty)
  if (instructors?.length) {
    courseNode.instructor = instructors.map((inst) => ({
      '@type': 'Person',
      name: inst.name,
      jobTitle: inst.title || '',
      image: inst.image_url || '',
      worksFor: {
        '@type': 'Organization',
        name: '9Expert Training',
      },
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

      // offers array
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

        const ebAvailable =
          batch.early_bird_deadline == null ||
          new Date(batch.early_bird_deadline) > new Date();
        ebOffer.availability = ebAvailable
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock';

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
        availability:
          batch.status === 'open'
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
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
