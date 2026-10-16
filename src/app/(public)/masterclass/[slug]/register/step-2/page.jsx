import { MasterclassRegisterContent, masterclassRegisterMetadata } from '../MasterclassRegisterContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return masterclassRegisterMetadata(params, 2);
}

/** Step 2 — review, then pay (card / PromptPay) or request a quotation. */
export default function Page({ params, searchParams }) {
  return <MasterclassRegisterContent params={params} searchParams={searchParams} step={2} />;
}
