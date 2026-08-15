import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';

export async function POST(req) {
  // Allow this endpoint ONLY when PAYMENT_TEST_MODE=true is explicitly set,
  // regardless of NODE_ENV. This lets us test on production with test keys
  // without exposing it permanently.
  if (process.env.PAYMENT_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  await dbConnect();
  const doc = await RegisterPublic.findById(id);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  /**
   * ── A CANCELLED REGISTRATION IS NOT MARKABLE PAID ──────────────────────────
   *
   * `doc.status !== 'paid'` matched a CANCELLED document, so this endpoint
   * wrote `paid` over it — producing exactly the state the webhook's own
   * cancelled guard exists to prevent: a record the admin transition table has
   * no edge out of, holding a payment nobody can correct from the screen.
   *
   * ── THE DECIDING FACT IS NOT THAT THIS IS "DEV-ONLY" ───────────────────────
   * Its own comment two lines up says PAYMENT_TEST_MODE is meant to be settable
   * ON PRODUCTION, deliberately, so the flow can be tested with test keys
   * against real data. So the reachable-from-production argument is the
   * endpoint's own documented design, not a hypothetical — and the guard is not
   * a nicety for a local-only tool.
   *
   * The webhook guard (src/app/api/webhooks/omise/route.js) is the same rule
   * for the real payment path, with a `console.error` because a refund is
   * probably owed. Nothing is owed here — no money moved — so this is a plain
   * 409 rather than a log-and-ack.
   */
  if (doc.status === 'cancelled') {
    return NextResponse.json(
      { error: 'cancelled', message: 'a cancelled registration cannot be marked paid' },
      { status: 409 }
    );
  }

  if (doc.status !== 'paid') {
    doc.status = 'paid';
    if (doc.payment) {
      doc.payment.omiseStatus = 'successful';
      doc.payment.paidAt = new Date();
    }
    await doc.save();
    const { sendPaidReceipt } = await import('@/lib/registration/send-receipt');
    await sendPaidReceipt(doc);
  }
  return NextResponse.json({ ok: true, status: 'paid' });
}
