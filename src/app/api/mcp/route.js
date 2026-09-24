/**
 * The 9Expert MCP server. Read-only, header-key authenticated, stateless.
 *
 * ── WHY A STATIC `api/mcp` ROUTE AND NOT THE README'S `api/[transport]` ─────
 * mcp-handler decides which transport a request wants by comparing
 * `url.pathname` to an endpoint it derives from `basePath`
 * (node_modules/mcp-handler/dist/index.js:140-143 builds
 * `${basePath}/mcp`, and :279 does `if (url.pathname === streamableHttpEndpoint)`).
 * With `basePath: "/api"` that endpoint is `/api/mcp` — exactly this file's
 * static path, so the handler's own match succeeds with no dynamic segment.
 *
 * The package README puts the file at `app/api/[transport]/` so ONE route can
 * serve `/api/mcp`, `/api/sse` and `/api/message`. SSE is disabled here, so the
 * segment bought nothing — and it cost a lot: a dynamic segment directly under
 * `app/api/` claims every unmatched single-segment `/api/*` path, so every
 * probe of `/api/<anything>` became a function invocation instead of reaching
 * the site's normal not-found handling. The static route removes that surface.
 *
 * The pathname check in `guarded` is kept as a belt-and-braces guard: Next
 * only routes `/api/mcp` here now, but the handler must never be reached on a
 * path it was not configured for.
 *
 * ── STATELESS, AND REDIS IS NEVER CONSTRUCTED ─────────────────────────────
 * `disableSse: true` (the option is declared at dist/index.d.mts:101, "If true,
 * disables the SSE endpoint") makes both SSE branches return 404 at
 * dist/index.js:369 and :575 — BEFORE the `if (!redisUrl) throw` at :181-182
 * that the SSE transport would otherwise reach. Streamable HTTP is stateless in
 * this version by construction: `sessionIdGenerator` is typed as `undefined`.
 * No `redisUrl` is passed and none is needed; the `redis` package arrives as an
 * unavoidable dependency of mcp-handler 1.x and is never loaded.
 */

import { createMcpHandler } from 'mcp-handler';

import {
  MCP_AUTH_OK,
  MCP_KEY_HEADER,
  mcpAuthErrorBody,
  mcpAuthStatus,
} from '@/lib/mcp/auth';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, registerMcpTools } from '@/lib/mcp/register';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** The one path this route answers — the handler's `${basePath}/mcp`. */
const MCP_PATH = '/api/mcp';

const NO_STORE = { 'cache-control': 'no-store' };

const handler = createMcpHandler(
  (server) => {
    registerMcpTools(server);
  },
  {
    serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
  },
  {
    basePath: '/api',
    maxDuration: 30,
    disableSse: true,
  }
);

/**
 * Auth runs BEFORE the MCP handler sees anything.
 *
 * Not `withMcpAuth` from the package: that one implements OAuth bearer tokens
 * and advertises protected-resource metadata, which is a different contract
 * from a shared header key and would answer a missing key with a WWW-Authenticate
 * challenge pointing at an authorization server we do not run.
 */
async function guarded(request) {
  const { pathname } = new URL(request.url);
  if (pathname !== MCP_PATH) {
    return new Response(null, { status: 404 });
  }

  const status = mcpAuthStatus(request.headers.get(MCP_KEY_HEADER), process.env.MCP_API_KEY);
  if (status !== MCP_AUTH_OK) {
    return Response.json(mcpAuthErrorBody(status), { status, headers: NO_STORE });
  }

  return handler(request);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
