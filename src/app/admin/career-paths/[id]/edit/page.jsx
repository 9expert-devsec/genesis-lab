import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { listPublicCourses } from '@/lib/api/public-courses';
import { getAllCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { CareerPathForm } from '../../_components/CareerPathForm';

export const metadata = { title: 'แก้ไข Career Path' };
export const dynamic = 'force-dynamic';

export default async function EditCareerPathPage({ params }) {
  const { id } = await params;

  const [all, coursesResult] = await Promise.all([
    getAllCareerPaths(),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);

  const careerPath = all.find(
    (c) => c._id === id || c.career_path_id === id
  );
  if (!careerPath) notFound();

  const courses = (coursesResult?.items ?? []).map((c) => ({
    _id:         c._id,
    course_id:   c.course_id,
    course_name: c.course_name ?? '',
    course_teaser:        c.course_teaser        ?? '',
    course_trainingdays:  c.course_trainingdays  ?? 0,
    course_traininghours: c.course_traininghours ?? 0,
    course_price:         c.course_netprice ?? c.course_price ?? 0,
    course_cover_url:     c.course_cover_url     ?? '',
    website_urls:         c.website_urls         ?? [],
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link
        href="/admin/career-paths"
        className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> กลับไปที่รายการ
      </Link>
      <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
        แก้ไข Career Path
      </h1>
      <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        {careerPath.api_slug || '—'}
      </p>
      <CareerPathForm careerPath={careerPath} courses={courses} />
    </div>
  );
}
