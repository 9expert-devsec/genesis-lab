import { RegisterPageContent } from '../RegisterPageContent';

export const metadata = { title: 'ตรวจสอบข้อมูล - 9Expert Training' };

/** Step 2 — review the submitted information before confirming. */
export default function Page({ searchParams }) {
  return <RegisterPageContent searchParams={searchParams} step={2} />;
}
