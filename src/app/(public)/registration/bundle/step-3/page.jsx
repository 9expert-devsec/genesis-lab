import { BundlePageContent } from '../BundlePageContent';

export const metadata = {
  title: 'ส่งคำขอสำเร็จ - ขอใบเสนอราคาแพ็กเกจ | 9Expert Training',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/bundle/step-3` },
};

/** Step 3 — the request is in; the reference number lives here. */
export default function Page({ searchParams }) {
  return <BundlePageContent searchParams={searchParams} step={3} />;
}
