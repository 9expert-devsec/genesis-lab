import { InhousePageContent } from '../InhousePageContent';

export const metadata = { title: 'ส่งคำขอเรียบร้อย - 9Expert Training' };

/** Step 3 — request submitted / thank-you screen. */
export default function Page({ searchParams }) {
  return <InhousePageContent searchParams={searchParams} step={3} />;
}
