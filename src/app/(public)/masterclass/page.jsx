import { getPublishedMasterclasses, getLocalFaqs } from '@/lib/masterclass/getMasterclass';
import { MasterclassListingClient } from './_components/MasterclassListingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Masterclass — 9Expert Training',
  description:
    'เรียนเข้มข้นแบบ Workshop เต็มวัน เฉพาะเสาร์-อาทิตย์ กลุ่มเล็ก ลงมือปฏิบัติจริงกับผู้เชี่ยวชาญ 9Expert',
};

export default async function MasterclassListingPage() {
  const [courses, faqs] = await Promise.all([
    getPublishedMasterclasses(),
    getLocalFaqs('masterclass'),
  ]);
  return <MasterclassListingClient courses={courses} faqs={faqs} />;
}
