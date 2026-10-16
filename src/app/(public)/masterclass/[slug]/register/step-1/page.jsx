import { MasterclassRegisterContent, masterclassRegisterMetadata } from '../MasterclassRegisterContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return masterclassRegisterMetadata(params, 1);
}

/** Step 1 — fill in the registration form. */
export default function Page({ params, searchParams }) {
  return <MasterclassRegisterContent params={params} searchParams={searchParams} step={1} />;
}
