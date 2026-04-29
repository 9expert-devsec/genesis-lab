import { getSchedulePDF } from '@/lib/actions/schedule-pdf';
import SchedulePDFClient from './_components/SchedulePDFClient';

export const metadata = { title: 'ตารางฝึกอบรม PDF' };
export const dynamic = 'force-dynamic';

export default async function SchedulePDFPage() {
  const current = await getSchedulePDF();
  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          ตารางฝึกอบรม PDF
        </h1>
        <p className="mt-1 text-sm text-9e-slate">
          อัปโหลดไฟล์ PDF ตารางฝึกอบรมเพื่อให้ผู้เข้าชมหน้า /schedule ดาวน์โหลดได้
        </p>
      </div>
      <SchedulePDFClient current={current} />
    </div>
  );
}
