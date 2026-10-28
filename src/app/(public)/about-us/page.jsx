import AboutHero from "@/components/about/AboutHero";
import StorySection from "@/components/about/StorySection";
import ProofSection from "@/components/about/ProofSection";
import TeachingSection from "@/components/about/TeachingSection";
import FormatsSection from "@/components/about/FormatsSection";
import InstructorCardsSection from "@/components/about/InstructorCardsSection";
import ClosingCtaSection from "@/components/about/ClosingCtaSection";
import CommunitySection from "@/components/about/CommunitySection";
import ReviewsSection from "@/components/about/ReviewsSection";
import { getLandingData } from "@/lib/landing/getLandingData";

import { getInstructors, getAboutConfig } from "@/lib/actions/about";
import { buildInstructorCards } from "@/lib/about/instructorCards";
import { getCompanyProfileSize } from "@/lib/about/companyProfileSize";
import { getActiveAtmospherePhotos, getActiveClientLogos } from "@/lib/actions/portfolio";
import { getSiteStats } from "@/lib/stats/getSiteStats";
import { getActiveCareerPaths } from "@/lib/career-paths/getCareerPaths";
import { buildStatItems, ABOUT_STAT_KEYS } from "@/lib/stats/statItems";
import { getNavMenuData } from "@/lib/navmenu/getNavMenuData";
import { focusPillLinks } from "@/lib/about/focusPills";
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
  const [instructors, atmospherePhotos, clientLogos, siteStats, aboutConfig, profileSize, careerPaths, navMenu, landing] = await Promise.all([
    getInstructors(),
    getActiveAtmospherePhotos().catch(() => []),
    getActiveClientLogos().catch(() => []),
    getSiteStats(),
    // Only `tagline` is rendered (the Story quote card); see quoteCardText.
    getAboutConfig().catch(() => null),
    getCompanyProfileSize(),
    // The same loader the header and /career-path-project use; only its count
    // is shown (the Career Path format card). A failure hides the number.
    getActiveCareerPaths().catch(() => null),
    // The header's own loader; its skillSlugs give the hero pills the same
    // URLs the mega menu uses. Never throws (returns empty maps).
    getNavMenuData(),
    // Home's own loader: its `reviews` are the admin's featured reviews, in
    // order. Never throws (empty defaults when the cache is missing).
    getLandingData(),
  ]);
  // Same instructors, same order; adds each one's program icons (MSDB-curated).
  const instructorCards = await buildInstructorCards(instructors);

  return (
    <main data-page="about" className="about-page">
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
      {/* Every top-level section sits under a stable about-* id, for anchor
          links. data-page="about" scopes this page's scroll-padding-top in
          globals.css: the ONE header offset for #hash jumps, so the wrappers
          carry no scroll-margin of their own. */}
      <div id="about-hero">
        <AboutHero pills={focusPillLinks(navMenu?.skillSlugs)} />
      </div>
      <div id="about-proof">
        <ProofSection
          items={buildStatItems(siteStats, ABOUT_STAT_KEYS)}
          organizations={siteStats.organizations}
          logos={clientLogos}
        />
      </div>
      <div id="about-story">
        <StorySection tagline={aboutConfig?.tagline} />
      </div>
      <div id="about-teach">
        <TeachingSection />
      </div>
      <div id="about-formats">
        <FormatsSection careerPathCount={careerPaths?.length || null} />
      </div>
      <div id="about-instructors">
        <InstructorCardsSection cards={instructorCards} />
      </div>
      <div id="about-community">
        <CommunitySection photos={atmospherePhotos} />
      </div>
      <div id="about-reviews">
        <ReviewsSection reviews={landing?.reviews} />
      </div>
      <div id="about-cta">
        <ClosingCtaSection profileSize={profileSize} />
      </div>
    </main>
  );
}
