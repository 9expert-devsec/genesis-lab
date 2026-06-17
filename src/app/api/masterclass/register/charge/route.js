import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import { createCardCharge, createPromptPayCharge, getPromptPayQrUrl } from '@/lib/omise';
import { toSatang } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const { registrationId, paymentMethod, omiseToken } = body ?? {};
  if (!registrationId || !paymentMethod) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (paymentMethod !== 'credit_card' && paymentMethod !== 'promptpay') {
    return NextResponse.json({ error: 'invalid_method' }, { status: 400 });
  }

  try {
    await dbConnect();

    const doc = await MasterclassRegistration.findById(registrationId);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (doc.status === 'paid') return NextResponse.json({ error: 'already_paid' }, { status: 409 });

    const amountSatang = toSatang(doc.pricing.total);
    const referenceNumber = String(doc._id).slice(-8).toUpperCase();
    const metadata = { registrationId: String(doc._id), referenceNumber, source: 'masterclass' };

    let result;
    if (paymentMethod === 'credit_card') {
      result = await createCardCharge({ amountSatang, token: omiseToken, metadata });
    } else {
      result = await createPromptPayCharge({ amountSatang, metadata });
    }

    if (!result.ok) {
      await MasterclassRegistration.findByIdAndUpdate(registrationId, {
        $set: {
          'payment.method': paymentMethod,
          'payment.omiseStatus': 'failed',
          'payment.failureCode': result.error,
          'payment.failureMessage': result.detail || '',
        },
      });
      return NextResponse.json(
        { error: 'charge_failed', code: result.error, message: 'การชำระเงินไม่สำเร็จ' },
        { status: 402 }
      );
    }

    const charge = result.data;
    const update = {
      'payment.method': paymentMethod,
      'payment.omiseChargeId': charge.id,
      'payment.omiseStatus': charge.status,
    };

    if (paymentMethod === 'credit_card' && charge.status === 'successful' && charge.paid) {
      update['payment.paidAt'] = new Date();
      update.status = 'paid';
    }
    await MasterclassRegistration.findByIdAndUpdate(registrationId, { $set: update });

    // Card settled synchronously — send receipt
    if (update.status === 'paid') {
      const fresh = await MasterclassRegistration.findById(registrationId);
      const { sendMasterclassReceipt } = await import('@/lib/masterclass/send-receipt');
      await sendMasterclassReceipt(fresh);
    }

    if (paymentMethod === 'promptpay') {
      return NextResponse.json({
        ok: true, method: paymentMethod, referenceNumber,
        registrationId: String(doc._id), chargeId: charge.id,
        qrUrl: getPromptPayQrUrl(charge), amount: doc.pricing.total, pending: true,
      });
    }

    return NextResponse.json({
      ok: true, method: paymentMethod, referenceNumber,
      registrationId: String(doc._id), amount: doc.pricing.total,
    });
  } catch (err) {
    console.error('[POST /api/masterclass/register/charge]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
