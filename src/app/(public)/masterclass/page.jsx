import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
import { MasterclassListingClient } from './_components/MasterclassListingClient';

// ISR, not force-dynamic. Course content changes revalidate '/masterclass'
// from lib/actions/masterclass.js; batch state (open/full) changes on
// registration and payment, and those actions now revalidate the public paths
// too — see revalidateMasterclassPublic in lib/actions/masterclass-registrations.js.
export const revalidate = 3600;

export const metadata = {
  title: 'Masterclass — 9Expert Training',
  description:
    'เรียนเข้มข้นแบบ Workshop เต็มวัน เฉพาะเสาร์-อาทิตย์ กลุ่มเล็ก ลงมือปฏิบัติจริงกับผู้เชี่ยวชาญ 9Expert',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/masterclass` },
};

export default async function MasterclassListingPage() {
  const courses = await getPublishedMasterclasses();
  return <MasterclassListingClient courses={courses} />;
}
