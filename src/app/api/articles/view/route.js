import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db/connect';
import ArticleView from '@/models/ArticleView';
import { isBotUserAgent, isCountingEnabled, parseViewBody, viewDay } from '@/lib/articles/viewCounter';

/**
 * POST /api/articles/view — count one anonymous article view. Collect only.
 *
 * Called fire-and-forget by ArticleViewBeacon after the article page mounts.
 * Same shape as /api/consent-stats: Node runtime, never cached, always 204 with
 * no body, and a failed count is logged rather than surfaced.
 *
 * Cheap rejections come BEFORE dbConnect: bot user agent, body over 1 KB, body
 * that is not `{ id: <ObjectId> }`. Only POST is exported, so any other method
 * gets Next's 405 without reaching this file.
 *
 * Then a projected `_id`-only read of the ARTICLES collection — a read through
 * the native driver, so this module never imports the Article model and cannot
 * write to it — confirming the id is a real, active article. Unknown or
 * inactive ids are dropped, so junk ids cannot create rows.
 *
 * Stores exactly `{ articleId, day, count }`. No IP, no user agent, no cookie,
 * no identifier of any kind is read into the row; the UA is consulted only to
 * reject, and is not stored.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  // Dev, preview and production share one database; only production traffic is real readership.
  if (!isCountingEnabled(process.env)) return noContent();
  if (isBotUserAgent(request.headers.get('user-agent'))) return noContent();

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 1024) return noContent();

  let raw;
  try {
    raw = await request.text();
  } catch {
    return noContent();
  }
  const id = parseViewBody(raw);
  if (!id) return noContent();

  try {
    await dbConnect();
    const _id = new mongoose.Types.ObjectId(id);
    const exists = await mongoose.connection.db
      .collection('articles')
      .findOne({ _id, active: true }, { projection: { _id: 1 } });
    if (!exists) return noContent();

    await ArticleView.updateOne(
      { articleId: _id, day: viewDay() },
      { $inc: { count: 1 } },
      { upsert: true }
    );
  } catch (err) {
    // A lost view is not worth an error the beacon would only ignore.
    console.warn('[articles/view] increment failed:', err?.message ?? err);
  }
  return noContent();
}
