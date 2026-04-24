import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { getCourseByCode, listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { getActiveBanners } from '@/lib/actions/banners';
import { getActiveFeaturedCourseIds } from '@/lib/actions/featured-courses';
import { siteConfig } from '@/config/site';
import { HeroBanner } from './_components/home/HeroBanner';
import { HeroBannerCarousel } from './_components/home/HeroBannerCarousel';
import { ServicesSection } from './_components/home/ServicesSection';
import { ProgramSelector } from './_components/home/ProgramSelector';
import { NewCoursesSection } from './_components/home/NewCoursesSection';
import { OnlineCoursesSection } from './_components/home/OnlineCoursesSection';
import { InhouseCTA } from './_components/home/InhouseCTA';
import { TestimonialStats } from './_components/home/TestimonialStats';
import { BlogSection } from './_components/home/BlogSection';
import { InstructorQuote } from './_components/home/InstructorQuote';

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
 * All upstream fetches run in parallel via Promise.allSettled so one
 * failing endpoint doesn't 500 the whole page. Each section has its
 * own empty/placeholder fallback.
 */
export default async function HomePage() {
  const [coursesRes, programsRes, skillsRes, bannersRes] =
    await Promise.allSettled([
      listPublicCourses(),
      listPrograms(),
      listSkills(),
      getActiveBanners(),
    ]);

  const courses =
    coursesRes.status === 'fulfilled' ? coursesRes.value.items : [];
  const programs =
    programsRes.status === 'fulfilled' ? programsRes.value.items : [];
  const skills = skillsRes.status === 'fulfilled' ? skillsRes.value.items : [];
  const banners = bannersRes.status === 'fulfilled' ? bannersRes.value : [];

  // Sort by upstream sort_order so featured courses surface first.
  const sorted = [...courses].sort(
    (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
  );

  // "คอร์สใหม่แนะนำ" is admin-curated via the `featured_courses`
  // collection. Fetch each featured course by course_id directly — the
  // list response may not include it (e.g., hidden upstream) and detail
  // has the cover/teaser/levels fields we want anyway. Max ~8 calls.
  const featuredIds = await getActiveFeaturedCourseIds().catch(() => []);
  const featuredDetails = (
    await Promise.all(
      featuredIds
        .slice(0, 8)
        .map((id) => getCourseByCode(id).catch(() => null))
    )
  ).filter(Boolean);

  // Fall back to the top 8 from the list when no admin curation exists.
  const promotedRaw =
    featuredDetails.length > 0 ? featuredDetails : sorted.slice(0, 8);

  const promotedIds = new Set(promotedRaw.map((c) => c._id));
  const onlineRaw = sorted
    .filter((c) => !promotedIds.has(c._id))
    .slice(0, 8);

  // Featured courses are already detail-shape; only enrich what isn't.
  const detailById = new Map(
    featuredDetails.map((d) => [d.course_id, d])
  );
  const toEnrich =
    featuredDetails.length > 0 ? onlineRaw : [...promotedRaw, ...onlineRaw];

  const DETAIL_CHUNK = 10;
  for (let i = 0; i < toEnrich.length; i += DETAIL_CHUNK) {
    const chunk = toEnrich.slice(i, i + DETAIL_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => getCourseByCode(c.course_id))
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        detailById.set(chunk[idx].course_id, r.value);
      }
    });
  }

  // ≤ 16 courses we're actually going to render.
  const displayed = [...promotedRaw, ...onlineRaw];

  // Pre-fetch up to 3 upcoming schedules per displayed course so the
  // CourseCard expand panel renders the signup pills directly.
  const scheduleMap = new Map();
  for (let i = 0; i < displayed.length; i += DETAIL_CHUNK) {
    const chunk = displayed.slice(i, i + DETAIL_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => listSchedulesByCourse(c._id, { limit: 3 }))
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        scheduleMap.set(chunk[idx]._id, r.value.items ?? []);
      }
    });
  }

  // Skills on detail are full objects already; fall back to resolving
  // ObjectId strings via the skills list when detail was missing.
  const skillsById = new Map(skills.map((s) => [s._id, s]));

  const enrich = (c) => {
    const d = detailById.get(c.course_id);
    const base = d
      ? {
          ...c,
          course_cover_url: d.course_cover_url ?? null,
          course_teaser: d.course_teaser ?? null,
          course_levels: d.course_levels ?? null,
          course_traininghours:
            d.course_traininghours ??
            (c.course_trainingdays ? c.course_trainingdays * 6 : null),
          course_workshop_status: d.course_workshop_status ?? null,
          course_certificate_status: d.course_certificate_status ?? null,
          course_type_public: d.course_type_public ?? null,
          course_type_inhouse: d.course_type_inhouse ?? null,
          skills: d.skills ?? c.skills,
        }
      : c;

    return {
      ...base,
      skills: Array.isArray(base.skills)
        ? base.skills
            .map((s) => (typeof s === 'string' ? skillsById.get(s) : s))
            .filter(Boolean)
        : [],
      schedules: scheduleMap.get(c._id) ?? [],
    };
  };

  const newCoursesWithSchedules = promotedRaw.map(enrich);
  const onlineCoursesWithSchedules = onlineRaw.map(enrich);

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
        <OnlineCoursesSection courses={onlineCoursesWithSchedules} />
        <InhouseCTA />
        <TestimonialStats />
        <BlogSection articles={null} />
        <InstructorQuote />
      </main>
      <PublicFooter />
    </>
  );
}
