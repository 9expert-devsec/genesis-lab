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

import { resolvePageKey } from '@/lib/rbac/pages';

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
