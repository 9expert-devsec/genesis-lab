/**
 * The chat panel's DATE WINDOW — read from the URL, validated, defaulted.
 *
 * ── NO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────
 * Same constraint as lib/dashboard/ranges.js: the pure tier loads this with
 * nothing stubbed, and nothing here may reach for env, a model, a session or
 * next/*. It is also what lets client.js (server-only) and the pages share one
 * definition of "a valid range" without the pages importing the client.
 *
 * ── ASIA/BANGKOK, BY ARITHMETIC ─────────────────────────────────────────────
 * The panel API defines `from`/`to` as inclusive calendar days in Asia/Bangkok
 * (its contract; the service does the bucketing). Bangkok is UTC+7 with no
 * daylight saving, so "today in Bangkok" is the UTC date of `now + 7h` — no
 * Intl, no timezone database, and the same answer on Vercel (UTC) and on a
 * developer's machine in any zone. `TZ` is deliberately not consulted.
 *
 * ── THE URL IS THE ONLY PLACE THE RANGE LIVES ───────────────────────────────
 * `readPanelRange(searchParams)` is called by the page on every request and the
 * result is passed down as props. Nothing copies it into `useState` — see
 * test/fs/urlFilterNoState for why a filter seeded into state goes stale on
 * the next navigation.
 */

/** The service refuses a span over this many inclusive days. */
export const MAX_SPAN_DAYS = 92;

/** The default window: the last 7 days ending today (inclusive). */
export const DEFAULT_SPAN_DAYS = 7;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` from a UTC epoch-ms value's UTC calendar day. */
function isoOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The epoch-ms of `YYYY-MM-DD` at 00:00 UTC, or null when the string is not a
 * real calendar date (`2026-02-30` is rejected, not rolled forward).
 */
export function parseIsoDate(value) {
  const m = ISO_DATE.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(ms)) return null;
  // Round-trip: a rolled-forward date (Feb 30 → Mar 2) does not come back equal.
  return isoOf(ms) === `${y}-${mo}-${d}` ? ms : null;
}

/** Is `value` a `YYYY-MM-DD` string naming a real calendar date? */
export function isIsoDate(value) {
  return parseIsoDate(value) !== null;
}

/** Today's calendar date in Asia/Bangkok, as `YYYY-MM-DD`. */
export function bangkokToday(now = Date.now()) {
  return isoOf(Number(now) + BANGKOK_OFFSET_MS);
}

/** `YYYY-MM-DD` plus `days` calendar days (negative allowed). */
export function shiftIsoDate(iso, days) {
  const ms = parseIsoDate(iso);
  if (ms === null) return null;
  return isoOf(ms + Number(days) * DAY_MS);
}

/**
 * Inclusive day count of `from..to`, or null when either is invalid or the
 * order is reversed. `2026-09-01..2026-09-17` → 17.
 */
export function spanDays(from, to) {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * Is `{from, to}` a window the service will accept? Both real dates, ordered,
 * and at most MAX_SPAN_DAYS inclusive.
 */
export function isValidRange(from, to) {
  const span = spanDays(from, to);
  return span !== null && span <= MAX_SPAN_DAYS;
}

/** The last `span` days ending today (Bangkok), inclusive. */
export function defaultPanelRange(now = Date.now(), span = DEFAULT_SPAN_DAYS) {
  const to = bangkokToday(now);
  return { from: shiftIsoDate(to, -(span - 1)), to };
}

/**
 * A single value out of Next's `searchParams` object: the first entry when the
 * key was repeated, '' when absent. Never an array reaches a comparison.
 */
export function firstParam(sp, key) {
  const v = sp?.[key];
  if (Array.isArray(v)) return String(v[0] ?? '');
  return v == null ? '' : String(v);
}

/**
 * The window the page will show, from the URL.
 *
 *   ?from=&to= both valid, ordered, ≤ 92 days → that window, `source: 'query'`
 *   neither given                             → the default, `source: 'default'`
 *   anything else                             → the default, `source: 'invalid'`
 *
 * `source: 'invalid'` lets the page say "the dates in the link were ignored"
 * rather than silently showing last week for a URL that asked for something
 * else. The returned `from`/`to` are ALWAYS valid — a caller can hand them to
 * the client without re-checking.
 */
export function readPanelRange(sp, now = Date.now()) {
  const from = firstParam(sp, 'from');
  const to = firstParam(sp, 'to');
  if (!from && !to) return { ...defaultPanelRange(now), source: 'default' };
  if (isValidRange(from, to)) return { from, to, source: 'query' };
  return { ...defaultPanelRange(now), source: 'invalid' };
}

/** `?page=` as a positive integer; anything else is page 1. */
export function readPage(sp) {
  const n = Number(firstParam(sp, 'page'));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** `?vote=` narrowed to the service's vocabulary; anything else is `any`. */
export function readVote(sp) {
  const v = firstParam(sp, 'vote');
  return v === 'up' || v === 'down' ? v : 'any';
}

/** `?has_error=1|true` → true; anything else → false. */
export function readHasError(sp) {
  const v = firstParam(sp, 'has_error');
  return v === '1' || v === 'true';
}

/**
 * The preset links the range control offers — each an explicit `from`/`to`
 * so the URL says what it shows and a shared link means the same window later.
 * 90 rather than 92 because a round number reads as a choice and 92 reads as a
 * limit; both are inside the service's cap.
 */
export const RANGE_PRESETS = Object.freeze([
  { key: 'today', label: 'วันนี้', days: 1 },
  { key: 'week', label: '7 วัน', days: 7 },
  { key: 'month', label: '30 วัน', days: 30 },
  { key: 'quarter', label: '90 วัน', days: 90 },
]);

/** `{from, to}` for a preset ending today (Bangkok). */
export function presetRange(preset, now = Date.now()) {
  return defaultPanelRange(now, preset.days);
}
