import { RegisterPageContent } from '../RegisterPageContent';

export const metadata = { title: 'ลงทะเบียนสำเร็จ - 9Expert Training' };

/** Step 3 — registration complete / thank-you screen. */
export default function Page({ searchParams }) {
  return <RegisterPageContent searchParams={searchParams} step={3} />;
}
