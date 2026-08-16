'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import {
  PUBLIC_STATUS_VALUES,
  INHOUSE_STATUS_VALUES,
  storedValuesForFilter,
  transitionsForSource,
  allowedFromStates,
  statusLabel,
} from '@/lib/registrations/statuses';
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
      /**
       * THE PROJECTION IS THE RENDER LIST, field for field — the same rule the
       * in-house branch above is held to.
       *
       * ── THREE FIELDS LEFT IN ROUND 3, WITH THE COLUMNS THAT READ THEM ─────
       * `requestInvoice`, `payment` and `pricing` are gone. They fed the two
       * tick columns and the payment chip, all three of which were removed by
       * ruling: they were single-glyph answers to questions the detail page
       * answers properly, and the chip additionally asserted a payment method
       * for rows that hold no payment record at all.
       *
       * `payment` and `pricing` are whole SUBDOCUMENTS, so this is not a
       * cosmetic saving on a page of twenty rows.
       *
       * ── AND WHAT DELIBERATELY STAYED ──────────────────────────────────────
       * `scheduleType` AND `attendanceMode` both remain, because ScheduleBadge
       * is kept whole by ruling — without the mode a hybrid round cannot say
       * whether it runs on Teams or in the classroom, and two arrangements
       * collapse into one chip.
       *
       * `classDate` stays although its own column is gone: it moved INTO the
       * course cell as the รอบอบรม line, which is what that column heading now
       * means. A field losing its column is not a field losing its home.
       *
       * NOT WIDENED, either: the design puts a ครบ / ยังไม่ครบ / แจ้งภายหลัง chip
       * under the attendee count. Ruled out, and deriving one would have meant
       * adding `attendeesListProvided` and the `attendees` ARRAY — personal data
       * — to a list query, to render a three-way chip.
       */
      .select('courseName classDate scheduleType attendanceMode coordinator attendeesCount status createdAt')
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

/**
 * DERIVED, both of them, not written out again. These Sets are the write-side
 * membership gate on `updateRegistrationStatus`; the cards and the chips on the
 * list screen are built from the same two arrays in
 * lib/registrations/statuses.js. Spelling the values here a second time is how
 * the screen came to offer a `quoted` chip that no card could display.
 *
 * The in-house set is now the THREE-VALUE vocabulary. A retired value arriving
 * here — `contacted` from a stale open tab — is rejected as "สถานะไม่ถูกต้อง",
 * which is the correct answer: it is no longer a state an admin may choose.
 * Documents that still HOLD one are a separate question, handled by the
 * transition table, which returns [] for an unknown from-state.
 */
const PUBLIC_STATUSES  = new Set(PUBLIC_STATUS_VALUES);
const INHOUSE_STATUSES = new Set(INHOUSE_STATUS_VALUES);

// The refusal message reads through `statusLabel` instead of a per-source label
// map. It has to: the from-state may be a RETIRED value, which no live map
// knows, and a public-only map would have rendered an in-house refusal as
// 'จาก "contacted"' — half Thai, half raw enum, explaining a rule the admin did
// not expect in the least helpful way available.

/**
 * ── THE TRANSITION IS ENFORCED HERE, NOT BY WHICH BUTTONS RENDER ────────────
 *
 * Every export of a `'use server'` module is a POST endpoint. Which transitions
 * RegistrationDetailClient chooses to offer is therefore a CONVENTION the
 * client is trusted to follow, not a guarantee — anything that can speak the
 * action protocol can call this with any pair of states. This repo has already
 * paid for that exact shape once, in applyArticlePositionPlan.
 *
 * So the rule lives in lib/registrations/statuses.js and is applied
 * against the STORED value, by the database:
 *
 *   · the membership check below rejects a target that is not a declared
 *     status at all;
 *   · the conditional update rejects a target the CURRENT state may not reach.
 *
 * ── WHY A CONDITIONAL UPDATE AND NOT A READ-THEN-WRITE ──────────────────────
 * `allowedFromStates(status)` names the permitted from-states and they go into
 * the filter, so Mongo matches the document and writes it in one operation. A
 * read-then-write leaves a window in which a concurrent call — a second admin,
 * a double-clicked button, the Omise webhook settling a charge — changes the
 * status between the read and the write, and the write then lands on a state
 * nobody checked. `paid → cancelled` racing `cancelled → paid` is not a
 * hypothetical here; it is the exact case the webhook guard was added for.
 */
export async function updateRegistrationStatus(id, status, source = 'public') {
  const session = await requireAdmin('registrations');
  const validSet = source === 'inhouse' ? INHOUSE_STATUSES : PUBLIC_STATUSES;
  if (!validSet.has(status)) return { ok: false, error: 'สถานะไม่ถูกต้อง' };

  await dbConnect();
  const Model = getModel(source);

  /**
   * ATOMIC, FOR BOTH SOURCES. The filter names both the id AND the states
   * permitted to reach `status`, so a document in any other state is not
   * matched and not written.
   *
   * ── THE IN-HOUSE BRANCH IS GONE, NOT MIRRORED ───────────────────────────
   * Round 1 left in-house on an unconditional `findByIdAndUpdate` with the
   * note "in-house has its own vocabulary and no agreed transition table yet;
   * inventing one here would be a guess enforced on the sales team". The table
   * is agreed now, so the guess is no longer a guess — and keeping a separate
   * branch would mean the atomicity argument below applied to one collection
   * and not the other, for no reason anyone could state.
   *
   * `transitionsForSource` is the ONLY thing that differs between them, and it
   * is a lookup rather than a control-flow fork.
   *
   * ── WHY A CONDITIONAL UPDATE AND NOT A READ-THEN-WRITE ──────────────────
   * A read-then-write leaves a window in which a concurrent call — a second
   * admin, a double-clicked button, the Omise webhook settling a charge —
   * changes the status between the read and the write, and the write then
   * lands on a state nobody checked.
   *
   * ── A NULL RESULT IS AMBIGUOUS ──────────────────────────────────────────
   * It means EITHER no such id OR an id whose stored status may not make this
   * move, and the two deserve different messages ("ไม่พบรายการ" sends the
   * admin looking for a deleted record; the refusal tells them the rule). One
   * extra read resolves which, and it runs ONLY on that path — the successful
   * path is still a single write.
   *
   * ── THE REFUSAL MESSAGE USES `statusLabel`, NOT THE PUBLIC MAP ──────────
   * The from-state may be a RETIRED value — every unmigrated in-house document
   * holds one — and the public label map has no entry for `contacted`, so the
   * message would have read 'ไม่สามารถเปลี่ยนสถานะจาก "contacted"'. Telling an
   * admin the rule in half Thai and half English is a poor way to explain a
   * refusal they did not expect.
   */
  /**
   * The permitted from-states, WIDENED to the stored values that behave as
   * them. `quoted` is reachable from `pending`, and therefore also from the
   * unmigrated `new` and `contacted` that are about to become `pending`.
   *
   * Without the widening the atomic filter would refuse every in-house
   * transition until the migration ran — the whole backlog frozen, because a
   * retired value has no row in the three-value table. After --apply the extra
   * members match nothing.
   */
  const table = transitionsForSource(source);
  const fromStates = allowedFromStates(status, table)
    .flatMap((from) => storedValuesForFilter(from, source));

  const doc = await Model.findOneAndUpdate(
    { _id: id, status: { $in: fromStates } },
    { $set: { status } },
    { new: false, runValidators: false }
  );
  if (!doc) {
    const existing = await Model.findById(id).select('status').lean();
    if (!existing) return { ok: false, error: 'ไม่พบรายการ' };
    const from = statusLabel(existing.status);
    const to   = statusLabel(status);
    return { ok: false, error: `ไม่สามารถเปลี่ยนสถานะจาก "${from}" เป็น "${to}" ได้` };
  }
  const previous = doc.status;

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);

  // BELOW EVERY EARLY RETURN, and that placement is the rule: a REJECTED
  // transition writes NO audit row. The trail is a record of what happened, and
  // a refused move did not happen — filing one would put a status change in the
  // history of a record that never changed status, which is worse than silence
  // because it reads as evidence.
  recordAdminActionAfter({
    menu:        'registrations',
    action:      'status',
    entity:      entityForSource(source),
    recordId:    String(id),
    recordLabel: '', // the reference number IS the id — see the header
    before:      { status: previous },
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

  /**
   * ── THE CANCELLATION LOCK ───────────────────────────────────────────────
   *
   * A cancelled PUBLIC registration is READ-ONLY. The gate is in the FILTER,
   * not in a preceding read, for the same reason as the transition check
   * above: a read-then-write can be raced by the cancel it is checking for,
   * and the edit then lands on a record that was cancelled a millisecond ago.
   *
   * ── THE SCOPE IS EXACTLY THIS, AND THE OMISSIONS ARE RULINGS ────────────
   *
   *   · `cancelled` ⇒ THE WHOLE RECORD IS FROZEN. Every field, and every
   *     cancelled record — including one cancelled before any payment. There
   *     is no "it was only a pending registration" carve-out, because the
   *     value of the lock is that a cancelled row means one thing.
   *
   *   · `paid` (not cancelled) LOCKS THE STATUS FIELD ONLY, and it is locked
   *     by the transition table, not here. Editing attendees, the coordinator,
   *     the invoice/billing address and the notes stays fully available on a
   *     paid record — those are exactly the things that need correcting after
   *     money arrives (a misspelled name on a tax invoice, a substituted
   *     attendee). Do NOT extend this filter to `paid`.
   *
   *   · DELETE STAYS AVAILABLE ON A CANCELLED RECORD. That is a decision, not
   *     a hole in the lock. Delete is a different permission from edit, it
   *     writes its own audit row, and the team needs to clear test rows —
   *     which is also the escape hatch for a wrongly-cancelled registration,
   *     since cancellation itself is terminal. Nothing here should be
   *     "completed" by gating deleteRegistration.
   *
   * ── IT COVERS BOTH COLLECTIONS NOW, AND IT DID NOT BEFORE ───────────────
   *
   * Round 1 wrote this as `source === 'inhouse' ? { _id: id } : …` with the
   * note "in-house is not gated: it has no `cancelled` in its vocabulary, so
   * the filter would be inert". That was true then and is FALSE now — round 2
   * gave in-house a `cancelled`, and the branch would have left a cancelled
   * in-house request fully editable while the public one beside it was frozen.
   *
   * So the branch is gone rather than mirrored. The rule follows the VALUE, not
   * the collection: a record holding `cancelled` is read-only, and there is one
   * filter saying so. A per-source ternary here would be a second place for the
   * rule to live and a second place for it to fall behind.
   */
  const filter = { _id: id, status: { $ne: 'cancelled' } };

  const doc = await Model.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: false });
  if (!doc) {
    // Same ambiguity as the status gate — no such id, or a locked one. One
    // extra read on the refusal path only, so the two messages stay distinct.
    const existing = await Model.findById(id).select('status').lean();
    if (!existing) return { ok: false, error: 'ไม่พบรายการ' };
    return { ok: false, error: 'ใบสมัครนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้' };
  }

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

// ── One number, for the source toggle's badge ─────────────────────

/**
 * How many records one source holds, under the SAME range window everything
 * else on the screen is under.
 *
 * ── WHY THIS EXISTS RATHER THAN A SECOND getRegistrationStatusCounts CALL ───
 * The toggle needs ONE number for the source that is NOT selected — the badge
 * beside "In-house" while Public is showing. `getRegistrationStatusCounts`
 * would answer it, but it issues one `countDocuments` per declared status plus
 * a total (five queries for public) to produce a number the toggle takes one of.
 * This is that one query.
 *
 * ── THE RANGE IS NOT OPTIONAL HERE, AND THE MOCKUP DISAGREES ────────────────
 * The design shows the toggle carrying RAW TOTALS while the cards beneath it are
 * range-filtered. That is the screen contradicting itself: under "7 วัน" the
 * In-house badge would read 8 while the ทั้งหมด card three centimetres below it
 * reads 1, and a reader has no way to know which number answers which question.
 *
 * This screen has shipped exactly that class of defect before — twice. The date
 * chips once filtered the summary cards and not the table (fixed by moving the
 * window into lib/registrations/listFilter.js), and the in-house strip once read
 * ทั้งหมด 6 over cards summing to 5. Both were one surface answering a question
 * a neighbouring surface was answering differently. A raw total in the toggle
 * would be the third.
 *
 * So the badge follows `range` like everything else, and "how many in-house
 * enquiries exist in total" is answered by selecting In-house with ทั้งหมด —
 * which is what the ทั้งหมด chip is for.
 */
export async function getRegistrationTotal({ range = 'all', source = 'public' } = {}) {
  await requireAdmin('registrations');
  await dbConnect();

  // The SAME derivation the list query and the counts use — see listRegistrations.
  return getModel(source).countDocuments(rangeToDateFilter(range));
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
     * Keys are the STORED VALUE, which is also the card key and the filter
     * value, so no consumer has to map between spellings.
     *
     * ── EACH COUNT MATCHES ITS LEGACY VALUES TOO ────────────────────────────
     * `storedValuesForFilter` widens `pending` to `['pending','new',
     * 'contacted']` and `cancelled` to `['cancelled','closed-lost']` for the
     * window between this deploying and the migration's --apply. Without that
     * the strip would read ทั้งหมด 8 over cards summing to 2 — the ORIGINAL
     * defect this module exists to prevent, arriving from the other direction,
     * because `total` counts every document while a per-value count would only
     * find the migrated ones. After --apply the extra members match nothing.
     */
    const [total, ...perStatus] = await Promise.all([
      Model.countDocuments(dateFilter),
      ...INHOUSE_STATUS_VALUES.map((value) =>
        Model.countDocuments({ ...dateFilter, status: { $in: storedValuesForFilter(value, 'inhouse') } })
      ),
    ]);

    const byStatus = Object.fromEntries(
      INHOUSE_STATUS_VALUES.map((value, i) => [value, perStatus[i]])
    );

    return serialize({ total, ...byStatus, range, source });
  } else {
    /**
     * ONE COUNT PER DECLARED STATUS, driven by the array — the same shape as
     * the in-house branch above and for the same reason. The four hand-named
     * counts this replaces were the last hand-written spelling of the public
     * enum on the server, and a fifth status added to PUBLIC_STATUSES would
     * have been counted by nothing while its card rendered `undefined`.
     *
     * The returned keys are unchanged (`pending`, `confirmed`, `paid`,
     * `cancelled`) because they ARE the stored values, which is also the card
     * key and the URL filter value.
     */
    const [total, ...perStatus] = await Promise.all([
      Model.countDocuments(dateFilter),
      ...PUBLIC_STATUS_VALUES.map((value) =>
        Model.countDocuments({ ...dateFilter, status: value })
      ),
    ]);

    const byStatus = Object.fromEntries(
      PUBLIC_STATUS_VALUES.map((value, i) => [value, perStatus[i]])
    );

    return serialize({ total, ...byStatus, range, source });
  }
}