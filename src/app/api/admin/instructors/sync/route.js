/**
 * POST /api/admin/instructors/sync
 *
 * Manual trigger for an instructors resync. Mirrors the FAQ/Promotion
 * sync routes — auth-gated, returns the sync result envelope.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { syncInstructors } from '@/lib/instructors/syncInstructors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncInstructors();
    return NextResponse.json({ success: result.ok, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/admin/instructors/sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
