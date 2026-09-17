/**
 * IS THIS ADMIN ONLINE? — the one rule, pure.
 *
 * ── NO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────
 * Same constraint as lib/dashboard/ranges.js: the pure tier loads this with
 * nothing stubbed, and nothing here may reach for a model, a session or
 * next/*. `listAdmins` (a server action) calls it with the server clock and
 * ships the resulting boolean to the client, so a visitor's skewed laptop
 * clock can never decide who is Online.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * Online only when ALL of:
 *   · the account is enabled — a disabled admin is Offline whatever the beat
 *     says (their session may still be valid until it expires; the accounts
 *     list must not show a disabled person as present);
 *   · a beat has ever landed (`lastSeenAt` non-null);
 *   · the last beat is within the threshold, INCLUSIVE at the edge;
 *   · no sign-out happened at or after the last beat. `lastSeenAt` is kept
 *     across sign-out (the list still shows "last seen …"), so it is the
 *     ORDER of the two stamps that says whether the beat post-dates the
 *     sign-out: a beat strictly after the sign-out is a new session on some
 *     device and counts.
 *
 * ── THE THRESHOLD, 150 s ────────────────────────────────────────────────────
 * The heartbeat is 60 s while the tab is visible. 150 s is two missed beats
 * plus jitter: one late beat (a throttled background timer, a slow request)
 * must not flip someone Offline, and three would leave "Offline" lagging four
 * minutes behind reality. A hidden tab or a sleeping laptop stops beating and
 * simply times out, which is the correct answer for both.
 *
 * Dates may arrive as Date objects, ISO strings or epoch numbers — `.lean()`
 * rows hold Dates, serialised rows hold strings — so every value is coerced
 * once here. Anything that does not coerce to a finite time is treated as
 * null.
 */

export const PRESENCE_THRESHOLD_MS = 150_000;

/** A Date / ISO string / epoch number → epoch ms, or null when absent or invalid. */
function ms(value) {
  if (value === null || value === undefined || value === '') return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {{ active?: boolean, lastSeenAt?: Date|string|number|null, lastSignedOutAt?: Date|string|number|null }} admin
 * @param {number|Date} now  the SERVER clock
 * @param {number} [thresholdMs]
 * @returns {boolean}
 */
export function isOnline(admin, now, thresholdMs = PRESENCE_THRESHOLD_MS) {
  if (!admin || admin.active !== true) return false;
  const seen = ms(admin.lastSeenAt);
  if (seen === null) return false;
  const at = ms(now);
  if (at === null) return false;
  if (at - seen > thresholdMs) return false;
  const out = ms(admin.lastSignedOutAt);
  if (out !== null && seen <= out) return false;
  return true;
}
