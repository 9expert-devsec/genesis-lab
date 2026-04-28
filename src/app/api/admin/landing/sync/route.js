/**
 * POST /api/admin/landing/sync
 *
 * Manual trigger for a landing-cache rebuild. Used by the admin UI
 * card. The site-wide middleware only matches `/admin/:path*`, so we
 * gate this route explicitly here.
 *
 * Auth: NextAuth v5 — `auth()` reads the session out of the request.
 * Runtime: nodejs because the sync function pulls in Mongoose.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { syncLandingData } from '@/lib/landing/syncLandingData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncLandingData();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/admin/landing/sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
