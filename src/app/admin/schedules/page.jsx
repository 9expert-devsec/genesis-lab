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

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default async function AdminSchedulesPage() {
  // Show the next 3 months of schedules by default. The Month tabs in
  // the client filter inside that window — narrower than the default
  // upstream which returns everything from today onwards.
  const now = new Date();
  const toDate = new Date(now);
  toDate.setMonth(toDate.getMonth() + 3);
  const from = toIsoDate(now);
  const to   = toIsoDate(toDate);

  // MSDB schedules first; we need their ids before fetching sidecars.
  const [scheduleRes, courseRes, instructorRes] = await Promise.allSettled([
    listSchedules({ from, to }),
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
