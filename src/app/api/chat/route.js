/**
 * POST /api/chat
 *
 * Same-origin proxy in front of the 9Expert chatbot service. The browser talks
 * ONLY to this route; it never learns the upstream host and never opens a
 * cross-origin connection to it.
 *
 * That is not tidiness — next.config.mjs ships a `connect-src 'self' …` CSP.
 * It is Report-Only today, so a direct browser→Cloud-Run call would "work"
 * while quietly logging a violation on every message, and would break outright
 * the day the policy is enforced. Keeping the upstream host server-side means
 * the CSP needs no widening at all.
 *
 * Ported from review-app's src/app/api/chat/route.js with five defects fixed
 * (timeout, log gating, input caps, rate limiting, missing-config handling).
 * Each is marked FIX below.
 *
 * ── Error vocabulary ─────────────────────────────────────────────────────────
 * Every failure answers with the repo's `{ error: <code>, message: <prose> }`
 * shape, and the CODE is what the client branches on — `chat_unavailable` (the
 * service was never configured) has to be renderable as a calm "chat is off"
 * state, distinctly from `upstream_failed` / `upstream_timeout`, which are
 * genuine faults worth showing as an error.
 *
 *   400 invalid_json       body was not JSON
 *   400 empty_message      nothing to ask
 *   413 message_too_long   over MAX_MESSAGE_CHARS
 *   429 rate_limited       see src/lib/chat/rateLimit.js — a speed bump only
 *   502 upstream_failed    upstream unreachable, or answered with non-JSON
 *   503 chat_unavailable   CHATBOT_V2_API_URL unset or unparseable
 *   504 upstream_timeout   upstream did not answer within UPSTREAM_TIMEOUT_MS
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { checkRateLimit, rateLimitKeyFrom } from '@/lib/chat/rateLimit';
import { MAX_HISTORY_CHARS, MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS } from '@/lib/chat/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── THE PLATFORM CEILING, AND WHY IT IS EXPORTED RATHER THAN ASSUMED ─────────
// maxDuration is the platform's hard kill. Our own abort (UPSTREAM_TIMEOUT_MS,
// derived from this number below) has to fire BEFORE it, or the timeout branch
// in this file is unreachable: the platform kills the invocation first and the
// caller gets Vercel's own 504 — an HTML error page with no `upstream_timeout`
// code in it — while the source keeps looking completely correct. A dev-server
// test cannot see that, because dev has no ceiling at all.
//
// Left unset, the ceiling is Vercel's plan-dependent DEFAULT, which on every
// tier whose default is documented is lower than the abort we want. So it is
// declared here.
//
// THE EXPORT IS ALSO A DETECTOR, and that is the load-bearing reason to prefer
// it over a bare constant: a maxDuration the project's plan cannot honour FAILS
// THE BUILD. It cannot deploy silently degraded. So the "correct in source,
// dead in production" failure this guards against is not merely documented — it
// is unreachable without a red deploy telling us why.
//
// 30 is inside the ceiling of every current plan tier. If a plan caps duration
// below 30, lower THIS number only: the abort follows it automatically.
export const maxDuration = 30;

// FIX 3 — caps enforced HERE, not in the browser. The client's own limits are a
// courtesy to the user; these are the ones that hold when the request does not
// come from our client at all. The NUMBERS are shared with the composer via
// src/lib/chat/limits.js so the two cannot disagree — a client that sends what
// the server refuses fails silently, showing a generic error on a message the
// user was allowed to type.

// FIX 1 — review-app awaited fetch with no abort at all, so a hung upstream
// pinned the function until the PLATFORM killed it, with no JSON answer for the
// client to render.
//
// DERIVED, NOT WRITTEN DOWN TWICE. The invariant is "abort strictly before the
// platform kills us", and as two independent literals ten lines apart that is a
// rule a person has to remember while editing one of them. Subtracting the
// slack from the ceiling makes it hold by construction: there is one number to
// change, lowering it lowers both, and no comment here can go stale against the
// code because this line IS the relationship. (Currently 30 - 5 = 25s.)
const TIMEOUT_SLACK_S = 5; // room to serialise the 504 after we abort
const UPSTREAM_TIMEOUT_MS = (maxDuration - TIMEOUT_SLACK_S) * 1000;

// FIX 2 — review-app logged upstream status AND 2000 chars of the upstream body
// on EVERY request. User messages and the model's answers flow through here, so
// that is conversation content in the platform log with no retention story.
// Nothing below is logged in production.
const isDev = () => process.env.NODE_ENV !== 'production';
function debug(...args) {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.log('[/api/chat]', ...args);
}

const fail = (code, message, status, extraHeaders) =>
  NextResponse.json({ error: code, message }, { status, headers: extraHeaders });

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isEmptyObject(x) {
  return x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 0;
}

/**
 * Ported verbatim from review-app. The upstream sometimes asks the user to pick
 * a category and then sends no chips to pick FROM, which leaves the user staring
 * at a question with no affordance. Injection is deliberately narrow: it fires
 * only for a plain-text turn whose wording is that question.
 */
function shouldInjectQuickReplies(data) {
  const resp = String(data?.response || data?.reply || data?.message || '').trim();
  const mt = String(data?.message_type || '').trim();
  return mt === 'text' && /เลือกหมวดหมู่|หมวดหมู่ที่สนใจ|สนใจเรียนด้านไหน/.test(resp);
}

function buildFallbackQuickReplies() {
  // label → value sent back to the model. No counts: upstream does not send any
  // in this branch, and inventing them would be fiction on a chip.
  return {
    'Microsoft Excel': 'Microsoft Excel',
    'Power BI': 'Power BI',
    'Microsoft SQL Server': 'Microsoft SQL Server',
    'Power Automate': 'Power Automate',
    'Power Apps': 'Power Apps',
    Canva: 'Canva',
    'Generative AI': 'Generative AI',
    'Web Developer': 'Web Developer',
    'Data Analyst': 'Data Analyst',
  };
}

/**
 * Reduce whatever arrived to exactly the three fields upstream is given.
 *
 * The payload is REBUILT rather than trimmed: review-app forwarded `payload`
 * verbatim, so any extra key a caller invented rode straight through to the
 * model. Rebuilding means the forwarded shape is decided here.
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn?.role === 'assistant' ? 'assistant' : 'user',
      content: String(turn?.content ?? '').slice(0, MAX_HISTORY_CHARS),
    }))
    .filter((turn) => turn.content);
}

/**
 * FIX 5 — an unset CHATBOT_V2_API_URL used to be a 500 on every keystroke.
 * A missing env var is a deployment state, not a fault, and the client renders
 * it as "chat unavailable". Returning null here (rather than throwing) is what
 * makes the two cases distinguishable at the call site.
 */
function upstreamUrl() {
  const base = String(process.env.CHATBOT_V2_API_URL || '').trim();
  if (!base) return null;
  try {
    const url = new URL('/api/chat', base);
    url.searchParams.set('backend', 'langchain');
    return url;
  } catch {
    // A typo'd base is the same user-visible situation as an absent one.
    debug('CHATBOT_V2_API_URL is set but not a valid URL');
    return null;
  }
}

export async function POST(req) {
  const url = upstreamUrl();
  if (!url) {
    return fail(
      'chat_unavailable',
      'ระบบแชทยังไม่พร้อมใช้งานในขณะนี้',
      503,
    );
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return fail('invalid_json', 'รูปแบบคำขอไม่ถูกต้อง', 400);
  }

  const message = String(payload.message ?? '').trim();
  if (!message) {
    return fail('empty_message', 'กรุณาพิมพ์คำถาม', 400);
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return fail(
      'message_too_long',
      `ข้อความยาวเกินไป (จำกัด ${MAX_MESSAGE_CHARS} ตัวอักษร)`,
      413,
    );
  }

  const sessionId = String(payload.sessionId ?? '').trim().slice(0, 100);

  // FIX 4 — see src/lib/chat/rateLimit.js. In a serverless runtime this counter
  // is PER INSTANCE, so it is a speed bump against a runaway client, not a limit
  // against anyone who wants past it. Stated here as well as there so nobody
  // reading only the route mistakes it for protection.
  const headersList = await headers();
  const limit = checkRateLimit(
    rateLimitKeyFrom({
      forwardedFor: headersList.get('x-forwarded-for'),
      realIp: headersList.get('x-real-ip'),
      sessionId,
    }),
  );
  if (!limit.allowed) {
    return fail(
      'rate_limited',
      'ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
      429,
      { 'retry-after': String(limit.retryAfterSeconds) },
    );
  }
  // Surfaced so the limiter's state is OBSERVABLE from outside. Without it the
  // only symptom of a limiter that silently resets — which is exactly what a
  // per-instance counter does on every cold start — is a 429 that never
  // arrives, and "never fires" is indistinguishable from "nobody hit it".
  const rateLimitHeaders = { 'x-ratelimit-remaining': String(limit.remaining) };

  let upstream;
  try {
    upstream = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        message,
        history: sanitizeHistory(payload.history),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    // AbortSignal.timeout rejects with TimeoutError; a caller-side abort gives
    // AbortError. Both mean "no answer in time", which is not the same failure
    // as "could not reach it".
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      debug('upstream timed out after', UPSTREAM_TIMEOUT_MS, 'ms');
      return fail(
        'upstream_timeout',
        'ระบบแชทตอบกลับช้าผิดปกติ กรุณาลองใหม่อีกครั้ง',
        504,
      );
    }
    debug('upstream fetch failed:', err?.message || err);
    return fail('upstream_failed', 'ไม่สามารถเชื่อมต่อระบบแชทได้ กรุณาลองใหม่อีกครั้ง', 502);
  }

  const text = await upstream.text();
  const data = safeJsonParse(text);

  debug('upstream status:', upstream.status);

  if (!data) {
    // Diverges from review-app, which echoed the raw upstream body to the
    // browser and reused the upstream status — so an upstream 200 carrying an
    // HTML error page reached the client as a SUCCESS the parser then choked on.
    // 502 says what actually happened, and the body is not relayed.
    //
    // The body is logged HERE rather than left to a shared log above this
    // branch: since we do not relay it, this is the only record of what upstream
    // actually said, and a later tidy-up that moved a generic body log below the
    // early return would delete the evidence for precisely the failure that
    // needs it. A body we neither relay nor log is a failure with no evidence.
    debug('upstream returned non-JSON; body:', text.slice(0, 2000));
    return fail('upstream_failed', 'ระบบแชทตอบกลับในรูปแบบที่ไม่รองรับ', 502);
  }

  debug('upstream body:', text.slice(0, 2000));

  const qr = data.quick_replies ?? data.quickReplies ?? null;
  if ((qr == null || isEmptyObject(qr)) && shouldInjectQuickReplies(data)) {
    data.quick_replies = buildFallbackQuickReplies();
    debug('injected fallback quick_replies:', Object.keys(data.quick_replies).length);
  }

  return NextResponse.json(data, { status: upstream.status, headers: rateLimitHeaders });
}
