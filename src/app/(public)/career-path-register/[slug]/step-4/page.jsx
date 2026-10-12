import { CareerPathRegisterContent, careerPathRegisterMetadata } from '../CareerPathRegisterContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return careerPathRegisterMetadata(params, 4);
}

/** Step 4 — registration submitted / thank-you (เสร็จสิ้น). */
export default function Page({ params }) {
  return <CareerPathRegisterContent params={params} step={4} />;
}
