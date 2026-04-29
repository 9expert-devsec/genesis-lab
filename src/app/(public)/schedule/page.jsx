import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getAllSchedules } from '@/lib/api/schedules';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getSchedulePDF } from '@/lib/actions/schedule-pdf';
import { ScheduleClient } from './_components/ScheduleClient';

export const metadata = {
  title: 'ตารางฝึกอบรม',
  description:
    'ตารางการฝึกอบรมหลักสูตรทั้งหมด Public Training — เลือกเดือน ทักษะ และรูปแบบการอบรม',
};

export const revalidate = 1800;

export default async function SchedulePage() {
  const [coursesResult, programsResult, schedulesResult, schedulePDF] =
    await Promise.all([
      listPublicCourses().catch(() => ({ items: [] })),
      listPrograms().catch(() => ({ items: [] })),
      getAllSchedules().catch(() => ({ items: [] })),
      getSchedulePDF().catch(() => null),
    ]);

  const courses = coursesResult.items ?? [];
  const rawPrograms = programsResult.items ?? [];
  const schedules = schedulesResult.items ?? [];

  // Apply admin-set program order so the table groups appear in the
  // same sequence as the home page + /training-course filter.
  const programs = await getOrderedPrograms(rawPrograms).catch(
    () => rawPrograms
  );

  // Server-side join schedules → courses by course ObjectId, so the
  // client doesn't have to re-derive the map. /schedules items carry
  // the course as a string ObjectId in `course`.
  const schedulesByCourseId = new Map();
  for (const s of schedules) {
    const ref = typeof s.course === 'string' ? s.course : s.course?._id;
    if (!ref) continue;
    const list = schedulesByCourseId.get(String(ref)) ?? [];
    list.push(s);
    schedulesByCourseId.set(String(ref), list);
  }

  // Strip the course list down to the fields the table actually renders
  // and attach this course's schedules. Drops courses with no upcoming
  // schedules — the schedule page is about "what's actually open."
  const coursesWithSchedules = courses
    .map((c) => {
      const list = schedulesByCourseId.get(String(c._id)) ?? [];
      if (list.length === 0) return null;
      return {
        _id: c._id,
        course_id: c.course_id,
        course_name: c.course_name,
        course_trainingdays: c.course_trainingdays ?? null,
        course_price: c.course_price ?? null,
        program: c.program
          ? {
              _id: c.program._id,
              program_id: c.program.program_id,
              program_name: c.program.program_name,
              programiconurl: c.program.programiconurl ?? null,
            }
          : null,
        schedules: list,
      };
    })
    .filter(Boolean);

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
    />
  );
}
