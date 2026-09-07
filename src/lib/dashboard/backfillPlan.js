/**
 * The dashboard-scope backfill, as a PURE PLAN over role documents.
 *
 * ══ WHY migrate-rbac.mjs IS THE WRONG VEHICLE ═══════════════════════════════
 *
 * Three reasons, any one of which is fatal:
 *
 *   1. IT CANNOT TOUCH AN EXISTING ROLE. Every role it writes goes through
 *      `$setOnInsert`, which its own header calls out as making a re-run "a pure
 *      no-op for any role that already exists". Running it after this round
 *      would add the two scopes to precisely nobody.
 *   2. IT ONLY KNOWS THE FIVE SEEDED ROLES. Roles created since through
 *      /admin/roles are invisible to it, and those are exactly the ones a real
 *      deployment cares about.
 *   3. ITS `pages` COME FROM SEED POLICY, NOT FROM LIVE STATE. `PAGE_SET` and
 *      `ROLE_MEMBERSHIP` describe what a role SHOULD have had at seed time. The
 *      backfill has to key off what each role ACTUALLY holds today.
 *
 * So the backfill is a separate one-time script, and this module is the half of
 * it that can be tested without a database.
 *
 * ── THE RULE, IN ONE LINE ───────────────────────────────────────────────────
 * A role that holds `dashboard` gets both scopes. Nothing else is touched.
 *
 * ── WHAT THAT DOES AND DOES NOT PRESERVE — READ THIS BEFORE RUNNING IT ──────
 *
 * `dashboard_registrations` PRESERVES the status quo exactly. Before this round
 * a role holding `dashboard` saw the registration cards, the donut and the
 * trend chart; after the backfill it holds the key that gates them. No change.
 *
 * `dashboard_system` WIDENS. The ภาพรวมระบบ strip used to be gated on
 * `isSuperadmin` — no `pages` grant could produce it — and it is now gated on
 * this key. So every non-superadmin role holding `dashboard` GAINS the strip
 * the day this is applied. That is the round's stated intent (content writers
 * and course staff are supposed to get the system overview, and there was
 * previously no way to give it to them short of making someone a superadmin),
 * but it is a real access change and it is named here rather than left to be
 * discovered.
 *
 * IF THAT WIDENING IS NOT WANTED, the one-line change is to drop
 * `DASHBOARD_SCOPE_KEYS.system` from `SCOPES_TO_ADD` below and grant it per
 * role from /admin/roles instead. test/pure/dashboardScopeBackfill pins both
 * halves, so making that change reddens the assertion that records the
 * widening — deliberately, so the decision has to be re-made rather than
 * drifted into.
 */

// RELATIVE, and .js-suffixed, because scripts/backfill-dashboard-scopes.mjs
// imports this module from plain node, which resolves neither the '@/' alias nor
// an extensionless specifier. scopeKeys.js is import-free precisely so this
// chain terminates here — see its header.
import { DASHBOARD_SCOPE_KEYS } from './scopeKeys.js';

/** The page key that decides whether a role is in scope for the backfill. */
export const BACKFILL_TRIGGER_KEY = 'dashboard';

/** The keys added to every role that holds the trigger. */
export const SCOPES_TO_ADD = Object.freeze([
  DASHBOARD_SCOPE_KEYS.registrations,
  DASHBOARD_SCOPE_KEYS.system,
]);

/**
 * What the backfill would do to each role.
 *
 * IDEMPOTENT BY CONSTRUCTION: `add` lists only the keys a role does not already
 * have, so a second run plans nothing. That is asserted rather than assumed —
 * a migration whose second run is not a no-op is one nobody can safely re-run
 * after a partial failure.
 *
 * @param {Array<{key?: string, pages?: string[], isSuperadmin?: boolean}>} roles
 * @returns {{
 *   toUpdate: Array<{key: string, add: string[], before: string[], after: string[]}>,
 *   skipped: Array<{key: string, reason: string}>,
 * }}
 */
export function planDashboardScopeBackfill(roles = []) {
  const toUpdate = [];
  const skipped = [];

  for (const role of Array.isArray(roles) ? roles : []) {
    const key = role?.key ?? '(unkeyed)';
    const pages = Array.isArray(role?.pages) ? role.pages : [];

    if (!pages.includes(BACKFILL_TRIGGER_KEY)) {
      /**
       * A role WITHOUT `dashboard` is left alone, and that is the point of
       * keying off the trigger rather than granting the scopes to everyone: a
       * role that cannot open the dashboard has no business holding a key that
       * gates half of it. Granting one would be invisible today and would
       * silently become access the moment somebody ticked `dashboard`.
       *
       * Superadmin roles land here too when their `pages` is empty — which is
       * correct and costs them nothing, since canAccess short-circuits on
       * isSuperadmin and they see both halves regardless.
       */
      skipped.push({ key, reason: `does not hold '${BACKFILL_TRIGGER_KEY}'` });
      continue;
    }

    const add = SCOPES_TO_ADD.filter((k) => !pages.includes(k));
    if (add.length === 0) {
      skipped.push({ key, reason: 'already holds both scopes' });
      continue;
    }

    toUpdate.push({ key, add, before: [...pages], after: [...pages, ...add] });
  }

  return { toUpdate, skipped };
}

/**
 * Which dashboard sections a role's `pages` array yields.
 *
 * Deliberately expressed over a raw pages array rather than over a session
 * user, so a test can ask "what did this role see BEFORE, and what does it see
 * AFTER" without constructing sessions. `isSuperadmin` is passed separately
 * because it is the bypass, and because the OLD system-strip gate was that flag
 * and nothing else.
 */
export function sectionsVisible({ pages = [], isSuperadmin = false } = {}) {
  if (isSuperadmin) return { registrations: true, system: true };
  return {
    registrations: pages.includes(DASHBOARD_SCOPE_KEYS.registrations),
    system: pages.includes(DASHBOARD_SCOPE_KEYS.system),
  };
}

/**
 * What each role saw BEFORE round E2 — the baseline the backfill is measured
 * against.
 *
 * Registration sections: any role holding `dashboard`.
 * System strip: superadmin ONLY. This is the line that makes the widening
 * visible; it is a record of the old behaviour, not a proposal.
 */
export function sectionsVisibleBeforeE2({ pages = [], isSuperadmin = false } = {}) {
  return {
    registrations: isSuperadmin || pages.includes(BACKFILL_TRIGGER_KEY),
    system: isSuperadmin,
  };
}
