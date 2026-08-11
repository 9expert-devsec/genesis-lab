'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterInhouse from '@/models/RegisterInhouse';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';

const ADMIN_LIST_PATH   = '/admin/registrations';
const ADMIN_DETAIL_PATH = '/admin/registrations/inhouse';

/**
 * ── PII ENTITY — 5.1 / 5.2. READ THIS BEFORE ADDING A PAYLOAD ──────────────
 *
 * RegisterInhouse holds the contact person, their email and phone, and the
 * company. The audit trail is append-only and presently forever, so anything
 * copied into it CANNOT be redacted when a deletion or subject-access request
 * arrives. These actions record metadata; only the status transition carries a
 * payload, and it is a short enum.
 *
 * recordLabel is empty on purpose: the admin reads a reference number that is
 * String(_id).slice(-8).toUpperCase(), so recordId already carries it.
 */

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * ── THERE IS NO LIST ACTION HERE, AND THAT IS DELIBERATE ───────────────────
 *
 * `listInhouseRegistrations` and `getInhouseStatusCounts` used to live in this
 * file and were deleted unused. /admin/registrations renders BOTH collections
 * from one page, so it calls `listRegistrations({ source })` and
 * `getRegistrationStatusCounts({ source })` in src/lib/actions/registrations.js;
 * these two were a second implementation that nothing ever imported.
 *
 * They were not harmless. The two list projections had already drifted — this
 * one selected `contactPhone` and the live one did not — so the dead copy read
 * as evidence that the admin list fetched a field it had never fetched, while
 * the real table rendered a blank cell. A second reading path for one collection
 * is a place for the truth to diverge from the code that runs.
 *
 * If a list action is ever wanted here, the question to answer first is why the
 * shared one is not enough — not how to keep two in step.
 */

// ── Detail ─────────────────────────────────────────────────────────

export async function getInhouseRegistrationById(id) {
  await requireAdmin('registrations');
  await dbConnect();
  if (!id) return null;
  const doc = await RegisterInhouse.findById(id).lean();
  return serialize(doc);
}

// ── Status update ──────────────────────────────────────────────────

const VALID_STATUSES = new Set(['new', 'contacted', 'quoted', 'closed-won', 'closed-lost']);

export async function updateInhouseStatus(id, status) {
  const session = await requireAdmin('registrations');
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();
  // `new: false` returns the PRE-update document — the only place the previous
  // status exists. The existence check is unchanged and `doc` never reaches the
  // caller, so this adds no query and changes no behaviour.
  const doc = await RegisterInhouse.findByIdAndUpdate(
    id,
    { status },
    { new: false, runValidators: false }
  );
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(ADMIN_LIST_PATH);
  revalidatePath(`${ADMIN_DETAIL_PATH}/${id}`);

  recordAdminActionAfter({
    menu:        'registrations',
    action:      'status',
    entity:      'inhouse',
    recordId:    String(id),
    recordLabel: '',
    before:      { status: doc.status },
    after:       { status },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── Admin notes update ─────────────────────────────────────────────

export async function updateInhouseAdminNotes(id, adminNotes) {
  const session = await requireAdmin('registrations');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const doc = await RegisterInhouse.findByIdAndUpdate(
    id,
    // '' NOT `|| undefined`: Mongoose drops an undefined value from an update
    // object, so clearing the box sent nothing and the old note survived the
    // save. A note is a plain String with no cast to fail, so the empty string
    // is both a legal value and the only one that means "cleared".
    { adminNotes: String(adminNotes ?? '').trim().slice(0, 2000) },
    { new: true, runValidators: false }
  );
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(`${ADMIN_DETAIL_PATH}/${id}`);

  // THE ACT ONLY — never the note text, before or after. Admin notes are free
  // text about a customer and will contain their details: what they asked for,
  // what they can afford, who to call. That is the most sensitive field on the
  // record, not the least.
  recordAdminActionAfter({
    menu:        'registrations',
    action:      'notes',
    entity:      'inhouse',
    recordId:    String(id),
    recordLabel: '',
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteInhouseRegistration(id) {
  const session = await requireAdmin('registrations');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const doc = await RegisterInhouse.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(ADMIN_LIST_PATH);

  // The act and the id. No read-before-delete needed — there is nothing here
  // we are permitted to capture. A backup is the answer, not a shadow copy.
  recordAdminActionAfter({
    menu:        'registrations',
    action:      'delete',
    entity:      'inhouse',
    recordId:    String(id),
    recordLabel: '',
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}
