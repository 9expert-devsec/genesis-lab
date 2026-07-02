import { listSchedules } from '@/lib/api/schedules';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { requirePage } from '@/lib/rbac/guard';
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
  await requirePage('schedules');

  // 4-month window — current month + next 3. The page renders one
  // column per month, so this defines the visible horizon. We pass a
  // wide `to` so MSDB returns everything that could fall into one of
  // the displayed columns (filter on the client by `dates[0]`).
  const now = new Date();
  const toDate = new Date(now);
  toDate.setMonth(toDate.getMonth() + 4);

  const [scheduleRes, courseRes, programRes, instructorRes] =
    await Promise.allSettled([
      // revalidate: 0 — admin table must reflect a just-written row
      // immediately after `router.refresh()`. The `schedules` tag is
      // still attached so revalidateTag(...) busts public ISR caches.
      listSchedules({
        from: toIsoDate(now),
        to:   toIsoDate(toDate),
        revalidate: 0,
      }),
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
