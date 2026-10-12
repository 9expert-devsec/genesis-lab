import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 2);
}

/** Step 2 — coordinator / attendees / tax / note (กรอกข้อมูล). */
export default function Page({ params }) {
  return <CareerPathRegisterContent params={params} step={2} />;
}
