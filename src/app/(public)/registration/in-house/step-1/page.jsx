import { InhousePageContent } from '../InhousePageContent';

export const metadata = {
  title: 'กรอกข้อมูล - ขอใบเสนอราคา In-house | 9Expert Training',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/in-house/step-1` },
};

/** Step 1 — fill in the In-house requirement form. */
export default function Page({ searchParams }) {
  return <InhousePageContent searchParams={searchParams} step={1} />;
}
