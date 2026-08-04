import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
import { sendPublicRegistrationEmails } from '@/lib/email/template-senders/public-registration';
import { resolveScheduleStatus } from '@/lib/schedule-status';
import { getCourseByCode } from '@/lib/api/public-courses';

/**
 * The course cover for the confirmation email, or '' — NEVER a throw.
 *
 * The email model is pure, so the I/O happens here. This is on the critical
 * path of a request that has ALREADY WRITTEN THE REGISTRATION, so an upstream
 * hiccup must cost the customer a picture and nothing else: a decorative image
 * is not worth a failed confirmation, and it is certainly not worth a 500 on a
 * registration that is already in Mongo.
 *
 * `getCourseByCode` filters on `course_id`, and both `courseCode` and
 * `courseId` hold that short code here (RegisterWizard sets both from
 * `course.course_id`), so either spelling resolves correctly.
 */
async function courseCoverUrl(code) {
  try {
    const course = await getCourseByCode(code);
    return course?.course_cover_url ?? '';
  } catch (err) {
    console.warn('[reg-route] course cover lookup failed — sending without it.', err?.message);
    return '';
  }
}

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

  // AWAITED, deliberately: the model is built synchronously inside the sender,
  // so a pending promise here would reach the template as `undefined` and the
  // <img> would silently vanish. The cost is one upstream call before the
  // response — bounded by fetchWithTimeout inside aiFetch, and ISR-cached for
  // an hour per course, so the common case is a cache read.
  const courseImage = await courseCoverUrl(data.courseCode || data.courseId);

  await sendPublicRegistrationEmails({
    data,
    referenceNumber,
    attendees,
    invoiceCountry,
    invoiceAddress,
    courseImage,
  });

  return NextResponse.json({
    ok: true,
    referenceNumber,
    registrationId: String(doc._id),
  });
}
