import { listPublicCourses } from '@/lib/api/public-courses';
import { InhouseForm } from '@/components/registration/InhouseForm';

export const metadata = {
  title: 'ขอใบเสนอราคาอบรม In-house - 9Expert Training',
  description: 'ส่งคำขออบรมแบบ In-house สำหรับองค์กร ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา',
};

export default async function Page({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const preselectedCourse = typeof sp.course === 'string' ? sp.course.toUpperCase() : null;

  const coursesRes = await listPublicCourses().catch(() => ({ items: [] }));
  const courses = (coursesRes.items ?? []).map((c) => ({
    id:      c.course_id,
    name:    c.course_name,
    program: c.program?.program_name ?? '',
  }));

  return (
    <article className="mx-auto max-w-[920px] px-4 py-10 lg:px-6">
      <InhouseForm courses={courses} preselectedCourse={preselectedCourse} />
    </article>
  );
}