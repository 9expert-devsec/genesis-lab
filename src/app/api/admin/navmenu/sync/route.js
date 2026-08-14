/**
 * POST /api/admin/navmenu/sync
 *
 * Manual trigger for a nav-menu resync. Used by the admin UI button on
 * /admin/cache. Site-wide middleware only matches `/admin/:path*`, so this
 * route handler is gated explicitly.
 *
 * ── WHAT ROUND 7 CHANGED, AND WHY IT WAS NOT COSMETIC ──────────────────────
 * Until round 7 this route existed with ZERO callers — written for a button
 * that was never built. Wiring the button up meant looking at what it would
 * actually be exposing, and two things were missing:
 *
 * 1. It called `auth()` and checked `session?.user`, which AUTHENTICATES and
 *    does not AUTHORISE. Any signed-in admin could rebuild the mega menu for
 *    every public page, including one whose role does not hold the Cache
 *    Console at all. `requireAdmin('landing_cache')` checks the page key —
 *    `landing_cache` being the RBAC key for /admin/cache, deliberately kept
 *    after the page was renamed because Role.pages stores it in Mongo
 *    (rbac/pages.js:90-97).
 *
 * 2. It recorded nothing. A control that rewrites a snapshot every public page
 *    reads, reachable by any admin, left no trace of who pressed it — and this
 *    sync can REFUSE (the downgrade guard) or come back `partial`, so "did
 *    anyone run this, and what did it say" is a question that gets asked.
 *
 * `requireAdmin` throws a plain Error carrying `.status` (401/403) precisely so
 * a route handler can map it, which is what the catch below does. Its own
 * docstring says so; this is the first route to take it up on the offer.
 *
 * ── WHY THE AUDIT ROW IS WRITTEN HERE AND NOT INSIDE syncNavMenuData ───────
 * The cron calls the same function. A row written inside the sync would record
 * `system:cron` runs as admin actions eight times a day and drown the human
 * presses this trail exists to show. The row belongs to the BUTTON PRESS, so it
 * lives at the only call site that is one.
 *
 * `menu` and `entity` are LITERALS at this call site, never derived — the
 * round-3 contract finding. `landing_cache` also matches the requireAdmin key
 * above, which is the invariant test/fs/auditCoverage enforces for actions.
 * NOTE that this file is a ROUTE, and that sweep walks src/lib/actions only, so
 * nothing generic covers this pair — test/fs/navSyncButtonWiring asserts it
 * directly.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { syncNavMenuData } from '@/lib/navmenu/syncNavMenuData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  let session;
  try {
    session = await requireAdmin('landing_cache');
  } catch (err) {
    const status = err?.status === 403 ? 403 : 401;
    return NextResponse.json(
      { ok: false, error: status === 403 ? 'Forbidden' : 'Unauthorized' },
      { status }
    );
  }

  try {
    const result = await syncNavMenuData();

    /**
     * NO `before`, and NO `after` — the outcome goes in `meta`.
     *
     * That is not a shortcut, it is what the pair's policy dictates. This pair
     * is `count_only`, and reducePayload NULLS both sides for that policy
     * (recordAdminAction.js:139-143) precisely because a sync's outcome is a
     * count and `meta` is where counts belong — the AdminAuditLog field notes
     * name "the {synced, errors} counts a bulk sync returns" as the example.
     * Passing this object as `after` would have been silently discarded, and
     * the row would have recorded that a sync happened and nothing about it.
     *
     * A REFUSED run is recorded too, deliberately: "an admin pressed sync and
     * the downgrade guard said no" is the single most useful row this trail can
     * hold, and dropping it because nothing was written would hide exactly the
     * case someone comes here looking for.
     *
     * The counts are `null` and not `0` on a refused run because a refusal
     * returns neither — syncNavMenuData's refusal branch returns
     * {ok, refused, verdict, reason, shrunk, …, status, errors} with no
     * programCount/skillCount at all. Zero would read as "synced, found
     * nothing", which is a different and much more alarming event.
     */
    recordAdminActionAfter({
      menu:        'landing_cache',
      action:      'sync',
      entity:      'nav_menu_sync',
      recordId:    'navmenu_v1',
      recordLabel: 'เมกะเมนูหลักสูตร (nav_menu_cache)',
      meta: {
        status:       result?.status ?? 'unknown',
        refused:      Boolean(result?.refused),
        verdict:      result?.verdict ?? null,
        programCount: result?.programCount ?? null,
        skillCount:   result?.skillCount ?? null,
        errors:       (result?.errors ?? []).length,
      },
      actor: { id: session.user?.id, name: session.user?.name },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/admin/navmenu/sync]', err);
    return NextResponse.json(
      { ok: false, error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
