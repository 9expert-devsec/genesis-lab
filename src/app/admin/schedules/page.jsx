import { ADMIN_SCHEDULE_STATUSES, listSchedules } from '@/lib/api/schedules';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { requirePage } from '@/lib/rbac/guard';
import { adminScheduleWindow } from '@/lib/adminScheduleHorizon';
import { SchedulesAdminClient } from './_components/SchedulesAdminClient';

export const metadata = {
  title: 'จัดการตารางอบรม',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminSchedulesPage() {
  await requirePage('schedules');

  // The grid renders one column per month; this window must be the SAME
  // window. `adminScheduleWindow` derives `to` from the last rendered
  // column (its last day) rather than adding N months to today, so MSDB
  // cannot return a row that lands outside every column and gets dropped
  // client-side — which is what the old `today + 4 months` bound did to
  // anything dated after the final column. Both sides read
  // ADMIN_SCHEDULE_MONTHS; see src/lib/adminScheduleHorizon.js.
  const { from, to } = adminScheduleWindow();

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
      listPublicCourses(),
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
      />
    </div>
  );
}
