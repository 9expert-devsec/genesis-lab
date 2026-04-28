/**
 * Reviews adapter.
 *
 * Upstream: https://reviews.9experttraining.com/api/public/reviews
 * Envelope: { ok, items }
 *
 * The reviews service is a separate app from the AI MSDB API used by
 * the rest of the site, so this adapter does not go through the
 * `aiFetch` client. No auth header is required (public endpoint).
 */

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const REVIEWS_URL =
  process.env.NEXT_PUBLIC_REVIEWS_URL ??
  'https://reviews.9experttraining.com/api/public/reviews';

const REVIEWS_TIMEOUT_MS = 10_000;

export async function getAllReviews() {
  try {
    const res = await fetchWithTimeout(
      REVIEWS_URL,
      { next: { revalidate: 3600, tags: ['reviews'] } },
      REVIEWS_TIMEOUT_MS
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.items ?? data.data ?? data.reviews ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch a curated subset by id, preserving the input order.
 * Both `_id` and `id` keys are checked because upstream returns both.
 */
export async function getReviewsById(ids = []) {
  if (!ids.length) return [];
  const all = await getAllReviews();
  const byId = new Map();
  for (const r of all) {
    if (r._id) byId.set(String(r._id), r);
    if (r.id) byId.set(String(r.id), r);
  }
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}
