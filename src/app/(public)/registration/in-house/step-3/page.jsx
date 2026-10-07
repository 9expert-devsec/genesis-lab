import { InhousePageContent } from '../InhousePageContent';

export const metadata = {
  title: 'ส่งคำขอเรียบร้อย',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/in-house/step-3` },
};

/** Step 3 — request submitted / thank-you screen. */
export default function Page({ searchParams }) {
  return <InhousePageContent searchParams={searchParams} step={3} />;
}
