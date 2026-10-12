import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 3);
}

/** Step 3 — read-only preview + submit (ยืนยันข้อมูล). */
export default function Page({ params }) {
  return <CareerPathRegisterContent params={params} step={3} />;
}
