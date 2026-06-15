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
