import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getWriter, listInstructorOptions } from '@/lib/actions/writers';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { toOnlineCourseOptions } from '@/lib/writers/writerProfile';
import { WriterForm } from '../_components/WriterForm';

export const metadata = {
  title: 'แก้ไขผู้เขียน',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditWriterPage({ params }) {
  await requirePage('writers');

  const { id } = await params;
  const writer = await getWriter(id);
  if (!writer) notFound();
  const [instructors, online] = await Promise.all([
    listInstructorOptions(writer.instructorId),
    // Best-effort: without it the picker is empty and the rest of the form works.
    getOnlineCourses().catch(() => ({ items: [] })),
  ]);

  return (
    <>
      {/* Keyed so moving between two writers cannot keep the first one's state. */}
      <WriterForm
        key={writer._id}
        writer={writer}
        instructors={instructors}
        onlineCourses={toOnlineCourseOptions(online.items)}
      />
      <div className="mt-6">
        <RecordHistory menu="writers" entity="writer" recordId={String(writer._id)} />
      </div>
    </>
  );
}
