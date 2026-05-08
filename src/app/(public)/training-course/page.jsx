import { Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { CourseListClient } from './_components/CourseListClient';

export const metadata = { title: 'หลักสูตรทั้งหมด' };

export default async function Page() {
  let items = [];
  let programOrder = [];
  let fetchError = null;

  try {
    const [coursesResult, rawPrograms] = await Promise.all([
      listPublicCourses(),
      listPrograms().catch(() => ({ items: [] })),
    ]);
    items = await enrichCoursesWithDetails(coursesResult.items);
    // Apply admin-set program order. We pass the names down so the
    // client groups + filter dropdown render in the same sequence.
    const ordered = await getOrderedPrograms(rawPrograms.items ?? []).catch(
      () => rawPrograms.items ?? []
    );
    programOrder = ordered
      .map((p) => p.program_name)
      .filter(Boolean);
  } catch (err) {
    console.error('[training-course]', err);
    fetchError = err.message;
  }

  if (fetchError) {
    return <ErrorState message={fetchError} />;
  }

  // Suspense boundary — CourseListClient reads useSearchParams, which
  // under Next 15 forces dynamic rendering without a boundary above it.
  return (
    <Suspense fallback={null}>
      <CourseListClient items={items} programOrder={programOrder} />
    </Suspense>
  );
}

function ErrorState({ message }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 lg:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-9e-air/20">
          <AlertTriangle className="h-5 w-5 text-9e-action" strokeWidth={1.75} />
        </div>
        <p className="text-base font-semibold text-9e-navy">โหลดข้อมูลไม่สำเร็จ</p>
        <p className="mt-1 text-sm text-9e-slate-dp-50">
          กรุณาลองใหม่อีกครั้ง หรือติดต่อเราหากปัญหายังคงอยู่
        </p>
        {process.env.NODE_ENV !== 'production' && message && (
          <pre className="mt-4 max-w-full overflow-x-auto rounded bg-9e-ice p-3 text-left text-xs text-9e-slate-dp-50">
            {message}
          </pre>
        )}
      </div>
    </div>
  );
}
