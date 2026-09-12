/**
 * The key check in front of /api/corpus/*.
 *
 * ── FAIL CLOSED, STATED FIRST BECAUSE THE REPO HAS THE OPPOSITE PRECEDENT ──
 * /api/cron/promotions-sync skips its check when CRON_SECRET is unset, so a
 * deploy that forgot the variable is an OPEN endpoint. That is tolerable for a
 * route that triggers an idempotent sync; it is not tolerable for one that
 * serves the whole live price sheet to anyone who asks. So here an unset
 * CORPUS_API_KEY refuses EVERY request with 503 — the operator sees "service
 * unavailable" and sets the variable, rather than nobody noticing the door was
 * never locked.
 *
 * ── THE COMPARISON ─────────────────────────────────────────────────────────
 * Both sides are SHA-256 hashed before `timingSafeEqual`, which is what makes
 * the compare length-safe: `timingSafeEqual` throws on unequal lengths, and a
 * length check in front of it leaks the key's length one rejected byte at a
 * time. Two 32-byte digests always have equal length, so neither the length nor
 * the bytes of the configured key are observable through timing.
 *
 * Pure: no env, no request, no logging. The route reads the header and the
 * variable and passes both in, so this can be exercised by a function call.
 * Nothing here ever returns, logs or embeds either key.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** The header the chatbot sends, matching genesis's own MSDB client. */
export const CORPUS_KEY_HEADER = 'x-api-key';

/**
 * @param {unknown} presented  the header value as received (string or null)
 * @param {unknown} configured process.env.CORPUS_API_KEY as read
 * @returns {200|401|503} the HTTP status the route must answer with:
 *   503 — no key is configured, so nothing can be authorised (fail closed);
 *   401 — a key is configured and the request did not present it;
 *   200 — the presented key matches.
 */
export function corpusAuthStatus(presented, configured) {
  if (typeof configured !== 'string' || configured.trim() === '') return 503;
  if (typeof presented !== 'string' || presented === '') return 401;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(configured).digest();
  return timingSafeEqual(a, b) ? 200 : 401;
}
