import 'server-only';

/**
 * The genesis → chatbot PANEL client. The only module that knows the panel
 * API's host or key.
 *
 * ══ `server-only` — THE FIRST USE IN THIS REPO, AND WHY IT IS HERE ══════════
 * The key must never reach a browser bundle. Until now the repo relied on the
 * structural rule (env is read only in route handlers, server components and
 * 'use server' modules) plus the NEXT_PUBLIC_ source walk in
 * test/fs/chatWiring. Both are still in force. `server-only` adds the build-time
 * property: importing this module from a Client Component is a compile error,
 * not a leak somebody has to notice. test/fs/chatPanelBundleGuard adds the
 * same property at the source level so the suite reddens before the build
 * does. (Under the test loader the package resolves to test/stub-server-only.mjs,
 * an empty module — the real one throws on import outside a react-server
 * condition, which Node's test runner is not.)
 *
 * ── READ AT CALL TIME, NOT AT MODULE SCOPE ──────────────────────────────────
 * `process.env` is consulted inside each call. lib/api/client.js reads its key
 * once at module scope; that is fine for a module only server code imports,
 * but a module-scope read is evaluated in whichever bundle imports it, and this
 * module's whole argument is that no such bundle exists. Reading late costs
 * nothing and makes the argument hold by construction.
 *
 * Missing or invalid configuration is a DEPLOYMENT STATE — `not_configured` —
 * never a throw: the page renders a sentence, the same ruling as
 * /api/chat's `chat_unavailable`.
 *
 * ── THE RESULT SHAPE ────────────────────────────────────────────────────────
 * Every function answers `{ ok: true, data }` or `{ ok: false, reason }` and
 * never rejects. `reason` is one of PANEL_FAILURE_REASONS (lib/chatPanel/
 * messages.js), which is the page's whole branching vocabulary:
 *
 *   not_configured     env unset / not a URL — no request was made
 *   bad_request        our own validation refused the input — no request was
 *                      made — or the service answered 400
 *   unauthorized       401: the key we sent was refused
 *   disabled_upstream  503 panel_disabled: the service has no key of its own
 *   not_found          404
 *   timeout            no answer within PANEL_TIMEOUT_MS
 *   upstream_error     network failure, non-JSON, or any other status
 *
 * ── WHAT IS NEVER LOGGED ────────────────────────────────────────────────────
 * The key, the request headers, and the response body. A failure logs the
 * path and the status, nothing else — transcripts flow through here and the
 * platform log has no retention story for them (see /api/chat, FIX 2).
 *
 * ── INPUTS ARE VALIDATED BEFORE THE NETWORK ─────────────────────────────────
 * Dates through lib/chatPanel/range.js (real dates, ordered, ≤ 92 days);
 * numeric options are CLAMPED into the service's documented ranges rather
 * than refused — a `limit=500` in a URL is a reader asking for "many", not an
 * attack — while a malformed date is refused, because a clamped date would
 * silently show a different window than the link claims.
 */

import { isValidRange } from '@/lib/chatPanel/range';

export const PANEL_TIMEOUT_MS = 10_000;
export const PANEL_KEY_HEADER = 'x-api-key';

/** Service-documented bounds, applied by clamping. */
export const TRENDS_LIMIT = Object.freeze({ min: 1, max: 50, default: 20 });
export const SESSIONS_PAGE_SIZE = Object.freeze({ min: 1, max: 100, default: 50 });
const MAX_SESSION_ID_CHARS = 100;

const ok = (data) => ({ ok: true, data });
const fail = (reason) => ({ ok: false, reason });

/**
 * `{ base, key }` from the environment, or null. Both must be present and the
 * base must parse as a URL; a typo'd host is the same deployment state as an
 * absent one.
 */
function readConfig() {
  const base = String(process.env.CHAT_PANEL_API_URL || '').trim();
  const key = String(process.env.CHAT_PANEL_API_KEY || '').trim();
  if (!base || !key) return null;
  try {
    // eslint-disable-next-line no-new
    new URL(base);
  } catch {
    return null;
  }
  return { base: base.replace(/\/+$/, ''), key };
}

/** Coerce to an integer inside `[min, max]`; non-numbers take the default. */
function clampInt(value, { min, max, default: dflt }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function reasonForStatus(status) {
  if (status === 401) return 'unauthorized';
  if (status === 503) return 'disabled_upstream';
  if (status === 400) return 'bad_request';
  if (status === 404) return 'not_found';
  return 'upstream_error';
}

/**
 * One GET against the panel API. `deps.fetchImpl` and `deps.log` are test
 * seams; production passes nothing and gets the globals.
 */
async function panelGet(path, params, deps = {}) {
  const { fetchImpl = globalThis.fetch, log = console.error } = deps;
  const config = readConfig();
  if (!config) return fail('not_configured');

  const url = new URL(`${config.base}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { [PANEL_KEY_HEADER]: config.key, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      log(`[chatPanel] ${path} timed out after ${PANEL_TIMEOUT_MS}ms`);
      return fail('timeout');
    }
    log(`[chatPanel] ${path} unreachable: ${err?.name ?? 'Error'}`);
    return fail('upstream_error');
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    log(`[chatPanel] ${path} answered ${res.status}`);
    return fail(reasonForStatus(res.status));
  }
  if (!body || typeof body !== 'object') {
    log(`[chatPanel] ${path} answered ${res.status} with a non-JSON body`);
    return fail('upstream_error');
  }
  return ok(body);
}

/** GET /api/panel/summary?from&to */
export async function getPanelSummary({ from, to } = {}, deps = {}) {
  if (!isValidRange(from, to)) return fail('bad_request');
  return panelGet('/api/panel/summary', { from, to }, deps);
}

/** GET /api/panel/trends?from&to&limit — `limit` clamped to 1..50. */
export async function getPanelTrends({ from, to, limit } = {}, deps = {}) {
  if (!isValidRange(from, to)) return fail('bad_request');
  return panelGet(
    '/api/panel/trends',
    { from, to, limit: clampInt(limit, TRENDS_LIMIT) },
    deps,
  );
}

/**
 * GET /api/panel/sessions?from&to&page&page_size&vote&has_error
 * `page` ≥ 1, `page_size` 1..100 — clamped; `vote` outside any|up|down → any.
 */
export async function listPanelSessions(
  { from, to, page, pageSize, vote, hasError } = {},
  deps = {},
) {
  if (!isValidRange(from, to)) return fail('bad_request');
  const safePage = clampInt(page, { min: 1, max: Number.MAX_SAFE_INTEGER, default: 1 });
  const safeVote = vote === 'up' || vote === 'down' ? vote : 'any';
  return panelGet(
    '/api/panel/sessions',
    {
      from,
      to,
      page: safePage,
      page_size: clampInt(pageSize, SESSIONS_PAGE_SIZE),
      vote: safeVote,
      has_error: hasError === true ? 'true' : 'false',
    },
    deps,
  );
}

/**
 * GET /api/panel/sessions/{session_id}
 * The id is a path segment: refused (bad_request, no request) when empty,
 * over 100 chars, or containing anything that could change the path.
 */
export async function getPanelSession(sessionId, deps = {}) {
  const id = String(sessionId ?? '').trim();
  if (!id || id.length > MAX_SESSION_ID_CHARS || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
    return fail('bad_request');
  }
  return panelGet(`/api/panel/sessions/${encodeURIComponent(id)}`, {}, deps);
}
