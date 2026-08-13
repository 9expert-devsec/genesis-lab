'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { INHOUSE_STATUS_VALUES } from '@/lib/registrations/inhouseStatuses';
import { buildRegistrationFilter, rangeToDateFilter } from '@/lib/registrations/listFilter';

const ADMIN_PATH = '/admin/registrations';
const PAGE_SIZE  = 20;

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/** Returns the correct Mongoose model based on source param */
function getModel(source) {
  return source === 'inhouse' ? RegisterInhouse : RegisterPublic;
}

/**
 * The audit `entity` for a `source` argument.
 *
 * `source` picks the collection, so it IS the entity discriminator — but it
 * arrives from the client and `getModel` treats everything that is not
 * 'inhouse' as public. Normalising here means an unexpected value cannot become
 * a phantom entity in the trail: rows would be written under an entity no
 * screen queries, invisible to the inline history widget forever.
 *
 * The writer's fail-closed reduction is the BACKSTOP for that, not the primary
 * check — it would strip the payload and warn, but the row would still be filed
 * under the wrong entity. Normalise at the source instead.
 */
function entityForSource(source) {
  return source === 'inhouse' ? 'inhouse' : 'public';
}

/**
 * ── PII ENTITIES — §5.1 / §5.2. READ THIS BEFORE ADDING A PAYLOAD ───────────
 *
 * `RegisterPublic` and `RegisterInhouse` hold customer names, emails, phones
 * and company details. The audit trail is append-only and presently forever, so
 * anything copied into it CANNOT be redacted when a deletion or subject-access
 * request arrives — the collection's entire premise is that rows are never
 * modified. A shadow copy of personal data in there is a contradiction you do
 * not want to design in.
 *
 * So these actions record metadata, and exactly one exception:
 *   · status transitions carry `{status}` before and after — a short enum, no
 *     personal data, and the field people actually dispute;
 *   · everything else records the ACT and the id;
 *   · `recordLabel` is '' — the admin's `เลขอ้างอิง` is
 *     `String(_id).slice(-8).toUpperCase()`, so `recordId` already carries it.
 *
 * The contract enforces this independently (registrations|public and
 * registrations|inhouse are capped at status_only, and the writer reduces
 * whatever it is handed). The discipline here is belt; that is braces.
 */

// ── List (paginated + filtered) ────────────────────────────────────

export async function listRegistrations({ page = 1, status = 'all', q = '', source = 'public', range = 'all' } = {}) {
  await requireAdmin('registrations');
  await dbConnect();

  const Model = getModel(source);

  /**
   * THE FILTER IS BUILT IN ONE PLACE, SHARED WITH THE COUNTS.
   *
   * `range` used to stop at `getRegistrationStatusCounts` and never reach this
   * query, so the summary cards were filtered by date and the table below them
   * was not — วันนี้ showed ทั้งหมด 1 above a table listing all seven rows.
   * Both callers now derive from `buildRegistrationFilter` /
   * `rangeToDateFilter` in lib/registrations/listFilter.js, so a date window
   * that applies to one and not the other is no longer expressible.
   */
  const filter = buildRegistrationFilter({ status, q, source, range });

  const skip  = (Math.max(1, page) - 1) * PAGE_SIZE;
  const total = await Model.countDocuments(filter);

  let docs;
  if (source === 'inhouse') {
    docs = await Model.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      /**
       * THE PROJECTION IS THE RENDER LIST, field for field.
       *
       * It gained `contactPhone` and `preferredMonth` because InhouseTable shows
       * both, and `trainingFormat` is back because the รูปแบบ column now renders
       * it. It was dropped for one commit on the grounds that all four stored
       * records say 'onsite' — which was reasoning from the sample, not the
       * schema, where it is a required two-value enum with no default.
       *
       * Keeping the two lists equal is the actual guard here. A projection that
       * is a superset of the render is dead weight over the wire; one that is a
       * SUBSET renders `undefined`, and this whole table was blank because a
       * public-shaped render was fed an in-house-shaped projection. If you add a
       * column, add the field.
       */
      .select('companyName contactFirstName contactLastName contactEmail contactPhone coursesInterested participantsCount trainingFormat preferredMonth status createdAt')
      .lean();
  } else {
    docs = await Model.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .select('courseName classDate scheduleType attendanceMode coordinator attendeesCount requestInvoice status createdAt payment pricing')
      .lean();
  }

  return {
    items:    serialize(docs),
    total,
    page:     Math.max(1, page),
    pageSize: PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}

// ── Detail ─────────────────────────────────────────────────────────

export async function getRegistrationById(id, source = 'public') {
  await requireAdmin('registrations');
  await dbConnect();
  if (!id) return null;
  const Model = getModel(source);
  const doc   = await Model.findById(id).lean();
  return serialize(doc);
}

// ── Status update ──────────────────────────────────────────────────

const PUBLIC_STATUSES  = new Set(['pending', 'confirmed', 'paid', 'cancelled']);
/**
 * DERIVED, not written out again. This Set is the write-side gate on
 * `updateRegistrationStatus`; the cards and the chips on the list screen are
 * built from the same array in lib/registrations/inhouseStatuses.js. Spelling
 * the five values here a second time is how the screen came to offer a `quoted`
 * chip that no card could display.
 */
const INHOUSE_STATUSES = new Set(INHOUSE_STATUS_VALUES);

export async function updateRegistrationStatus(id, status, source = 'public') {
  const session = await requireAdmin('registrations');
  const validSet = source === 'inhouse' ? INHOUSE_STATUSES : PUBLIC_STATUSES;
  if (!validSet.has(status)) return { ok: false, error: 'สถานะไม่ถูกต้อง' };

  await dbConnect();
  const Model = getModel(source);
  // `new: false` returns the PRE-update document, which is the only place the
  // previous status exists. The existence check below is unchanged (a missing
  // id returns null either way) and `doc` is not returned to the caller, so
  // this costs nothing and adds no query.
  const doc   = await Model.findByIdAndUpdate(id, { status }, { new: false, runValidators: false });
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);

  recordAdminActionAfter({
    menu:        'registrations',
    action:      'status',
    entity:      entityForSource(source),
    recordId:    String(id),
    recordLabel: '', // the reference number IS the id — see the header
    before:      { status: doc.status },
    after:       { status },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── Update fields ──────────────────────────────────────────────────

export async function updateRegistration(id, data, source = 'public') {
  const session = await requireAdmin('registrations');
  if (!id) return { ok: false, error: 'Missing id' };

  const update = {};

  if (source === 'inhouse') {
    /**
     * Inhouse editable fields — AN ALLOWLIST, so a field that is not named here
     * reaches Mongo from nowhere. That cuts both ways and the omissions are
     * deliberate:
     *
     *   · `skillLevel`, `objective`, `scheduleMode`, `preferredDateFrom`,
     *     `preferredDateTo`, `onsiteEquipment`, `onsiteAddress`,
     *     `onsiteProvince`, `onsiteDistrict` — removed from the form; the paths
     *     survive on the Mongoose schema so old enquiries still read back, and
     *     leaving them writable would let the admin surface create data in a
     *     shape nothing else produces any more.
     *   · `branch` — LEGACY READ-ONLY. `branchType` / `branchCode` replaced it.
     *     Keeping it writable is precisely how the two representations drift
     *     apart, one of them wins in a template, and nobody can say which was
     *     meant. An fs guard pins its absence from both allowlists.
     *   · `companyName` — a derived mirror of `quotationCompany`, written by
     *     one line in the API route and nowhere else.
     */
    const inhouseFields = [
      'coursesInterested','participantsCount','contentMode','contentDetails',
      'preferredMonth','scheduleNote',
      'trainingFormat','onsiteVenue',
      'onlineRegion','onlineTimezone',
      'contactFirstName','contactLastName','contactRole','contactDepartment',
      'contactEmail','contactPhone','contactLine',
      'quotationCountry','quotationCompany','taxId','branchType','branchCode',
      'thaiAddress','internationalAddress','message','adminNotes',
    ];
    for (const f of inhouseFields) {
      if (data[f] !== undefined) update[f] = data[f];
    }
  } else {
    // Public editable fields
    if (data.classDate      !== undefined) update.classDate      = String(data.classDate ?? '').trim();
    if (data.scheduleType   !== undefined) update.scheduleType   = data.scheduleType;
    if (data.attendanceMode !== undefined) update.attendanceMode = data.attendanceMode;

    if (data.coordinator) {
      const c = data.coordinator;
      if (c.firstName !== undefined) update['coordinator.firstName'] = String(c.firstName).trim();
      if (c.lastName  !== undefined) update['coordinator.lastName']  = String(c.lastName).trim();
      if (c.email     !== undefined) update['coordinator.email']     = String(c.email).trim().toLowerCase();
      if (c.phone     !== undefined) update['coordinator.phone']     = String(c.phone).trim();
    }
    if (data.attendeesListProvided !== undefined) update.attendeesListProvided = Boolean(data.attendeesListProvided);
    if (data.attendeesCount !== undefined) {
      const n = parseInt(data.attendeesCount, 10);
      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;
    }
    if (data.attendees !== undefined) {
      if (!Array.isArray(data.attendees)) return { ok: false, error: 'รูปแบบข้อมูลผู้เข้าอบรมไม่ถูกต้อง' };
      for (const a of data.attendees) {
        if (!a.firstName?.trim() || !a.lastName?.trim() || !a.email?.trim() || !a.phone?.trim()) {
          return { ok: false, error: 'กรุณากรอกข้อมูลผู้เข้าอบรมให้ครบทุกช่อง' };
        }
      }
      update.attendees = data.attendees.map((a) => ({
        firstName: String(a.firstName).trim(),
        lastName:  String(a.lastName).trim(),
        email:     String(a.email).trim().toLowerCase(),
        phone:     String(a.phone).trim(),
      }));
    }
    if (data.invoice !== undefined) {
      if (data.invoice === null) {
        update.requestInvoice = false;
        update.invoice = null;
      } else {
        update.requestInvoice = true;
        const inv = data.invoice;
        if (inv.type        !== undefined) update['invoice.type']        = inv.type;
        if (inv.country     !== undefined) update['invoice.country']     = inv.country;
        if (inv.firstName   !== undefined) update['invoice.firstName']   = String(inv.firstName ?? '').trim();
        if (inv.lastName    !== undefined) update['invoice.lastName']    = String(inv.lastName ?? '').trim();
        if (inv.companyName !== undefined) update['invoice.companyName'] = String(inv.companyName ?? '').trim();
        /**
         * `invoice.branch` IS DELIBERATELY NOT COPIED — it is legacy read-only.
         *
         * This one-key-at-a-time copy is the third layer of a three-layer save
         * (JSX control → lazily-created skeleton → this allowlist) and the only
         * one with no visible symptom when it is wrong: an unnamed key is
         * dropped here, the action returns ok, and the admin sees the old value
         * after a refresh. Same class of trap as articleSchema's strip mode.
         */
        if (inv.branchType  !== undefined) update['invoice.branchType']  = inv.branchType;
        if (inv.branchCode  !== undefined) update['invoice.branchCode']  = String(inv.branchCode ?? '').trim();
        if (inv.branchFree  !== undefined) update['invoice.branchFree']  = String(inv.branchFree ?? '').trim();
        if (inv.taxId       !== undefined) update['invoice.taxId']       = String(inv.taxId ?? '').trim();
        if (inv.thaiAddress !== undefined) {
          update['invoice.thaiAddress'] = inv.thaiAddress;
          if (inv.country === 'TH') update['invoice.internationalAddress'] = null;
        }
        if (inv.internationalAddress !== undefined) {
          update['invoice.internationalAddress'] = inv.internationalAddress;
          if (inv.country === 'OTHER') update['invoice.thaiAddress'] = null;
        }
      }
    }
    if (data.notes !== undefined) {
      // The `!== undefined` guard above already draws the line this file cares
      // about: a caller that did not mention `notes` never reaches here, so the
      // field is left alone. Once inside, the value is a deliberate one — and
      // `|| undefined` threw that away again, making "clear the note" a no-op.
      update.notes = String(data.notes ?? '').trim().slice(0, 500);
    }
  }

  if (Object.keys(update).length === 0) return { ok: false, error: 'ไม่มีข้อมูลที่จะอัปเดต' };

  await dbConnect();
  const Model = getModel(source);
  const doc   = await Model.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: false });
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);

  // THE ACT ONLY. This edits the record wholesale — the `update` object above
  // can carry the customer's name, email, phone, tax id and every attendee's
  // contact details. None of it goes in the trail. Which FIELDS changed is
  // answerable from a backup; who edited the registration and when is not.
  recordAdminActionAfter({
    menu:        'registrations',
    action:      'update',
    entity:      entityForSource(source),
    recordId:    String(id),
    recordLabel: '',
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteRegistration(id, source = 'public') {
  const session = await requireAdmin('registrations');
  if (!id) return { ok: false, error: 'Missing id' };

  await dbConnect();
  const Model = getModel(source);
  const doc   = await Model.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);

  // The act and the id. NO read-before-delete, and that is not an oversight:
  // every other delete in this sweep captures `before` first because the label
  // is unrecoverable afterwards, but here there is nothing we are PERMITTED to
  // capture. If someone needs what was in a deleted registration, the answer is
  // a database backup — not a shadow copy in an append-only collection.
  recordAdminActionAfter({
    menu:        'registrations',
    action:      'delete',
    entity:      entityForSource(source),
    recordId:    String(id),
    recordLabel: '',
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── Status counts for stat strip ──────────────────────────────────

export async function getRegistrationStatusCounts({ range = 'all', source = 'public' } = {}) {
  await requireAdmin('registrations');
  await dbConnect();

  // The SAME derivation the list query uses — see listRegistrations.
  const dateFilter = rangeToDateFilter(range);
  const Model = getModel(source);

  if (source === 'inhouse') {
    /**
     * ONE COUNT PER DECLARED STATUS, driven by the array — never by a list of
     * names written here.
     *
     * The four hand-named counts this replaces omitted `quoted` entirely, so a
     * real record was included in `total` and returned under no key at all. The
     * card for it could not have shown a number even if one had been declared.
     * Counting `INHOUSE_STATUS_VALUES` means a status added to that array is
     * counted here without this file being edited.
     *
     * Keys are the STORED VALUE (`closed-won`, not `closedWon`), which is also
     * the card key and the filter value, so no consumer has to map between
     * spellings.
     */
    const [total, ...perStatus] = await Promise.all([
      Model.countDocuments(dateFilter),
      ...INHOUSE_STATUS_VALUES.map((value) =>
        Model.countDocuments({ ...dateFilter, status: value })
      ),
    ]);

    const byStatus = Object.fromEntries(
      INHOUSE_STATUS_VALUES.map((value, i) => [value, perStatus[i]])
    );

    return serialize({ total, ...byStatus, range, source });
  } else {
    const [total, pending, confirmed, paid, cancelled] = await Promise.all([
      Model.countDocuments(dateFilter),
      Model.countDocuments({ ...dateFilter, status: 'pending' }),
      Model.countDocuments({ ...dateFilter, status: 'confirmed' }),
      Model.countDocuments({ ...dateFilter, status: 'paid' }),
      Model.countDocuments({ ...dateFilter, status: 'cancelled' }),
    ]);
    return serialize({ total, pending, confirmed, paid, cancelled, range, source });
  }
}