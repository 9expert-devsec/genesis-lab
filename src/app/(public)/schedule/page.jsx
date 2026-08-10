import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { PUBLIC_SCHEDULE_STATUSES, getAllSchedules } from '@/lib/api/schedules';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getSchedulePDF } from '@/lib/actions/schedule-pdf';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { joinCourseSchedules } from '@/lib/schedule/joinCourseSchedules';
import { ScheduleClient } from './_components/ScheduleClient';

export const metadata = {
  title: 'ตารางฝึกอบรม',
  description:
    'ตารางการฝึกอบรมหลักสูตรทั้งหมด Public Training — เลือกเดือน ทักษะ และรูปแบบการอบรม',
};

export const revalidate = 1800;

export default async function SchedulePage() {
  const [
    coursesResult,
    programsResult,
    schedulesResult,
    schedulePDF,
    earlyBirdMap,
  ] = await Promise.all([
    listPublicCourses().catch(() => ({ items: [] })),
    listPrograms().catch(() => ({ items: [] })),
    // All three statuses, so a sold-out round renders as เต็ม (unclickable)
    // instead of being absent. A round the user can see is full is strictly
    // more informative than a gap they cannot interpret.
    getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES }).catch(() => ({
      items: [],
    })),
    getSchedulePDF().catch(() => null),
    getAllActiveEarlyBirdMap().catch(() => ({})),
  ]);

  const courses = coursesResult.items ?? [];
  const rawPrograms = programsResult.items ?? [];
  const schedules = schedulesResult.items ?? [];

  // Apply admin-set program order so the table groups appear in the
  // same sequence as the home page + /training-course filter.
  const programs = await getOrderedPrograms(rawPrograms).catch(
    () => rawPrograms
  );

  // Server-side join schedules → courses by course ObjectId, so the client
  // doesn't have to re-derive the map. Courses with no upcoming schedule are
  // dropped — the schedule page is about "what's actually open."
  const {
    rows: coursesWithSchedules,
    dropped,
    orphans,
  } = joinCourseSchedules(courses, schedules);

  // Reconcile-and-warn. The drop above is correct but lossy and silent: a course
  // missing because upstream filtered its schedule out (empty `signup_url` →
  // excluded from /schedules) is indistinguishable from one correctly absent.
  // ONE line per render, codes capped so the log stays readable.
  if (dropped.length > 0 || orphans.length > 0) {
    const shown = dropped.slice(0, 10).join(', ');
    const more = dropped.length > 10 ? `, +${dropped.length - 10} more` : '';
    const orphanRows = orphans.reduce((n, o) => n + o.count, 0);
    console.warn(
      `[schedule] joined ${coursesWithSchedules.length}/${courses.length} courses ` +
        `from ${schedules.length} schedules — dropped ${dropped.length} with zero ` +
        `upcoming schedules (${shown}${more}), ${orphanRows} orphan schedules`
    );
  }

  // Reduce programs payload to what the filter dropdown needs.
  const programsLite = programs.map((p) => ({
    _id: p._id,
    program_id: p.program_id,
    program_name: p.program_name,
  }));

  return (
    <ScheduleClient
      courses={coursesWithSchedules}
      programs={programsLite}
      schedulePDF={schedulePDF}
      earlyBirdMap={earlyBirdMap}
    />
  );
}
