/**
 * GET /api/cron/instructors-sync
 *
 * Vercel Cron entry point. Schedule via vercel.json. Auth gate
 * matches the other cron routes (Bearer CRON_SECRET).
 */

import { NextResponse } from 'next/server';
import { syncInstructors } from '@/lib/instructors/syncInstructors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncInstructors();
    return NextResponse.json({ ok: result.ok, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/cron/instructors-sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
