import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import MasterclassRegistration from '@/models/MasterclassRegistration';

/**
 * Dev-only endpoint to force a Masterclass registration to 'paid'
 * and trigger the receipt email — for testing Postmark locally without Omise.
 *
 * Requires PAYMENT_TEST_MODE=true in .env.local to activate.
 * Usage: POST /api/masterclass/dev-mark-paid  { "id": "<registrationId>" }
 */
export async function POST(req) {
  if (process.env.PAYMENT_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  await dbConnect();
  const doc = await MasterclassRegistration.findById(id);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  console.log('[dev-mark-paid] Marking registration as paid | id:', id, '| current status:', doc.status);

  if (doc.status !== 'paid') {
    doc.status = 'paid';
    if (!doc.payment) doc.payment = {};
    doc.payment.method      = doc.payment?.method === 'quote' ? 'quote' : 'credit_card';
    doc.payment.omiseStatus = 'successful';
    doc.payment.paidAt      = new Date();
    // Clear receiptSentAt to allow re-send in testing
    doc.payment.receiptSentAt = null;
    await doc.save();
  } else {
    // Already paid but no receipt — clear the guard to re-test sending
    await MasterclassRegistration.findByIdAndUpdate(id, {
      $set: { 'payment.receiptSentAt': null },
    });
    await doc.reload?.() ?? (Object.assign(doc, await MasterclassRegistration.findById(id).lean()));
  }

  const fresh = await MasterclassRegistration.findById(id);
  console.log('[dev-mark-paid] Calling sendMasterclassReceipt | coordinator:', fresh?.coordinator?.email, '| attendee:', fresh?.attendee?.email);

  const { sendMasterclassReceipt } = await import('@/lib/masterclass/send-receipt');
  const result = await sendMasterclassReceipt(fresh);

  console.log('[dev-mark-paid] sendMasterclassReceipt result:', JSON.stringify(result));
  return NextResponse.json({ ok: true, status: 'paid', emailResult: result });
}
