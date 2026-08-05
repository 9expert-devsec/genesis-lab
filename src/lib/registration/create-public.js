import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import {
  baseRegistration,
  buildConsentRecord,
  buildAttendees,
} from '@/lib/registration/build-public';

// The pure document builders live in build-public.js — importing this module
// costs you next/headers and a MONGODB_URI, which nothing that merely wants to
// SHAPE a document should have to pay. Re-exported here so existing callers
// keep their import path.
export {
  buildAttendees,
  buildInvoiceDisplay,
  buildConsentRecord,
  buildQuoteRegistration,
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
export async function createPaidRegistration({ data, pricing, method, consent, ipAddress }) {
  await dbConnect();
  const attendees = buildAttendees(data);
  const doc = await RegisterPublic.create({
    ...baseRegistration({ data, attendees, ipAddress }),
    pricing,
    payment: { method, omiseStatus: 'pending' },
    consent: buildConsentRecord(consent, ipAddress),
  });
  return doc;
}
