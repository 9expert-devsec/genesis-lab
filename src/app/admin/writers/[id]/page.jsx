import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getWriter, listInstructorOptions } from '@/lib/actions/writers';
import { RecordHistory } from '@/components/audit/RecordHistory';
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
  const instructors = await listInstructorOptions(writer.instructorId);

  return (
    <>
      {/* Keyed so moving between two writers cannot keep the first one's state. */}
      <WriterForm key={writer._id} writer={writer} instructors={instructors} />
      <div className="mt-6">
        <RecordHistory menu="writers" entity="writer" recordId={String(writer._id)} />
      </div>
    </>
  );
}
