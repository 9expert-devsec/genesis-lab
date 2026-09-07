/**
 * The two dashboard scope page keys — the strings, and NOTHING ELSE.
 *
 * ── NO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────
 * The same constraint that keeps lib/registrations/statuses.js import-free, and
 * for the same reason. The backfill in scripts/backfill-dashboard-scopes.mjs is
 * a plain-node CLI: it cannot resolve `@/` aliases, so anything it imports must
 * reach it through relative paths whose whole transitive graph is alias-free.
 * `scopes.js` imports `canAccess`, which imports the registry — an alias chain
 * three deep — so the keys could not live there and also be readable by the
 * script.
 *
 * They live here instead, written ONCE, and both sides import them:
 *
 *   lib/dashboard/scopes.js       → the runtime predicate (alias import, fine)
 *   lib/dashboard/backfillPlan.js → the migration plan (relative, node-safe)
 *
 * The alternative was to restate the two strings in the backfill, which is
 * exactly the hand-maintained mirror that left migrate-rbac.mjs three keys
 * behind the registry — a defect this round measured rather than inherited.
 *
 * ── THESE STRINGS ARE STORED DATA ───────────────────────────────────────────
 * They are values inside `Role.pages` documents in Mongo and members of the
 * AdminAuditLog `menu` enum. Renaming one silently revokes half the dashboard
 * from every role that held it. Change the LABEL in lib/rbac/pages.js instead;
 * the key is not free.
 */

/**
 * `dashboard` itself is deliberately NOT here. It gates the PAGE, not a
 * section, and grouping it with these would invite a caller to treat "may open
 * the dashboard" as if it were a third half of it.
 */
export const DASHBOARD_SCOPE_KEYS = Object.freeze({
  registrations: 'dashboard_registrations',
  system: 'dashboard_system',
});
