import { redirect } from 'next/navigation';

/** Rebuild a page's `searchParams` as a `?query` string ('' when empty). */
export function toQueryString(sp) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp ?? {})) {
    if (typeof value === 'string') {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    }
  }
  const query = qs.toString();
  return query ? `?${query}` : '';
}

/**
 * Career-path slugs are lowercase, and the slug lookup is exact, so
 * `/career-path-register/ACCOUNTING-AND-FINANCE` would otherwise render
 * "ยังไม่เปิดรับสมัคร". The legacy-host Cloudflare rule passes the slug through
 * as typed, so mixed case does arrive. Redirect such a URL to its lowercase
 * form — `suffix` is the step segment (e.g. '/step-1', or '' on the bare
 * entry point) — keeping the query string.
 *
 * `redirect()` from a page render is a 307, deliberately not permanent.
 * No-op when the slug is already lowercase.
 */
export async function redirectIfMixedCaseSlug(params, searchParams, suffix) {
  const { slug } = await params;
  const lower = slug.toLowerCase();
  if (lower === slug) return;
  const query = toQueryString(await searchParams);
  redirect(`/career-path-register/${encodeURIComponent(lower)}${suffix}${query}`);
}
