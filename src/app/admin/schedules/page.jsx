import { ADMIN_SCHEDULE_STATUSES, listSchedules } from '@/lib/api/schedules';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { requirePage } from '@/lib/rbac/guard';
import {
  adminScheduleWindow,
  resolveAdminScheduleRange,
} from '@/lib/adminScheduleHorizon';
import { SchedulesAdminClient } from './_components/SchedulesAdminClient';

export const metadata = {
  title: 'จัดการตารางอบรม',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Filters — including the month range — live in searchParams, not client
 * state: see SchedulesAdminClient's header note and
 * test/fs/urlFilterNoState.test.mjs, which now guards this screen too.
 */
export default async function AdminSchedulesPage({ searchParams }) {
  await requirePage('schedules');

  const sp = (await searchParams) ?? {};
  const one = (key) => {
    const raw = sp?.[key];
    return (Array.isArray(raw) ? raw[0] : raw ?? '').toString();
  };
  const search = one('search');
  const filterProgram = one('filterProgram');
  const filterStatus = one('filterStatus');

  // `now` is read ONCE and threaded through both calls below, so the
  // resolved range and the fetch bound derived from it cannot disagree by a
  // moment crossed between two separate `new Date()` reads.
  const now = new Date();
  const { from: monthFrom, to: monthTo } = resolveAdminScheduleRange(now, {
    fromKey: one('monthFrom') || undefined,
    toKey: one('monthTo') || undefined,
  });

  // The grid renders one column per month; this window must be the SAME
  // window the admin selected. `adminScheduleWindow` derives `to` from the
  // last rendered column (its last day) rather than adding N months to
  // today, so MSDB cannot return a row that lands outside every column and
  // gets dropped client-side — which is what the old `today + 4 months`
  // bound did to anything dated after the final column. See
  // src/lib/adminScheduleHorizon.js.
  const { from, to } = adminScheduleWindow(now, {
    fromKey: monthFrom,
    toKey: monthTo,
  });

  const [scheduleRes, courseRes, programRes, instructorRes] =
    await Promise.allSettled([
      // revalidate: 0 — admin table must reflect a just-written row
      // immediately after `router.refresh()`. The `schedules` tag is
      // still attached so revalidateTag(...) busts public ISR caches.
      //
      // status: all — the admin table must NEVER read the public-filtered
      // feed. Without this, `/schedules` hands back only the registerable
      // statuses, so an admin who set a round to เต็ม watched it disappear
      // from the very grid they set it in, with no way to set it back. `all`
      // rather than the explicit public trio is deliberate: this is the one
      // surface where a status MSDB adds later must show up unannounced.
      listSchedules({ from, to, status: ADMIN_SCHEDULE_STATUSES, revalidate: 0 }),
      // includeHidden — admin picker AND the name column for existing rounds.
      // A round already scheduled for a course that has since been hidden must
      // still identify itself by name.
      listPublicCourses({ includeHidden: true }),
      listPrograms(),
      listInstructorsForAdmin(),
    ]);

  const schedules =
    scheduleRes.status === 'fulfilled' ? scheduleRes.value.items ?? [] : [];
  const courses =
    courseRes.status === 'fulfilled' ? courseRes.value.items ?? [] : [];
  const programs =
    programRes.status === 'fulfilled' ? programRes.value.items ?? [] : [];
  const instructors =
    instructorRes.status === 'fulfilled' ? instructorRes.value : [];

  const scheduleLocals = await getScheduleLocals();

  return (
    <div>
      <SchedulesAdminClient
        schedules={schedules}
        courses={courses}
        programs={programs}
        scheduleLocals={scheduleLocals}
        instructors={instructors}
        search={search}
        filterProgram={filterProgram}
        filterStatus={filterStatus}
        monthFrom={monthFrom}
        monthTo={monthTo}
      />
    </div>
  );
}
