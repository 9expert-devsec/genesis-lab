/**
 * Central RBAC guard helpers (Phase 2+).
 *
 * `requirePage` / `requirePageAction` are server-only (they import `auth`).
 * The pure predicates `canAccess` / `canAccessPath` now live in
 * `./access` (no `auth` dependency, reusable client-side); they are
 * re-exported here so existing `@/lib/rbac/guard` imports keep working.
 *
 * Permission model: a session carries `user.pages` (array of page keys) and
 * `user.isSuperadmin`. `pages == null` is the superadmin allow-all sentinel
 * (see options.js authorize()).
 */

import { auth } from '@/lib/auth/options';
import { redirect } from 'next/navigation';
import { canAccess, canAccessPath } from '@/lib/rbac/access';

// Re-export the pure predicates so callers importing from guard.js are
// unaffected by the Phase-3d split into access.js.
export { canAccess, canAccessPath };

/**
 * Server-Component guard. Returns the session if the current user may access
 * `pageKey`; redirects to the portal when unauthenticated, or to /admin/403
 * when authenticated but lacking the page.
 */
export async function requirePage(pageKey) {
  const session = await auth();
  if (!session?.user) redirect('/admin/9x-portal');
  if (canAccess(session.user, pageKey)) return session;
  redirect('/admin/403');
}

/**
 * Guard for server actions / route handlers. Throws instead of redirecting
 * so the caller can surface the error however it wants.
 */
export async function requirePageAction(pageKey) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHENTICATED');
  if (!canAccess(session.user, pageKey)) throw new Error('FORBIDDEN');
  return session;
}
