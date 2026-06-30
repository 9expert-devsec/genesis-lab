import { notFound, permanentRedirect } from 'next/navigation';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { resolveCourse } from '@/lib/resolveCourse';
import { getCareerPathBySlug } from '@/lib/career-paths/getCareerPaths';
import { CareerPathDetail } from './_components/CareerPathDetail';
import { CourseCard } from '@/components/course/CourseCard';
import { CourseHero } from './_components/CourseHero';
import { SkillBreadcrumb } from './_components/SkillBreadcrumb';
import { ScheduleSection } from './_components/ScheduleSection';
import { CourseDescription } from './_components/CourseDescription';
import { CourseObjectives } from './_components/CourseObjectives';
import { CourseTarget } from './_components/CourseTarget';
import { CoursePrerequisites } from './_components/CoursePrerequisites';
import { CourseRequirements } from './_components/CourseRequirements';
import { CourseOutline } from './_components/CourseOutline';
import { CourseRoadmap } from './_components/CourseRoadmap';
import { SidebarNav } from './_components/SidebarNav';
import { InhouseCTA } from './_components/InhouseCTA';
import { PDFDownload } from './_components/PDFDownload';
import { RelatedCourses } from './_components/RelatedCourses';
import { EarlyBirdBanner } from './_components/EarlyBirdBanner';
import { CoursePromoSection } from './_components/CoursePromoSection';
import {
  getEarlyBirdByCourse,
  getActiveCoursePromos,
  getAllActiveEarlyBirdMap,
} from '@/lib/actions/course-promos';
import { dbConnect } from '@/lib/db/connect';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { resolveProgramBySlug, resolveSkillBySlug } from '@/lib/resolvePageSlug';
import { listSkills } from '@/lib/api/skills';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';
import { buildCourseJsonLd } from '@/lib/courses/buildCourseJsonLd';
import {
  getCustomPageBySlug,
  getCustomPageBySlugAny,
  findCustomPageByHistoricalSlug,
} from '@/lib/actions/customPages';
import { buildPageJsonLd } from '@/lib/customPages/buildPageJsonLd';
import { CustomPageView } from './_components/CustomPageView';

/**
 * Catch-all route for legacy-style pattern URLs:
 *   /<slug>-training-course   → course detail (real data)
 *   /<custom-alias>           → same course, but matched by
 *                               CourseExtension.urlAlias
 *   /<slug>-career-path       → career path detail (Phase 3 placeholder)
 *   /<slug>-all-courses       → catalog by skill or program (Phase 3 placeholder)
 *
 * Resolution flow:
 *   resolveCourse() tries alias first, then the `-training-course`
 *   suffix. If neither hits, fall through to the placeholder branches
 *   so career-path / all-courses URLs keep working.
 */

export const revalidate = 3600;

function segmentFromSlug(slug) {
  const segment = Array.isArray(slug) ? slug.join('/') : String(slug ?? '');
  if (segment.includes('/')) return null;
  return segment;
}

// Resolve a custom page for either public (published) or preview (any status
// with a matching token) access. Returns { page, isPreview } or null.
async function resolveCustomPageForRequest(segment, searchParams) {
  const sp = await searchParams;               // App Router: searchParams is a promise
  const token = sp?.preview ? String(sp.preview) : '';
  if (token) {
    const draft = await getCustomPageBySlugAny(segment);
    if (draft && draft.previewToken && draft.previewToken === token) {
      return { page: draft, isPreview: true };
    }
    // token present but wrong/!match → fall through to published-only
  }
  const published = await getCustomPageBySlug(segment);
  if (published) return { page: published, isPreview: false };
  return null;
}

// ── Program / skill pretty-URL pages ────────────────────────────────
// These used to live under /program/[slug] and /skill/[slug]; they now
// render at the bare slug (e.g. /canva, /power-bi-all-courses) matched
// by the admin custom `urlSlug` only. A cheap indexed probe on the
// *PageConfig collection short-circuits the common case (course aliases
// hitting this catch-all) before any heavier list/enrich work runs, so
// existing course pages pay almost nothing for this addition.

async function loadProgram(slug) {
  await dbConnect();
  const cfg = await ProgramPageConfig.findOne({ urlSlug: slug }).lean();
  if (!cfg || cfg.isPublished === false) return null;

  const [programsRes, coursesRes, earlyBirdMap] = await Promise.all([
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
    getAllActiveEarlyBirdMap().catch(() => ({})),
  ]);

  const resolved = await resolveProgramBySlug(slug, programsRes.items ?? []);
  if (!resolved) return null;

  const { program, config } = resolved;
  const programKey = String(program._id);
  const programCourses = (coursesRes.items ?? []).filter(
    (c) => String(c?.program?._id ?? '') === programKey
  );
  const courses = await enrichCoursesWithDetails(programCourses);
  return { program, config, courses, earlyBirdMap };
}

function courseInSkill(course, skillId) {
  const arr = Array.isArray(course?.skills) ? course.skills : [];
  return arr.some((s) => {
    if (typeof s === 'string') return s === skillId;
    return s?._id === skillId || s?.skill_id === skillId;
  });
}

async function loadSkill(slug) {
  await dbConnect();
  const cfg = await SkillPageConfig.findOne({ urlSlug: slug }).lean();
  if (!cfg || cfg.isPublished === false) return null;

  const [skillsRes, programsRes, coursesRes] = await Promise.all([
    listSkills().catch(() => ({ items: [] })),
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);

  const resolved = await resolveSkillBySlug(slug, skillsRes.items ?? []);
  if (!resolved) return null;

  const { skill, config } = resolved;
  const skillId = String(skill._id);
  const enriched = await enrichCoursesWithDetails(coursesRes.items ?? []);
  const skillCourses = enriched.filter((c) => courseInSkill(c, skillId));

  const ordered = await getOrderedPrograms(programsRes.items ?? []).catch(
    () => programsRes.items ?? []
  );
  const coursesByProgram = ordered
    .map((prog) => ({
      program: prog,
      courses: skillCourses.filter(
        (c) => String(c?.program?._id ?? '') === String(prog._id)
      ),
    }))
    .filter((g) => g.courses.length > 0);

  return { skill, config, coursesByProgram, totalCourses: skillCourses.length };
}

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);
  if (!segment) return {};

  const pageUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/${segment}`;

  // Program / skill custom-slug metadata. Cheap indexed probe first so
  // course-alias hits don't pay for the program/skill list fetches.
  if (
    !segment.endsWith('-training-course') &&
    !segment.endsWith('-career-path')
  ) {
    await dbConnect();
    const [progCfg, skillCfg] = await Promise.all([
      ProgramPageConfig.findOne({ urlSlug: segment }).lean(),
      SkillPageConfig.findOne({ urlSlug: segment }).lean(),
    ]);

    if (progCfg && progCfg.isPublished !== false) {
      const programsRes = await listPrograms().catch(() => ({ items: [] }));
      const resolved = await resolveProgramBySlug(segment, programsRes.items ?? []);
      if (resolved) {
        const { program, config } = resolved;
        const title =
          config?.metaTitle?.trim() ||
          `${program.program_name}`;
        const description =
          config?.metaDescription?.trim() ||
          program.program_description ||
          program.program_teaser ||
          '';
        const ogImage = config?.ogImage?.trim() || program.programiconurl || '';
        return {
          title,
          description,
          alternates: { canonical: pageUrl },
          openGraph: {
            title,
            description,
            url: pageUrl,
            images: ogImage ? [{ url: ogImage }] : [],
          },
        };
      }
    }

    if (skillCfg && skillCfg.isPublished !== false) {
      const skillsRes = await listSkills().catch(() => ({ items: [] }));
      const resolved = await resolveSkillBySlug(segment, skillsRes.items ?? []);
      if (resolved) {
        const { skill, config } = resolved;
        const title =
          config?.metaTitle?.trim() ||
          `${skill.skill_name}`;
        const description =
          config?.metaDescription?.trim() ||
          skill.skill_description ||
          skill.skill_teaser ||
          '';
        const ogImage = config?.ogImage?.trim() || skill.skilliconurl || '';
        return {
          title,
          description,
          alternates: { canonical: pageUrl },
          openGraph: {
            title,
            description,
            url: pageUrl,
            images: ogImage ? [{ url: ogImage }] : [],
          },
        };
      }
    }
  }

  // Career-path detail pages live under this catch-all too; resolve them
  // first so their metadata wins over any accidental course-name collision.
  if (segment.endsWith('-career-path')) {
    const careerPath = await getCareerPathBySlug(segment);
    if (careerPath) {
      const title =
        `${careerPath.title} | เส้นทางอาชีพ`.trim();
      const description =
        careerPath.short_description?.slice(0, 160) ||
        careerPath.tagline?.slice(0, 160) ||
        '';
      const ogImage = careerPath.hero_image_url || '';
      return {
        title,
        description,
        alternates: { canonical: pageUrl },
        openGraph: {
          title,
          description,
          url: pageUrl,
          images: ogImage ? [{ url: ogImage }] : [],
        },
      };
    }
  }

  const resolved = await resolveCourse(segment);
  if (resolved) {
    const { course, extension } = resolved;
    const title =
      extension?.metaTitle?.trim() ||
      `${course.course_name}`;
    const description =
      extension?.metaDescription?.trim() ||
      course.course_teaser?.slice(0, 160) ||
      '';
    const ogImage =
      extension?.ogImage?.trim() || course.course_cover_url || '';

    return {
      title,
      description,
      alternates: { canonical: pageUrl },
      openGraph: {
        title,
        description,
        url: pageUrl,
        images: ogImage ? [{ url: ogImage }] : [],
      },
    };
  }

  // Custom page metadata — lowest priority, after every built-in resolver.
  const cp = await resolveCustomPageForRequest(segment, searchParams);
  if (cp) {
    const customPage = cp.page;
    const base = process.env.NEXT_PUBLIC_SITE_URL;
    const canonical = customPage.canonicalUrl || `${base}/${segment}`;
    const title = customPage.metaTitle || customPage.title;
    const description = customPage.metaDescription || '';
    const ogTitle = customPage.ogTitle || title;
    const ogDesc = customPage.ogDescription || description;
    return {
      title,
      description,
      alternates: { canonical },
      // Force noindex for preview renders so a shared preview URL can never
      // get indexed, regardless of the page's own noIndex setting.
      robots: (cp.isPreview || customPage.noIndex) ? { index: false, follow: false } : undefined,
      openGraph: {
        title: ogTitle,
        description: ogDesc,
        url: canonical,
        type: customPage.ogType || 'website',
        images: customPage.ogImage ? [{ url: customPage.ogImage }] : [],
        siteName: '9Expert Training',
        locale: 'th_TH',
      },
      twitter: {
        card: customPage.twitterCard || 'summary_large_image',
        title: ogTitle,
        description: ogDesc,
        images: customPage.ogImage ? [customPage.ogImage] : [],
      },
    };
  }

  return {};
}

export default async function CatchAllPage({ params, searchParams }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);

  if (!segment) notFound();

  // Program / skill pretty-URL pages (custom admin slug, no prefix).
  // Skip obvious course / career-path suffixes so we don't probe the DB
  // on every course-alias hit. The probe inside loadProgram/loadSkill
  // makes a non-custom slug fall straight through to the logic below.
  if (
    !segment.endsWith('-training-course') &&
    !segment.endsWith('-career-path')
  ) {
    const programData = await loadProgram(segment);
    if (programData) {
      return (
        <ProgramPageClient
          program={programData.program}
          config={programData.config}
          courses={programData.courses}
          earlyBirdMap={programData.earlyBirdMap}
        />
      );
    }

    const skillData = await loadSkill(segment);
    if (skillData) {
      return (
        <SkillPageClient
          skill={skillData.skill}
          coursesByProgram={skillData.coursesByProgram}
          totalCourses={skillData.totalCourses}
        />
      );
    }
  }

  // Career-path detail — handled before course resolution so the
  // `-career-path` suffix can't accidentally match a course alias.
  // 404 when the record is missing or inactive; the duplicate
  // PagePlaceholder fallthrough was removed.
  if (segment.endsWith('-career-path')) {
    const careerPath = await getCareerPathBySlug(segment);
    if (!careerPath || careerPath.is_active === false) notFound();
    return <CareerPathDetail careerPath={careerPath} />;
  }

  // All-courses catalog — public listing filtered by skill or program.
  // We can't tell up-front which one `catalogSlug` refers to, so call
  // listPublicCourses() unfiltered and let the user scan the grid.
  if (segment.endsWith('-all-courses')) {
    const catalogSlug = segment.slice(0, -'-all-courses'.length);
    const { items: courses = [] } = await listPublicCourses().catch(() => ({
      items: [],
    }));
    if (courses.length === 0) notFound();
    return (
      <section className="mx-auto max-w-[1200px] px-4 py-12">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wider text-9e-action">
            หลักสูตรทั้งหมด
          </p>
          <h1 className="mt-1 text-2xl font-bold text-9e-navy md:text-3xl">
            {catalogSlug.replace(/-/g, ' ')}
          </h1>
        </header>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.course_id} course={course} />
          ))}
        </div>
      </section>
    );
  }

  // Course resolver handles both alias and `-training-course` suffix.
  const resolved = await resolveCourse(segment);
  if (resolved) {
    const { course, extension } = resolved;

    // Parallelise schedules + programs. `/programs` carries `programcolor`
    // which the hero gradient uses; the course detail response doesn't
    // include it. If the programs fetch fails we fall through to the
    // skillcolor fallback in CourseDetail.
    const [scheduleRes, programsRes, earlyBirdRes, coursePromosRes] =
      await Promise.allSettled([
        listSchedulesByCourse(course._id, { limit: 10 }),
        listPrograms(),
        getEarlyBirdByCourse(course.course_id),
        getActiveCoursePromos(course.course_id),
      ]);
    const schedules =
      scheduleRes.status === 'fulfilled' ? scheduleRes.value.items : [];
    const programs =
      programsRes.status === 'fulfilled' ? programsRes.value.items : [];
    const earlyBird =
      earlyBirdRes.status === 'fulfilled' ? earlyBirdRes.value : null;
    const coursePromos =
      coursePromosRes.status === 'fulfilled' ? coursePromosRes.value : [];

    // Course + BreadcrumbList JSON-LD (separate <script> tags, as Google
    // recommends). courseUrl mirrors the slug logic in buildCourseJsonLd.
    const courseJsonLd = buildCourseJsonLd({
      course,
      extension,
      schedules,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });
    const courseSlug =
      extension?.urlAlias || `${course.course_id?.toLowerCase?.()}-training-course`;
    const courseUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/${courseSlug}`;
    const breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'หน้าแรก',
          item: process.env.NEXT_PUBLIC_SITE_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: course.program?.program_name ?? 'หลักสูตร',
          item: `${process.env.NEXT_PUBLIC_SITE_URL}/training-course`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: course.course_name,
          item: courseUrl,
        },
      ],
    };

    return (
      <>
        {courseJsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <CourseDetail
          course={course}
          extension={extension}
          schedules={schedules}
          programs={programs}
          earlyBird={earlyBird}
          coursePromos={coursePromos}
        />
      </>
    );
  }

  // ── Custom page — lowest-priority resolver (after course resolution). ──
  const cp = await resolveCustomPageForRequest(segment, searchParams);
  if (cp) {
    const customPage = cp.page;
    const jsonLdData = buildPageJsonLd(customPage, process.env.NEXT_PUBLIC_SITE_URL);
    return (
      <>
        {jsonLdData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
          />
        )}
        {cp.isPreview && (
          <div className="bg-9e-lime/20 border-b border-9e-lime px-4 py-2 text-center text-sm font-medium text-9e-navy">
            ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — เฉพาะผู้ดูแลระบบ
          </div>
        )}
        <CustomPageView page={customPage} />
      </>
    );
  }

  // 301 redirect for renamed custom-page slugs — only reached when nothing
  // else (course/program/skill/career-path/published custom page) matched.
  // permanentRedirect emits 308 (permanent), which throws internally, so it
  // must sit outside any try/catch and be the last thing before notFound().
  const historical = await findCustomPageByHistoricalSlug(segment);
  if (historical?.slug && historical.slug !== segment) {
    permanentRedirect(`/${historical.slug}`);
  }

  notFound();
}

function CourseDetail({
  course,
  extension,
  schedules,
  programs,
  earlyBird,
  coursePromos,
}) {
  const hasSchedules = Boolean(schedules?.length);
  const isInhouseOnly = !course.course_price || Number(course.course_price) === 0;
  const relatedCourses = Array.isArray(course.related_courses)
    ? course.related_courses
    : [];
  const hasRelated = relatedCourses.length > 0;
  const gallery = Array.isArray(extension?.gallery) ? extension.gallery : [];
  // `getEarlyBirdByCourse` joins the linked Promotion as `promotion` so
  // the banner can render the thumbnail without a second DB hit.
  const earlyBirdPromotion = earlyBird?.promotion ?? null;

  // Hero gradient base — prefer the program's `programcolor` (carried on
  // `/programs`, not on the course detail). Fall back to the first
  // skill's `skillcolor`, then a brand blue as a last resort.
  const programMatch = programs?.find((p) => p?._id === course.program?._id);
  const heroColor =
    programMatch?.programcolor ??
    course.skills?.[0]?.skillcolor ??
    '#005CFF';

  return (
    <article className="bg-white">
      <CourseHero course={course} heroColor={heroColor} gallery={gallery} />
      <SkillBreadcrumb course={course} />

      <div className="mx-auto max-w-[1200px] py-8 ">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-10">
            {earlyBird && (
              <EarlyBirdBanner
                earlyBird={earlyBird}
                earlyBirdPromotion={earlyBirdPromotion}
                schedules={schedules}
                course={course}
              />
            )}
            {Array.isArray(coursePromos) && coursePromos.length > 0 && (
              <CoursePromoSection coursePromos={coursePromos} />
            )}
            {!isInhouseOnly && (
              <ScheduleSection
                course={course}
                schedules={schedules}
                earlyBird={earlyBird}
              />
            )}
            <CourseDescription course={course} />
            <CourseObjectives course={course} />
            <CourseTarget course={course} />
            <CoursePrerequisites course={course} />
            <CourseRequirements course={course} />
            <CourseOutline course={course} />
            <CourseRoadmap course={course} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <SidebarNav
              course={course}
              hasSchedules={hasSchedules}
              hasRelated={hasRelated}
            />
            {/* <InhouseCTA courseId={course.course_id} /> */}
            <PDFDownload course={course} />
          </aside>
        </div>
      </div>

      <RelatedCourses courses={relatedCourses} />
    </article>
  );
}
