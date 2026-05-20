import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { listPublicCourses } from '@/lib/api/public-courses';
import { CareerPathForm } from '../_components/CareerPathForm';

export const metadata = { title: 'สร้าง Career Path' };
export const dynamic = 'force-dynamic';

export default async function NewCareerPathPage() {
  // We pass the full list so the curriculum item editor can do a local,
  // typeahead-style filter without a roundtrip per keystroke.
  const result = await listPublicCourses().catch(() => ({ items: [] }));
  const courses = (result?.items ?? []).map((c) => ({
    _id:         c._id,
    course_id:   c.course_id,
    course_name: c.course_name ?? c.name ?? '',
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link
        href="/admin/career-paths"
        className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> กลับไปที่รายการ
      </Link>
      <h1 className="text-2xl font-bold text-9e-navy dark:text-white">สร้าง Career Path ใหม่</h1>
      <CareerPathForm courses={courses} />
    </div>
  );
}
