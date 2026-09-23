/**
 * The 9Expert MCP server. Read-only, header-key authenticated, stateless.
 *
 * ── WHY THE FILE IS AT `api/[transport]` AND NOT `api/mcp/[transport]` ─────
 * mcp-handler decides which transport a request wants by comparing
 * `url.pathname` to an endpoint it derives from `basePath`
 * (node_modules/mcp-handler/dist/index.js:140-143 builds
 * `${basePath}/mcp`, and :279 does `if (url.pathname === streamableHttpEndpoint)`).
 * For the public URL to be `/api/mcp`, `basePath` must be `/api` and the
 * dynamic segment must therefore sit directly under `app/api/`. That is
 * exactly what the package's own README shows:
 *
 *     // app/api/[transport]/route.ts
 *     basePath: "/api", // must match where [transport] is located
 *
 * Nesting it one level deeper and setting `basePath: "/api/mcp"` would serve
 * the server at `/api/mcp/mcp`.
 *
 * ── WHAT THAT COSTS, AND HOW IT IS PAID BACK ──────────────────────────────
 * A dynamic segment under `app/api/` would otherwise claim every unmatched
 * single-segment `/api/*` path. Static routes win over dynamic ones in Next, so
 * none of the eleven existing `/api/*` routes is affected — but `/api/anything`
 * would newly reach this handler instead of 404ing, and with the auth gate in
 * front it would answer 401. That is a visible behaviour change on a surface
 * this round is not supposed to touch.
 *
 * So the gate below checks the PATHNAME FIRST and hands anything that is not
 * exactly `/api/mcp` a plain 404, before auth and before the handler. Unknown
 * `/api/*` paths answer exactly what they answered yesterday.
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

/** The one path this route answers. Everything else 404s, as it did before. */
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
