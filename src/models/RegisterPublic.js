import mongoose from 'mongoose';
import { InternalNoteSchema } from './internalNoteSchema';
import { LegacyImportSchema } from './legacyImportSchema';

/**
 * Sub-schema for a single attendee (person actually attending).
 * When coordinator.isAttending === true, attendees[0] is a copy of
 * the coordinator's info (merged server-side on create).
 */
/**
 * ══ ONLY ชื่อ AND นามสกุล ARE REQUIRED HERE. READ BEFORE "FIXING" THE ASYMMETRY ══
 *
 * `email` and `phone` were `required: true` until round 8 and are not any more,
 * while `attendeeSchema` in lib/schemas/register-public STILL DEMANDS ALL FOUR.
 * That difference is deliberate and it is the kind a reader tidies into
 * consistency, so the reason is written at both sites.
 *
 * THIS SCHEMA IS THE STORAGE FLOOR. It must accept everything any legitimate
 * writer may legitimately write, and round 8 made the admin screen one of those
 * writers: an admin correcting a record — a walk-in whose email nobody took, a
 * name given over the phone — may now store an attendee with two fields. A floor
 * that refused it would contradict the writer above it.
 *
 * THE WIZARD'S ZOD IS A PRODUCT DECISION, and it is deliberately STRICTER than
 * the floor: what we accept from a CUSTOMER is all four, because a public
 * registration with no way to contact the attendee is a different product from
 * the one we sell. An admin correcting a record and a customer submitting one
 * are different decisions and they are allowed to have different rules.
 *
 * Tightening this back to four, or loosening the wizard's zod to two, both go
 * RED — test/fs/rosterSeatLock asserts the asymmetry in both directions rather
 * than only the direction that was changed.
 *
 * (`updateRegistration` writes with `runValidators: false`, so these `required`
 * flags would not have fired on an admin save anyway. They are relaxed all the
 * same: a declaration that contradicts its writer is a trap for whoever turns
 * validators on, and it would have been a one-word change to break the admin
 * path.)
 */
const AttendeeSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName:  { type: String, trim: true, required: true },
    email:     { type: String, trim: true, lowercase: true, default: '' },
    phone:     { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Sub-schema for the coordinator (person filling out the form).
 */
const CoordinatorSchema = new mongoose.Schema(
  {
    firstName:   { type: String, trim: true, required: true },
    lastName:    { type: String, trim: true, required: true },
    email:       { type: String, trim: true, lowercase: true, required: true },
    phone:       { type: String, trim: true, required: true },
    lineId:      { type: String, trim: true },
    isAttending: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * Structured Thai address.
 */
const ThaiAddressSchema = new mongoose.Schema(
  {
    addressLine: { type: String, trim: true, required: true },
    subDistrict: { type: String, trim: true, required: true }, // แขวง/ตำบล
    district:    { type: String, trim: true, required: true }, // เขต/อำเภอ
    province:    { type: String, trim: true, required: true }, // จังหวัด
    postalCode:  { type: String, trim: true, required: true },
  },
  { _id: false }
);

/**
 * Free-form address for non-Thai customers.
 */
const InternationalAddressSchema = new mongoose.Schema(
  {
    line1:      { type: String, trim: true, required: true },
    line2:      { type: String, trim: true },
    city:       { type: String, trim: true, required: true },
    state:      { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country:    { type: String, trim: true, required: true },
  },
  { _id: false }
);

/**
 * Invoice info.
 * - country 'TH'   : uses thaiAddress (structured) + taxId 13 digits required
 * - country 'OTHER': uses internationalAddress (free-form) + taxId optional
 */
const InvoiceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['individual', 'corporate'],
      required: true,
    },
    country: {
      type: String,
      enum: ['TH', 'OTHER'],
      default: 'TH',
    },
    firstName:   { type: String, trim: true },
    lastName:    { type: String, trim: true },
    companyName: { type: String, trim: true },
    /**
     * `branch` is LEGACY READ-ONLY — the free-text field the structured pair
     * below replaced. Nothing writes it: zod strips it, and the admin action's
     * allowlist does not name it. A derived string alongside the pair is how
     * one value under two names ends up disagreeing with itself (this repo
     * already paid for that as quotation_address / billing_address).
     *
     * `branchType` / `branchCode` are the Thai Revenue-Department concepts and
     * apply to country 'TH'. `branchFree` is the 'Other country' counterpart,
     * where a 5-digit branch number is meaningless. The label for any of the
     * three is computed by src/lib/registration/branchLabel.js.
     */
    branch:      { type: String, trim: true }, // legacy — never written by the current form
    branchType: {
      type: String,
      enum: ['head_office', 'branch'],
      default: 'head_office',
    },
    branchCode:  { type: String, trim: true, default: '' },
    branchFree:  { type: String, trim: true },
    taxId:       { type: String, trim: true },
    // Only one address sub-document will be populated
    thaiAddress:          { type: ThaiAddressSchema, default: null },
    internationalAddress: { type: InternationalAddressSchema, default: null },
  },
  { _id: false }
);

/**
 * Pricing snapshot — frozen at the moment of checkout so future price
 * changes (per-round overrides, upstream edits) never alter what the
 * customer actually paid. All amounts in THB.
 */
const PricingSnapshotSchema = new mongoose.Schema(
  {
    pricePerSeat: { type: Number, required: true, min: 0 },
    seats:        { type: Number, required: true, min: 1 },
    subtotal:     { type: Number, required: true, min: 0 }, // pricePerSeat * seats
    vatRate:      { type: Number, default: 0.07 },          // 7%
    vatAmount:    { type: Number, required: true, min: 0 },
    total:        { type: Number, required: true, min: 0 }, // subtotal + vatAmount
    currency:     { type: String, default: 'THB' },
  },
  { _id: false }
);

/**
 * Payment record — Omise charge metadata. Only populated for the
 * card / promptpay methods. 'quote' registrations leave this null.
 */
const PaymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ['quote', 'credit_card', 'promptpay'],
      required: true,
    },
    omiseChargeId: { type: String, default: null },
    omiseStatus:   { type: String, default: null }, // pending | successful | failed | expired
    paidAt:        { type: Date,   default: null },
    failureCode:    { type: String, default: null },
    failureMessage: { type: String, default: null },
    receiptSentAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * Consent record — captured on the pre-payment summary screen so the
 * customer's acceptance of the 4 conditions is auditable.
 */
const ConsentSchema = new mongoose.Schema(
  {
    accepted:      { type: Boolean, default: false },
    acceptedAt:    { type: Date,    default: null },
    ipAddress:     { type: String,  default: null },
    dataChecked:   { type: Boolean, default: false }, // ตรวจสอบข้อมูลแล้ว
    noRefund:      { type: Boolean, default: false }, // รับทราบไม่คืนเงิน
    changePolicy:  { type: Boolean, default: false }, // เงื่อนไขเปลี่ยน/เลื่อน/ยกเลิก
    termsAccepted: { type: Boolean, default: false }, // ยินยอมเงื่อนไขอบรม
  },
  { _id: false }
);

const RegisterPublicSchema = new mongoose.Schema(
  {
    // Course / class references (upstream IDs as strings)
    courseId:   { type: String, required: true },
    courseCode: { type: String, trim: true },
    courseName: { type: String, trim: true },
    classId:    { type: String, required: true },
    classDate:  { type: String, trim: true },

    // Schedule delivery type (from upstream API)
    scheduleType: {
      type: String,
      enum: ['classroom', 'hybrid', 'online'],
      default: 'classroom',
    },
    // Attendee's chosen mode — only meaningful when scheduleType === 'hybrid'
    attendanceMode: {
      type: String,
      enum: ['classroom', 'teams'],
      default: 'classroom',
    },

    // Coordinator (the person filling the form)
    coordinator: { type: CoordinatorSchema, required: true },

    // Attendees
    attendeesCount:        { type: Number, min: 1, max: 50, required: true, default: 1 },
    attendeesListProvided: { type: Boolean, default: true },
    attendees:             { type: [AttendeeSchema], default: [] },

    // Invoice
    requestInvoice: { type: Boolean, default: false },
    invoice:        { type: InvoiceSchema, default: null },

    /**
     * ── THE LEGACY INVOICE ADDRESS. ONE BLOB, AND IT STAYS ONE BLOB. ─────────
     *
     * Drupal collected the invoice address as a SINGLE free-text field. There is
     * no แขวง, no เขต, no postcode and no reliable separator — so it cannot be
     * split into `invoice.thaiAddress`, whose five paths are each `required`,
     * without a machine inventing the boundaries. An import that guessed would
     * put a district in the province field on some unknowable fraction of 2,427
     * rows, and nothing downstream could tell a guess from a fact.
     *
     * So it is stored verbatim in a path of its own, and the structured
     * `invoice` stays null on an imported row. A human reading the record sees
     * exactly what the customer typed.
     *
     * ══ IT MUST NOT BE MERGED INTO `notes`. THIS WAS A RULING. ═══════════════
     *
     * `notes` below is THE CUSTOMER'S OWN TEXT and is quoted back to them in the
     * confirmation email. Appending an address to it would put system-generated
     * content into a field the customer believes is theirs, and then mail it to
     * them as though they had written it. The in-house side carries the same
     * ruling over `message`.
     *
     * Not `adminNotes` either: that is an append-only internal LOG with an
     * author and a timestamp per entry, and an address is neither an event nor
     * something anyone wrote.
     */
    legacyInvoiceAddress: { type: String, trim: true },

    // ── Online payment (Omise) — null for legacy quote-only flow ──
    pricing: { type: PricingSnapshotSchema, default: null },
    payment: { type: PaymentSchema,         default: null },
    consent: { type: ConsentSchema,         default: null },

    /**
     * AUDIT ANNOTATION ONLY — the registration this one replaced.
     *
     * The charge endpoint is one-shot: it creates a document and a charge in a
     * single POST with no dedup key, so pressing "สร้าง QR ใหม่" produces a
     * SECOND document for the same person and round. Before this field, that
     * was indistinguishable in the data from a retried card, a genuine second
     * booking, or one coordinator booking twice — which is what the orphan
     * audit actually found.
     *
     * Set only by the regenerate path, and only when the value the client sent
     * looks like an ObjectId (see asRegistrationPointer). It is NOT a foreign
     * key: nothing resolves it, nothing populates it, no behaviour branches on
     * it, and a null here means "not known", never "not superseded" — every
     * document written before this field existed has null.
     *
     * String, not ObjectId, on purpose: the type makes `.populate()` impossible
     * so the annotation cannot quietly become a lookup.
     */
    supersedesRegistrationId: { type: String, default: null },

    // Meta
    /**
     * ── THE CUSTOMER'S OWN NOTE. SHOWN BACK TO THEM. ─────────────────────────
     * Written by the public registration form, non-empty on 31 of 39 documents,
     * and quoted in the confirmation email. It is NOT an internal field and
     * nothing internal may be written into it — see `adminNotes` below, which is
     * the one that must never reach the customer.
     *
     * ══ 500 → 2000, AND THE WIZARD'S 500 IS DELIBERATELY LEFT ALONE ══════════
     *
     * THE SAME ASYMMETRY THE AttendeeSchema HEADER AT THE TOP OF THIS FILE
     * RECORDS, on a different path and for the same reason. Read that one first
     * if this looks like an inconsistency to tidy up.
     *
     * THIS SCHEMA IS THE STORAGE FLOOR. It must accept everything any legitimate
     * writer may legitimately write, and the legacy Drupal import is now one of
     * those writers: it carries 275 customers' own `remark` text across, and the
     * longest is 559 CHARACTERS — measured, not estimated, with two rows over
     * 500. A floor that refused them would either drop a customer's words or
     * fail the import on a row that is not wrong about anything.
     *
     * THE 500-CHARACTER RULE IS A PRODUCT DECISION AND IT STILL STANDS. It lives
     * in the wizard's zod (lib/schemas/register-public), which is NOT changed
     * here: what we accept from a CUSTOMER TYPING TODAY is still 500, because
     * that is a form-design choice about how long a note should be. What we
     * accept from a SYSTEM CARRYING HISTORY is what history actually contains.
     * Those are different decisions and they are allowed to have different
     * limits — tightening this back to 500, or loosening the wizard's zod to
     * 2000, are both changes that need their own argument.
     *
     * 2000 rather than 559: it matches `message` on RegisterInhouse, so the two
     * customer-text fields have one limit between them, and it is not a number
     * derived from the current import's high-water mark — which would have to
     * move again the next time a longer note turns up.
     */
    notes:  { type: String, trim: true, maxlength: 2000 },

    /**
     * ── INTERNAL NOTES. APPEND-ONLY. NEVER SHOWN TO THE CUSTOMER. ───────────
     *
     * NOT called `notes`, and that is the whole point: `notes` directly above is
     * the customer's own text and is mailed back to them. An internal note is
     * the field most likely to quote a customer verbatim — what they can afford,
     * who to call, what they actually want — and it goes nowhere near an email
     * or an audit row.
     *
     * The name mirrors RegisterInhouse.adminNotes so both screens run one
     * mechanism. See lib/registrations/internalNotes for the shape, the
     * append-only reasoning, and why `authorName` is denormalised.
     *
     * `_id: false` on the subdocument: a note is identified by its position in
     * an append-only list and by nothing else. Giving each one an id would be
     * the first half of an edit/delete API that is deliberately not being built.
     */
    adminNotes: {
      type: [InternalNoteSchema],
      default: undefined,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'paid', 'cancelled'],
      default: 'pending',
    },

    // Audit
    source:    { type: String, default: 'web' },
    ipAddress: { type: String },

    /**
     * ══ CARRIED ACROSS FROM DRUPAL, OR NOT. `null` IS "NOT IMPORTED". ═══════
     *
     * ── WHY THIS EXISTS: THE IMPORT IS RE-RUNNABLE ─────────────────────────
     * The legacy import is not a one-shot. It runs once to move the bulk and
     * AGAIN ON CUTOVER NIGHT to catch everything Drupal accepted in between —
     * the same script over the same source table, re-reading every row it
     * already imported.
     *
     * `legacy.sid` is the Drupal `webform_submission.sid`, and it is what makes
     * that second run INSERT NOTHING IT ALREADY INSERTED. Without it, "have I
     * seen this row?" has no answer that is not a guess: nothing on a legacy
     * submission carries a genesis id, and matching on (email, course, date)
     * would merge two colleagues who signed up together from one address on one
     * day — an ordinary thing to do, and unrecoverable once merged.
     *
     * The unique partial index below is what ENFORCES it. The field alone is a
     * label; the index is the guarantee.
     *
     * See models/legacyImportSchema.js for the field-by-field reasoning and for
     * why the subdocument is shared with RegisterInhouse rather than copied.
     */
    legacy: { type: LegacyImportSchema, default: null },
  },
  { timestamps: true, collection: 'register_public' }
);

RegisterPublicSchema.index({ createdAt: -1, status: 1 });
RegisterPublicSchema.index({ 'coordinator.email': 1 });
RegisterPublicSchema.index({ 'payment.method': 1, status: 1 });

/**
 * ══ THE DEDUP GUARANTEE: UNIQUE, AND PARTIAL ════════════════════════════════
 *
 * UNIQUE is the point — it is what turns "the import script checks first" into
 * "a second insert cannot happen". A check-then-insert in application code is
 * two round trips with a gap in the middle, and the catch-up run is exactly the
 * situation where two invocations could overlap.
 *
 * ── PARTIAL, AND THIS HALF IS NOT AN OPTIMISATION ──────────────────────────
 * A plain unique index treats a MISSING field as null and indexes it, so all
 * 2,427-plus documents that were born here — every registration the web form
 * has ever taken and every one it takes tomorrow — would collide with each
 * other on a shared null. The SECOND non-imported registration would fail to
 * save. `partialFilterExpression` keeps them out of the index entirely, so
 * uniqueness is asserted over imported documents and nothing else.
 *
 * ── `$exists: true`, AND WHAT IT DOES NOT COVER ────────────────────────────
 * It excludes a document with `legacy: null` (the default) and a document whose
 * `legacy` subdocument simply omits `sid`. It does NOT exclude one written with
 * an explicit `legacy.sid: null` — that field exists and would be indexed, so a
 * second such document would collide. The import writes the subdocument whole,
 * with a real sid from MySQL, so that shape is not produced; it is written down
 * because it is the one way this index can surprise someone.
 *
 * BUILDING IT IS A DEPLOY-TIME EVENT, NOT A CODE ONE. Mongoose only creates
 * indexes when autoIndex is on, and a unique index cannot be built over data
 * that already violates it. Declaring it BEFORE the import is deliberate: the
 * constraint exists from the first inserted row, rather than being added
 * afterwards over data that may already need it.
 */
RegisterPublicSchema.index(
  { 'legacy.sid': 1 },
  { unique: true, partialFilterExpression: { 'legacy.sid': { $exists: true } } }
);

// Drop cached model from prior schema shape (Phase 2.5a) so dev HMR
// picks up the new structure. No-op in production.
if (mongoose.models.RegisterPublic) {
  delete mongoose.models.RegisterPublic;
}

export default mongoose.model('RegisterPublic', RegisterPublicSchema);
