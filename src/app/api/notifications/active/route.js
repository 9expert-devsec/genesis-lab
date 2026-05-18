/**
 * GET /api/notifications/active
 *
 * Public read endpoint for the client-side popup. Returns active popups
 * (sorted ascending by weight) so `SitePopup` can pick the first
 * eligible one client-side after applying cooldown + page-scope rules.
 *
 * 60s ISR cache — fresh enough for editors to see their changes within
 * a minute without hammering the DB on every page load.
 */

import { NextResponse } from 'next/server';
import { getActivePopups } from '@/lib/actions/site-notifications';

export const runtime = 'nodejs';
export const revalidate = 60;

export async function GET() {
  try {
    const popups = await getActivePopups();
    return NextResponse.json(popups);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/notifications/active]', err);
    return NextResponse.json([], { status: 200 });
  }
}