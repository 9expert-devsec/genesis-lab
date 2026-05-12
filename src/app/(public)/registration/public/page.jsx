import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCourseByCode } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { resolveScheduleStatusBatch } from '@/lib/schedule-status';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { RegisterWizard } from '@/components/registration/RegisterWizard';

export const metadata = { title: 'สมัครอบรม - 9Expert Training' };

/**
 * Public registration entry point.
 *
 * URL: /registration/public?course=<lowercase-course-id>&class=<schedule-id>
 *
 * - `course` (required) matches the lowercase slug used in course
 *   detail URLs (e.g. `copilot-stu`). Missing → redirect to catalog.
 * - `class` (optional) pre-selects a card in the carousel.
 */
export default async function Page({ searchParams }) {
  const params = (await searchParams) ?? {};
  const courseSlug = typeof params.course === 'string' ? params.course : null;
  const initialClassId = typeof params.class === 'string' ? params.class : null;

  if (!courseSlug) {
    redirect('/training-course');
  }

  const course = await getCourseByCode(courseSlug.toUpperCase());
  if (!course) {
    redirect('/training-course');
  }

  const [{ items: rawSchedules }, earlyBirdMap] = await Promise.all([
    listSchedulesByCourse(course._id, { limit: 20 }),
    getAllActiveEarlyBirdMap().catch(() => ({})),
  ]);

  // Apply admin status overrides (open → closed, scheduled changes).
  const schedules = await resolveScheduleStatusBatch(rawSchedules);

  const earlyBirdScheduleId =
    earlyBirdMap[String(course.course_id).toUpperCase()] ?? null;

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

      {schedules.length === 0 ? (
        <EmptyState />
      ) : (
        <RegisterWizard
          course={course}
          schedules={schedules}
          initialClassId={initialClassId}
          earlyBirdScheduleId={earlyBirdScheduleId}
        />
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] px-6 py-12 text-center">
      <h2 className="text-xl font-semibold text-[var(--text-primary)]">
        ยังไม่มีรอบเปิดรับสมัคร
      </h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        กรุณาติดต่อทีมขายเพื่อสอบถามรอบถัดไป
      </p>
      <Link
        href="/contact-us"
        className="mt-4 inline-block text-sm font-semibold text-9e-brand underline"
      >
        ติดต่อเรา
      </Link>
    </div>
  );
}
