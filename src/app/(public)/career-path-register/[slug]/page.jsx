import { redirect } from 'next/navigation';
import { redirectIfMixedCaseSlug, toQueryString } from './lowercaseSlug';

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
  await redirectIfMixedCaseSlug(params, searchParams, '');

  const { slug } = await params;
  const query = toQueryString(await searchParams);
  redirect(`/career-path-register/${encodeURIComponent(slug)}/step-1${query}`);
}
