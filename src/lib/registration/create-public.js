import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { buildAttendees, buildPaidRegistration } from '@/lib/registration/build-public';

// The pure document builders live in build-public.js — importing this module
// costs you next/headers and a MONGODB_URI, which nothing that merely wants to
// SHAPE a document should have to pay. Re-exported here so existing callers
// keep their import path.
export {
  asRegistrationPointer,
  buildAttendees,
  buildInvoiceDisplay,
  buildConsentRecord,
  buildQuoteRegistration,
  buildPaidRegistration,
} from '@/lib/registration/build-public';

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
export async function createPaidRegistration({
  data,
  pricing,
  method,
  consent,
  ipAddress,
  supersedesRegistrationId = null,
}) {
  await dbConnect();
  const doc = await RegisterPublic.create(
    // Audit annotation on supersedesRegistrationId — see the field's note on
    // the model and the write site in the charge route. null is the normal
    // case and means "not known", not "not superseded".
    buildPaidRegistration({
      data,
      attendees: buildAttendees(data),
      pricing,
      method,
      consent,
      ipAddress,
      supersedesRegistrationId,
    })
  );
  return doc;
}
