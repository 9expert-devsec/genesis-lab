/**
 * POST /api/webhooks/msdb
 *
 * Receives webhook events from the MSDB upstream. The shared secret is
 * `MSDB_WEBHOOK_SECRET` and must match `WEBHOOK_DEFAULT_SECRET` in the
 * MSDB project.
 *
 * Contract:
 *   - Verify HMAC-SHA256 of the raw body using `MSDB_WEBHOOK_SECRET`.
 *     Reject 401 if missing/mismatched.
 *   - Once verified, ALWAYS return 200 — even on handler failure — to
 *     stop MSDB from retrying. Failures are persisted in WebhookLog
 *     for replay via the admin UI.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import WebhookLog from '@/models/WebhookLog';
import { dispatchEvent } from '@/lib/webhooks/handlers';

export const runtime = 'nodejs';
// NO `export const revalidate` — webhook is dynamic, every POST runs.
export const dynamic = 'force-dynamic';

function verifySignature(rawBody, headerValue, secret) {
  if (!secret || !headerValue) return false;
  // Accept either bare hex or the `sha256=<hex>` form MSDB sends.
  const provided = String(headerValue).replace(/^sha256=/i, '').trim();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

async function logEvent({ event, payload, status, error }) {
  try {
    await dbConnect();
    await WebhookLog.create({
      event:        event || '',
      source:       'msdb',
      payload:      payload ?? null,
      status:       status === 'error' ? 'error' : 'ok',
      error:        error || '',
      processed_at: new Date(),
    });
  } catch (err) {
    console.error('[webhook] failed to write WebhookLog', err?.message);
  }
}

export async function POST(req) {
  const secret = process.env.MSDB_WEBHOOK_SECRET;
  if (!secret) {
    // Surfaces fast in dev; in prod this is a deploy misconfiguration.
    return NextResponse.json(
      { error: 'MSDB_WEBHOOK_SECRET not configured' },
      { status: 500 }
    );
  }

  const sigHeader   = req.headers.get('x-webhook-signature');
  const eventHeader = req.headers.get('x-webhook-event') || '';

  let rawBody;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!verifySignature(rawBody, sigHeader, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    await logEvent({
      event:  eventHeader || 'unknown',
      payload: { raw: rawBody?.slice(0, 500) ?? '' },
      status: 'error',
      error:  'Invalid JSON',
    });
    return NextResponse.json({ ok: true, warning: 'invalid json' }, { status: 200 });
  }

  // Header is authoritative; body event is a fallback so manual
  // replays via the admin UI still route correctly.
  const event = eventHeader || parsed?.event || '';
  const data  = parsed?.data ?? parsed?.payload ?? parsed;

  if (event === 'ping') {
    await logEvent({ event, payload: parsed, status: 'ok', error: '' });
    return NextResponse.json({ ok: true, pong: true }, { status: 200 });
  }

  try {
    await dispatchEvent(event, data);
    await logEvent({ event, payload: parsed, status: 'ok', error: '' });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[webhook]', event, '→', msg);
    await logEvent({ event, payload: parsed, status: 'error', error: msg });
    // Always 200 — see top-of-file contract.
    return NextResponse.json({ ok: true, warning: msg }, { status: 200 });
  }
}

export async function GET() {
  // Lets MSDB / a human curl the URL to confirm the route is wired up
  // without sending a signed event.
  return NextResponse.json({ ok: true, ready: true });
}
