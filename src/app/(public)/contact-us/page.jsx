import ContactHero from "@/components/contact/ContactHero";
import GetInTouchSection from "@/components/contact/GetInTouchSection";
import VideoSection from "@/components/contact/VideoSection";
import TransportMapSection from "@/components/contact/TransportMapSection";
import BusinessInfoSection from "@/components/contact/BusinessInfoSection";
import MapSection from "@/components/contact/MapSection";
import ContactCTA from "@/components/contact/ContactCTA";

import { SITE_URL } from "@/lib/seo/siteUrl";
import { CONTACT_TITLE, buildContactPageJsonLd } from "@/lib/seo/infoPageJsonLd";

export const revalidate = 86400;

/**
 * The canonical URL of this page. ONE expression of the origin, shared with the
 * JSON-LD below.
 *
 * SITE_URL *is* `process.env.NEXT_PUBLIC_SITE_URL`, read through siteConfig, so
 * the PRODUCTION VALUE IS UNCHANGED — but it was a second EXPRESSION of the same
 * value on the page whose structured data is built from the first. Same change,
 * for the same reason, as /training-course and /schedule.
 */
const CANONICAL_URL = `${SITE_URL}/contact-us`;

export function generateMetadata() {
  return {
    // Read from the JSON-LD module so the tag and the page node's `name` are one
    // value — see CONTACT_TITLE for why the constant lives there and not here.
    title: CONTACT_TITLE,
    description:
      "ติดต่อ 9Expert Training โทร 02-219-4304 อาคารเอเวอร์กรีน เพลส ซอยวรฤทธิ์ ถนนพญาไท เขตราชเทวี กรุงเทพฯ",
    alternates: { canonical: CANONICAL_URL },
    openGraph: { url: CANONICAL_URL },
  };
}

export default function ContactPage() {
  return (
    <main>
      {/* A ContactPage node referencing the home graph's organisation and
          training venue by @id. NO contact facts are restated — the address,
          phones, hours and map this page shows live on the home graph once, and
          the two sides already disagree in six measured ways. See
          lib/seo/infoPageJsonLd.js for that list and why copying them in would
          make the drift machine-readable. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildContactPageJsonLd()),
        }}
      />
      <ContactHero />
      <GetInTouchSection />
      <VideoSection />
      <MapSection />
      {/* <TransportMapSection /> */}
      <BusinessInfoSection />
      <ContactCTA />
    </main>
  );
}
