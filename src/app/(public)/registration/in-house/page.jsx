import { redirect } from 'next/navigation';

export const metadata = {
  title: 'ขอใบเสนอราคาอบรม In-house - 9Expert Training',
  description: 'ส่งคำขออบรมแบบ In-house สำหรับองค์กร ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา',
};

/**
 * Legacy In-house entry point.
 *
 * The flow now lives under step-prefixed routes
 * (`/registration/in-house/step-1|2|3`). Anyone landing on the old
 * `/registration/in-house?course=...` URL is redirected to step 1 with the
 * `course` param preserved so the dropdown can pre-select it.
 */
export default async function Page({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const q = typeof sp.course === 'string' && sp.course ? `?course=${sp.course}` : '';
  redirect(`/registration/in-house/step-1${q}`);
}
