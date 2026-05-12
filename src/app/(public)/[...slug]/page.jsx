import { notFound } from 'next/navigation';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';
import { listPrograms } from '@/lib/api/programs';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { resolveCourse } from '@/lib/resolveCourse';
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
import { CourseGallery } from './_components/CourseGallery';
import { EarlyBirdBanner } from './_components/EarlyBirdBanner';
import { CoursePromoSection } from './_components/CoursePromoSection';
import {
  getEarlyBirdByCourse,
  getActiveCoursePromos,
} from '@/lib/actions/course-promos';

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

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);
  if (!segment) return {};

  const resolved = await resolveCourse(segment);
  if (!resolved) return {};

  const { course, extension } = resolved;
  const title =
    extension?.metaTitle?.trim() ||
    `${course.course_name} | 9Expert Training`;
  const description =
    extension?.metaDescription?.trim() ||
    course.course_teaser?.slice(0, 160) ||
    '';
  const ogImage =
    extension?.ogImage?.trim() || course.course_cover_url || '';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function CatchAllPage({ params }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);

  if (!segment) notFound();

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

    return (
      <CourseDetail
        course={course}
        extension={extension}
        schedules={schedules}
        programs={programs}
        earlyBird={earlyBird}
        coursePromos={coursePromos}
      />
    );
  }

  if (segment.endsWith('-career-path')) {
    const pathSlug = segment.slice(0, -'-career-path'.length);
    return (
      <PagePlaceholder
        title={`เส้นทางอาชีพ: ${pathSlug}`}
        description="รายละเอียดเส้นทางอาชีพ ทักษะที่จำเป็น และหลักสูตรแนะนำ — เชื่อมต่อ /api/ai/career-path ใน Phase 3"
        phase="Phase 3"
      />
    );
  }

  if (segment.endsWith('-all-courses')) {
    const catalogSlug = segment.slice(0, -'-all-courses'.length);
    return (
      <PagePlaceholder
        title={`หลักสูตรทั้งหมด: ${catalogSlug}`}
        description="รวมหลักสูตรตาม Skill หรือ Program — filter จาก /api/ai/public-courses ใน Phase 3"
        phase="Phase 3"
      />
    );
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
      <CourseHero course={course} heroColor={heroColor} />
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
            {gallery.length > 0 && (
              <section aria-label="แกลเลอรี่หลักสูตร">
                <CourseGallery gallery={gallery} />
              </section>
            )}
            <ScheduleSection
              course={course}
              schedules={schedules}
              earlyBird={earlyBird}
            />
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
            <InhouseCTA />
            <PDFDownload course={course} />
          </aside>
        </div>
      </div>

      <RelatedCourses courses={relatedCourses} />
    </article>
  );
}
