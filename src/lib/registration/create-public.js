import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';

/**
 * Build the merged attendees array (coordinator-as-attendee folded in)
 * exactly like the existing quote route does. Pure — no IO.
 */
export function buildAttendees(data) {
  if (!data.attendeesListProvided) return [];
  if (data.coordinator.isAttending) {
    return [
      {
        firstName: data.coordinator.firstName,
        lastName: data.coordinator.lastName,
        email: data.coordinator.email,
        phone: data.coordinator.phone,
      },
      ...data.attendees,
    ];
  }
  return data.attendees;
}

/** Flat invoice country + address strings for email templates. */
export function buildInvoiceDisplay(data) {
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
        ].filter(Boolean).join(', ')
      : [
          data.invoice?.thaiAddress?.addressLine,
          data.invoice?.thaiAddress?.subDistrict,
          data.invoice?.thaiAddress?.district,
          data.invoice?.thaiAddress?.province,
          data.invoice?.thaiAddress?.postalCode,
        ].filter(Boolean).join(' ');
  return { invoiceCountry, invoiceAddress };
}

/** Resolve client IP from forwarded headers (async — Next 15 headers()). */
export async function getClientIp() {
  const h = await headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    null
  );
}

/**
 * Create the RegisterPublic doc for an Omise-paying customer.
 * status starts 'pending'; payment.method/pricing/consent are stored.
 * Returns the saved mongoose doc.
 */
export async function createPaidRegistration({ data, pricing, method, consent, ipAddress }) {
  await dbConnect();
  const attendees = buildAttendees(data);
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
    pricing,
    payment: { method, omiseStatus: 'pending' },
    consent: {
      accepted: true,
      acceptedAt: new Date(),
      ipAddress,
      dataChecked: Boolean(consent?.dataChecked),
      noRefund: Boolean(consent?.noRefund),
      changePolicy: Boolean(consent?.changePolicy),
      termsAccepted: Boolean(consent?.termsAccepted),
    },
  });
  return doc;
}
