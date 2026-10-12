import { notFound } from 'next/navigation';
import { getMasterclassBySlug } from '@/lib/masterclass/getMasterclass';
import { MasterclassRegisterClient } from './_components/MasterclassRegisterClient';

/** Shared metadata for the step routes — same title on every step, per-step canonical. */
export async function masterclassRegisterMetadata(params, step) {
  const { slug } = await params;
  const course = await getMasterclassBySlug(slug);
  return {
    title: course ? `สมัคร: ${course.title_th} | Masterclass` : 'สมัครอบรม Masterclass',
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/masterclass/${slug}/register/step-${step}`,
    },
  };
}

/**
 * Shared body of `/masterclass/[slug]/register/step-1|2|3`.
 *
 * ── STEP 3 SKIPS THE "OPEN" CHECK, AND THAT IS NOT A LOOSENING ────────────
 * Step 3 is the receipt for a registration that already happened. The seat it
 * paid for may have been the last one, which flips the batch to `full` before
 * the browser has even navigated here — gating step 3 on `open` would turn the
 * last buyer's success screen into "รุ่นนี้ไม่เปิดรับสมัคร". Steps 1 and 2 still
 * require an open batch: they are where a registration is made.
 */
export async function MasterclassRegisterContent({ params, searchParams, step }) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const batchId = typeof sp.batch === 'string' ? sp.batch : null;

  const course = await getMasterclassBySlug(slug);
  if (!course) notFound();

  // Find the batch from course.batches (already loaded by getMasterclassBySlug)
  const batch = batchId
    ? course.batches?.find((b) => String(b._id) === batchId) ?? null
    : course.batches?.find((b) => b.status === 'open') ?? null;

  if (!batch || (step !== 3 && batch.status !== 'open')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">รุ่นนี้ไม่เปิดรับสมัคร</h1>
        <p className="mt-3 text-sm text-gray-500">กรุณาตรวจสอบรุ่นที่เปิดรับสมัครในหน้าหลักสูตร</p>
      </div>
    );
  }

  return <MasterclassRegisterClient course={course} batch={batch} step={step} />;
}
