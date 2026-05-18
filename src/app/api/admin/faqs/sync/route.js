/**
 * POST /api/admin/faqs/sync
 *
 * Manual trigger for a FAQs resync. Used by the admin UI button.
 * Site-wide middleware only matches `/admin/:path*`, so we gate this
 * route handler explicitly with auth().
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/options';
import { syncFaqs } from '@/lib/faqs/syncFaqs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncFaqs();
    return NextResponse.json({ success: result.ok, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/admin/faqs/sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}