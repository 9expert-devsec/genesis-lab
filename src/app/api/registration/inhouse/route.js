import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterInhouse from '@/models/RegisterInhouse';
import { inhouseRegistrationSchema } from '@/lib/schemas/register-inhouse';
import { sendInhouseRegistrationEmails } from '@/lib/email/template-senders/inhouse-registration';

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = inhouseRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headersList.get('x-real-ip') ||
    null;

  await dbConnect();
  const doc = await RegisterInhouse.create({
    ...data,
    status: 'new',
    source: 'inhouse',
    ipAddress,
  });

  const referenceNumber = String(doc._id).slice(-8).toUpperCase();

  const host = headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = process.env.AUTH_URL || `${proto}://${host}`;
  const adminDashboardUrl = `${baseUrl}/admin/registrations/inhouse/${doc._id}`;
  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  // Pre-compute address string so templates stay logic-free
  const quotationAddress =
    data.quotationCountry === 'OTHER'
      ? [
          data.internationalAddress?.line1,
          data.internationalAddress?.line2,
          data.internationalAddress?.city,
          data.internationalAddress?.state,
          data.internationalAddress?.postalCode,
          data.internationalAddress?.country,
        ].filter(Boolean).join(', ')
      : [
          data.thaiAddress?.addressLine,
          data.thaiAddress?.subDistrict,
          data.thaiAddress?.district,
          data.thaiAddress?.province,
          data.thaiAddress?.postalCode,
        ].filter(Boolean).join(' ');

  await sendInhouseRegistrationEmails({
    data,
    referenceNumber,
    quotationAddress,
    adminDashboardUrl,
    adminEmail,
  });

  return NextResponse.json({
    ok: true,
    referenceNumber,
    registrationId: String(doc._id),
  });
}