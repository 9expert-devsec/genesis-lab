import { redirect } from 'next/navigation';

export const metadata = { title: 'ขอใบเสนอราคาแพ็กเกจ - 9Expert Training' };

/**
 * Legacy bundle quotation entry point.
 *
 * The wizard now lives under step-prefixed routes
 * (`/registration/bundle/step-1|2|3`). Anyone landing on the old
 * `/registration/bundle?page=…&section=…` URL is redirected to step 1 with all
 * query params preserved.
 *
 * ── THIS REDIRECT IS LOAD-BEARING, NOT TIDINESS ───────────────────────────
 * The bare URL is what `promotion_bundle.jsx` builds for its ลงทะเบียน button
 * (`bundleRegisterHref`), and it is a link that lives in bookmarks, in
 * forwarded messages and in whatever a customer saved last month. The PAIR is
 * the whole lookup key: dropping either half lands on a page that resolves
 * nothing, so the query string is rebuilt in full rather than reconstructed
 * from the two params this route happens to know about — a third param added to
 * that link later must survive this hop without anyone remembering to come
 * back here.
 *
 * Same shape as the public wizard's own legacy entry point; see
 * registration/public/page.jsx.
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
  redirect(`/registration/bundle/step-1${query ? `?${query}` : ''}`);
}
