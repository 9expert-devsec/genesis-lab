import { notFound } from 'next/navigation';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';
import { getCourseByCode } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { listSchedulesByCourse } from '@/lib/api/schedules';
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

/**
 * Catch-all route for legacy-style pattern URLs:
 *   /<slug>-training-course      → course detail (real data)
 *   /<slug>-career-path          → career path detail (Phase 3 placeholder)
 *   /<slug>-all-courses          → catalog by skill or program (Phase 3 placeholder)
 *
 * Next.js App Router does not support suffixes on a single dynamic segment
 * (e.g. `[slug]-training-course`), so we route all three patterns through
 * this catch-all and dispatch by suffix.
 */

export const revalidate = 3600;

function segmentFromSlug(slug) {
  const segment = Array.isArray(slug) ? slug.join('/') : String(slug ?? '');
  if (segment.includes('/')) return null;
  return segment;
}

function courseIdFromSegment(segment) {
  if (!segment.endsWith('-training-course')) return null;
  return segment.slice(0, -'-training-course'.length).toUpperCase();
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);
  if (!segment) return {};

  const courseId = courseIdFromSegment(segment);
  if (courseId) {
    const course = await getCourseByCode(courseId);
    if (!course) return { title: 'ไม่พบหลักสูตร' };
    return {
      title: `${course.course_name} | 9Expert Training`,
      description: course.course_teaser?.slice(0, 160),
    };
  }

  return {};
}

export default async function CatchAllPage({ params }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);

  if (!segment) notFound();

  if (segment.endsWith('-training-course')) {
    const courseId = courseIdFromSegment(segment);
    const course = await getCourseByCode(courseId);
    if (!course) notFound();

    // Parallelise schedules + programs. `/programs` carries `programcolor`
    // which the hero gradient uses; the course detail response doesn't
    // include it. If the programs fetch fails we fall through to the
    // skillcolor fallback in CourseDetail.
    const [scheduleRes, programsRes] = await Promise.allSettled([
      listSchedulesByCourse(course._id, { limit: 10 }),
      listPrograms(),
    ]);
    const schedules =
      scheduleRes.status === 'fulfilled' ? scheduleRes.value.items : [];
    const programs =
      programsRes.status === 'fulfilled' ? programsRes.value.items : [];

    return (
      <CourseDetail
        course={course}
        schedules={schedules}
        programs={programs}
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

function CourseDetail({ course, schedules, programs }) {
  const hasSchedules = Boolean(schedules?.length);
  const relatedCourses = Array.isArray(course.related_courses)
    ? course.related_courses
    : [];
  const hasRelated = relatedCourses.length > 0;

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

      <div className="mx-auto max-w-[1280px] px-4 py-8 lg:px-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-10">
            <ScheduleSection course={course} schedules={schedules} />
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
