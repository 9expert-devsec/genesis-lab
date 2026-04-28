// src/app/page.jsx
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

import { getLandingData } from "@/lib/landing/getLandingData";
import { siteConfig } from "@/config/site";

import { HeroBanner } from "./_components/home/HeroBanner";
import { HeroBannerCarousel } from "./_components/home/HeroBannerCarousel";
import { ServicesSection } from "./_components/home/ServicesSection";
import { ProgramSelector } from "./_components/home/ProgramSelector";
import { NewCoursesSection } from "./_components/home/NewCoursesSection";
import { OnlineCoursesSection } from "./_components/home/OnlineCoursesSection";
import { InhouseCTA } from "./_components/home/InhouseCTA";
import { TestimonialStats } from "./_components/home/TestimonialStats";
import { BlogSection } from "./_components/home/BlogSection";
import { InstructorQuote } from "./_components/home/InstructorQuote";

// The home page now reads from the LandingCache document — a single
// MongoDB query instead of fanning out to 10+ external APIs per render.
// Cache invalidation happens via `revalidatePath('/')` inside
// `triggerLandingSync()`, called from every admin action that mutates
// data feeding this page (banners, featured-*). The cron job and
// manual /admin/landing-cache button do the same. So Next.js can
// safely cache the rendered HTML between syncs — a stale read here
// just means the admin save hasn't finished its background sync yet.
export const runtime = "nodejs";

export const metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

/**
 * Home page.
 *
 * Lives at /app/page.jsx (root), not inside the (public) group, so we
 * render PublicHeader / PublicFooter inline — the group layout isn't
 * inherited here.
 *
 * If the LandingCache is missing or unreadable, `getLandingData()`
 * returns empty arrays and each section renders its own empty state —
 * never a 500.
 */
export default async function HomePage() {
  const {
    banners,
    programs,
    skills,
    newCoursesWithSchedules,
    onlineCoursesForSection,
    reviews,
  } = await getLandingData();

  return (
    <>
      <PublicHeader />

      <main id="main">
        {banners.length > 0 ? (
          <HeroBannerCarousel banners={banners} />
        ) : (
          <HeroBanner />
        )}

        <ServicesSection />

        <ProgramSelector programs={programs} skills={skills} />

        <NewCoursesSection courses={newCoursesWithSchedules} />

        <OnlineCoursesSection courses={onlineCoursesForSection} />

        <InhouseCTA />

        <TestimonialStats reviews={reviews} />

        <BlogSection />

        <InstructorQuote />
      </main>

      <PublicFooter />
    </>
  );
}
