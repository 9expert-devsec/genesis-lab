import { redirect } from 'next/navigation';

export const metadata = { title: 'สมัครอบรม - 9Expert Training' };

/**
 * Legacy public registration entry point.
 *
 * The wizard now lives under step-prefixed routes
 * (`/registration/public/step-1|2|3`). Anyone landing on the old
 * `/registration/public?course=...&class=...` URL is redirected to
 * step 1 with all query params preserved.
 */
export default async function Page({ searchParams }) {
  const params = (await searchParams) ?? {};

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    }
  }

  const query = qs.toString();
  redirect(`/registration/public/step-1${query ? `?${query}` : ''}`);
}
