import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import MasterclassBatch from '@/models/MasterclassBatch';
import { retrieveCharge } from '@/lib/omise';

/** Fire-and-forget forward to legacy webhook endpoint. Never throws. */
async function forwardToLegacy(rawBody, originalHeaders) {
  const forwardUrl = process.env.OMISE_WEBHOOK_FORWARD_URL;
  if (!forwardUrl) return;
  try {
    // Forward all x-opn-* headers from Omise so the legacy endpoint
    // can verify the webhook signature (x-opn-signature).
    const headersToForward = { 'Content-Type': 'application/json' };
    for (const [key, value] of originalHeaders.entries()) {
      if (key.toLowerCase().startsWith('x-opn-')) {
        headersToForward[key] = value;
      }
    }
    const res = await fetch(forwardUrl, {
      method: 'POST',
      headers: headersToForward,
      body: rawBody,
    });
    console.log('[webhook] forwarded to legacy | status:', res.status, '| url:', forwardUrl);
  } catch (err) {
    console.error('[webhook] forward to legacy failed:', err?.message);
  }
}

export async function POST(req) {
  // URL-token check (Omise has no built-in HMAC; we gate via a secret query param).
  const url = new URL(req.url);
  const expected = process.env.OMISE_WEBHOOK_SECRET;
  if (expected && url.searchParams.get('key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Capture raw text once so we can forward the original payload to the legacy webhook.
  const rawBody = await req.text().catch(() => '');
  const omiseHeaders = req.headers;
  let event;
  try { event = JSON.parse(rawBody); } catch { event = null; }
  if (!event || !event.data) {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }

  // event.data is the charge object (for charge.* events).
  const chargeId = event.data.id;
  if (!chargeId) return NextResponse.json({ ok: true, ignored: true });

  // Re-verify against Omise rather than trusting the webhook body.
  const verified = await retrieveCharge(chargeId);
  if (!verified.ok) {
    return NextResponse.json({ error: 'verify_failed' }, { status: 502 });
  }
  const charge = verified.data;

  await dbConnect();
  // Check MasterclassRegistration if not found in RegisterPublic
  let doc = await RegisterPublic.findOne({ 'payment.omiseChargeId': chargeId });
  let isMasterclass = false;
  if (!doc) {
    doc = await MasterclassRegistration.findOne({ 'payment.omiseChargeId': chargeId });
    isMasterclass = Boolean(doc);
  }
  if (!doc) {
    // Unknown charge — likely belongs to Academy. Forward and ack.
    await forwardToLegacy(rawBody, omiseHeaders);
    return NextResponse.json({ ok: true, unknown: true });
  }

  // Idempotency — already settled. Still forward so Academy receives retried events.
  if (doc.status === 'paid' && doc.payment?.omiseStatus === 'successful') {
    await forwardToLegacy(rawBody, omiseHeaders);
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  if (charge.status === 'successful') {
    /**
     * ── A SETTLED CHARGE LANDING ON A CANCELLED REGISTRATION ───────────────
     *
     * This case did not exist until cancellation became terminal. A customer
     * opens a PromptPay QR, an admin cancels the registration while it is
     * still unpaid, and the customer then pays anyway — the bank settles, this
     * webhook fires, and writing `paid` here would produce a record sitting in
     * a state the admin transition table has no edge out of. Nobody could
     * correct it from the screen.
     *
     * So the status and the paid fields are NOT written, and no receipt is
     * sent — a receipt for a cancelled seat is a promise the company cannot
     * keep. The money is real and is sitting in the Omise account, so this
     * logs loudly enough to be found: a refund is almost certainly owed, and
     * only a human can decide that.
     *
     * ── THIS ROUTE IS A SYSTEM ACTOR AND IS NOT SUBJECT TO THE ADMIN TABLE ──
     * lib/registrations/publicStatuses.js governs what an ADMIN may do. This
     * route and src/app/api/registration/public/charge/route.js are the only
     * writers of `paid`, precisely because a real charge — not a person — is
     * the evidence for it. Routing them through the admin table would forbid
     * the one transition the table deliberately reserves for them and break
     * payment collection outright. The cancelled check here is a separate,
     * narrower guard: it is about one terminal state, not about the machine.
     *
     * Masterclass is a different collection with its own flow and is out of
     * scope for this rework, so its behaviour is deliberately unchanged.
     */
    if (doc.status === 'cancelled' && !isMasterclass) {
      console.error(
        '[webhook] REFUND LIKELY OWED — a settled charge landed on a CANCELLED registration.',
        '| chargeId:', chargeId,
        '| registrationId:', String(doc._id),
        '| amount:', charge.amount, charge.currency,
        '| status NOT written, paid fields NOT written, no receipt sent.'
      );
      // Still ack, and still forward: returning an error would make Omise
      // retry this event forever, and Academy still needs to see it.
      await forwardToLegacy(rawBody, omiseHeaders);
      return NextResponse.json({ ok: true, cancelled: true, refundLikelyOwed: true });
    }

    doc.status = 'paid';
    doc.payment.omiseStatus = 'successful';
    doc.payment.paidAt = new Date();
    await doc.save();
    if (isMasterclass) {
      console.log('[webhook] masterclass paid, sending receipt for docId:', String(doc._id));
      const { sendMasterclassReceipt } = await import('@/lib/masterclass/send-receipt');
      await sendMasterclassReceipt(doc);

      // Increment registered_count and auto-flip status to 'full' if capacity reached.
      const updatedBatch = await MasterclassBatch.findByIdAndUpdate(
        doc.batch_id,
        { $inc: { registered_count: 1 } },
        { new: true }
      );
      if (
        updatedBatch &&
        !updatedBatch.status_override &&
        updatedBatch.status === 'open' &&
        updatedBatch.registered_count >= updatedBatch.capacity
      ) {
        await MasterclassBatch.findByIdAndUpdate(updatedBatch._id, {
          $set: { status: 'full' },
        });
      }
    } else {
      const { sendPaidReceipt } = await import('@/lib/registration/send-receipt');
      await sendPaidReceipt(doc);
    }
    await forwardToLegacy(rawBody, omiseHeaders);
    return NextResponse.json({ ok: true, paid: true });
  }

  if (charge.status === 'failed') {
    doc.payment.omiseStatus = 'failed';
    doc.payment.failureCode = charge.failure_code || null;
    doc.payment.failureMessage = charge.failure_message || null;
    await doc.save();
    await forwardToLegacy(rawBody, omiseHeaders);
    return NextResponse.json({ ok: true, failed: true });
  }

  if (charge.status === 'expired') {
    doc.payment.omiseStatus = 'expired';
    doc.status = 'cancelled';
    await doc.save();
    await forwardToLegacy(rawBody, omiseHeaders);
    return NextResponse.json({ ok: true, expired: true });
  }

  // Forward raw event to legacy webhook (never blocks Omise ACK on failure).
  await forwardToLegacy(rawBody, omiseHeaders);

  return NextResponse.json({ ok: true, status: charge.status });
}
