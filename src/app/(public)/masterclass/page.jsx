import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
import { SITE_URL } from '@/lib/seo/siteUrl';
import {
  MASTERCLASS_TITLE,
  buildMasterclassListJsonLd,
} from '@/lib/seo/masterclassListJsonLd';
import { MasterclassListingClient } from './_components/MasterclassListingClient';

// ISR, not force-dynamic. Course content changes revalidate '/masterclass'
// from lib/actions/masterclass.js; batch state (open/full) changes on
// registration and payment, and those actions now revalidate the public paths
// too — see revalidateMasterclassPublic in lib/actions/masterclass-registrations.js.
export const revalidate = 3600;

/**
 * The canonical URL of this page. ONE expression of the origin, shared with the
 * JSON-LD below.
 *
 * SITE_URL *is* `process.env.NEXT_PUBLIC_SITE_URL`, read through siteConfig, so
 * the PRODUCTION VALUE IS UNCHANGED — but it was a second EXPRESSION of the same
 * value on the page whose structured data is built from the first. Same change,
 * for the same reason, as /training-course, /schedule, /about-us and /contact-us.
 */
const CANONICAL_URL = `${SITE_URL}/masterclass`;

export const metadata = {
  /**
   * The `%s` the root layout's template composes into `<title>`.
   *
   * THIS USED TO DOUBLE THE BRAND. The value was
   * `'Masterclass — 9Expert Training'`, and the root layout appends
   * ` | ${siteConfig.name}`, so the page rendered
   * `Masterclass — 9Expert Training | 9Expert Training`. The brand belongs to the
   * template; this is the segment alone, and the rendered title is now
   * `Masterclass | 9Expert Training`.
   *
   * Read from the JSON-LD module so the tag and CollectionPage.name are one value.
   */
  title: MASTERCLASS_TITLE,
  description:
    'เรียนเข้มข้นแบบ Workshop เต็มวัน เฉพาะเสาร์-อาทิตย์ กลุ่มเล็ก ลงมือปฏิบัติจริงกับผู้เชี่ยวชาญ 9Expert',
  alternates: { canonical: CANONICAL_URL },
};

export default async function MasterclassListingPage() {
  const courses = await getPublishedMasterclasses();

  // The published masterclasses, described for readers that never run this
  // page's JavaScript. `null` when nothing is published, in which case no script
  // tag is emitted at all — see lib/seo/masterclassListJsonLd.js.
  const listJsonLd = buildMasterclassListJsonLd(courses);

  return (
    <>
      {/* Same pattern as /training-course and /schedule: a plain ld+json script
          guarded on the builder returning null, rendered from server data before
          the client component. Each ListItem's Course @id is the SAME id the
          matching detail page emits. */}
      {listJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
        />
      )}
      <MasterclassListingClient courses={courses} />
    </>
  );
}
