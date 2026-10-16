import { MasterclassRegisterContent, masterclassRegisterMetadata } from '../MasterclassRegisterContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return masterclassRegisterMetadata(params, 3);
}

/** Step 3 — registration complete / thank-you screen. */
export default function Page({ params, searchParams }) {
  return <MasterclassRegisterContent params={params} searchParams={searchParams} step={3} />;
}
