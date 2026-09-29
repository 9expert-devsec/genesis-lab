import HeroUniverse from "@/components/about/HeroUniverse";
import MissionSection from "@/components/about/MissionSection";
import KPISection from "@/components/about/KPISection";
import HowWeTeachSection from "@/components/about/HowWeTeachSection";
import InstructorSection2 from "@/components/about/InstructorSection2";
import CompanyProfileSection from "@/components/about/CompanyProfileSection";
import JoinUsSection from "@/components/about/JoinUsSection";
import AtmosphereSection from "@/components/portfolio/AtmosphereSection";

import { getInstructors } from "@/lib/actions/about";
import { getActiveAtmospherePhotos } from "@/lib/actions/portfolio";
import { SITE_URL } from "@/lib/seo/siteUrl";
import { ABOUT_TITLE, buildAboutPageJsonLd } from "@/lib/seo/infoPageJsonLd";

export const revalidate = 3600;

/**
 * The canonical URL of this page. ONE expression of the origin, shared with the
 * JSON-LD below.
 *
 * SITE_URL *is* `process.env.NEXT_PUBLIC_SITE_URL`, read through siteConfig, so
 * the PRODUCTION VALUE IS UNCHANGED — but it was a second EXPRESSION of the same
 * value on the page whose structured data is built from the first, and two ways
 * of spelling one host is how they become two hosts. Same change, for the same
 * reason, as /training-course and /schedule. It also gains the fallback the bare
 * env read did not have: a deployment that forgets the variable emitted
 * `undefined/about-us`.
 */
const CANONICAL_URL = `${SITE_URL}/about-us`;

export function generateMetadata() {
  return {
    // Read from the JSON-LD module so the tag and the page node's `name` are one
    // value — see ABOUT_TITLE for why the constant lives there and not here.
    title: ABOUT_TITLE,
    description:
      "9Expert Learning Universe — ผู้นำด้านการอบรม Data, AI, Business และ Technology ในประเทศไทย",
    alternates: { canonical: CANONICAL_URL },
    openGraph: { url: CANONICAL_URL },
  };
}

export default async function AboutUsPage() {
  const [instructors, atmospherePhotos] = await Promise.all([
    getInstructors(),
    getActiveAtmospherePhotos().catch(() => []),
  ]);

  const stats = [
    { value: 90, suffix: "K+", label: "ผู้เรียน" },
    { value: 5, suffix: "K+", label: "องค์กร" },
    { value: 5.0, suffix: "", label: "คะแนนรีวิว", decimals: 1 },
    { value: 700, suffix: "K+", label: "ผู้ติดตาม" },
    { value: 79, suffix: "", label: "หลักสูตร" },
  ];

  return (
    <main>
      {/* An AboutPage node referencing the home graph's organisation by @id —
          no organisation facts are restated here. Same pattern as
          /training-course and /schedule: a plain ld+json script from server
          data. See lib/seo/infoPageJsonLd.js. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildAboutPageJsonLd()),
        }}
      />
      <HeroUniverse />
      <MissionSection />
      <KPISection stats={stats} />
      <HowWeTeachSection />
      <InstructorSection2 instructors={instructors} />
      <CompanyProfileSection />
      <AtmosphereSection photos={atmospherePhotos} />
      <JoinUsSection />
    </main>
  );
}
