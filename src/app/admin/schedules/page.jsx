import { listSchedules } from '@/lib/api/schedules';
import { listPublicCourses } from '@/lib/api/public-courses';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { SchedulesAdminClient } from './_components/SchedulesAdminClient';

export const metadata = {
  title: 'จัดการตารางอบรม',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminSchedulesPage() {
  // MSDB schedules first; we need their ids before fetching sidecars.
  const [scheduleRes, courseRes, instructorRes] = await Promise.allSettled([
    listSchedules(),
    listPublicCourses(),
    listInstructorsForAdmin(),
  ]);

  const schedules =
    scheduleRes.status === 'fulfilled' ? scheduleRes.value.items ?? [] : [];
  const courses =
    courseRes.status === 'fulfilled' ? courseRes.value.items ?? [] : [];
  const instructors =
    instructorRes.status === 'fulfilled' ? instructorRes.value : [];

  // Pull sidecar metadata for the visible schedules in one round-trip.
  const localsByMsdbId = await getScheduleLocals(
    schedules.map((s) => String(s._id))
  );

  return (
    <div className="mx-auto max-w-6xl">
      <SchedulesAdminClient
        schedules={schedules}
        courses={courses}
        instructors={instructors}
        localsByMsdbId={localsByMsdbId}
      />
    </div>
  );
}
