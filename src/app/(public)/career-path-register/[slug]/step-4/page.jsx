import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';
import { redirectIfMixedCaseSlug } from '../lowercaseSlug';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 4);
}

/** Step 4 — registration submitted / thank-you (เสร็จสิ้น). */
export default async function Page({ params, searchParams }) {
  await redirectIfMixedCaseSlug(params, searchParams, '/step-4');
  return <CareerPathRegisterContent params={params} step={4} />;
}
