import { NextResponse } from 'next/server';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
import { resolveScheduleStatus } from '@/lib/schedule-status';
import { resolveCheckoutPricing } from '@/lib/registration/resolve-price';
import { asRegistrationPointer, createPaidRegistration, getClientIp } from '@/lib/registration/create-public';
import { createCardCharge, createPromptPayCharge, getPromptPayQrUrl } from '@/lib/omise';
import { toSatang } from '@/lib/pricing';
import RegisterPublic from '@/models/RegisterPublic';
import { refNo } from '@/lib/refNo';

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

  // ── Audit annotation: which registration this one replaced ────────────────
  //
  // Sent ONLY by the "สร้าง QR ใหม่" path in ReviewAndPayStep. Read off the raw
  // body rather than `data` because publicRegistrationSchema does not declare
  // it and zod strips unknown keys — which is the behaviour we want: a
  // malformed pointer must never turn a payment into a 400. asRegistrationPointer
  // checks the SHAPE and nothing else, so garbage silently becomes null.
  //
  // THIS IS NOT A FOREIGN KEY, AND THE NEXT EDIT HERE MUST NOT MAKE IT ONE.
  // Nothing verifies the named document exists, belongs to this customer, or is
  // still pending — the value arrives from the browser and is written down
  // exactly as received. So:
  //   • do not findById() it, populate it, or join on it
  //   • do not cancel, expire, refund or otherwise modify the document it names
  //   • do not branch any behaviour on whether it is set
  // It exists so a human reading the audit can tell a QR regenerate apart from
  // a genuine second booking. Treating it as trustworthy turns a client-supplied
  // string into a write target on someone else's registration.
  const supersedesRegistrationId = asRegistrationPointer(body?.supersedesRegistrationId);

  const doc = await createPaidRegistration({
    data,
    pricing,
    method,
    consent: data.consent,
    ipAddress,
    supersedesRegistrationId,
  });
  const referenceNumber = refNo(doc._id);
  const amountSatang = toSatang(pricing.total);
  const metadata = { registrationId: String(doc._id), referenceNumber };

  let result;
  if (method === 'credit_card') {
    // Without a return_uri Omise cannot run 3DS: the charge comes back pending
    // with authorize_uri null and the client polls to timeout. Send the customer
    // back to a page that polls the status endpoint until the bank settles.
    const returnUri = `${process.env.NEXT_PUBLIC_BASE_URL}/registration/payment/complete?registrationId=${String(doc._id)}`;
    result = await createCardCharge({ amountSatang, token: data.omiseToken, metadata, returnUri });
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

  /**
   * ── THIS ROUTE IS A SYSTEM ACTOR. IT IS NOT SUBJECT TO THE ADMIN TABLE. ───
   *
   * lib/registrations/publicStatuses.js holds the transitions an ADMIN may
   * make, and it deliberately contains NO edge into `paid` from any state: a
   * person must not be able to assert that money arrived. This route and
   * src/app/api/webhooks/omise/route.js are the only two writers of `paid`,
   * because a settled Omise charge — not a click — is the evidence for it.
   * Gating either of them on that table would forbid the one transition the
   * table reserves for them and break payment collection outright.
   *
   * The cancelled-registration guard in the webhook is a separate, narrower
   * thing and is not duplicated here: this route runs from the customer's own
   * checkout on a registration they are in the middle of creating, so there is
   * no window in which an admin cancels between the charge and this write.
   */
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
    // Present when the card needs 3DS / bank authorization. The client must
    // redirect the user here; Omise sends them back to our return_uri after.
    authorizeUrl: charge.authorize_uri ?? null,
  });
}
