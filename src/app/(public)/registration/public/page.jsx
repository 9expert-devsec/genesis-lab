import { redirect } from 'next/navigation';
import { getCourseByCode } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { RegisterWizard } from '@/components/registration/RegisterWizard';

export const metadata = { title: 'สมัครอบรม - 9Expert Training' };

/**
 * Public registration entry point.
 *
 * Expects URL: /registration/public?course=<lowercase-course-id>&class=<schedule-id>
 *
 * `course` is the same lowercase slug used in course detail URLs
 * (e.g. `copilot-stu`); we upper-case it to query upstream, which
 * requires `?course_id=COPILOT-STU` (see docs/api-domains.md).
 */
export default async function Page({ searchParams }) {
  const params = (await searchParams) ?? {};
  const courseSlug = typeof params.course === 'string' ? params.course : null;
  const classId = typeof params.class === 'string' ? params.class : null;

  if (!courseSlug) {
    redirect('/training-course');
  }

  const course = await getCourseByCode(courseSlug.toUpperCase());
  if (!course) {
    redirect('/training-course');
  }

  const { items: schedules } = await listSchedulesByCourse(course._id, {
    limit: 30,
  });
  const classItem = classId ? schedules.find((s) => s._id === classId) : null;

  return (
    <article className="mx-auto max-w-[880px] px-4 py-10 lg:px-6">
      <header className="mb-8">
        {course.program?.program_name && (
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {course.program.program_name}
          </p>
        )}
        <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">
          สมัครอบรม: {course.course_name}
        </h1>
      </header>
      <RegisterWizard
        course={course}
        classItem={classItem}
        allSchedules={schedules}
      />
    </article>
  );
}
