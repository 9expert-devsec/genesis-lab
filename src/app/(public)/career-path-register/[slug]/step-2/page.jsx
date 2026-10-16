import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';
import { redirectIfMixedCaseSlug } from '../lowercaseSlug';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 2);
}

/** Step 2 — coordinator / attendees / tax / note (กรอกข้อมูล). */
export default async function Page({ params, searchParams }) {
  await redirectIfMixedCaseSlug(params, searchParams, '/step-2');
  return <CareerPathRegisterContent params={params} step={2} />;
}
