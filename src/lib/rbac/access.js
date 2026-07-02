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
