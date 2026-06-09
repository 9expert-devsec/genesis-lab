/**
 * POST /api/admin/navmenu/sync
 *
 * Manual trigger for a nav-menu resync. Used by the admin UI button.
 * Site-wide middleware only matches `/admin/:path*`, so we gate this
 * route handler explicitly with auth().
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { syncNavMenuData } from '@/lib/navmenu/syncNavMenuData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncNavMenuData();
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
