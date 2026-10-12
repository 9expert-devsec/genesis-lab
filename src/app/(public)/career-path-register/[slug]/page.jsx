import { redirect } from 'next/navigation';

/**
 * Legacy career-path registration entry point.
 *
 * The wizard now lives under step-prefixed routes
 * (`/career-path-register/[slug]/step-1|2|3|4`). Anyone landing on the old
 * `/career-path-register/[slug]` URL — the career-path detail CTA's old
 * href, saved links, forwarded messages — is redirected to step 1 with ALL
 * query params preserved.
 *
 * Same shape as the masterclass and public wizards' legacy entry points; see
 * masterclass/[slug]/register/page.jsx.
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
  redirect(`/career-path-register/${encodeURIComponent(slug)}/step-1${query ? `?${query}` : ''}`);
}
