/**
 * POST /api/admin/promotions/sync
 *
 * Manual trigger for a promotions resync. Used by the admin UI button.
 * Site-wide middleware only matches `/admin/:path*`, so we gate this
 * route handler explicitly with auth().
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { syncPromotions } from '@/lib/promotions/syncPromotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPromotions();
    return NextResponse.json({ success: result.ok, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/admin/promotions/sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
