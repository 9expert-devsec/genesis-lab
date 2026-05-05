/**
 * GET /api/cron/promotions-sync
 *
 * Vercel Cron entry point. Schedule via vercel.json — see crons array.
 * Set CRON_SECRET in Vercel project env vars; we reject any request
 * whose Authorization header does not match `Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { syncPromotions } from '@/lib/promotions/syncPromotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  // If a secret is configured, require it. If unset (e.g. local dev),
  // we still allow GETs through so devs can hit the route to test.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPromotions();
    return NextResponse.json({ ok: result.ok, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/cron/promotions-sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
