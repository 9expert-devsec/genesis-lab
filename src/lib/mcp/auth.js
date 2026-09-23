/**
 * Header-key auth for the MCP server. FAIL CLOSED.
 *
 * ── A KEY OF ITS OWN, AND THAT IS THE WHOLE POINT ──────────────────────────
 * `MCP_API_KEY` is deliberately NOT `CORPUS_API_KEY` and NOT `AI_API_KEY`. The
 * three serve different audiences — the chatbot service, the MSDB upstream, and
 * whoever we hand a Claude Desktop config to. The MCP one is the only one
 * that lives in a plaintext file on somebody's laptop. It has to be revocable
 * on its own, without an outage for the other two. Reusing an existing key here
 * would make "rotate the MCP key" mean "re-deploy the chat integration", which
 * is how a leaked key stays live.
 *
 * ── 503 WHEN UNSET, NEVER "OPEN" ───────────────────────────────────────────
 * An unset env var is the deploy-time failure this module exists to survive. A
 * check written as `if (expected && presented !== expected)` passes everything
 * through the moment the variable is missing, which is exactly the state a
 * fresh environment is in. So the unset case is its own status, returned BEFORE
 * any comparison, and it is 503 rather than 401 because the fault is ours and
 * an operator reading the log needs to tell "misconfigured" from "bad key".
 * This mirrors `corpusAuthStatus` in lib/corpus/promotionsAuth.js, which made
 * the same call for the same reason.
 *
 * ── WHY timingSafeEqual AND NOT `===` ──────────────────────────────────────
 * `===` on strings short-circuits at the first differing byte, so the time it
 * takes leaks how much of a guess was correct. That is only worth attacking
 * over many requests, which is precisely what an always-on endpoint offers.
 * `timingSafeEqual` costs nothing here and removes the question.
 *
 * It THROWS on unequal-length buffers rather than returning false, so length is
 * checked first and an unequal length is rejected outright. That does leak the
 * key's length, which is not a secret worth protecting: the key is a fixed-width
 * hex string by convention and its length is in the setup doc.
 */

import { timingSafeEqual } from 'node:crypto';

/** The header the key travels in. Lower-case: `Headers.get` is case-insensitive. */
export const MCP_KEY_HEADER = 'x-api-key';

/** Status codes this module can answer with. Named so call sites read as prose. */
export const MCP_AUTH_OK = 200;
export const MCP_AUTH_UNAUTHORIZED = 401;
export const MCP_AUTH_NOT_CONFIGURED = 503;

/**
 * Decide whether a presented key may proceed.
 *
 * @param {string|null|undefined} presented the `x-api-key` header, verbatim
 * @param {string|null|undefined} expected  `process.env.MCP_API_KEY`
 * @returns {200|401|503}
 *
 * `expected` is passed in rather than read from `process.env` here, so a test
 * can exercise every branch without touching the ambient environment — this
 * suite runs every file in ONE process and a stray `process.env` write is
 * visible to hundreds of unrelated files.
 */
export function mcpAuthStatus(presented, expected) {
  const want = typeof expected === 'string' ? expected.trim() : '';
  if (want === '') return MCP_AUTH_NOT_CONFIGURED;

  const got = typeof presented === 'string' ? presented : '';
  if (got === '') return MCP_AUTH_UNAUTHORIZED;

  const a = Buffer.from(got, 'utf8');
  const b = Buffer.from(want, 'utf8');
  // timingSafeEqual throws on a length mismatch; reject before it can.
  if (a.length !== b.length) return MCP_AUTH_UNAUTHORIZED;

  return timingSafeEqual(a, b) ? MCP_AUTH_OK : MCP_AUTH_UNAUTHORIZED;
}

/**
 * The body for a non-OK status. Deliberately terse — there is nothing to learn
 * from it, which is the point. No echo of what was sent, no hint about length.
 */
export function mcpAuthErrorBody(status) {
  return status === MCP_AUTH_NOT_CONFIGURED
    ? { error: 'mcp_not_configured' }
    : { error: 'unauthorized' };
}
