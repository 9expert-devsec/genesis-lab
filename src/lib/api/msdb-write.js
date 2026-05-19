/**
 * Write-side wrapper around the MSDB API.
 *
 * The read-side client (`./client.js`) hits the same base URL but
 * leans on Next's ISR cache + `tags` for revalidation. Mutations have
 * different semantics — no caching, no `next: { revalidate }`, and we
 * surface the upstream error message so server actions can show a
 * useful toast instead of a generic 500.
 *
 * Response contract (curl-verified against the live MSDB write API):
 *   success → { ok: true, item: { _id, … } }
 *   failure → { ok: false, error: '…' }
 * We return the success envelope as-is so callers can read
 * `result.item._id`. Failures are thrown.
 *
 * All callers MUST pass an `entity` from the allowlist below; this
 * doubles as a guard against typos that would silently 404.
 */

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const BASE = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY  = process.env.AI_API_KEY;
// 10s ceiling for any single write — long enough for a healthy MSDB to
// finish, short enough that a hung upstream can't tie up a server
// action waiting on a response that's never coming.
const TIMEOUT_MS = 10_000;

const ALLOWED = new Set([
  'public-course',
  'schedules',
  'promotions',
  'instructors',
  'career-path',
]);

function assertEntity(entity) {
  if (!ALLOWED.has(entity)) {
    throw new Error(
      `[msdb-write] unsupported entity "${entity}". ` +
      `Allowed: ${[...ALLOWED].join(', ')}`
    );
  }
}

function assertKey() {
  if (!KEY) {
    throw new Error(
      'AI_API_KEY is not set. Configure it in .env.local (see .env.example).'
    );
  }
}

async function request(method, path, body) {
  // `fetchWithTimeout` wraps AbortController internally and propagates
  // the AbortError on timeout. We translate that here so the surfaced
  // message names the offending endpoint instead of the opaque "The
  // operation was aborted." default — saves debugging time when a
  // server action toast bubbles up the error to the admin.
  let res;
  try {
    res = await fetchWithTimeout(
      BASE + path,
      {
        method,
        headers: {
          'x-api-key':    KEY,
          'content-type': 'application/json',
          'accept':       'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      },
      TIMEOUT_MS
    );
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `[msdb-write] ${method} ${path} timed out after ${TIMEOUT_MS}ms`
      );
    }
    throw err;
  }

  // Parse body once — even on HTTP error, MSDB usually returns JSON.
  let parsed = null;
  const text = await res.text().catch(() => '');
  if (text) {
    try { parsed = JSON.parse(text); }
    catch { /* leave parsed = null, fall back to raw text below */ }
  }

  // Two failure modes: HTTP non-OK, or HTTP-200 with `{ ok: false }`.
  if (!res.ok) {
    const msg =
      parsed?.error ||
      parsed?.message ||
      text?.slice(0, 200) ||
      `${res.status} ${res.statusText}`;
    throw new Error(`[msdb-write] ${method} ${path} → ${msg}`);
  }
  if (parsed && parsed.ok === false) {
    throw new Error(
      `[msdb-write] ${method} ${path} → ${parsed.error || 'unknown error'}`
    );
  }

  return parsed;
}

/**
 * @returns {Promise<{ ok: true, item: object }>}
 */
export async function msdbCreate(entity, body) {
  assertKey();
  assertEntity(entity);
  return request('POST', `/${entity}`, body);
}

/**
 * @returns {Promise<{ ok: true, item: object }>}
 */
export async function msdbUpdate(entity, id, body) {
  assertKey();
  assertEntity(entity);
  if (!id) throw new Error('[msdb-write] update requires id');
  return request('PUT', `/${entity}/${encodeURIComponent(id)}`, body);
}

/**
 * @returns {Promise<{ ok: true, item?: object }>}
 */
export async function msdbDelete(entity, id) {
  assertKey();
  assertEntity(entity);
  if (!id) throw new Error('[msdb-write] delete requires id');
  return request('DELETE', `/${entity}/${encodeURIComponent(id)}`);
}
