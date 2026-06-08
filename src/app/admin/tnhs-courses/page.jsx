import { getAllTnhsCourses } from '@/lib/actions/tnhs-courses';
import { TnhsCourseForm } from './_components/TnhsCourseForm';
import { TnhsCourseList } from './_components/TnhsCourseList';

export const metadata = { title: 'TNHS Courses' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const courses = await getAllTnhsCourses();
  const activeCount = courses.filter((c) => c.is_active).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-9e-navy">TNHS Courses</h1>
        <p className="text-sm text-9e-slate-dp-50">
          {activeCount} / {courses.length} active
        </p>
      </div>

      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-9e-navy">เพิ่ม Course</h2>
        <TnhsCourseForm />
      </div>

      <TnhsCourseList courses={courses} />
    </div>
  );
}
