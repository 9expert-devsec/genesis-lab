import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';
import { redirectIfMixedCaseSlug } from '../lowercaseSlug';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 1);
}

/** Step 1 — pick a round for every course in the path (the un-numbered pre-step on screen). */
export default async function Page({ params, searchParams }) {
  await redirectIfMixedCaseSlug(params, searchParams, '/step-1');
  return <CareerPathRegisterContent params={params} step={1} />;
}
