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

  // When the coordinator is also an attendee, they fill the first
  // attendee slot server-side so the attendees[] array always matches
  // the attendeesCount count the user selected.
  const attendees = !data.attendeesListProvided
    ? []
    : data.coordinator.isAttending
      ? [
          {
            firstName: data.coordinator.firstName,
            lastName: data.coordinator.lastName,
            email: data.coordinator.email,
            phone: data.coordinator.phone,
          },
          ...data.attendees,
        ]
      : data.attendees;

  await dbConnect();
  const doc = await RegisterPublic.create({
    courseId: data.courseId,
    courseCode: data.courseCode,
    courseName: data.courseName,
    classId: data.classId,
    classDate: data.classDate,
    coordinator: data.coordinator,
    attendeesCount: data.attendeesCount,
    attendeesListProvided: data.attendeesListProvided,
    attendees,
    requestInvoice: Boolean(data.requestInvoice),
    invoice: data.invoice ?? null,
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

  // Email templates still use the Phase 2.5a shape (firstName at the
  // top level). Remap from coordinator until the templates are
  // rewritten in sub-phase 2.5a-4.
  const userMsg = userConfirmationEmail({
    referenceNumber,
    firstName: data.coordinator.firstName,
    courseName: data.courseName || data.courseId,
    classDate: data.classDate,
  });

  const adminMsg = adminNotificationEmail({
    referenceNumber,
    data: {
      ...data,
      firstName: data.coordinator.firstName,
      lastName: data.coordinator.lastName,
      email: data.coordinator.email,
      phone: data.coordinator.phone,
      lineId: data.coordinator.lineId,
      requestInvoice: Boolean(data.requestInvoice),
    },
    adminDashboardUrl,
  });

  const emailPromises = [
    sendEmail({
      to: data.coordinator.email,
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
