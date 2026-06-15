import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCourseByCode } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { resolveScheduleStatusBatch } from '@/lib/schedule-status';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { getCourseExtension } from '@/lib/actions/course-extensions';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { RegisterWizard } from '@/components/registration/RegisterWizard';

/**
 * Base path for the public registration wizard. The wizard pushes
 * step-prefixed URLs under this path (step-1 / step-2 / step-3).
 */
export const REGISTRATION_BASE_PATH = '/registration/public';

/**
 * Shared page logic for every step of the public registration wizard.
 *
 * The three step routes (`step-1`, `step-2`, `step-3`) each render this
 * with the matching `step` number, so the data fetching + layout stay in
 * one place and the wizard knows which sub-step to show.
 *
 * URL: /registration/public/step-N?course=<lowercase-course-id>&class=<schedule-id>
 *
 * - `course` (required) matches the lowercase slug used in course
 *   detail URLs (e.g. `copilot-stu`). Missing → redirect to catalog.
 * - `class` (optional) pre-selects a card in the carousel.
 */
export async function RegisterPageContent({ searchParams, step }) {
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

  const [{ items: rawSchedules }, earlyBirdMap, ext] = await Promise.all([
    listSchedulesByCourse(course._id, { limit: 20 }),
    getAllActiveEarlyBirdMap().catch(() => ({})),
    getCourseExtension(course.course_id).catch(() => null),
  ]);

  // Apply admin status overrides (open → closed, scheduled changes).
  const schedules = await resolveScheduleStatusBatch(rawSchedules);

  const earlyBirdScheduleId =
    earlyBirdMap[String(course.course_id).toUpperCase()] ?? null;

  // ── Omise online-payment inputs ────────────────────────────────
  // The toggle lives on the CourseExtension sidecar; per-round price
  // overrides live on ScheduleLocal. Resolve both here so the wizard
  // can branch + show prices without an extra client round-trip.
  const omisePaymentEnabled = ext?.omisePaymentEnabled === true;

  const scheduleIds = schedules.map((s) => s._id).filter(Boolean);
  const locals = await getScheduleLocals(scheduleIds).catch(() => []);
  const priceByScheduleId = {};
  for (const row of locals) {
    if (row?.msdb_schedule_id != null && row.price_override != null) {
      priceByScheduleId[row.msdb_schedule_id] = row.price_override;
    }
  }

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
          step={step}
          basePath={REGISTRATION_BASE_PATH}
          omisePaymentEnabled={omisePaymentEnabled}
          coursePrice={course.course_price ?? null}
          priceByScheduleId={priceByScheduleId}
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
        className="mt-4 inline-block text-sm font-semibold text-9e-action underline"
      >
        ติดต่อเรา
      </Link>
    </div>
  );
}
