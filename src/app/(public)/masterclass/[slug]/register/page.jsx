import { notFound } from 'next/navigation';
import { getMasterclassBySlug } from '@/lib/masterclass/getMasterclass';
import { MasterclassRegisterClient } from './_components/MasterclassRegisterClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const course = await getMasterclassBySlug(slug);
  return {
    title: course ? `สมัคร: ${course.title_th} | Masterclass` : 'สมัครอบรม Masterclass',
  };
}

export default async function MasterclassRegisterPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const batchId = typeof sp?.batch === 'string' ? sp.batch : null;

  const course = await getMasterclassBySlug(slug);
  if (!course) notFound();

  // Find the batch from course.batches (already loaded by getMasterclassBySlug)
  const batch = batchId
    ? course.batches?.find((b) => String(b._id) === batchId) ?? null
    : course.batches?.find((b) => b.status === 'open') ?? null;

  if (!batch || batch.status !== 'open') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">รุ่นนี้ไม่เปิดรับสมัคร</h1>
        <p className="mt-3 text-sm text-gray-500">กรุณาตรวจสอบรุ่นที่เปิดรับสมัครในหน้าหลักสูตร</p>
      </div>
    );
  }

  return <MasterclassRegisterClient course={course} batch={batch} />;
}
