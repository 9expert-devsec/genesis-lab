import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterInhouse from '@/models/RegisterInhouse';
import { inhouseRegistrationSchema } from '@/lib/schemas/register-inhouse';
import { sendEmail } from '@/lib/email/postmark';
import { inhouseUserConfirmationEmail } from '@/lib/email/templates/registration-inhouse-user';
import { inhouseAdminNotificationEmail } from '@/lib/email/templates/registration-inhouse-admin';

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

  const userMsg = inhouseUserConfirmationEmail({
    referenceNumber,
    contactFirstName: data.contactFirstName,
    companyName:      data.companyName,
    data,
    quotationAddress,
  });

  const adminMsg = inhouseAdminNotificationEmail({
    referenceNumber,
    data,
    quotationAddress,
    adminDashboardUrl,
  });

  const emailPromises = [
    sendEmail({
      to: data.contactEmail,
      bcc: process.env.POSTMARK_ADMIN_EMAIL,
      subject: `ได้รับคำขอใบเสนอราคา In-house ${data.companyName} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    }),
  ];
  if (adminEmail) {
    emailPromises.push(
      sendEmail({
        to: adminEmail,
        bcc: process.env.POSTMARK_ADMIN_EMAIL,
        subject: `In-house Request ใหม่ ${data.companyName} - ${referenceNumber}`,
        html: adminMsg.html,
        text: adminMsg.text,
      })
    );
  }
  await Promise.allSettled(emailPromises);

  return NextResponse.json({
    ok: true,
    referenceNumber,
    registrationId: String(doc._id),
  });
}