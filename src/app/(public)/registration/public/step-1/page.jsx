import { RegisterPageContent } from '../RegisterPageContent';

export const metadata = { title: 'สมัครอบรม - 9Expert Training' };

/** Step 1 — fill in the registration form. */
export default function Page({ searchParams }) {
  return <RegisterPageContent searchParams={searchParams} step={1} />;
}
