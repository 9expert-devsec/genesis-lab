'use server';

/**
 * Server actions for the CareerPathRegistration collection.
 *
 * `createCareerPathRegistration` is intentionally public — it's how the
 * /career-path-register/[slug] form submits. Reads and the status/delete
 * mutations are admin-gated.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CareerPathRegistration from '@/models/CareerPathRegistration';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { sendCareerPathRegistrationEmail } from '@/lib/email/template-senders/careerpath-registration';

const ADMIN_PATH = '/admin/career-path-registrations';

/**
 * ── PII ENTITY — §5.1 / §5.2 ────────────────────────────────────────────────
 *
 * CareerPathRegistration holds applicant contact details. The trail is
 * append-only and presently forever, so nothing copied into it can be redacted
 * later. Status transitions carry a short enum; everything else records the act
 * and the id. `recordLabel` is '' because the reference number the admin reads
 * is derived from `_id`.
 *
 * `createCareerPathRegistration` is NOT logged — see §4. It is a public visitor
 * submitting the form, there is no admin actor, and an admin log that contains
 * visitor writes stops answering "who on the team did this".
 */

function serialize(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

export async function createCareerPathRegistration(data) {
  await dbConnect();
  const doc = await CareerPathRegistration.create(data);
  revalidatePath(ADMIN_PATH);

  /**
   * THE CONFIRMATION MAIL — AFTER the write, and unable to undo it.
   *
   * This is the only mail the flow produces, and until now the flow produced
   * none: the success screen has been promising "ทีมขายจะติดต่อกลับ" with
   * nothing behind it.
   *
   * ── WHY THERE IS NO ROUTE ────────────────────────────────────────────────
   * The other three flows send from an API route because they have one for
   * other reasons — a payment charge, a schedule-status re-check at submit.
   * This form posts straight to this action, and adding a route purely to hold
   * a send would mean a second entry point to a collection that has exactly one
   * writer today.
   *
   * ── IT CANNOT FAIL THE REGISTRATION ─────────────────────────────────────
   * The document is committed and `revalidatePath` has already run above.
   * `sendCareerPathRegistrationEmail` never rejects — every failure inside it is
   * caught and logged there — so this call cannot turn a filed registration into
   * an error message about a registration that exists. It is awaited rather than
   * left floating because a serverless invocation can be frozen the moment this
   * function returns, and an un-awaited send is one that may simply never leave.
   *
   * `.toObject()` because the builder is pure and takes a plain document — and
   * because reading the CREATED doc rather than `data` is what applies the
   * schema defaults (`attendeeCount`, `invoiceCountry`, `dates: []`) that a
   * partial payload would otherwise leave undefined in the mail.
   */
  await sendCareerPathRegistrationEmail(doc.toObject());

  return { ok: true, id: String(doc._id) };
}

export async function getCareerPathRegistrations({
  page = 1,
  limit = 30,
  search = '',
  careerSlug = '',
  status = '',
} = {}) {
  await dbConnect();

  const filter = {};
  if (search) {
    filter.$or = [
      { contactFirstName: { $regex: search, $options: 'i' } },
      { contactLastName:  { $regex: search, $options: 'i' } },
      { contactEmail:     { $regex: search, $options: 'i' } },
    ];
  }
  if (careerSlug) filter.careerSlug = String(careerSlug);
  if (status)     filter.status     = String(status);

  const skip  = (Math.max(1, page) - 1) * limit;
  const [total, items] = await Promise.all([
    CareerPathRegistration.countDocuments(filter),
    CareerPathRegistration.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: serialize(items),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getCareerPathRegistrationById(id) {
  if (!id) return null;
  await dbConnect();
  const doc = await CareerPathRegistration.findById(id).lean();
  return doc ? serialize(doc) : null;
}

export async function updateRegistrationStatus(id, status) {
  const session = await requireAdmin('career_path_registrations');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  // The returned document is the PRE-update one (findByIdAndUpdate's default),
  // which is both the existence check and the only place the previous status
  // exists.
  //
  // The check is NEW. Before it, a bad id updated nothing and still returned
  // `{ ok: true }` — the caller reported success for a write that never
  // happened, and the audit row said a status changed when it had not. Its
  // sibling in registrations.js has always returned this exact shape; the
  // wording is copied rather than reinvented so the two read the same.
  const prev = await CareerPathRegistration.findByIdAndUpdate(id, { $set: { status } });
  if (!prev) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);

  recordAdminActionAfter({
    menu:        'career_path_registrations',
    action:      'status',
    entity:      'registration',
    recordId:    String(id),
    recordLabel: '',
    before:      { status: prev.status },
    after:       { status },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

export async function deleteCareerPathRegistration(id) {
  const session = await requireAdmin('career_path_registrations');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await CareerPathRegistration.findByIdAndDelete(id);
  revalidatePath(ADMIN_PATH);

  // The act and the id — this is a PII entity (§5.1) and there is nothing here
  // we are permitted to capture, so no read-before-delete.
  recordAdminActionAfter({
    menu:        'career_path_registrations',
    action:      'delete',
    entity:      'registration',
    recordId:    String(id),
    recordLabel: '',
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}
