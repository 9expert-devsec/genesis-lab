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
  const {
    batchId, attendee, coordinator, attendees, attendeesCount, attendeesListProvided,
    license_choice, license_level, license_detail,
    license_scope, license_per_attendee,
    request_invoice, invoice, consent, notes,
    method: paymentMethod,
  } = body ?? {};

  const primaryEmail = coordinator?.email || attendee?.email;
  if (!batchId || !primaryEmail) {
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
    const seats      = Math.max(1, Number(attendeesCount) || 1);
    const pricing    = computePricing(priceInfo.effective_price, seats);
    const ipAddress  = await getClientIp();

    // Resolve coordinator — use first attendee slot as fallback for backward compat
    const resolvedCoordinator = coordinator ?? {
      firstName: attendee?.firstName,
      lastName:  attendee?.lastName,
      email:     attendee?.email,
      phone:     attendee?.phone,
      isAttending: false,
    };

    // Resolve attendee (first person in list, or coordinator if attending)
    const resolvedAttendee = attendee ?? {
      firstName: resolvedCoordinator.firstName,
      lastName:  resolvedCoordinator.lastName,
      email:     resolvedCoordinator.email,
      phone:     resolvedCoordinator.phone,
    };

    const reg = await MasterclassRegistration.create({
      course_id:        batch.course_id,
      batch_id:         batchId,
      course_title:     course.title_th,
      batch_label:      batch.batch_label || `รุ่นที่ ${batch.batch_no}`,
      batch_date_label: batch.dates?.[0]?.day_label ?? '',
      venue_name:       batch.venue_name ?? '',

      // Coordinator
      coordinator: resolvedCoordinator,

      // Multi-attendee
      attendeesCount:        seats,
      attendeesListProvided: attendeesListProvided ?? true,
      attendees:             Array.isArray(attendees) ? attendees : [],

      // Single attendee (backward compat)
      attendee: resolvedAttendee,

      // License
      license_choice:       license_choice       ?? null,
      license_level:        license_level         ?? null,
      license_detail:       license_detail        ?? null,
      license_scope:        license_scope         ?? 'all',
      license_per_attendee: license_per_attendee  ?? null,

      // Invoice
      request_invoice: request_invoice ?? false,
      invoice:         request_invoice ? invoice : null,

      // Pricing + Payment
      pricing: { ...pricing, price_type: priceInfo.price_type },
      payment: { method: 'pending' }, // placeholder; overwritten by /charge
      consent: consent ?? null,
      notes:   notes?.trim() || null,
      status:  'pending',
      source:  'web',
      ipAddress,
    });

    const referenceNumber = String(reg._id).slice(-8).toUpperCase();

    // Quote path: send confirmation email now (no charge needed)
    if (paymentMethod === 'quote') {
      console.log('[quote-debug] entering quote email block, registrationId:', String(reg._id));
      try {
        await MasterclassRegistration.findByIdAndUpdate(reg._id, {
          $set: { 'payment.method': 'quote', status: 'pending' },
        });
        const fresh = await MasterclassRegistration.findById(reg._id);
        console.log('[quote-debug] fresh doc fetched, course_id:', String(fresh?.course_id));
        const { sendMasterclassQuoteConfirmation } = await import('@/lib/masterclass/send-receipt');
        await sendMasterclassQuoteConfirmation(fresh, referenceNumber);
        console.log('[quote-debug] email sent successfully');
      } catch (emailErr) {
        console.error('[masterclass/register] quote email failed:', emailErr?.message, emailErr?.stack);
      }
    }

    return NextResponse.json({ ok: true, registrationId: String(reg._id), referenceNumber });
  } catch (err) {
    console.error('[POST /api/masterclass/register]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
