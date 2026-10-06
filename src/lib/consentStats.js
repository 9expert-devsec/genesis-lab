/**
 * Aggregate consent-choice counters (round CB-C §4) — the pure half.
 *
 * The owner needs the acceptance rate after the banner redesign. What is
 * collected is the minimum that answers that, and nothing that identifies
 * anyone:
 *
 *   body   { choice: 'accept_all'|'reject_all'|'custom', analytics, marketing, layer: 1|2 }
 *   store  one document per (UTC+7 calendar date, host), `$inc` counters only
 *
 * No id, no cookie, no IP, no user agent, no timestamp finer than the day. The
 * HOST is kept because dev, preview and production share one MongoDB, and a
 * developer's test clicks must be separable from www.
 *
 * PURE: no DB, no request objects. The route (src/app/api/consent-stats) does
 * the I/O; this file decides what is valid and what to increment, so both are
 * unit-testable without either.
 */

export const CHOICES = Object.freeze(['accept_all', 'reject_all', 'custom']);
const BODY_KEYS = Object.freeze(['analytics', 'choice', 'layer', 'marketing']);

/** Largest request body the route will read, in bytes. */
export const MAX_BODY_BYTES = 512;

/**
 * Strict validation: exactly the four keys, exactly the right types, and the
 * one-click choices must agree with their switches (accept_all = both on,
 * reject_all = both off). Anything else is a 400.
 *
 * @returns {{ ok: true, value: {choice, analytics, marketing, layer} } | { ok: false, error: string }}
 */
export function validateConsentStatsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body must be an object' };
  const keys = Object.keys(body).sort();
  if (keys.length !== BODY_KEYS.length || keys.some((k, i) => k !== BODY_KEYS[i])) {
    return { ok: false, error: 'unexpected keys' };
  }
  const { choice, analytics, marketing, layer } = body;
  if (!CHOICES.includes(choice)) return { ok: false, error: 'bad choice' };
  if (typeof analytics !== 'boolean' || typeof marketing !== 'boolean') return { ok: false, error: 'bad flags' };
  if (layer !== 1 && layer !== 2) return { ok: false, error: 'bad layer' };
  if (choice === 'accept_all' && !(analytics && marketing)) return { ok: false, error: 'accept_all must grant both' };
  if (choice === 'reject_all' && (analytics || marketing)) return { ok: false, error: 'reject_all must grant neither' };
  if (choice === 'custom' && layer !== 2) return { ok: false, error: 'custom only comes from layer 2' };
  return { ok: true, value: { choice, analytics, marketing, layer } };
}

/** The UTC+7 (Asia/Bangkok, no DST) calendar date, `YYYY-MM-DD`. */
export function bangkokDate(nowMs = Date.now()) {
  return new Date(nowMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The `$inc` document for one validated decision. */
export function incrementsFor({ choice, analytics, marketing, layer }) {
  const inc = { decisions: 1, [choice]: 1 };
  if (analytics) inc.analytics_granted = 1;
  if (marketing) inc.marketing_granted = 1;
  if (choice === 'custom' && analytics) inc.custom_analytics = 1;
  if (choice === 'custom' && marketing) inc.custom_marketing = 1;
  if (layer === 2) inc.via_layer2 = 1;
  return inc;
}

/**
 * A host as recorded: lower-case, port kept, only hostname characters, capped.
 * `''` when there is nothing usable — the route refuses those.
 */
export function normaliseStatsHost(value) {
  const h = String(value ?? '').trim().toLowerCase().split(',')[0].trim();
  if (!h || h.length > 100 || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(h)) return '';
  return h;
}

/**
 * The abuse guard: the request must come from a page on the SAME host it is
 * sent to. Browsers always send `Origin` on a POST, so a missing or foreign
 * origin is a script, a curl, or another site — counted for nobody.
 */
export function isSameSiteOrigin(origin, host) {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * The acceptance rate the owner asked for:
 *   (accept_all + custom with analytics) / all decisions
 * `null` when there were no decisions (not 0 — "no data" is not "nobody accepted").
 */
export function acceptanceRate(t) {
  const all = (t.accept_all ?? 0) + (t.reject_all ?? 0) + (t.custom ?? 0);
  if (!all) return null;
  return ((t.accept_all ?? 0) + (t.custom_analytics ?? 0)) / all;
}

/** Sum counter fields across daily documents. */
export const COUNTER_FIELDS = Object.freeze([
  'decisions', 'accept_all', 'reject_all', 'custom',
  'custom_analytics', 'custom_marketing', 'analytics_granted', 'marketing_granted', 'via_layer2',
]);
export function sumCounters(docs) {
  const out = Object.fromEntries(COUNTER_FIELDS.map((k) => [k, 0]));
  for (const d of docs ?? []) for (const k of COUNTER_FIELDS) out[k] += Number(d?.[k]) || 0;
  return out;
}
