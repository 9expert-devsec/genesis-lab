/**
 * GET /api/cron/navmenu-sync
 *
 * Vercel Cron entry point. Vercel Cron sends GET requests with an
 * Authorization header containing CRON_SECRET; we reject anything that
 * doesn't match. If CRON_SECRET is unset (e.g. local dev) we let GETs
 * through so devs can hit the route to test — set CRON_SECRET in prod.
 *
 * Scheduled via vercel.json: "0 *​/3 * * *" (every 3 hours).
 */

import { NextResponse } from 'next/server';
import { syncNavMenuData } from '@/lib/navmenu/syncNavMenuData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncNavMenuData();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/cron/navmenu-sync]', err);
    return NextResponse.json(
      { ok: false, error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
