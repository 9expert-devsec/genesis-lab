// src/app/page.jsx
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { TopNotificationBar } from "@/components/notifications/TopNotificationBar";
import { SitePopup } from "@/components/notifications/SitePopup";
import { ScrollToTopButton } from "@/components/ui/ScrollToTopButton";
import { getActiveTopBars } from "@/lib/actions/site-notifications";
import { getFeaturedArticlesForLanding } from "@/lib/actions/articles";
import { getActiveClientLogos } from "@/lib/actions/portfolio";
import ClientLogosSection from "@/components/portfolio/ClientLogosSection";

import { getLandingData } from "@/lib/landing/getLandingData";
import { getNavMenuData } from "@/lib/navmenu/getNavMenuData";
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
  description:
    'อบรมคอร์สเทคโนโลยีชั้นนำ AI, Data, Power BI, Excel, Power Automate, Automation ด้วยผู้เชี่ยวชาญตัวจริง สอนสไตล์ใช้งานจริง Never Stop Learning',
  alternates: {
    canonical: siteConfig.url,
  },
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
  // Home sits outside the `(public)` group so it doesn't inherit that
  // group's layout — fetch + render the top bar inline here. Same call
  // as `(public)/layout.jsx`; both are cached together via
  // `revalidatePath('/', 'layout')` on admin writes.
  const [
    {
      banners,
      programs,
      skills,
      newCoursesWithSchedules,
      onlineCoursesForSection,
      reviews,
    },
    bars,
    featuredArticles,
    clientLogos,
    // Live slug maps from ProgramPageConfig / SkillPageConfig — the same
    // source the navbar uses — so the Program/Skill selector emits the
    // admin's current custom slug (no reliance on 308 redirects).
    { programSlugs, skillSlugs },
  ] = await Promise.all([
    getLandingData(),
    getActiveTopBars().catch(() => []),
    getFeaturedArticlesForLanding().catch(() => []),
    getActiveClientLogos().catch(() => []),
    getNavMenuData().catch(() => ({ programSlugs: {}, skillSlugs: {} })),
  ]);

  return (
    <>
      <TopNotificationBar bars={bars} />
      <PublicHeader />

      {/* Organization structured data — surfaces the brand panel and
          course catalogue in Google's SERP. Inlined here (vs. layout)
          so it only appears on the home page, where the Organization
          claim is canonical. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'EducationalOrganization',
            name: '9Expert Training',
            alternateName: 'นายน์เอ็กซ์เพิร์ท',
            url: siteConfig.url,
            logo: `${siteConfig.url}/logo/9exp-stand.png`,
            description:
              'อบรมคอร์สเทคโนโลยีชั้นนำ AI, Data, Power BI, Excel, Power Automate, Automation ด้วยผู้เชี่ยวชาญตัวจริง',
            address: {
              '@type': 'PostalAddress',
              addressCountry: 'TH',
              addressLocality: 'กรุงเทพมหานคร',
            },
            sameAs: [siteConfig.facebookUrl],
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: 'หลักสูตรอบรม IT',
              itemListElement: [
                { '@type': 'Course', name: 'AI & Machine Learning',          provider: { '@type': 'Organization', name: '9Expert Training' } },
                { '@type': 'Course', name: 'Data Analytics & Power BI',      provider: { '@type': 'Organization', name: '9Expert Training' } },
                { '@type': 'Course', name: 'Microsoft 365 & Power Platform', provider: { '@type': 'Organization', name: '9Expert Training' } },
                { '@type': 'Course', name: 'RPA & Automation',               provider: { '@type': 'Organization', name: '9Expert Training' } },
              ],
            },
          }),
        }}
      />

      <main id="main">
        {/* Visually hidden H1 — present in the DOM for crawlers and
            screen readers, takes up zero visual space. Uses the
            clip-rect pattern instead of font-size:0 because some
            assistive tech skips zero-sized text. Must be the first
            heading in DOM order so Ahrefs / Google see H1 before any
            section H2/H3. */}
        <h1
          aria-label="9Expert Training อบรมคอร์สเทคโนโลยีชั้นนำ AI Data Automation Power BI Excel ด้วยผู้เชี่ยวชาญตัวจริง"
          className="absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0"
          style={{ clip: 'rect(0,0,0,0)' }}
        >
          9Expert Training อบรมคอร์สเทคโนโลยีชั้นนำ AI Data Automation Power BI Excel ด้วยผู้เชี่ยวชาญตัวจริง
        </h1>

        {banners.length > 0 ? (
          <HeroBannerCarousel banners={banners} />
        ) : (
          <HeroBanner />
        )}

        <ServicesSection />

        <ProgramSelector
          programs={programs}
          skills={skills}
          programSlugs={programSlugs}
          skillSlugs={skillSlugs}
        />

        <NewCoursesSection courses={newCoursesWithSchedules} />

        <OnlineCoursesSection courses={onlineCoursesForSection} />

        <InhouseCTA />

        <ClientLogosSection logos={clientLogos} />

        <TestimonialStats reviews={reviews} />

        

        <BlogSection articles={featuredArticles} />

        <InstructorQuote />
      </main>

      <PublicFooter />
      <SitePopup />
      <ScrollToTopButton />
    </>
  );
}
