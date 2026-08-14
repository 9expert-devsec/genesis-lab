/**
 * `WebhookLog.revalidated` is a TAGGED UNION. This classifies it.
 *
 * Dependency-free on purpose — no next/*, no db, no models — so the whole
 * classification is unit-testable without a Mongo connection or a request
 * context. Same split as lib/webhooks/courseRevalidatePlan.js: the planner
 * decides, the handler executes, the test drives the decision.
 *
 * ── DISCRIMINATE ON `type`, NEVER ON `ok` ───────────────────────────────────
 * There are FIVE type values, produced at four sites in webhooks/handlers.js:
 *
 *   'tag'                  :70,:73  a revalidateTag call was made
 *   'path'                 :61,:64  a revalidatePath call was made
 *   'alias-lookup'         :138     a DB lookup for a course's aliases FAILED
 *   'visibility'           :198     the row FAILS upstream's own /schedules
 *                                   read filter and will never reach a public
 *                                   surface — a FACT about upstream
 *   'visibility-uncertain' :201     we could not DECIDE whether it will (e.g. a
 *                                   status that only matches after case-folding,
 *                                   where upstream's comparison is unverified)
 *                                   — an OPEN QUESTION, not a fact
 *
 * Three of those five carry `ok: false` and NONE of the three is a failed
 * revalidation. `alias-lookup` is a database miss. Both visibility entries are
 * findings ABOUT THE INCOMING ROW, recorded while the handler still holds the
 * document — the model says so at WebhookLog.js:26-34, and adds that neither is
 * a delivery failure: the document-level `status` stays 'ok' and the route
 * still returns 200.
 *
 * So a console that groups by `ok` reports a healthy webhook as three failed
 * cache invalidations. It would be wrong about what happened, wrong about
 * whether anything needs fixing, and wrong in the direction that generates
 * work. `visibility` and `visibility-uncertain` are additionally kept APART
 * from each other, because WebhookLog.js:31-33 states plainly that definite and
 * possible must not be read as the same claim.
 *
 * ── UNKNOWN TYPES SURVIVE ───────────────────────────────────────────────────
 * A sixth type added to handlers.js without touching this file lands in
 * `unknown` and is rendered as itself. It is not dropped and not folded into an
 * existing bucket — a silently-swallowed entry is how a union grows a member
 * nobody notices.
 */

/** The five type values this module knows, as produced by webhooks/handlers.js. */
export const REVALIDATED_TYPES = Object.freeze({
  TAG: 'tag',
  PATH: 'path',
  ALIAS_LOOKUP: 'alias-lookup',
  VISIBILITY: 'visibility',
  VISIBILITY_UNCERTAIN: 'visibility-uncertain',
});

const KNOWN = new Set(Object.values(REVALIDATED_TYPES));

/** Is this entry an attempted cache invalidation (tag or path)? */
export function isRevalidationEntry(entry) {
  return (
    entry?.type === REVALIDATED_TYPES.TAG || entry?.type === REVALIDATED_TYPES.PATH
  );
}

/**
 * Split a `revalidated` array into its union members.
 *
 * `null` in — which is the schema default (WebhookLog.js:35) and what a handler
 * returning nothing produces — yields every bucket empty rather than throwing.
 * A non-array behaves the same way: this reads an audit trail, and an audit
 * trail that crashes the page it is displayed on is worse than one that shows
 * nothing.
 *
 * @returns {{
 *   revalidations: object[], aliasLookups: object[],
 *   visibility: object[], visibilityUncertain: object[],
 *   unknown: object[], total: number
 * }}
 */
export function classifyRevalidated(revalidated) {
  const out = {
    revalidations: [],
    aliasLookups: [],
    visibility: [],
    visibilityUncertain: [],
    unknown: [],
    total: 0,
  };
  if (!Array.isArray(revalidated)) return out;

  for (const entry of revalidated) {
    if (!entry || typeof entry !== 'object') {
      out.unknown.push(entry);
      out.total += 1;
      continue;
    }
    out.total += 1;
    switch (entry.type) {
      case REVALIDATED_TYPES.TAG:
      case REVALIDATED_TYPES.PATH:
        out.revalidations.push(entry);
        break;
      case REVALIDATED_TYPES.ALIAS_LOOKUP:
        out.aliasLookups.push(entry);
        break;
      case REVALIDATED_TYPES.VISIBILITY:
        out.visibility.push(entry);
        break;
      case REVALIDATED_TYPES.VISIBILITY_UNCERTAIN:
        out.visibilityUncertain.push(entry);
        break;
      default:
        out.unknown.push(entry);
    }
  }
  return out;
}

/** Types this module does not know about, for a "the union grew" notice. */
export function unknownTypesIn(revalidated) {
  if (!Array.isArray(revalidated)) return [];
  const seen = new Set();
  for (const entry of revalidated) {
    const t = entry?.type;
    if (typeof t === 'string' && !KNOWN.has(t)) seen.add(t);
  }
  return [...seen].sort();
}

/**
 * How many revalidation ATTEMPTS threw, out of how many were made.
 *
 * The name is `attempted`, not `succeeded`, and that is the whole point.
 * `safeRevalidate`/`safeRevalidateTag` (handlers.js:56-75) set `ok: true` when
 * the call DID NOT THROW. Next's revalidatePath and revalidateTag both return
 * void, so "a cache entry was cleared" is not something they can report and not
 * something this can count. The inventory classifies that NOT OBSERVABLE; this
 * counter deliberately stops at "the call was made".
 */
export function revalidationCallSummary(revalidated) {
  const { revalidations } = classifyRevalidated(revalidated);
  const threw = revalidations.filter((e) => e?.ok === false).length;
  return { attempted: revalidations.length, threw };
}
