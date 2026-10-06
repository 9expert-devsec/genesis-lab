import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import ConsentDailyStat from '@/models/ConsentDailyStat';
import {
  MAX_BODY_BYTES,
  bangkokDate,
  incrementsFor,
  isSameSiteOrigin,
  normaliseStatsHost,
  validateConsentStatsBody,
} from '@/lib/consentStats';

/**
 * POST /api/consent-stats — count one cookie-consent decision (round CB-C §4).
 *
 * Called fire-and-forget by the banner mount after a decision has already been
 * applied, stored and broadcast; nothing the visitor sees waits on it, and a
 * failure here costs one count, never the decision.
 *
 *   · strict body (src/lib/consentStats.js) — anything else is a 400
 *   · same-site Origin only — a foreign or missing Origin is ignored (204, so a
 *     prober learns nothing), not counted
 *   · stores counters only: `$inc` on one (UTC+7 date, host) document; no id,
 *     no IP, no user agent, no cookie is read or written
 *
 * The HOST is the request's own (x-forwarded-host on Vercel), so dev/preview
 * clicks land in their own rows — dev and production share this database.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
const badRequest = (error) => NextResponse.json({ error }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const host = normaliseStatsHost(request.headers.get('x-forwarded-host') || request.headers.get('host'));
  if (!host || !isSameSiteOrigin(request.headers.get('origin'), host)) return noContent();

  let raw;
  try {
    raw = await request.text();
  } catch {
    return badRequest('unreadable body');
  }
  if (raw.length > MAX_BODY_BYTES) return badRequest('body too large');

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest('invalid JSON');
  }

  const check = validateConsentStatsBody(body);
  if (!check.ok) return badRequest(check.error);

  try {
    await dbConnect();
    await ConsentDailyStat.updateOne(
      { date: bangkokDate(), host },
      { $inc: incrementsFor(check.value) },
      { upsert: true }
    );
  } catch (err) {
    // A lost count is not worth a 500 the client would only ignore.
    console.warn('[consent-stats] increment failed:', err?.message ?? err);
  }
  return noContent();
}
