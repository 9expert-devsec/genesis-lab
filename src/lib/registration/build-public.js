/**
 * Pure builders for RegisterPublic documents — no IO, no imports that need a
 * Next runtime or a live database.
 *
 * They live apart from create-public.js on purpose. That module imports
 * `next/headers` (for getClientIp) and `@/lib/db/connect`, which THROWS at
 * module load when MONGODB_URI is unset. Anything importing it therefore needs
 * a Next runtime and a database URI just to read a function — including the
 * verification suite, whose whole point is to assert what gets written without
 * writing anything. Keeping the builders here makes the document shape testable
 * on its own terms; create-public.js re-exports them so existing callers are
 * unaffected.
 */

import { formatBillingAddress } from '@/lib/address/formatBillingAddress';

/**
 * Build the merged attendees array (coordinator-as-attendee folded in).
 * When coordinator.isAttending is true they occupy the first slot, so
 * attendees.length always matches the attendeesCount the user chose.
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
  // The shared formatter, not a local join: it takes the WHOLE invoice because
  // it reads invoice.country to pick the Thai vs international branch, and it
  // is the only thing that applies the แขวง/เขต vs ตำบล/อำเภอ/จังหวัด prefixes.
  // Hand-rolling this here is what put a prefix-less address on customer mail.
  const invoiceAddress = formatBillingAddress(data.invoice);
  return { invoiceCountry, invoiceAddress };
}

/**
 * The `consent` sub-document, or null when the request carried no consent.
 *
 * Both step-2 paths post the SAME four booleans (the UI shows one checkbox and
 * `consentFanOut` expands it), so both write through here — the quote route and
 * the charge route cannot drift into two different audit shapes.
 *
 * `accepted` is derived from the four flags rather than hard-coded true: the
 * charge route can't reach here with a partial set (superRefine rejects it
 * first) but the quote route can, and an audit record that claims acceptance
 * the customer did not give is worse than no record.
 */
export function buildConsentRecord(consent, ipAddress = null) {
  if (!consent) return null;
  const dataChecked = Boolean(consent.dataChecked);
  const noRefund = Boolean(consent.noRefund);
  const changePolicy = Boolean(consent.changePolicy);
  const termsAccepted = Boolean(consent.termsAccepted);
  return {
    accepted: dataChecked && noRefund && changePolicy && termsAccepted,
    acceptedAt: new Date(),
    ipAddress,
    dataChecked,
    noRefund,
    changePolicy,
    termsAccepted,
  };
}

/**
 * Shape-check for an audit pointer at another RegisterPublic document.
 *
 * SHAPE ONLY — 24 hex characters, which is what a Mongo ObjectId looks like.
 * This deliberately does NOT check that the document exists, and callers must
 * not make it: the pointer is an annotation for a human reading the audit, not
 * a key anything resolves. See the write site in the charge route.
 *
 * Anything else — wrong length, non-hex, a number, an object (which is how a
 * query-operator injection would arrive as JSON) — becomes null. A bad pointer
 * is dropped, never an error: it is metadata about a payment, and no customer
 * should fail to pay because an annotation was malformed.
 */
export function asRegistrationPointer(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[0-9a-fA-F]{24}$/.test(v) ? v : null;
}

/** Fields common to both registration shapes (quote and paid). */
export function baseRegistration({ data, attendees, ipAddress = null }) {
  return {
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
  };
}

/**
 * The document the quote route hands to RegisterPublic.create().
 *
 * `pricing` and `payment` stay unset: a quote has no charge. `consent` is
 * whatever the customer ticked on step 2, or null on the toggle-OFF path where
 * no checkbox is shown.
 */
export function buildQuoteRegistration({ data, attendees, ipAddress = null }) {
  return {
    ...baseRegistration({ data, attendees, ipAddress }),
    consent: buildConsentRecord(data.consent, ipAddress),
  };
}

/**
 * The document the charge route hands to RegisterPublic.create().
 *
 * `supersedesRegistrationId` passes through asRegistrationPointer here as well
 * as at the route, so the shape check cannot be skipped by a future caller that
 * forgets it. Anything that is not ObjectId-shaped lands as null and the rest of
 * the document is unaffected — a malformed annotation must never cost the
 * customer their registration.
 */
export function buildPaidRegistration({
  data,
  attendees,
  pricing,
  method,
  consent,
  ipAddress = null,
  supersedesRegistrationId = null,
}) {
  return {
    ...baseRegistration({ data, attendees, ipAddress }),
    pricing,
    payment: { method, omiseStatus: 'pending' },
    consent: buildConsentRecord(consent, ipAddress),
    supersedesRegistrationId: asRegistrationPointer(supersedesRegistrationId),
  };
}
