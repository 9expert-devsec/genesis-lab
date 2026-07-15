import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { listPrograms } from '@/lib/api/programs';
import { getAllLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { ProgramFaqClient } from './_components/ProgramFaqClient';

export const metadata = { title: 'จัดการ FAQ — โปรแกรม' };
export const dynamic = 'force-dynamic';

/** Stable FAQ ref — prefer the upstream code (`program_id`), fall back to `_id`. */
function programRefId(program) {
  return String(program?.program_id ?? program?._id ?? '');
}

export default async function ProgramFaqsPage({ params }) {
  await requirePage('local_faqs');

  const { id } = await params;
  const res = await listPrograms().catch(() => ({ items: [] }));
  // Tolerant match: resolve by the stable code OR the raw _id (both
  // case-insensitive) so old _id-based links keep working.
  const lower = id.toLowerCase();
  const program = (res.items ?? []).find(
    (p) =>
      programRefId(p).toLowerCase() === lower ||
      String(p._id).toLowerCase() === lower
  );
  if (!program) notFound();

  const faqs = await getAllLocalFaqsForCourse('program', programRefId(program));
  return <ProgramFaqClient program={program} initialFaqs={faqs} />;
}
