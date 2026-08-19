'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterInhouse from '@/models/RegisterInhouse';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import {
  INHOUSE_STATUS_VALUES,
  INHOUSE_STATUS_TRANSITIONS,
  allowedFromStates,
  storedValuesForFilter,
  statusLabel,
} from '@/lib/registrations/statuses';

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

/**
 * DERIVED, not written out again. This was
 * `new Set(['new','contacted','quoted','closed-won','closed-lost'])` — a
 * SECOND hand-written spelling of the in-house enum, sitting on the server
 * where no screen could contradict it, and a THIRD lived in
 * lib/actions/registrations.js. Round 2 collapses all of them onto
 * lib/registrations/statuses.js.
 */
const VALID_STATUSES = new Set(INHOUSE_STATUS_VALUES);

/**
 * ── THE TRANSITION IS ENFORCED HERE, NOT BY WHICH BUTTONS RENDER ────────────
 *
 * THIS is the action the in-house detail screen actually calls — not
 * `updateRegistrationStatus` in lib/actions/registrations.js, which is reached
 * only through the shared list screen's `source` parameter. Both got the gate
 * in round 2; gating one and not the other would have left the live path open
 * while the tests pointed at the other.
 *
 * Every export of a `'use server'` module is a POST endpoint, so which buttons
 * InhouseDetailClient chooses to render is a CONVENTION the client is trusted
 * to follow, not a guarantee. It was previously an unconditional
 * `findByIdAndUpdate`: any pair of states, from anything, including OUT of
 * `cancelled` — which round 2 made terminal.
 *
 * ── ATOMIC, AND WIDENED FOR THE UNMIGRATED ──────────────────────────────────
 * The permitted from-states go into the FILTER, so Mongo checks them in one
 * operation and a concurrent cancel cannot slip between a read and a write.
 *
 * They are widened through `storedValuesForFilter` for the window before the
 * migration runs: `quoted` is reachable from `pending`, and therefore also from
 * the `new` and `contacted` documents that are about to become `pending`.
 * Without that the whole in-house backlog would be frozen — a retired value has
 * no row in the three-value table, so `allowedFromStates` would name nothing
 * that matches it.
 */
export async function updateInhouseStatus(id, status) {
  const session = await requireAdmin('registrations');
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();

  const fromStates = allowedFromStates(status, INHOUSE_STATUS_TRANSITIONS)
    .flatMap((from) => storedValuesForFilter(from, 'inhouse'));

  // `new: false` returns the PRE-update document — the only place the previous
  // status exists. `doc` never reaches the caller, so this adds no query.
  const doc = await RegisterInhouse.findOneAndUpdate(
    { _id: id, status: { $in: fromStates } },
    { $set: { status } },
    { new: false, runValidators: false }
  );
  if (!doc) {
    /**
     * A NULL RESULT IS AMBIGUOUS — no such id, or an id whose stored status may
     * not make this move. The two deserve different messages: "ไม่พบรายการ"
     * sends the admin looking for a record that was deleted, when in fact it is
     * sitting in front of them and the move was refused.
     *
     * One extra read, on the refusal path only. `statusLabel` rather than a
     * live map, because the from-state may be RETIRED and 'จาก "closed-lost"'
     * is not an explanation.
     */
    const existing = await RegisterInhouse.findById(id).select('status').lean();
    if (!existing) return { ok: false, error: 'ไม่พบรายการ' };
    const from = statusLabel(existing.status);
    const to   = statusLabel(status);
    return { ok: false, error: `ไม่สามารถเปลี่ยนสถานะจาก "${from}" เป็น "${to}" ได้` };
  }
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

/**
 * ── THE CANCELLATION LOCK, WHICH THIS ACTION HAD NO VERSION OF AT ALL ───────
 *
 * `updateRegistration` in lib/actions/registrations.js was gated in round 1 and
 * this was not gated by anything — not by a stale check, not by a weaker rule.
 * It was an unconditional `findByIdAndUpdate` on the id alone, so the admin
 * notes on a cancelled in-house request stayed writable while every other field
 * on the same record was frozen.
 *
 * It is the same lock, in the FILTER for the same reason: a preceding read can
 * be raced by the cancel it is checking for, and the write then lands on a
 * record that was cancelled a millisecond ago.
 *
 * ── `$ne: 'cancelled'` MATCHES THE RETIRED VALUE TOO, AND THAT IS WHY IT IS
 *    WRITTEN THIS WAY ─────────────────────────────────────────────────────
 * A document holding `closed-lost` is NOT `cancelled` yet, so `$ne` lets the
 * edit through until the migration runs — which is correct and is deliberate.
 * `closed-lost` is not a terminal state in the old vocabulary; it becomes one.
 * Freezing those records BEFORE the migration would apply a rule nobody agreed
 * to yet, to documents whose status still means what it always meant.
 *
 * ── DELETE STAYS AVAILABLE ON A CANCELLED REQUEST ───────────────────────────
 * The same ruling as public: delete is a different permission from edit, writes
 * its own audit row, and is the only way to clear a wrongly-cancelled row now
 * that cancellation is terminal. Nothing here should be "completed" by gating
 * deleteInhouseRegistration.
 */
/*
 * ══ `updateInhouseAdminNotes` IS DELETED. DO NOT REINSTATE IT. ══════════════
 *
 * In-house internal notes now go through `addInternalNote` in
 * lib/actions/registrations.js — THE SAME ACTION THE PUBLIC SCREEN USES. That
 * was the instruction and it is the point: one notes mechanism, not two.
 *
 * ── WHAT IT DID, AND WHY THAT SHAPE HAD TO GO ─────────────────────────────
 * It was a `$set` of ONE String field. Two salespeople could not both use it:
 * the second writer silently overwrote the first, with no record that anything
 * had been lost. That is the exact defect the append-only array replaces, and
 * keeping this action alive beside it would have left the overwrite reachable
 * through a second door while the UI advertised an append-only record.
 *
 * Its cancellation lock, its not-found/locked message split and its
 * body-never-in-the-audit-row discipline all survive — they were carried into
 * `addInternalNote` rather than dropped. What did NOT survive is `$set`.
 *
 * The audit action name is unchanged (`notes`), so historical rows written by
 * this function keep their title and read identically to new ones.
 */

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
