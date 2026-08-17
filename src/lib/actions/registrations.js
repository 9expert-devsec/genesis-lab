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
// `rangeToDateFilter` is no longer imported: round 8 moved the counts and the
// toggle total onto `buildRegistrationScope`, which is the shared non-status
// half of the list filter. Importing it here again would be a second, narrower
// derivation beside the shared one — which is precisely the shape that let the
// cards and the table disagree before this module existed.
import { buildRegistrationFilter, buildRegistrationScope } from '@/lib/registrations/listFilter';
// The ONE derivation site for "which course codes does this search term name".
// All three query actions call it, so the four numbers on the screen cannot
// disagree about what a search means — see its own header.
import { inhouseCourseCodes } from '@/lib/registrations/inhouseCourseSearch';
import { normalizeNoteBody, buildNoteEntry } from '@/lib/registrations/internalNotes';
import { ROUND_FIELDS, roundFieldsFor } from '@/lib/registrations/roundSelection';
// The duplicate rule lives beside the roster derivation, not here — the screens
// and the server must agree about what "the same attendee twice" means, and a
// second copy is how they come to disagree.
import { firstDuplicateAttendee } from '@/lib/registrations/attendeeInfo';
import { PUBLIC_SCHEDULE_STATUSES, listSchedulesByCourse } from '@/lib/api/schedules';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';

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

export async function listRegistrations({
  page = 1, status = 'all', q = '', source = 'public', range = 'all',
  from = '', to = '', course = '',
} = {}) {
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
  const courseCodes = await inhouseCourseCodes({ q, source });
  const filter = buildRegistrationFilter({ status, q, source, range, from, to, course, courseCodes });

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

  /**
   * Set when the payload touches a field that a PAID record may not change on
   * this path. Only `attendeesCount` sets it today — see the note at that field.
   * A flag rather than an inline filter edit, because the filter is built once,
   * far below, and a second `status:` key written there by hand would silently
   * replace the cancellation lock rather than join it.
   */
  let paidGuard = false;

  /**
   * How many attendee rows this payload writes, or null if it writes none.
   * Feeds the seat lock below — see the note there for why it is carried out
   * rather than checked inline.
   */
  let rosterLength = null;

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
      'thaiAddress','internationalAddress','message',
      /**
       * ── `adminNotes` IS GONE FROM THIS LIST, AND ITS ABSENCE IS THE LOCK ──
       *
       * Internal notes are APPEND-ONLY and this action is a `$set` of whatever
       * it is handed. Leaving the name here would have been the entire hole:
       * a caller could send `adminNotes: []` and erase the record, or send a
       * rewritten array and overwrite any note in it — which is exactly the
       * failure the append-only design exists to prevent, reachable through a
       * different door.
       *
       * The UI absence of an edit control is NOT the enforcement. Every export
       * of a `'use server'` module is a POST endpoint; the enforcement is that
       * the only action which touches this field uses `$push` and takes a
       * single body string. See `addInternalNote` below.
       *
       * test/fs/internalNotesAppendOnly pins this absence, because re-adding
       * the name is a one-word change that no render test could see.
       */
    ];
    for (const f of inhouseFields) {
      if (data[f] !== undefined) update[f] = data[f];
    }
  } else {
    /**
     * ── THE FOUR ROUND FIELDS ARE GONE FROM HERE ────────────────────────────
     *
     * `classDate`, `scheduleType` and `attendanceMode` used to be writable
     * through this action, one key at a time, with no `classId` involved at all.
     * THAT WAS THE COUPLING HOLE: a caller could set the date label to anything
     * while `classId` went on pointing at the old round, and no screen would
     * show the disagreement.
     *
     * They now move only through `updateRegistrationRound`, which takes an ID,
     * looks the round up, verifies it belongs to this registration's course, and
     * derives all four itself. `classId` was never in this allowlist and is not
     * being added — a client that could send an id here would bypass the lookup.
     *
     * fs/roundCouplingGate pins all four names out of this list. Re-adding any
     * one of them is a one-word change that restores the hole, and no render
     * test could see it.
     */

    // Public editable fields
    if (data.coordinator) {
      const c = data.coordinator;
      if (c.firstName !== undefined) update['coordinator.firstName'] = String(c.firstName).trim();
      if (c.lastName  !== undefined) update['coordinator.lastName']  = String(c.lastName).trim();
      if (c.email     !== undefined) update['coordinator.email']     = String(c.email).trim().toLowerCase();
      if (c.phone     !== undefined) update['coordinator.phone']     = String(c.phone).trim();
    }
    if (data.attendeesListProvided !== undefined) update.attendeesListProvided = Boolean(data.attendeesListProvided);
    /**
     * ══ attendeesCount IS EDITABLE HERE ONLY WHILE THE RECORD IS UNPAID ═══════
     *
     * ── THIS IS CLOSING AN OPEN HOLE, NOT HARDENING A SAFE FIELD ────────────
     * Until round 8 this branch had NO STATUS GATE AT ALL. The count that drove
     * the amount charged could be changed on a `paid` registration through the
     * ordinary field edit, silently, with the trail recording only that "an
     * edit happened". That was live.
     *
     * The rule is now three states:
     *   · unpaid (pending / confirmed) → editable here, an ordinary field
     *   · paid                          → REFUSED, and there is NO OTHER DOOR
     *   · cancelled                     → refused, by the filter below, like
     *                                     every other field (round 1)
     *
     * ── THERE WAS A SECOND DOOR FOR ONE ROUND. IT IS GONE. ──────────────────
     * Round 8 shipped `updateAttendeesCountPaid`: a separate action behind a
     * ขอเพิ่มจำนวนผู้เข้าอบรม panel that raised the count on a paid record,
     * increase-only, with consent copy and an audit row naming both numbers.
     *
     * It was removed because RAISING THE COUNT ON A PAID REGISTRATION IS NOT
     * SOMETHING THIS TEAM DOES IN THIS SYSTEM. When a customer asks for more
     * seats after paying, the whole thing is handled outside; the system only
     * records that the contact happened. The action was built for a workflow
     * that does not run here, and it carried real cost — a receipt whose
     * headcount disagrees with its own total, a rule about which document reads
     * which field, and a standing path for the record to drift away from what
     * Omise recorded.
     *
     * So the gate below is now the whole answer rather than half of one, and it
     * is STRICTER than when it was written, not looser: a paid record's count
     * cannot be changed by any path, in either direction.
     *
     * DO NOT RE-ADD A SECOND DOOR without a decision about the receipt, the
     * refund obligation a decrease creates, and reconciliation. Those were the
     * three unanswered questions the first one shipped around.
     *
     * ── THE GATE IS IN THE FILTER, NOT IN A READ-THEN-WRITE ─────────────────
     * `paidGuard` joins the update FILTER rather than being checked against a
     * status read first, for the same reason the cancellation lock is a filter:
     * a read-then-write loses to a charge landing between the two, and the
     * webhook that writes `paid` is exactly the concurrent writer that would win
     * that race. The refusal path below already re-reads to tell the two
     * refusals apart, so there is no extra round trip on success.
     */
    if (data.attendeesCount !== undefined) {
      const n = parseInt(data.attendeesCount, 10);
      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;
      paidGuard = true;
    }
    if (data.attendees !== undefined) {
      if (!Array.isArray(data.attendees)) return { ok: false, error: 'รูปแบบข้อมูลผู้เข้าอบรมไม่ถูกต้อง' };
      /**
       * ── ONLY ชื่อ AND นามสกุล ARE REQUIRED HERE. ROUND 8. ─────────────────
       *
       * Email and phone were required on this path too. They are not any more,
       * and the asymmetry with the customer form is DELIBERATE — see the note
       * on `attendeeSchema` in lib/schemas/register-public, which still demands
       * all four.
       *
       * THE MODEL IS THE STORAGE FLOOR and must accept everything any legitimate
       * writer may write; the wizard's zod is a PRODUCT DECISION about what we
       * accept from a customer and is deliberately stricter. An admin correcting
       * a record — a walk-in whose email nobody took, a name given over the
       * phone — is a different decision from a customer submitting one.
       */
      for (const a of data.attendees) {
        if (!a.firstName?.trim() || !a.lastName?.trim()) {
          return { ok: false, error: 'กรุณากรอกชื่อและนามสกุลผู้เข้าอบรมให้ครบทุกท่าน' };
        }
      }
      update.attendees = data.attendees.map((a) => ({
        firstName: String(a.firstName).trim(),
        lastName:  String(a.lastName).trim(),
        email:     String(a.email ?? '').trim().toLowerCase(),
        phone:     String(a.phone ?? '').trim(),
      }));

      /**
       * ── NO DUPLICATE ATTENDEE ────────────────────────────────────────────
       * On EMAIL where there is one, on the full name between rows that have
       * none. `firstDuplicateAttendee` carries the argument for that choice and
       * the failure mode it accepts.
       */
      const dup = firstDuplicateAttendee(update.attendees);
      if (dup !== -1) {
        const a = update.attendees[dup];
        return {
          ok: false,
          error: `ผู้เข้าอบรมท่านที่ ${dup + 1} (${a.firstName} ${a.lastName}) ซ้ำกับรายชื่อก่อนหน้า`,
        };
      }

      rosterLength = update.attendees.length;
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
  /**
   * ONE `status` KEY, built once. `$nin` rather than a second `status:` — an
   * object literal silently keeps the LAST duplicate key, so writing the paid
   * rule as its own `status:` line would have DELETED the cancellation lock
   * while looking like it added to it.
   */
  const blocked = paidGuard ? ['cancelled', 'paid'] : ['cancelled'];
  const filter = { _id: id, status: { $nin: blocked } };

  /**
   * ══ THE SEAT LOCK — ENFORCED HERE, NOT BY A DISABLED BUTTON ════════════════
   *
   * The roster may not exceed `attendeesCount`. The client disables its + button
   * at capacity, but that is a courtesy: every `'use server'` export is a POST
   * endpoint and this is the only thing that actually holds.
   *
   * ── TWO CASES, AND THE SECOND NEEDS NO EXTRA READ ─────────────────────────
   *
   *   · The payload sets the COUNT as well as the rows — compare the two in JS,
   *     because the new count is what the roster must fit inside, not the stored
   *     one.
   *   · The payload sets only the ROWS — the ceiling is the STORED count, and it
   *     is compared IN THE FILTER with `$expr`. That keeps the check atomic: a
   *     read-then-write would lose to a concurrent seat change landing between
   *     the two, and it costs no round trip.
   *
   * ── WHY NOT `$expr` FOR BOTH ──────────────────────────────────────────────
   * Because in the first case the count in the document is about to be replaced
   * by the one in this very update, and `$expr` sees the document as it is
   * BEFORE the write. It would compare against a number that is on its way out.
   *
   * ── THE ALREADY-OVER RECORD IS NOT TOUCHED ────────────────────────────────
   * This refuses a payload that WOULD leave the roster over capacity. It does
   * not truncate, and nothing anywhere deletes an attendee to satisfy a rule
   * invented after the data — one production record is already over (2 against
   * a count of 1) and it keeps both people. Saving that record unchanged still
   * fails this check, which is correct and is the only honest outcome: the way
   * out is to raise the count, not to lose a name.
   */
  if (rosterLength !== null) {
    if (update.attendeesCount !== undefined) {
      if (rosterLength > update.attendeesCount) {
        return {
          ok: false,
          error: `มีรายชื่อผู้เข้าอบรม ${rosterLength} ท่าน เกินจำนวนที่สมัครไว้ ${update.attendeesCount} ท่าน`,
        };
      }
    } else {
      filter.$expr = { $gte: ['$attendeesCount', rosterLength] };
    }
  }

  const doc = await Model.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: false });
  if (!doc) {
    // Same ambiguity as the status gate — no such id, or a locked one. One
    // extra read on the refusal path only, so the three messages stay distinct.
    const existing = await Model.findById(id).select('status attendeesCount').lean();
    if (!existing) return { ok: false, error: 'ไม่พบรายการ' };
    /**
     * THE SEAT LOCK'S REFUSAL, NAMED. Without this the `$expr` clause above
     * would surface as "ใบสมัครนี้ถูกยกเลิกแล้ว" — a message about a completely
     * different rule, on a record that is not cancelled. Checked BEFORE the
     * cancellation branch for exactly that reason.
     */
    if (rosterLength !== null && existing.status !== 'cancelled'
        && rosterLength > Number(existing.attendeesCount ?? 0)) {
      return {
        ok: false,
        error: `มีรายชื่อผู้เข้าอบรม ${rosterLength} ท่าน เกินจำนวนที่สมัครไว้ ${existing.attendeesCount} ท่าน`,
      };
    }
    /**
     * ── THE MESSAGE STOPS AT "NO", AND THAT IS THE WHOLE MESSAGE ────────────
     *
     * It used to end `กรุณาใช้ "ขอเพิ่มจำนวนผู้เข้าอบรม"`, naming the second
     * door. That door is gone, so the sentence would now send an admin looking
     * for a control that does not exist — the worst kind of stale copy, because
     * it reads as a working instruction.
     *
     * AND IT DELIBERATELY DOES NOT SAY "ยกเลิกแล้วลงทะเบียนใหม่". The removed
     * action's own refusal did say that, and it should not have: nobody has
     * established what cancelling a PAID registration does to reconciliation,
     * so this system must not route anyone down that path. Offering a next step
     * we have not thought through is worse than offering none — it converts an
     * admin's question into an action, and the question is the correct outcome.
     *
     * "จากหน้าแก้ไขปกติ" is gone for the same reason: qualifying the refusal by
     * WHICH page implies another page exists.
     */
    if (paidGuard && existing.status === 'paid') {
      return {
        ok: false,
        error: 'รายการนี้ชำระเงินแล้ว จึงเปลี่ยนจำนวนผู้เข้าอบรมไม่ได้',
      };
    }
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

// ── The training round (four coupled fields) ───────────────────────

/**
 * MOVE A REGISTRATION TO A DIFFERENT ROUND. Public only.
 *
 * ══ THE CLIENT SENDS AN ID; THE SERVER WRITES FOUR FIELDS ═══════════════════
 *
 * `classId`, `classDate`, `scheduleType` and `attendanceMode` describe ONE round
 * and must move together. A control that writes only the date label leaves
 * `classId` pointing at a different round than the label shows, and nothing on
 * screen would reveal it.
 *
 * So the payload is `{ classId }` plus `attendanceMode` ONLY when the chosen
 * round is hybrid. The client does NOT send `classDate` or `scheduleType` — it
 * cannot, because they are not in the signature — and THIS action reads the
 * round from the real source and derives all four itself. A client that cannot
 * send a label cannot send one that disagrees with the id.
 *
 * ── WHY NOT `updateRegistration` ──────────────────────────────────────────
 * That action is a wholesale `$set` of an allowlisted bag, and the three label
 * fields WERE in its allowlist — which is exactly the hole: a caller could send
 * `classDate: 'whatever'` with no `classId` at all. They have been removed from
 * it; see the note there.
 */
export async function updateRegistrationRound(id, { classId, attendanceMode } = {}) {
  const session = await requireAdmin('registrations');
  if (!id) return { ok: false, error: 'Missing id' };
  if (!classId) return { ok: false, error: 'กรุณาเลือกรอบอบรม' };

  await dbConnect();

  /**
   * The registration first, for TWO reasons — the course it belongs to, and the
   * `before` values the audit row needs. One read serves both.
   */
  const doc = await RegisterPublic.findById(id)
    .select('status courseId classId classDate scheduleType attendanceMode')
    .lean();
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  // The cancellation lock, read here rather than in a filter because the write
  // below is already preceded by this read for the course id — so unlike every
  // other action on this screen there is no extra round trip to save, and the
  // conditional update below still carries the same `$ne` so a cancel racing
  // this call cannot land.
  if (doc.status === 'cancelled') {
    return { ok: false, error: 'ใบสมัครนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้' };
  }

  /**
   * ══ REQUIREMENT 3: THE ROUND MUST BELONG TO THIS REGISTRATION'S COURSE ═════
   *
   * Without this an admin — or anything that can POST — could move an attendee
   * onto ANOTHER COURSE'S round by sending its id. The registration would then
   * name one course and point at a round of a different one, and the detail
   * screen would render the new date beside the old course name perfectly
   * happily.
   *
   * It is enforced by CONSTRUCTION rather than by comparison: the candidate
   * rounds are fetched FOR THIS COURSE, and a `classId` not among them is
   * refused. There is no branch that could compare the wrong two things.
   */
  const course = await getCourseByCodeInsensitive(doc.courseId).catch(() => null);
  if (!course?._id) {
    // Upstream is down, or the course was withdrawn. REFUSE rather than write —
    // an unverifiable round is exactly what this action exists to prevent.
    return { ok: false, error: 'ไม่สามารถตรวจสอบหลักสูตรของรายการนี้ได้ กรุณาลองใหม่' };
  }

  const { items: rounds } = await listSchedulesByCourse(course._id, {
    limit: 50,
    // ── FULL ROUNDS ARE OFFERED; PAST ROUNDS CANNOT BE ─────────────────────
    // The admin case is CORRECTION, not booking, so a sold-out round is a
    // legitimate destination and `PUBLIC_SCHEDULE_STATUSES` includes `full`.
    //
    // PAST rounds are a different matter and the DATA DOES NOT SUPPORT THEM:
    // the endpoint applies a `>= today` bound UNCONDITIONALLY and the `status`
    // parameter does not lift it — measured and curl-verified in
    // lib/api/schedules.js. There is no request that returns a finished round.
    // That is why requirement 5 (a stored round that is no longer listed still
    // renders, marked) is load-bearing rather than defensive.
    status: PUBLIC_SCHEDULE_STATUSES,
    // includeStarted — the public surfaces drop a round once its first training
    // day arrives. This is the ADMIN correction path and must not: requirement 3
    // enforces "the round belongs to this course" BY CONSTRUCTION, from this
    // very list, so a narrower list here would not merely hide a round — it
    // would REFUSE a legitimate correction onto a round that started this
    // morning, with the misleading error "รอบที่เลือกไม่ได้อยู่ในหลักสูตรของรายการนี้".
    // The picker at admin/registrations/[id] opts out identically; the two
    // lists must be the same list.
    includeStarted: true,
  }).catch(() => ({ items: null }));

  if (!rounds) return { ok: false, error: 'ไม่สามารถอ่านรอบอบรมของหลักสูตรนี้ได้ กรุณาลองใหม่' };

  const round = rounds.find((r) => String(r?._id) === String(classId));
  if (!round) {
    return { ok: false, error: 'รอบที่เลือกไม่ได้อยู่ในหลักสูตรของรายการนี้' };
  }

  /**
   * ══ REQUIREMENT 4: HYBRID REQUIRES A CHOICE, NEVER DEFAULTED ═══════════════
   *
   * `roundFieldsFor` returns null when a hybrid round has no valid mode. It is
   * a REFUSAL, not a prompt to substitute one: guessing `classroom` for someone
   * who meant Teams sends an attendee to a building on the day.
   *
   * A NON-hybrid round sets `classroom` automatically, exactly as RegisterWizard
   * does — the same function, imported, not restated.
   */
  const fields = roundFieldsFor(round, attendanceMode);
  if (!fields) {
    return { ok: false, error: 'รอบนี้เป็นแบบ Hybrid กรุณาเลือกรูปแบบการเข้าอบรม' };
  }

  const updated = await RegisterPublic.findOneAndUpdate(
    { _id: id, status: { $ne: 'cancelled' } },
    { $set: fields },
    { new: false, runValidators: false },
  );
  if (!updated) return { ok: false, error: 'ใบสมัครนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);

  /**
   * ══ THE ONE EXCEPTION TO THE NO-DIFF AUDIT RULE. READ BEFORE REMOVING. ═════
   *
   * Every other field edit on this screen records the ACT ONLY, because
   * `RegisterPublic` holds names, emails, phones and tax ids and the audit trail
   * is append-only and presently forever — a shadow copy of personal data in
   * there cannot be redacted when a deletion request arrives.
   *
   * THESE FOUR FIELDS ARE NOT PERSONAL DATA. A round id is an upstream ObjectId,
   * a date label is a date, and the two enums are `classroom`/`hybrid`/`online`
   * and `classroom`/`teams`. None of them says anything about a person.
   *
   * AND MOVING SOMEONE BETWEEN ROUNDS IS AMONG THE MOST WORTH TRACING CHANGES ON
   * THIS SCREEN: it changes which day a person is expected on and which room or
   * link they need, it is the edit most likely to be disputed afterwards
   * ("nobody told me it moved"), and it is the one an admin can make by
   * mis-clicking a dropdown.
   *
   * So this call carries `before`/`after` FOR EXACTLY THESE FOUR NAMES and
   * nothing else. THIS IS DELIBERATE AND IS NOT AN INCONSISTENCY WITH THE
   * ACTIONS EITHER SIDE OF IT — the next reader will see a diff payload beside
   * `update`'s bare `{}` and "fix" it. Do not.
   *
   * The payload is built by picking ROUND_FIELDS off the documents rather than
   * by spreading them, so a field added to the registration later cannot join
   * this row by accident.
   */
  const pick = (source) => Object.fromEntries(ROUND_FIELDS.map((f) => [f, source?.[f] ?? null]));

  recordAdminActionAfter({
    menu:        'registrations',
    action:      'round',
    entity:      'public',
    recordId:    String(id),
    recordLabel: '',
    before:      pick(doc),
    after:       pick(fields),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true, fields };
}

// ── Internal notes (append-only) ───────────────────────────────────

/**
 * ADD ONE INTERNAL NOTE. Both sources. The only writer of `adminNotes`.
 *
 * ══ WHY THIS IS ITS OWN ACTION AND NOT A FIELD ON updateRegistration ════════
 *
 * Round 5 established the reason and it is about the AUDIT TRAIL being true.
 * The public history feed says `แก้ไขข้อมูลใบสมัคร` for every edit, because
 * `updateRegistration` genuinely does not know which field changed — it is a
 * `$set` of an allowlisted bag. Routing notes through it would file "somebody
 * edited this registration" when what happened was "somebody added a note", and
 * the feed would be technically true and useless. A dedicated action makes the
 * history row say `เพิ่มบันทึกภายใน`, on both sources.
 *
 * ══ APPEND-ONLY IS ENFORCED HERE, NOT BY THE ABSENCE OF UI ══════════════════
 *
 * THE REASON, at the place the action lives, because this is where someone will
 * come to add an edit: a single mutable text field lets the SECOND WRITER
 * SILENTLY OVERWRITE THE FIRST. That is the failure this feature replaces —
 * in-house's `adminNotes` was one String and two salespeople could not both use
 * it. Allowing edits reintroduces exactly that defect one level up: the note is
 * still overwritable, just one click deeper and with no record that it happened.
 * Internal notes are a RECORD TO READ BACK, not a document to revise.
 *
 * Three things make that structural rather than conventional:
 *   1. `$push`, never `$set`. There is no code path here that can replace the
 *      array or any element of it.
 *   2. THE SIGNATURE. It takes a body string and nothing else — no index, no
 *      note id, no array. A caller cannot NAME an existing note to change it,
 *      so a hand-crafted POST has nothing to aim at. This is why the subdocument
 *      has `_id: false`.
 *   3. `adminNotes` is NOT in `updateRegistration`'s allowlist — see the note
 *      there. That was the door round the back.
 *
 * ══ THE NOTE BODY NEVER REACHES AN AUDIT ROW ════════════════════════════════
 *
 * These records carry names, emails, phones and tax ids, and AN INTERNAL NOTE IS
 * THE FIELD MOST LIKELY TO QUOTE A CUSTOMER VERBATIM — what they asked for, what
 * they can afford, who to call. The audit trail is append-only and presently
 * forever, so anything copied into it cannot be redacted when a deletion request
 * arrives.
 *
 * The row records THAT a note was added, BY WHOM, and WHEN. Not what it said.
 * The `before`/`after` slots are deliberately unused; the contract caps this
 * entity at status_only and the writer reduces whatever it is handed, but the
 * discipline is here as well as there.
 */
export async function addInternalNote(id, body, source = 'public') {
  const session = await requireAdmin('registrations');
  if (!id) return { ok: false, error: 'Missing id' };

  // Normalised BEFORE the emptiness test, so "is this empty" is asked of the
  // exact string that would have been stored. Testing the raw input instead
  // lets a body of spaces through and stores '' — a byline attached to nothing.
  const note = normalizeNoteBody(body);
  if (!note) return { ok: false, error: 'กรุณากรอกบันทึก' };

  await dbConnect();
  const Model = getModel(source);

  /**
   * THE CANCELLATION LOCK, same filter as every other editable card.
   *
   * A cancelled record is read-only and the notes card is not an exception —
   * "the card obeys the cancellation lock like every other editable card" was
   * the instruction, and the lock lives in the FILTER for the same reason it
   * does everywhere else on this screen: a preceding read can be raced by the
   * cancel it is checking for.
   */
  const doc = await Model.findOneAndUpdate(
    { _id: id, status: { $ne: 'cancelled' } },
    {
      $push: {
        adminNotes: buildNoteEntry({
          body: note,
          authorId:   session.user?.id,
          // DENORMALISED ON PURPOSE — the name AT THE TIME OF WRITING. It must
          // not be re-resolved from authorId later; see the reasoning in
          // lib/registrations/internalNotes. A future reader will see the
          // duplication and want to normalise it away.
          authorName: session.user?.name,
        }),
      },
    },
    { new: true, runValidators: false },
  );

  if (!doc) {
    // Same ambiguity as every other gate here — no such id, or a locked one.
    // One extra read on the refusal path only, so the messages stay distinct.
    const existing = await Model.findById(id).select('status').lean();
    if (!existing) return { ok: false, error: 'ไม่พบรายการ' };
    return { ok: false, error: 'รายการนี้ถูกยกเลิกแล้ว จึงเพิ่มบันทึกไม่ได้' };
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);

  // THE ACT, THE ACTOR, THE TIME. NOT THE BODY. See the header.
  recordAdminActionAfter({
    menu:        'registrations',
    // `notes`, NOT a new `note`. This is the action in-house's retired
    // `updateInhouseAdminNotes` already wrote, so historical rows keep their
    // title and the shared action produces the same row on both sources. A new
    // verb would have split one event into two names for no reason.
    action:      'notes',
    entity:      entityForSource(source),
    recordId:    String(id),
    recordLabel: '',
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  /**
   * ══ THE STAMPED ENTRY GOES BACK TO THE CALLER — ROUND 13 ═══════════════════
   *
   * It used to return `{ ok: true }` and nothing else, and BOTH detail screens
   * then appended a local echo they had built themselves:
   *
   *     { body, authorId: '', authorName: '', createdAt: null }
   *
   * The docstrings at both call sites said the real values "arrive on the next
   * load via revalidatePath". THEY NEVER ARRIVE. `internalNotes` is
   * `useState(() => readNotes(doc.adminNotes))`, and a `useState` INITIALISER
   * RUNS ONCE PER MOUNT — a revalidated `doc` prop does not re-run it. So the
   * empty echo was on screen not "for an instant" but until the admin navigated
   * away and back, which is exactly what the defect report showed.
   *
   * The fix is not to sync state from props. It is to stop guessing: the server
   * has just written the entry and knows every field of it, so it hands it back
   * and the client appends THAT. The client still supplies nothing but the body,
   * which is the property that mattered — `authorId`, `authorName` and
   * `createdAt` remain the session's, stamped here.
   *
   * ── AND THIS IS NOT THE AUDIT-ROW RULE BEING BENT ─────────────────────────
   * The body never reaching an audit row is about the append-only TRAIL, which
   * cannot be redacted. This is a reply to the admin who typed the body one
   * moment ago, on the screen they typed it into. Different question.
   */
  const stored = doc.adminNotes?.[doc.adminNotes.length - 1];
  return { ok: true, note: serialize(stored) };
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
export async function getRegistrationTotal({
  q = '', range = 'all', source = 'public', from = '', to = '', course = '',
} = {}) {
  await requireAdmin('registrations');
  await dbConnect();

  /**
   * THE SAME SCOPE the list query and the counts use — not `rangeToDateFilter`
   * any more.
   *
   * It read the date alone until round 8, which was correct while the date was
   * the only shared dimension and became a defect the moment there were three: a
   * toggle badge reading 39 beside a table filtered to one course is the screen
   * answering one question two ways, which is the failure this whole module
   * exists to prevent. One function; every number inside it.
   */
  /**
   * ── AND THE SAME COURSE-NAME RESOLUTION, FOR THE SAME REASON ─────────────
   * Round 10 lets an in-house search match a course NAME, which no in-house
   * document stores. The term is resolved to codes upstream of the builder, and
   * this badge has to resolve it too — a badge counting only code matches beside
   * a table counting name matches is the identical disagreement one control
   * over. `inhouseCourseCodes` is the single derivation site all three actions
   * share; it returns `[]` for a public source before any fetch.
   */
  const courseCodes = await inhouseCourseCodes({ q, source });

  return getModel(source).countDocuments(
    buildRegistrationScope({ q, source, range, from, to, course, courseCodes }),
  );
}

// ── Course options for the filter panel ───────────────────────────

/**
 * THE COURSES THE FILTER MAY OFFER — DERIVED FROM THE REGISTRATIONS THEMSELVES.
 *
 * ══ NOT FROM THE CATALOGUE, AND THAT IS THE WHOLE DECISION ══════════════════
 *
 * The obvious source is the live course list. It is the wrong one, and round 6
 * measured why on the neighbouring field: 26 of 39 registrations hold a ROUND the
 * schedule endpoint will not return — 66.7% — because the endpoint filters
 * `>= today` unconditionally. Courses have the same shape of problem: a course
 * withdrawn, renamed or simply not currently offered disappears from the
 * catalogue while every registration for it stays in the collection forever.
 *
 * A filter built from the catalogue would therefore be UNABLE TO SELECT courses
 * that plenty of rows actually hold, while looking complete. That is a control
 * that hides data — the worst kind, because the reader has no way to notice.
 *
 * The admin is asking "WHICH OF THESE RECORDS", not "which courses exist". So
 * the options come from the records, and by construction nothing falls outside
 * them. `ZZTEST-EXCEL-01` is the live proof: it is in `coursesInterested` on a
 * real in-house enquiry and it is certainly not in any catalogue.
 *
 * ── WHAT IT COSTS, MEASURED RATHER THAN ASSUMED ───────────────────────────
 * A `distinct` over the whole collection, unindexed — neither collection indexes
 * any course field (checked: register_public has createdAt_-1_status_1, email_1,
 * coordinator.email_1, payment.method_1_status_1; register_inhouse has
 * createdAt_-1_status_1). At 39 and 8 documents that is a collection scan of
 * nothing, and it runs once per page render inside the existing Promise.all.
 *
 * THAT IS A FACT ABOUT TODAY'S SIZE, NOT A PROPERTY OF THE DESIGN. At ten
 * thousand registrations this becomes a scan per page load and wants either an
 * index on `courseCode` / `coursesInterested` or a cached option list. Written
 * down here so the next reader inherits the measurement rather than the
 * conclusion.
 *
 * ── THE TWO SOURCES SHAPE DIFFERENTLY ─────────────────────────────────────
 * Public carries `courseName` denormalised beside the code, so an option can be
 * labelled without a second lookup. In-house carries BARE CODES in an array and
 * no name at all, so the code is the label — accurate, and better than resolving
 * against a catalogue that may not hold it.
 */
export async function getRegistrationCourseOptions({ source = 'public' } = {}) {
  await requireAdmin('registrations');
  await dbConnect();

  if (source === 'inhouse') {
    const codes = await RegisterInhouse.distinct('coursesInterested');
    return serialize(
      codes
        .filter((c) => String(c ?? '').trim())
        .sort()
        .map((code) => ({ code: String(code), label: String(code) })),
    );
  }

  /**
   * ONE row per distinct course, carrying the name the registrations hold.
   *
   * `$last` on the name rather than `$first`: where the same code has been
   * stored under two names — an upstream rename between registrations — the
   * later one is the one staff will recognise. Either is a guess; this one is
   * the guess that ages correctly.
   */
  const rows = await RegisterPublic.aggregate([
    { $match: { courseCode: { $nin: [null, ''] } } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: '$courseCode', name: { $last: '$courseName' } } },
    { $sort: { _id: 1 } },
  ]);

  return serialize(rows.map((r) => ({
    code: String(r._id),
    // The name where there is one, the code where there is not — never an empty
    // option, which would render as a blank line the reader cannot choose
    // meaningfully.
    label: String(r.name ?? '').trim() || String(r._id),
  })));
}

// ── Status counts for stat strip ──────────────────────────────────

export async function getRegistrationStatusCounts({
  q = '', range = 'all', source = 'public', from = '', to = '', course = '',
} = {}) {
  await requireAdmin('registrations');
  await dbConnect();

  /**
   * THE SAME SCOPE the list query uses — the search, the date and the course,
   * minus the status this action supplies once per card.
   *
   * ── RENAMED FROM `dateFilter`, AND THE NAME MATTERED ─────────────────────
   * It was `dateFilter` while the date was the only shared dimension, and the
   * name is part of why `q` went missing for so long: every `{ ...dateFilter,
   * status }` below READS AS COMPLETE, and a reader checking whether the cards
   * follow the search box sees a variable that says it is about dates and moves
   * on. `scope` is what it is.
   */
  const courseCodes = await inhouseCourseCodes({ q, source });
  const scope = buildRegistrationScope({ q, source, range, from, to, course, courseCodes });
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
      Model.countDocuments(scope),
      ...INHOUSE_STATUS_VALUES.map((value) =>
        Model.countDocuments({ ...scope, status: { $in: storedValuesForFilter(value, 'inhouse') } })
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
      Model.countDocuments(scope),
      ...PUBLIC_STATUS_VALUES.map((value) =>
        Model.countDocuments({ ...scope, status: value })
      ),
    ]);

    const byStatus = Object.fromEntries(
      PUBLIC_STATUS_VALUES.map((value, i) => [value, perStatus[i]])
    );

    return serialize({ total, ...byStatus, range, source });
  }
}