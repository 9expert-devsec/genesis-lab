'use server';

/**
 * Server actions for the Webhook Log admin page.
 *
 * Reads & replays. Replay re-runs the original handler against the
 * stored payload — useful when a deploy fixed a downstream bug but
 * MSDB has already moved on and won't re-send.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import WebhookLog from '@/models/WebhookLog';
import { auth } from '@/lib/auth/options';
import { dispatchEvent } from '@/lib/webhooks/handlers';

const ADMIN_PATH = '/admin/webhook-logs';
const PAGE_SIZE  = 50;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

function serialize(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

/**
 * Paginated listing of webhook logs.
 *
 * @param {{ page?: number, event?: string, status?: string }} opts
 *   - page: 1-based.
 *   - event: prefix filter ('course', 'schedule', 'promotion', etc.)
 *            or empty for all.
 *   - status: 'ok' | 'error' | '' for all.
 */
export async function getWebhookLogs({ page = 1, event = '', status = '' } = {}) {
  await requireAdmin();
  await dbConnect();

  const filter = {};
  if (event)  filter.event  = new RegExp(`^${event}\\.`);
  if (status) filter.status = status;

  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * PAGE_SIZE;

  const [logs, total] = await Promise.all([
    WebhookLog.find(filter)
      .sort({ processed_at: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .lean(),
    WebhookLog.countDocuments(filter),
  ]);

  return {
    logs: serialize(logs),
    total,
    page: safePage,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Replay a stored event by re-running the handler against its payload.
 * Writes a fresh WebhookLog row marking the result (so the audit trail
 * shows that a replay happened).
 */
export async function replayWebhookEvent(logId) {
  await requireAdmin();
  await dbConnect();

  if (!logId) return { ok: false, error: 'Missing logId' };

  const original = await WebhookLog.findById(logId).lean();
  if (!original) return { ok: false, error: 'Log not found' };

  const event   = original.event;
  const payload = original.payload ?? {};
  const data    = payload?.data ?? payload?.payload ?? payload;

  try {
    await dispatchEvent(event, data);
    await WebhookLog.create({
      event:   `replay:${event}`,
      source:  'admin',
      payload,
      status:  'ok',
      error:   '',
    });
    revalidatePath(ADMIN_PATH);
    return { ok: true };
  } catch (err) {
    const msg = err?.message ?? String(err);
    await WebhookLog.create({
      event:   `replay:${event}`,
      source:  'admin',
      payload,
      status:  'error',
      error:   msg,
    });
    revalidatePath(ADMIN_PATH);
    return { ok: false, error: msg };
  }
}
