/**
 * POST /api/admin/presence — the heartbeat.
 *
 * The admin shell's PresenceHeartbeat (src/components/admin/PresenceHeartbeat.jsx)
 * calls this every 60 s while a tab is visible. It stamps `lastSeenAt` on the
 * caller's OWN admin document and nothing else; src/lib/admin/presence.js
 * turns the stamp into Online / Offline for the accounts list.
 *
 * ── A ROUTE HANDLER, NOT A SERVER ACTION — DELIBERATELY ─────────────────────
 * Two reasons, both structural:
 *   · test/fs/auditCoverage classifies every exported function under
 *     src/lib/actions/ whose body reaches `.updateOne(` as a mutating export
 *     and pins the total. A heartbeat there would move that number for a write
 *     that is not an admin action in the audit sense at all.
 *   · this write must NEVER produce an AdminAuditLog row. Nothing records a
 *     row automatically in this repo — only an explicit recordAdminAction*
 *     call does — so the guarantee is that this file does not import the
 *     audit writer, and test/fs/adminPresence holds that on `withImports`.
 *
 * ── WHAT IT CHECKS, AND WHAT IT DOES NOT ────────────────────────────────────
 * `auth()` only: any signed-in admin may stamp their own row — there is no
 * page key for "being here". The filter carries `active: true` so a disabled
 * account's still-valid session stamps nothing (matchedCount 0 is still 204;
 * the client has nothing to do with the answer). No body is read, no
 * parameter is trusted: the id comes from the session.
 *
 * ── 204, ALWAYS, ONCE PAST AUTH ─────────────────────────────────────────────
 * The caller swallows errors and never inspects the reply; a failed stamp
 * costs one minute of "seen", nothing more. A 500 on a heartbeat would only
 * be a log line the next beat makes moot, so a write failure is logged here
 * and answered 204 like a success — there is no one to tell.
 *
 * `deps` is the test seam (the corpus routes' `handleGet(req, deps)` shape):
 * production calls POST → handlePost(req) with the real auth and model.
 */
import { NextResponse } from 'next/server';
import { auth as realAuth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function handlePost(_req, deps = {}) {
  const {
    auth = realAuth,
    connect = dbConnect,
    updateOne = (filter, update) => Admin.updateOne(filter, update),
    now = () => new Date(),
    log = console.error,
  } = deps;

  const session = await auth();
  const id = session?.user?.id;
  if (!id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    await connect();
    await updateOne({ _id: id, active: true }, { $set: { lastSeenAt: now() } });
  } catch (err) {
    log('[presence] stamp failed:', err?.message ?? err);
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export async function POST(req) {
  return handlePost(req);
}
