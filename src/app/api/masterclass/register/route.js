import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import MasterclassBatch    from '@/models/MasterclassBatch';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import MasterclassCourse   from '@/models/MasterclassCourse';
import { resolveBatchPrice } from '@/lib/masterclass/getMasterclass';
import { computePricing }    from '@/lib/pricing';
import { headers }           from 'next/headers';

export const dynamic = 'force-dynamic';

async function getClientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || null;
}

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  // Required fields
  const { batchId, attendee, license_choice, license_level, license_detail,
          request_invoice, invoice, consent } = body ?? {};

  if (!batchId || !attendee?.firstName || !attendee?.lastName ||
      !attendee?.email || !attendee?.phone) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }

  try {
    await dbConnect();

    const batch = await MasterclassBatch.findById(batchId).lean();
    if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 });
    if (batch.status !== 'open') {
      return NextResponse.json(
        { error: 'batch_unavailable', message: 'รุ่นนี้ไม่เปิดรับสมัครแล้ว' },
        { status: 409 }
      );
    }

    const course = await MasterclassCourse.findById(batch.course_id).lean();
    if (!course) return NextResponse.json({ error: 'course_not_found' }, { status: 404 });

    const priceInfo  = resolveBatchPrice(batch);
    const pricing    = computePricing(priceInfo.effective_price, 1);
    const ipAddress  = await getClientIp();

    const reg = await MasterclassRegistration.create({
      course_id:        batch.course_id,
      batch_id:         batchId,
      course_title:     course.title_th,
      batch_label:      batch.batch_label || `รุ่นที่ ${batch.batch_no}`,
      batch_date_label: batch.dates?.[0]?.day_label ?? '',
      venue_name:       batch.venue_name ?? '',
      attendee,
      license_choice:   license_choice ?? null,
      license_level:    license_level  ?? null,
      license_detail:   license_detail ?? null,
      request_invoice:  request_invoice ?? false,
      invoice:          request_invoice ? invoice : null,
      pricing: { ...pricing, price_type: priceInfo.price_type },
      payment: { method: 'credit_card' }, // placeholder; overwritten by /charge
      consent: consent ?? null,
      status: 'pending',
      source: 'web',
      ipAddress,
    });

    return NextResponse.json({ ok: true, registrationId: String(reg._id) });
  } catch (err) {
    console.error('[POST /api/masterclass/register]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
