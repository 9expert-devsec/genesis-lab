import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { retrieveCharge } from '@/lib/omise';

export async function POST(req) {
  // URL-token check (Omise has no built-in HMAC; we gate via a secret query param).
  const url = new URL(req.url);
  const expected = process.env.OMISE_WEBHOOK_SECRET;
  if (expected && url.searchParams.get('key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const event = await req.json().catch(() => null);
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
  const doc = await RegisterPublic.findOne({ 'payment.omiseChargeId': chargeId });
  if (!doc) {
    // Unknown charge — ack so Omise stops retrying.
    return NextResponse.json({ ok: true, unknown: true });
  }

  // Idempotency — already settled.
  if (doc.status === 'paid' && doc.payment?.omiseStatus === 'successful') {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  if (charge.status === 'successful' && charge.paid) {
    doc.status = 'paid';
    doc.payment.omiseStatus = 'successful';
    doc.payment.paidAt = new Date();
    await doc.save();
    const { sendPaidReceipt } = await import('@/lib/registration/send-receipt');
    await sendPaidReceipt(doc);
    return NextResponse.json({ ok: true, paid: true });
  }

  if (charge.status === 'failed') {
    doc.payment.omiseStatus = 'failed';
    doc.payment.failureCode = charge.failure_code || null;
    doc.payment.failureMessage = charge.failure_message || null;
    await doc.save();
    return NextResponse.json({ ok: true, failed: true });
  }

  if (charge.status === 'expired') {
    doc.payment.omiseStatus = 'expired';
    doc.status = 'cancelled';
    await doc.save();
    return NextResponse.json({ ok: true, expired: true });
  }

  return NextResponse.json({ ok: true, status: charge.status });
}
