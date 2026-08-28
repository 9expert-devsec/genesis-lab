import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';
import {
  PUBLIC_SCHEDULE_STATUSES,
  listSchedulesByCourse,
} from '@/lib/api/schedules';
import { resolveScheduleStatusBatch } from '@/lib/schedule-status';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { getCourseExtension } from '@/lib/actions/course-extensions';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { siteCurrentYear, siteTodayKey } from '@/lib/articlePublishTime';
import {
  excludeStartedRounds,
  startedRounds,
} from '@/lib/schedule/roundHasStarted';
import { RegisterWizard } from '@/components/registration/RegisterWizard';
import { courseHref } from '@/lib/utils';

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

  // Two separate blocks, deliberately. `redirect()` works by THROWING
  // NEXT_REDIRECT, so the try must wrap ONLY the upstream call — pull the
  // `if (!course) redirect(...)` inside it and the catch swallows the redirect
  // and reports it as an upstream failure. Do not "simplify" these into one
  // try/catch.
  //
  // The two outcomes are logged apart because they mean opposite things: a miss
  // is a bad or stale link, a throw is upstream being down. Without this the
  // user is bounced to the catalog with no server-side trace either way.
  // .toUpperCase() STAYS. It is what makes the 72 already-uppercase courses hit
  // the direct call inside the helper; passing the raw lowercase slug would miss
  // it every time and push all 77 onto the list fallback.
  const attempted = courseSlug.toUpperCase();
  let course = null;
  try {
    course = await getCourseByCodeInsensitive(attempted);
  } catch (err) {
    console.warn(
      `[registration] upstream lookup FAILED for course_id="${attempted}" ` +
        `(from ?course=${courseSlug}): ${err?.message}`
    );
    throw err;
  }
  if (!course) {
    console.warn(
      `[registration] no course for course_id="${attempted}" ` +
        `(from ?course=${courseSlug}) — redirecting to /training-course`
    );
    redirect('/training-course');
  }

  const [{ items: rawSchedules }, earlyBirdMap, ext] = await Promise.all([
    // All three statuses. A `?class=` deep link to a sold-out round used to
    // land on a wizard whose carousel did not contain it — step 1 rendered
    // nothing and said nothing. The round has to ARRIVE before RegisterWizard
    // can tell the user it is full.
    /**
     * ── `includeStarted`, ON A PUBLIC PAGE, AND IT IS NOT A LOOPHOLE ─────────
     *
     * A round that has begun is NOT bookable and never reaches the carousel —
     * the partition below is what removes it, using the same predicate the
     * fetch layer applies by default. This page opts out of the fetch-level
     * filter only so it can SEE the excluded rounds and tell the visitor which
     * of two things went wrong.
     *
     * `?class=` links live in bookmarks, emails and shared messages, and
     * /schedule is ISR-cached for 30 minutes, so for half an hour after
     * midnight the public table still renders a live link to a round that
     * started at 00:00. Without this, that click lands on a carousel with the
     * round silently absent — a documented dead end (see RegisterWizard, where
     * a `?class=` id resolving to nothing fails closed and says nothing). That
     * silence is acceptable for a stale or bogus id and NOT acceptable for a
     * round we deliberately hid this morning.
     *
     * The two states have different remedies — "pick another round" versus
     * "this link is stale" — so they are kept apart rather than merged into one
     * message. That distinction is only makeable HERE, because after the fetch
     * filter both look identical: absent.
     */
    listSchedulesByCourse(course._id, {
      limit: 20,
      status: PUBLIC_SCHEDULE_STATUSES,
      includeStarted: true,
    }),
    getAllActiveEarlyBirdMap().catch(() => ({})),
    getCourseExtension(course.course_id).catch(() => null),
  ]);

  // Apply admin status overrides (open → closed, scheduled changes).
  const resolved = await resolveScheduleStatusBatch(rawSchedules);

  /**
   * THE PARTITION. One clock read, one predicate, two disjoint lists.
   *
   * `todayKey` is read ONCE and threaded into both calls rather than each
   * deriving its own — two reads either side of midnight could put the same
   * round in both lists or in neither, and the wizard's message would then
   * depend on which of two Dates won.
   *
   * `schedules` is exactly what the fetch layer would have returned with the
   * default filter, so the carousel, the wizard and every other public surface
   * still agree about what is bookable. `startedScheduleIds` carries only ids —
   * the wizard needs to recognise one, never to render one.
   */
  const todayKey = siteTodayKey();
  const schedules = excludeStartedRounds(resolved, todayKey);
  const startedScheduleIds = startedRounds(resolved, todayKey)
    .map((s) => String(s?._id ?? ''))
    .filter(Boolean);

  const earlyBirdScheduleId =
    earlyBirdMap[String(course.course_id).toUpperCase()] ?? null;

  // Back-link target for step 1 — the detail page of the course being
  // registered for, not the catalog.
  //
  // Legacy "<course_id lowercased>-training-course" slug, matching CourseCard.
  // Deliberately NOT `ext.urlAlias`: aliases are stored WITH a leading slash
  // (normalizeAlias in course-extensions.js) and are not required to carry the
  // '-training-course' suffix, so courseHref would turn `/foo` into
  // `//foo-training-course` — a URL resolveCourse cannot match by either of its
  // two paths. The legacy slug always resolves via resolveCourse's path 2.
  //
  // courseHref('') already returns '/training-course', so a course with no id
  // falls back to the catalog without a second guard here.
  const courseDetailHref = courseHref(
    course.course_id ? String(course.course_id).toLowerCase() : ''
  );

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
          startedScheduleIds={startedScheduleIds}
          initialClassId={initialClassId}
          earlyBirdScheduleId={earlyBirdScheduleId}
          step={step}
          basePath={REGISTRATION_BASE_PATH}
          courseDetailHref={courseDetailHref}
          omisePaymentEnabled={omisePaymentEnabled}
          coursePrice={course.course_price ?? null}
          priceByScheduleId={priceByScheduleId}
          currentYear={siteCurrentYear()}
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
