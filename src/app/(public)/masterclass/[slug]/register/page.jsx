import { redirect } from 'next/navigation';

/**
 * Legacy masterclass registration entry point.
 *
 * The wizard now lives under step-prefixed routes
 * (`/masterclass/[slug]/register/step-1|2|3`). Anyone landing on the old
 * `/masterclass/[slug]/register?batch=...` URL — JSON-LD offers, saved links,
 * forwarded messages — is redirected to step 1 with ALL query params preserved.
 *
 * Same shape as the public wizard's legacy entry point; see
 * registration/public/page.jsx.
 */
export default async function Page({ params, searchParams }) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    }
  }

  const query = qs.toString();
  redirect(`/masterclass/${encodeURIComponent(slug)}/register/step-1${query ? `?${query}` : ''}`);
}
