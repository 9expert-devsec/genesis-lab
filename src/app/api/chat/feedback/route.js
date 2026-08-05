/**
 * POST /api/chat/feedback
 *
 * Thumbs up / down on a chat answer. Forwards to the feedback service named by
 * FEEDBACK_API_URL — a DIFFERENT Cloud Run service from the one behind
 * /api/chat, which is why it reads its own env var.
 *
 * It lives under /api/chat/ anyway, because the path names the CONSUMER, not
 * the upstream: this endpoint exists for the chat widget and for nothing else,
 * and a top-level /api/feedback would claim a generic name for a chat-specific
 * thing. Same reasoning as /api/notifications/active.
 *
 * ── THIS ROUTE NEVER FAILS THE UI ────────────────────────────────────────────
 * Rating an answer is a courtesy the user does US. If the upstream is down,
 * misconfigured, or throttling, the correct outcome is a thumb that lights up
 * and a row we did not get — never a red error under a message the user was
 * happy with. So every path below answers 200 `{ ok: true }`, and `forwarded`
 * tells the truth about whether it actually went anywhere.
 *
 * The one thing that IS rejected is a malformed body, because that cannot have
 * come from our widget and forwarding it would just move the garbage upstream.
 *
 * Ported from review-app's src/app/api/feedback/route.js. Fixed here: the
 * unconditional payload log (it carries the user's own question and the model's
 * answer verbatim), the absent timeout, and the absent input caps.
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { checkRateLimit, rateLimitKeyFrom } from '@/lib/chat/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT_CHARS = 2000; // an assistant answer is longer than a question
const MAX_ID_CHARS = 100;
const UPSTREAM_TIMEOUT_MS = 10_000; // nobody is waiting on this; fail fast

const isDev = () => process.env.NODE_ENV !== 'production';
function debug(...args) {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.log('[/api/chat/feedback]', ...args);
}

/**
 * Accepts either a bare host (append the path) or a full endpoint (use as-is),
 * because the deployed value has been both.
 */
function buildUpstreamUrl(base) {
  const b = String(base || '').trim();
  if (!b) return '';
  if (b.includes('/api/feedback') || b.endsWith('/feedback')) return b;
  return `${b.replace(/\/$/, '')}/api/feedback`;
}

const str = (v, max) => String(v ?? '').slice(0, max);

export async function POST(req) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'invalid_json', message: 'รูปแบบคำขอไม่ถูกต้อง' },
      { status: 400 },
    );
  }

  const rating = payload.rating === 'up' || payload.rating === 'down' ? payload.rating : null;
  if (!rating) {
    return NextResponse.json(
      { error: 'invalid_rating', message: 'ค่าคะแนนไม่ถูกต้อง' },
      { status: 400 },
    );
  }

  // Rebuilt, not trimmed — same reasoning as the chat route: the forwarded
  // shape is decided here, so an extra key a caller invents goes nowhere.
  const body = {
    rating,
    messageId: str(payload.messageId, MAX_ID_CHARS),
    sessionId: str(payload.sessionId, MAX_ID_CHARS),
    userText: str(payload.userText, MAX_TEXT_CHARS),
    assistantText: str(payload.assistantText, MAX_TEXT_CHARS),
    pageUrl: str(payload.pageUrl, 500),
    createdAt: Number(payload.createdAt) || Date.now(),
  };

  // Same per-instance speed bump as /api/chat — see src/lib/chat/rateLimit.js.
  // A rate-limited rating is DROPPED, not rejected: the contract above says the
  // UI never sees a failure, and a lost thumb costs a data point, not a user.
  const headersList = await headers();
  const limit = checkRateLimit(
    rateLimitKeyFrom({
      forwardedFor: headersList.get('x-forwarded-for'),
      realIp: headersList.get('x-real-ip'),
      sessionId: body.sessionId,
    }),
  );
  if (!limit.allowed) {
    debug('rate limited — dropping feedback');
    return NextResponse.json({ ok: true, forwarded: false, reason: 'rate_limited' });
  }

  const upstreamUrl = buildUpstreamUrl(process.env.FEEDBACK_API_URL);
  if (!upstreamUrl) {
    // Unset FEEDBACK_API_URL is a supported deployment state: the widget still
    // works, ratings simply go nowhere.
    return NextResponse.json({ ok: true, forwarded: false, reason: 'not_configured' });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      debug('upstream failed:', upstream.status);
      return NextResponse.json({
        ok: true,
        forwarded: false,
        reason: 'upstream_failed',
        upstreamStatus: upstream.status,
      });
    }

    return NextResponse.json({ ok: true, forwarded: true });
  } catch (err) {
    debug('upstream error:', err?.name || '', err?.message || err);
    return NextResponse.json({ ok: true, forwarded: false, reason: 'upstream_error' });
  }
}
