import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
import { sendEmail } from '@/lib/email/postmark';
import { userConfirmationEmail } from '@/lib/email/templates/registration-user';
import { adminNotificationEmail } from '@/lib/email/templates/registration-admin';
import { resolveScheduleStatus } from '@/lib/schedule-status';

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = publicRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Respect admin-set status override. Upstream already filters for
  // open/nearly_full, so the only blocking case is an explicit 'closed'.
  const status = await resolveScheduleStatus(data.classId, 'open');
  if (status === 'closed') {
    return NextResponse.json(
      { error: 'schedule_closed', message: 'รอบนี้ปิดรับสมัครแล้ว' },
      { status: 409 }
    );
  }

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headersList.get('x-real-ip') ||
    null;

  await dbConnect();
  const doc = await RegisterPublic.create({
    courseId: data.courseId,
    courseCode: data.courseCode,
    courseName: data.courseName,
    classId: data.classId,
    classDate: data.classDate,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    lineId: data.lineId || undefined,
    companyName: data.requestInvoice ? data.companyName : undefined,
    taxId: data.requestInvoice ? data.taxId : undefined,
    address: data.requestInvoice ? data.address : undefined,
    notes: data.notes || undefined,
    status: 'pending',
    source: 'web',
    ipAddress,
  });

  const referenceNumber = String(doc._id).slice(-8).toUpperCase();

  const host = headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = process.env.AUTH_URL || `${proto}://${host}`;
  const adminDashboardUrl = `${baseUrl}/admin/registrations/${doc._id}`;
  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  const userMsg = userConfirmationEmail({
    referenceNumber,
    firstName: data.firstName,
    courseName: data.courseName || data.courseId,
    classDate: data.classDate,
  });

  const adminMsg = adminNotificationEmail({
    referenceNumber,
    data: { ...data, requestInvoice: Boolean(data.requestInvoice) },
    adminDashboardUrl,
  });

  // Fire emails in parallel; do NOT block on failures. Registration is
  // already persisted by this point.
  const emailPromises = [
    sendEmail({
      to: data.email,
      subject: `ยืนยันการสมัครอบรม ${data.courseName || ''} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    }),
  ];
  if (adminEmail) {
    emailPromises.push(
      sendEmail({
        to: adminEmail,
        subject: `ใบสมัครใหม่ ${data.courseName || data.courseId} - ${referenceNumber}`,
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
