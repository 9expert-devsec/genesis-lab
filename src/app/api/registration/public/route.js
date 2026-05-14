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
    scheduleType: data.scheduleType ?? 'classroom',
    attendanceMode: data.attendanceMode ?? 'classroom',
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

  // Pre-compute flat invoice display strings for email templates.
  // These are derived from the nested invoice sub-document so the
  // templates stay logic-free.
  const invoiceCountry = data.invoice?.country ?? 'TH';
  const invoiceAddress =
    invoiceCountry === 'OTHER'
      ? [
          data.invoice?.internationalAddress?.line1,
          data.invoice?.internationalAddress?.line2,
          data.invoice?.internationalAddress?.city,
          data.invoice?.internationalAddress?.state,
          data.invoice?.internationalAddress?.postalCode,
          data.invoice?.internationalAddress?.country,
        ]
          .filter(Boolean)
          .join(', ')
      : [
          data.invoice?.thaiAddress?.addressLine,
          data.invoice?.thaiAddress?.subDistrict,
          data.invoice?.thaiAddress?.district,
          data.invoice?.thaiAddress?.province,
          data.invoice?.thaiAddress?.postalCode,
        ]
          .filter(Boolean)
          .join(' ');

  const userMsg = userConfirmationEmail({
    referenceNumber,
    firstName: data.coordinator.firstName,
    courseName: data.courseName || data.courseId,
    classDate: data.classDate,
    attendanceMode: data.attendanceMode ?? 'classroom',
    scheduleType: data.scheduleType,
    requestInvoice: Boolean(data.requestInvoice),
    invoice: data.invoice ?? null,
    invoiceCountry,
    invoiceAddress,
    attendeesListProvided: data.attendeesListProvided,
    attendees,
    coordinatorIsAttending: data.coordinator.isAttending,
    attendeesCount: data.attendeesCount,
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
      attendanceMode: data.attendanceMode ?? 'classroom',
      invoiceCountry,
      invoiceAddress,
      attendees,
      coordinatorIsAttending: data.coordinator.isAttending,
    },
    adminDashboardUrl,
  });

  const emailPromises = [
    sendEmail({
      to: data.coordinator.email,
      bcc: process.env.POSTMARK_ADMIN_EMAIL,
      subject: `ยืนยันการสมัครอบรม ${data.courseName || ''} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    }),
  ];
  if (adminEmail) {
    emailPromises.push(
      sendEmail({
        to: adminEmail,
        bcc: process.env.POSTMARK_ADMIN_EMAIL,
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
