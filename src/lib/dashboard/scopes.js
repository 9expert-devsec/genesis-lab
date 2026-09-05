/**
 * The two dashboard SCOPES, resolved from a session.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO canAccess CALLS AT THE CALL SITE ───────
 * There are three call sites — the server action that runs the reads, the page
 * that decides whether to fetch schedules, and the client component that decides
 * what to draw — and all three must agree about which key means which half. Two
 * of them getting it right and one of them typing 'dashboard_system' where it
 * meant 'dashboard_registrations' is a permission bug that renders as a working
 * screen, which is the failure mode the whole registry is arranged to avoid.
 * The key strings are written once, here.
 *
 * ── PURE, AND DELIBERATELY NOT A 'use server' MODULE ────────────────────────
 * It imports only `canAccess`, which is itself pure and client-safe (no `auth`,
 * no next/navigation, no mongoose). That means DashboardClient could import it
 * if it ever needed to, and the pure test tier can exercise it with a plain
 * object for `user`.
 *
 * ── THE SCOPES ARE READ FROM THE SESSION AND FROM NOTHING ELSE ──────────────
 * Every caller passes `session.user`. None of them passes a prop, a search
 * param, or a value that crossed the wire from a browser: a scope that a client
 * can state is not a scope, and this file exists partly so that the one function
 * every caller reaches for takes a session user and cannot be handed anything
 * else meaningful. `canAccess(undefined, …)` is false, so a caller that loses
 * its session fails CLOSED — no section, rather than every section.
 */

import { canAccess } from '@/lib/rbac/access';
import { DASHBOARD_SCOPE_KEYS } from '@/lib/dashboard/scopeKeys';

/**
 * The registry keys, RE-EXPORTED rather than declared.
 *
 * They live in the import-free `scopeKeys.js` because the backfill script is a
 * plain-node CLI that cannot resolve `@/` aliases, and this module's own import
 * of `canAccess` puts a three-deep alias chain in its way. Both sides therefore
 * read the same two strings instead of one of them keeping a copy — see that
 * file's header, and see migrate-rbac.mjs for what a hand-kept copy costs.
 *
 * Re-exported so every existing importer of `@/lib/dashboard/scopes` is
 * unaffected by where the strings ended up living.
 */
export { DASHBOARD_SCOPE_KEYS };

/**
 * Which halves of the dashboard may this user see?
 *
 * Superadmin gets both, via canAccess's `isSuperadmin || pages == null`
 * short-circuit — the same bypass every other page key gets, which is the point
 * of making these ordinary page keys.
 *
 * @param {{isSuperadmin?: boolean, pages?: string[]|null}|null|undefined} user
 * @returns {{registrations: boolean, system: boolean}}
 */
export function dashboardScopes(user) {
  return {
    registrations: canAccess(user, DASHBOARD_SCOPE_KEYS.registrations),
    system: canAccess(user, DASHBOARD_SCOPE_KEYS.system),
  };
}

/** True when the user may see no section at all — the explanatory state. */
export function hasNoDashboardScope(scopes) {
  return !scopes?.registrations && !scopes?.system;
}
