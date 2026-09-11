import { RegisterPageContent } from '../RegisterPageContent';

export const metadata = {
  title: 'สมัครอบรม - 9Expert Training',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/public/step-1` },
};

/** Step 1 — fill in the registration form. */
export default function Page({ searchParams }) {
  return <RegisterPageContent searchParams={searchParams} step={1} />;
}
