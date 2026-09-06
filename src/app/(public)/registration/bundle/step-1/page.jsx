import { BundlePageContent } from '../BundlePageContent';

export const metadata = { title: 'ขอใบเสนอราคาแพ็กเกจ - 9Expert Training' };

/** Step 1 — fill in the quotation request. */
export default function Page({ searchParams }) {
  return <BundlePageContent searchParams={searchParams} step={1} />;
}
