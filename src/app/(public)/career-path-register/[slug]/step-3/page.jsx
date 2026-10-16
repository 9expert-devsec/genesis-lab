import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';
import { redirectIfMixedCaseSlug } from '../lowercaseSlug';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 3);
}

/** Step 3 — read-only preview + submit (ยืนยันข้อมูล). */
export default async function Page({ params, searchParams }) {
  await redirectIfMixedCaseSlug(params, searchParams, '/step-3');
  return <CareerPathRegisterContent params={params} step={3} />;
}
