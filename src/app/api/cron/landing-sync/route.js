/**
 * GET /api/cron/landing-sync
 *
 * Vercel Cron entry point. Vercel Cron sends GET requests with an
 * Authorization header containing CRON_SECRET; we reject anything
 * that doesn't match.
 *
 * Schedule via vercel.json:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/landing-sync", "schedule": "0 *​/1 * * *" }
 *     ]
 *   }
 * (Adjust schedule as needed — once per hour is a reasonable default.)
 *
 * Set `CRON_SECRET` in Vercel project env vars.
 */

import { NextResponse } from 'next/server';
import { syncLandingData } from '@/lib/landing/syncLandingData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  // If a secret is configured, require it. If unset (e.g. local dev),
  // we still allow GETs through so devs can hit the route to test —
  // make sure CRON_SECRET is set in production.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncLandingData();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/cron/landing-sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
