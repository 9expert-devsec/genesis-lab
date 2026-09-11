import { InhousePageContent } from '../InhousePageContent';

export const metadata = {
  title: 'ตรวจสอบข้อมูล - ขอใบเสนอราคา In-house | 9Expert Training',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/in-house/step-2` },
};

/** Step 2 — review the In-house request before sending. */
export default function Page({ searchParams }) {
  return <InhousePageContent searchParams={searchParams} step={2} />;
}
