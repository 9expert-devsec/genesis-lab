/**
 * Pure RBAC predicates (Phase 3d).
 *
 * Extracted from guard.js so callers can reuse them WITHOUT pulling in the
 * server-only `auth` import — the Phase-4 sidebar needs these client-side,
 * and action guards want a dependency-light check. No imports of `auth`,
 * `next/navigation`, or mongoose here — keep it pure.
 *
 * Permission model: a session carries `user.pages` (array of page keys) and
 * `user.isSuperadmin`. `pages == null` is the superadmin allow-all sentinel
 * (see options.js authorize()).
 */

import { resolvePageKey, ALL_PAGE_KEYS } from '@/lib/rbac/pages';

/**
 * Pure predicate: may `user` access the page identified by `pageKey`?
 * Superadmin (or the `pages == null` sentinel) is allowed everything.
 */
export function canAccess(user, pageKey) {
  if (!user) return false;
  if (user.isSuperadmin || user.pages == null) return true;
  return Array.isArray(user.pages) && user.pages.includes(pageKey);
}

/**
 * The menu keys a user may READ audit rows for — the server-side clamp.
 *
 * Returns `null` for superadmin (and for the `pages == null` sentinel), meaning
 * NO CLAMP: the caller must omit the `menu` filter entirely rather than build
 * one from this. Anything else returns an array, possibly empty.
 *
 * ── WHY THE NARROWING TO ALL_PAGE_KEYS IS THE POINT ─────────────────────────
 * It is not tidying. `user.pages` is whatever was stored on the role, and two
 * kinds of value must never reach a query:
 *
 *   · a STALE key — a page that was renamed or removed since the role was
 *     saved. Harmless in a `$in`, but it makes the clamp lie about what it
 *     covers.
 *   · `UNKNOWN_MENU` — the bucket `recordAdminAction` files a row under when a
 *     caller passes a menu key the registry does not know. Those rows are
 *     visible to SUPERADMIN ONLY, and the mechanism that enforces it is
 *     precisely that 'unknown' is not in ALL_PAGE_KEYS and so can never survive
 *     this filter. A non-superadmin cannot be granted it, because there is no
 *     page key to grant.
 *
 * That is the fail-closed behaviour, and it is a NAMED, TESTED property rather
 * than a consequence — do not "simplify" this to `user.pages ?? []`.
 *
 * Pure and client-safe, like the rest of this file.
 *
 * @param {{isSuperadmin?: boolean, pages?: string[]|null}|null|undefined} user
 * @returns {string[]|null} null = no clamp (see all menus)
 */
export function menusForUser(user) {
  if (!user) return [];
  if (user.isSuperadmin || user.pages == null) return null;
  if (!Array.isArray(user.pages)) return [];
  const registry = new Set(ALL_PAGE_KEYS);
  return user.pages.filter((key) => registry.has(key));
}

/**
 * Path-based convenience: resolve a pathname to its page key, then check
 * access. Unknown admin paths deny by default.
 */
export function canAccessPath(user, pathname) {
  const key = resolvePageKey(pathname);
  if (!key) return false;
  return canAccess(user, key);
}

// ── Tier predicates (Page Builder) ───────────────────────────────
//
// `tier` is ORTHOGONAL to the `pages` permission above: `pages` controls
// whether a user can open a page (e.g. /admin/pages at all), while `tier`
// controls what they may DO inside it. Three tiers, escalating:
//   editor     → author/edit content, no publishing, no raw code.
//   marketing  → editor + publish/schedule + manage preview links.
//   developer  → marketing + raw HTML/CSS/JSON-LD overrides.
//
// Kept here (not in guard.js) so these stay pure and client-usable — no
// `auth` import, same as canAccess.

/** The three role tiers, least→most privileged. Shared by model/action/UI. */
export const ROLE_TIERS = ['editor', 'marketing', 'developer'];
export const DEFAULT_TIER = 'editor';

/**
 * Resolve a user's effective tier. Superadmin is always `developer`
 * regardless of the stored value — the override lives HERE (in the
 * predicate) rather than in the session, so the session can carry the raw
 * stored tier and this stays the single source of truth. Unknown/missing
 * tiers fall back to `editor` (least privilege).
 */
export function getTier(user) {
  if (!user) return DEFAULT_TIER;
  if (user.isSuperadmin) return 'developer';
  return ROLE_TIERS.includes(user.tier) ? user.tier : DEFAULT_TIER;
}

/** Developer only — may write raw HTML/CSS/JSON-LD overrides. */
export function canUseAdvanced(user) {
  return getTier(user) === 'developer';
}

/** Marketing or developer — may publish / schedule a page. */
export function canPublish(user) {
  const tier = getTier(user);
  return tier === 'marketing' || tier === 'developer';
}

/** Marketing or developer — may enable/manage preview links. */
export function canManagePreview(user) {
  const tier = getTier(user);
  return tier === 'marketing' || tier === 'developer';
}
