/**
 * Base client for the external 9exp-sec.com/api/ai MSDB API.
 *
 * This is the ONLY place that touches the upstream directly.
 * Domain-specific adapters (public-courses.js, schedules.js, etc.)
 * import `aiFetch` from here and wrap upstream quirks into clean shapes.
 *
 * Upstream quirks we handle (from integration guide + v1 experience):
 *   1. Path inconsistency — docs mix singular and plural in examples.
 *      Each adapter hardcodes its verified path, with a `// curl-verified: YYYY-MM-DD` stamp.
 *   2. Envelope variants:
 *      - Canonical:   { ok, summary: { total }, items }
 *      - Paginated:   { ok, total, page, limit, items }
 *   3. Status casing inconsistencies across domains — we do NOT normalize here.
 *      Each adapter handles its own status semantics.
 */

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const BASE = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY  = process.env.AI_API_KEY;
// Cap any single upstream call so a stalled API can't hang the
// landing-page sync job (or a request-time render that falls back
// to a direct call) for the full Node default.
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Low-level fetch against the upstream API.
 *
 * @param {string} path       — leading slash, e.g. '/public-courses'
 * @param {object} options
 * @param {object} options.params  — query parameters
 * @param {number} options.revalidate — Next.js ISR seconds; default 3600 (1h)
 * @param {string|string[]} options.tags — cache tags for on-demand revalidation
 * @returns {Promise<object>} raw JSON from upstream
 * @throws {Error} if the response is not OK
 */
export async function aiFetch(path, { params, revalidate = 3600, tags } = {}) {
  if (!KEY) {
    throw new Error(
      'AI_API_KEY is not set. Configure it in .env.local (see .env.example).'
    );
  }

  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'x-api-key': KEY,
        'accept': 'application/json',
      },
      next: {
        revalidate,
        ...(tags ? { tags: Array.isArray(tags) ? tags : [tags] } : {}),
      },
    },
    UPSTREAM_TIMEOUT_MS
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[aiFetch] ${res.status} ${res.statusText} on ${path} — ${body.slice(0, 200)}`
    );
  }

  return res.json();
}

/**
 * Normalize either envelope variant into a consistent `{ items, total }` shape.
 * Domain adapters can opt into this when they don't need pagination metadata.
 */
export function unwrap(response) {
  if (!response || typeof response !== 'object') {
    return { items: [], total: 0 };
  }
  const items = Array.isArray(response.items) ? response.items : [];
  const total =
    response.summary?.total ??
    response.total ??
    items.length;
  return { items, total };
}
