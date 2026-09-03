/**
 * THE 404 BOUNDARY: look up a redirect rule, or record the miss.
 *
 * Called from the point the app has decided it has nothing to serve. Server-only
 * (imports mongoose models); the decisions it makes are in redirectRules.js,
 * which is pure and tested without a database.
 *
 * ── ONE READ AND ONE WRITE, AND ONLY ONE OF THEM EVER HAPPENS ─────────────
 * A hit reads the rule and redirects — nothing is recorded, because a path with
 * a rule is not a 404 any more. A miss records the path and renders the 404.
 * Never both.
 *
 * ── NOTHING HERE MAY DELAY OR FAIL THE RESPONSE ───────────────────────────
 * This runs on a path that is, by definition, unauthenticated and reachable by
 * anyone. Two consequences, both deliberate:
 *
 *   the LOOKUP is awaited but wrapped — a database that is down produces a
 *   plain 404, which is what the visitor would have got anyway.
 *
 *   the RECORDING is fire-and-forget via `after()`, so it runs once the
 *   response has been sent. A slow write cannot hold a 404 open, and a failed
 *   one cannot turn it into a 500.
 */

import { after } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import RedirectRule from '@/models/RedirectRule';
import NotFoundHit from '@/models/NotFoundHit';
import {
  MAX_PATH_LENGTH,
  matchRedirect,
  normaliseHost,
  normalisePath,
} from '@/lib/redirects/redirectRules';

/**
 * Is this path worth a row at all?
 *
 * REFUSED, and each for its own reason:
 *   · empty — nothing to key on
 *   · over the length cap — normalisePath truncates, so an over-long request
 *     would otherwise create a row keyed on an arbitrary prefix, and a few
 *     thousand of those all truncate to something different. The cap is checked
 *     BEFORE truncation for exactly that reason.
 *   · /admin — the admin surface answers 404 to the public by design (see
 *     middleware rule 6). Recording those would fill the worklist with the
 *     normal behaviour of the door, and hand a prober a way to confirm which
 *     admin paths exist by watching what appears.
 *   · well-known noise every site receives and nobody will ever write a
 *     redirect for.
 */
const NOISE_PREFIXES = [
  '/.well-known/',
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wp-login',
  '/xmlrpc.php',
  '/.env',
  '/.git',
  '/vendor/',
  '/cgi-bin/',
];

export function shouldRecord(rawPath) {
  const raw = String(rawPath ?? '');
  if (!raw.trim()) return false;
  if (raw.length > MAX_PATH_LENGTH) return false;

  const path = normalisePath(raw);
  if (!path || path === '/') return false;
  if (path === '/admin' || path.startsWith('/admin/')) return false;
  if (NOISE_PREFIXES.some((p) => path.startsWith(p))) return false;
  return true;
}

/**
 * Record one miss — ONE upsert, `$inc`-ed. Never throws, never awaited by the
 * response.
 *
 * `$setOnInsert` for `firstSeen` and `$set` for `lastSeen` is what makes the
 * TTL behave as described on the model: the row's clock is the LAST time
 * anybody asked, so a path that keeps being requested keeps its row.
 *
 * @param {object} [deps] test seam ONLY — production passes nothing.
 */
export async function recordNotFound({ host, path }, deps = {}) {
  const {
    NotFoundHit: Model = NotFoundHit,
    connect = dbConnect,
    warn = (...args) => console.warn(...args),
  } = deps;

  if (!shouldRecord(path)) return { recorded: false, reason: 'skipped' };

  const h = normaliseHost(host);
  const p = normalisePath(path);
  if (!h) return { recorded: false, reason: 'no-host' };

  try {
    await connect();
    const now = new Date();
    await Model.updateOne(
      { host: h, path: p },
      {
        $inc: { count: 1 },
        $set: { lastSeen: now },
        $setOnInsert: { host: h, path: p, firstSeen: now },
      },
      { upsert: true }
    );
    return { recorded: true, reason: 'ok' };
  } catch (err) {
    // A lost 404 row is worth nothing. A 404 that became a 500 because the
    // logger failed is worth less than nothing.
    warn('[redirects] could not record a 404:', err?.message ?? err);
    return { recorded: false, reason: 'error' };
  }
}

/**
 * The whole boundary decision.
 *
 * @returns {Promise<{destination: string, permanent: boolean} | null>}
 *   a redirect target, or null meaning "render the 404".
 *
 * The candidate read is keyed on BOTH host and normalised path, so it returns
 * at most a handful of rows and the pure matcher decides among them. Matching
 * is not done in the query, deliberately: the rule about what a destination is
 * allowed to be lives in one testable place, and a Mongo filter cannot express
 * "and re-check that the stored destination is still internal".
 *
 * @param {object} [deps] test seam ONLY — production passes nothing.
 */
export async function resolveNotFound({ host, path }, deps = {}) {
  const {
    RedirectRule: Rules = RedirectRule,
    connect = dbConnect,
    record = recordNotFound,
    schedule = after,
    warn = (...args) => console.warn(...args),
  } = deps;

  const h = normaliseHost(host);
  const p = normalisePath(path);

  let rules = [];
  if (h && p) {
    try {
      await connect();
      rules = await Rules.find({ host: h, source: p, isActive: true })
        .select('host source destination permanent isActive')
        .limit(5)
        .lean();
    } catch (err) {
      // A 404 is the honest answer when the table cannot be read. Redirecting
      // on a guess would be worse.
      warn('[redirects] rule lookup failed:', err?.message ?? err);
      rules = [];
    }
  }

  const hit = matchRedirect({ host: h, path: p, rules });
  if (hit) return hit;

  /**
   * FIRE AND FORGET. `after()` throws outside a request scope (a script, a
   * test), and an unguarded call would turn a missing 404 row into a broken
   * page — the exact inversion this whole function is written to avoid.
   */
  try {
    schedule(() => record({ host: h, path: p }, deps));
  } catch {
    /* no request scope — nothing a human did, nothing to record */
  }

  return null;
}
