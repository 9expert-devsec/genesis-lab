/**
 * The JWT says who someone was at login. This asks Mongo whether they still
 * are, so a disabled or deleted admin stops on their next request instead of
 * keeping access for up to 72 hours. Superadmins are not exempt.
 *
 * NODE RUNTIME ONLY. The middleware runs on the Edge and must never import this
 * (Mongoose). test/fs/activeAdminGuards holds that.
 *
 * ── TWO ENTRY POINTS, ONE READ ──────────────────────────────────────────────
 * assertActiveAdmin(session)  a page request. Redirects to session-ended.
 * getActiveSession()          an action or API route. Returns the session, or
 *                             null, which every caller already handles as "not
 *                             signed in", so no caller gains a new error shape.
 *
 * ── WHY THE REJECTION GOES THROUGH A ROUTE HANDLER ──────────────────────────
 * A redirect straight to the login page would loop: the JWT is still valid, so
 * the middleware sends a signed-in visitor from the login page back to /admin.
 * The cookie has to go first, and a server component cannot change cookies
 * during render. /api/admin/session-ended can.
 *
 * ── A FAILED READ THROWS, IT DOES NOT MEAN INACTIVE ─────────────────────────
 * Only a read that answers can end a session. A Mongo blip surfaces as an error
 * page or a failed action, which the next request repairs. Reading it as
 * "inactive" would sign every admin out at once.
 *
 * ── WHAT React.cache COVERS ─────────────────────────────────────────────────
 * One render: the layout, requirePage and any requireAdmin below them share one
 * read. It does NOT memoise inside a server action or a route handler, because
 * those run outside a render, so there each guard call is one read. In practice
 * that is one per request, since an action guards once at its top.
 *
 * `React.cache` is read off the namespace rather than imported by name: only
 * the React that Next bundles has it. The React in node_modules is 18.3.1, a
 * named import there fails at link time, and the suite runs on that one.
 *
 * `deps` is the test seam, the same shape as /api/admin/presence. The fake DB is
 * process-global and the suite runs concurrently, so test/pure/activeAdminGuard
 * injects the read rather than seeding rows other files can see.
 */

import * as React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { isActiveAdminDoc, isWellFormedAdminId } from '@/lib/auth/adminStatus';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';

export const SESSION_ENDED_PATH = '/api/admin/session-ended';

const perRender = React.cache ?? ((fn) => fn);

const readAdminStatus = perRender(async (id) => {
  await dbConnect();
  return Admin.findById(id).select('active').lean();
});

export async function isActiveSession(session, { read = readAdminStatus } = {}) {
  const id = session?.user?.id;
  if (!isWellFormedAdminId(id)) return false;
  return isActiveAdminDoc(await read(id));
}

/** For a page render. Returns only if the session's admin is still active. */
export async function assertActiveAdmin(session, deps) {
  if (!(await isActiveSession(session, deps))) redirect(SESSION_ENDED_PATH);
}

/** For an action or route. The session if its admin is active, otherwise null. */
export async function getActiveSession({ readSession = auth, ...deps } = {}) {
  const session = await readSession();
  if (!session?.user) return null;
  return (await isActiveSession(session, deps)) ? session : null;
}
