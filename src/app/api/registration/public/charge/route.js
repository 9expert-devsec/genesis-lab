import { NextResponse } from 'next/server';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
import { resolveScheduleStatus } from '@/lib/schedule-status';
import { resolveCheckoutPricing } from '@/lib/registration/resolve-price';
import { createPaidRegistration, getClientIp } from '@/lib/registration/create-public';
import { createCardCharge, createPromptPayCharge, getPromptPayQrUrl } from '@/lib/omise';
import { toSatang } from '@/lib/pricing';
import RegisterPublic from '@/models/RegisterPublic';

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = publicRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  if (data.paymentMethod !== 'credit_card' && data.paymentMethod !== 'promptpay') {
    return NextResponse.json({ error: 'invalid_method' }, { status: 400 });
  }

  const status = await resolveScheduleStatus(data.classId, 'open');
  if (status === 'closed') {
    return NextResponse.json({ error: 'schedule_closed', message: 'รอบนี้ปิดรับสมัครแล้ว' }, { status: 409 });
  }

  // Authoritative pricing — never trust client amounts.
  let pricing;
  try {
    pricing = await resolveCheckoutPricing({
      courseCode: data.courseCode || data.courseId,
      classId: data.classId,
      seats: data.attendeesCount,
    });
  } catch (e) {
    return NextResponse.json({ error: 'price_unavailable', message: 'ไม่สามารถคำนวณราคาได้ กรุณาติดต่อทีมงาน' }, { status: 422 });
  }

  const ipAddress = await getClientIp();
  const method = data.paymentMethod;

  const doc = await createPaidRegistration({ data, pricing, method, consent: data.consent, ipAddress });
  const referenceNumber = String(doc._id).slice(-8).toUpperCase();
  const amountSatang = toSatang(pricing.total);
  const metadata = { registrationId: String(doc._id), referenceNumber };

  let result;
  if (method === 'credit_card') {
    result = await createCardCharge({ amountSatang, token: data.omiseToken, metadata });
  } else {
    result = await createPromptPayCharge({ amountSatang, metadata });
  }

  if (!result.ok) {
    await RegisterPublic.findByIdAndUpdate(doc._id, {
      $set: {
        'payment.omiseStatus': 'failed',
        'payment.failureCode': result.error,
        'payment.failureMessage': result.detail || '',
      },
    });
    return NextResponse.json(
      { error: 'charge_failed', code: result.error, message: 'การชำระเงินไม่สำเร็จ กรุณาลองใหม่' },
      { status: 402 }
    );
  }

  const charge = result.data;
  const update = {
    'payment.omiseChargeId': charge.id,
    'payment.omiseStatus': charge.status,
  };

  // Card may succeed synchronously.
  if (method === 'credit_card' && charge.status === 'successful' && charge.paid) {
    update['payment.paidAt'] = new Date();
    update.status = 'paid';
  }
  await RegisterPublic.findByIdAndUpdate(doc._id, { $set: update });

  // Card that settled synchronously — send the receipt now. The webhook
  // also fires for this charge, but the receiptSentAt guard inside
  // sendPaidReceipt makes whichever loses the race a no-op.
  if (update.status === 'paid') {
    const fresh = await RegisterPublic.findById(doc._id);
    const { sendPaidReceipt } = await import('@/lib/registration/send-receipt');
    await sendPaidReceipt(fresh);
  }

  if (method === 'promptpay') {
    return NextResponse.json({
      ok: true,
      method,
      referenceNumber,
      registrationId: String(doc._id),
      chargeId: charge.id,
      qrUrl: getPromptPayQrUrl(charge),
      amount: pricing.total,
      pending: true,
    });
  }

  // Card
  const paid = charge.status === 'successful' && charge.paid;
  return NextResponse.json({
    ok: true,
    method,
    referenceNumber,
    registrationId: String(doc._id),
    chargeId: charge.id,
    amount: pricing.total,
    paid,
    pending: !paid,
  });
}
