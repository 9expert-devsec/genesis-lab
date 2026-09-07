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
 * The bundle tag for one leg, or `undefined` for an ordinary registration.
 *
 * ── IT IS BUILT HERE, FROM WHAT THE SERVER RESOLVED ───────────────────────
 * NOT from the request body, and that is the whole point of it being a
 * function rather than a passthrough. The (pageId, sectionId) pair arrives in
 * a URL and is a lookup key; `resolveBundleRequest` turns it into a real
 * section, and the tag is minted from THAT. A client cannot post a `bundle`
 * object — `publicRegistrationSchema` has no such key and strips it — so no
 * registration can be filed against a package the customer never opened.
 *
 * `undefined` rather than `null` for the absent case: the field's default on
 * the model is `undefined`, so an ordinary registration writes no key at all
 * rather than a null one, and `bundle == null` stays the whole test for "is
 * this an ordinary row".
 *
 * All four values are stringified and trimmed here rather than trusted from
 * their sources. `name` is DENORMALISED at this moment on purpose — see the
 * field's note on the model — so an empty one is stored as empty and the
 * readers decide what to draw.
 */
export function buildBundleTag({ pageId, sectionId, requestId, name } = {}) {
  const page = String(pageId ?? '').trim();
  const section = String(sectionId ?? '').trim();
  const request = String(requestId ?? '').trim();
  // The three IDENTITY fields are what make a leg traceable and groupable. A
  // partial tag is worse than none, so anything short of all three writes no
  // tag — matching the model, where those three are required inside the
  // subdocument and `name` is not.
  if (!page || !section || !request) return undefined;
  return {
    pageId: page,
    sectionId: section,
    requestId: request,
    name: String(name ?? '').trim(),
  };
}

/**
 * The Early Bird tag for one registration, or `undefined`.
 *
 * ── BUILT FROM WHAT THE SERVER RESOLVED, LIKE `buildBundleTag` ────────────
 * Its input is the `EarlyBirdConfig` document `getEarlyBirdByCourse` returned,
 * never the request body. That read is itself the authority on whether an
 * Early Bird applies at all: it returns null for an inactive config AND null
 * once the deadline has passed, so a submit that arrives one second late is
 * handed nothing to mint from. `publicRegistrationSchema` has no `earlyBird`
 * key and is a plain `z.object()`, so a posted one is stripped before it could
 * reach here.
 *
 * ── THE ROUND MUST MATCH, AND THAT CHECK IS THE CALLER'S ─────────────────
 * An Early Bird belongs to exactly ONE round. This function refuses a tag whose
 * `scheduleId` does not equal the `classId` being registered, so a customer
 * booking a different round of the same course cannot pick the discount up by
 * association. It is checked HERE rather than only at the route so that a second
 * caller cannot forget it — the same reason `buildBundleTag` refuses a partial
 * tag rather than trusting its callers.
 *
 * `undefined` rather than `null` for every refusal: the field's default on the
 * model is `undefined`, so an ordinary registration writes no key at all and
 * `earlyBird == null` stays the whole test.
 *
 * `specialPrice` is copied as a NUMBER or null — never coerced through
 * `Number(undefined)`, which is NaN and would store a price nobody can read.
 */
export function buildEarlyBirdTag(config, { classId } = {}) {
  if (!config) return undefined;

  const scheduleId = String(config.schedule_id ?? '').trim();
  const courseCode = String(config.course_id ?? '').trim();
  const round = String(classId ?? '').trim();

  // Partial is worse than absent — the same rule buildBundleTag applies. A tag
  // that cannot name its course or its round can be checked against nothing.
  if (!scheduleId || !courseCode) return undefined;
  // THE ROUND GATE. Not the round this Early Bird is for → no tag.
  if (scheduleId !== round) return undefined;

  const price = config.special_price;
  return {
    courseCode,
    scheduleId,
    specialPrice: price == null || price === '' ? null : Number(price),
    labelTh: String(config.label_th ?? '').trim(),
    deadline: config.deadline ?? null,
  };
}

/**
 * The document the quote route hands to RegisterPublic.create().
 *
 * `pricing` and `payment` stay unset: a quote has no charge. `consent` is
 * whatever the customer ticked on step 2, or null on the toggle-OFF path where
 * no checkbox is shown.
 *
 * ── ONE BUILDER FOR BOTH, AND A BUNDLE LEG IS A QUOTE ─────────────────────
 * `bundle` is optional and a leg is otherwise an ORDINARY quote registration —
 * same course scalars, same coordinator, same attendees, same invoice. That is
 * the whole reason the several-rows shape survives every existing reader, so
 * giving legs their own builder would be the first place the two could drift
 * apart. It is spread conditionally so an ordinary registration writes no
 * `bundle` key at all.
 */
export function buildQuoteRegistration({
  data, attendees, ipAddress = null, bundle = undefined, earlyBird = undefined,
}) {
  return {
    ...baseRegistration({ data, attendees, ipAddress }),
    consent: buildConsentRecord(data.consent, ipAddress),
    ...(bundle ? { bundle } : {}),
    /**
     * Spread conditionally for the same reason `bundle` is: an ordinary
     * registration must write no key at all rather than an explicit undefined,
     * so `earlyBird == null` stays the whole test.
     *
     * The two are never both present — one promotion per registration — and the
     * refusal that guarantees it is written down at the bundle route rather than
     * left to the fact that bundles happen to take a different path.
     */
    ...(earlyBird ? { earlyBird } : {}),
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
