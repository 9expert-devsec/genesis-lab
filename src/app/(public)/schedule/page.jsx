import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export const metadata = { title: 'ตารางอบรม' };

export default function Page() {
  return (
    <PagePlaceholder
      title="ตารางอบรม"
      description="ดูตารางอบรมประจำเดือนทั้งหมด พร้อม filter ตามคอร์ส วันที่ และช่วงเวลา"
      phase="Phase 2"
    />
  );
}
