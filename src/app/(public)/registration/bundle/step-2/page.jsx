import { BundlePageContent } from '../BundlePageContent';

export const metadata = { title: 'ตรวจสอบข้อมูล - ขอใบเสนอราคาแพ็กเกจ | 9Expert Training' };

/** Step 2 — review the package and the submitted information before confirming. */
export default function Page({ searchParams }) {
  return <BundlePageContent searchParams={searchParams} step={2} />;
}
