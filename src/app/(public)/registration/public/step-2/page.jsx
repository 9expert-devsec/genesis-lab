import { RegisterPageContent } from '../RegisterPageContent';

export const metadata = {
  title: 'ตรวจสอบข้อมูล - 9Expert Training',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/public/step-2` },
};

/** Step 2 — review the submitted information before confirming. */
export default function Page({ searchParams }) {
  return <RegisterPageContent searchParams={searchParams} step={2} />;
}
