import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildArticleSnapshot } from '@/lib/articles/msdbSnapshot';
import { msdbPutArticleSnapshot, MsdbSyncError } from '@/lib/api/msdb-write';

/**
 * Vercel Cron (vercel.json: minute 20 of every 3rd hour): send the
 * published-article snapshot to MSDB.
 *
 * FAILS CLOSED, unlike the six older cron routes: with CRON_SECRET unset
 * every request gets a 503, because a real call REPLACES MSDB's article set.
 *
 *   GET ?dry=1  build only, send nothing → { count, byType, sample, bytes }
 *   GET         build and send → MSDB's answer; MSDB non-2xx → 502
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req, secret) {
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (!authorized(req, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1';

  let snapshot;
  try {
    snapshot = await buildArticleSnapshot();
  } catch (err) {
    console.error('[/api/cron/articles-msdb-sync] build failed', err);
    return NextResponse.json(
      { error: 'Snapshot build failed', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }

  const count = snapshot.items.length;
  const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');

  if (dry) {
    const byType = { article: 0, video: 0 };
    for (const it of snapshot.items) byType[it.type] = (byType[it.type] ?? 0) + 1;
    return NextResponse.json({ dry: true, count, byType, sample: snapshot.items[0] ?? null, bytes });
  }

  try {
    const msdb = await msdbPutArticleSnapshot(snapshot);
    return NextResponse.json({ ok: true, count, bytes, msdb_status: msdb.status, msdb: msdb.body });
  } catch (err) {
    console.error('[/api/cron/articles-msdb-sync] send failed', err);
    if (err instanceof MsdbSyncError) {
      return NextResponse.json(
        { error: 'MSDB rejected the snapshot', message: err.message, msdb_status: err.status, msdb: err.body },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: 'Sync failed', message: err?.message ?? String(err) },
      { status: 502 }
    );
  }
}
