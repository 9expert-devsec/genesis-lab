import { getAllRecruits } from '@/lib/actions/recruits';
import { RecruitsAdminClient } from './_components/RecruitsAdminClient';

export const metadata = { title: 'จัดการประกาศงาน' };
export const dynamic = 'force-dynamic';

export default async function RecruitsAdminPage() {
  const recruits = await getAllRecruits();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          จัดการประกาศงาน
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          สร้าง แก้ไข และจัดการตำแหน่งงานที่แสดงบนหน้า /join-us
        </p>
      </div>
      <RecruitsAdminClient initialRecruits={recruits} />
    </div>
  );
}
