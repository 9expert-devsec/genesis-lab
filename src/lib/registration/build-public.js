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
