import { listSchedules } from '@/lib/api/schedules';
import { listPublicCourses } from '@/lib/api/public-courses';
import { SchedulesAdminClient } from './_components/SchedulesAdminClient';

export const metadata = {
  title: 'จัดการตารางอบรม',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminSchedulesPage() {
  const [scheduleRes, courseRes] = await Promise.allSettled([
    listSchedules(),
    listPublicCourses(),
  ]);

  const schedules =
    scheduleRes.status === 'fulfilled' ? scheduleRes.value.items ?? [] : [];
  const courses =
    courseRes.status === 'fulfilled' ? courseRes.value.items ?? [] : [];

  return (
    <div className="mx-auto max-w-6xl">
      <SchedulesAdminClient schedules={schedules} courses={courses} />
    </div>
  );
}
