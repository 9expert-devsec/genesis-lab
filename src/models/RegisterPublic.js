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

/**
 * The bundle tag. See the `bundle` field below for what it is for, what each
 * of these four is read by, and the cost the shape accepts.
 *
 * `_id: false` — a tag is identified by the document it sits on. Giving it one
 * would be the first half of an API for editing it, which is not a thing:
 * `pageId`/`sectionId` say which bundle this leg came from and are a matter of
 * historical fact, and `requestId` is what makes the legs one request.
 *
 * The three IDENTITY fields are `required` INSIDE the subdocument while the
 * subdocument itself defaults to `undefined`. That is the shape the tag needs:
 * absent means "an ordinary registration", present means "this leg can be
 * traced and grouped". A half-filled tag — a `requestId` with no `pageId` —
 * would be a leg nothing could group and nothing could trace back to a bundle,
 * which is worse than no tag at all.
 *
 * ── `name` IS THE EXCEPTION, AND IT IS THE STORAGE-FLOOR RULE AGAIN ───────
 * `promotion_bundle.name` defaults to `''` and no publish rule demands one, so
 * an author can legitimately ship an unnamed bundle. THIS SCHEMA IS THE
 * STORAGE FLOOR (see the AttendeeSchema note at the top of this file, which
 * makes the same argument at length): it must accept everything any legitimate
 * writer may legitimately write, and `required: true` on a String rejects `''`
 * — so an unnamed bundle would fail to create a registration at all, turning a
 * cosmetic authoring gap into a customer who cannot submit a form.
 *
 * The readers handle the empty case instead, where an empty value is a display
 * question rather than a storage one.
 */
const BundleSchema = new mongoose.Schema(
  {
    pageId:    { type: String, trim: true, required: true },
    sectionId: { type: String, trim: true, required: true },
    requestId: { type: String, trim: true, required: true },
    name:      { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * The Early Bird tag. A SIBLING of `bundle`, not a shared "promotion" field,
 * and that is a ruling rather than a convenience.
 *
 * ── WHY NOT ONE DISCRIMINATED `promotion` SUBDOCUMENT ─────────────────────
 * `bundle == null` is currently THE WHOLE TEST for "is this an ordinary row" —
 * build-public.js says so in as many words, and `foldRequests` keys the entire
 * list on `bundle.requestId`. Folding both tags into one field with a `kind`
 * discriminator would stop that test being that test, which is a change to how
 * BUNDLE behaves, for the benefit of a second tag that shares none of its
 * fields. The two promotions have nothing structural in common: a bundle is
 * several rows that must be grouped and traced back to a section; an Early Bird
 * is one row and one round, with no legs and nothing to group.
 *
 * What IS shared is the MECHANISM, and that is reused exactly: a subdocument
 * defaulting to `undefined` so absent means "no promotion", a `build*Tag()`
 * that mints it from what the SERVER resolved, absence from the zod schema so a
 * client cannot post one, and denormalised display values.
 *
 * ── ONE PROMOTION PER REGISTRATION ────────────────────────────────────────
 * A row never carries both. The refusal is written down at the bundle route,
 * not left to the fact that the two are built on different paths — see the note
 * there. An admin issues quotations BY HAND, so two stacked chips would leave
 * the person writing the quote unable to say which price applies, which is the
 * exact harm this whole tag exists to prevent.
 *
 * ══ EVERY FIELD HERE HAS A NAMED READER ════════════════════════════════════
 *
 *   courseCode    which course the promotion was for. Identity, and required:
 *                 an Early Bird that cannot say which course it applied to is
 *                 a tag nothing can check against a quotation.
 *   scheduleId    THE ROUND. Required, because an Early Bird belongs to exactly
 *                 one round by rule (EarlyBirdConfig holds a single
 *                 `schedule_id`), and a tag naming no round could not be
 *                 verified against the registration's own `classId`.
 *   specialPrice  THE VALUE THIS TAG EXISTS FOR. Read by the detail screen.
 *   labelTh       the label as it was at submit ("Early Bird", or whatever the
 *                 author renamed it to). Read by the list chip and the detail.
 *   deadline      when the offer ended, as it stood at submit. Not read yet;
 *                 stored because it is the only thing that can later answer
 *                 "was this quote issued inside the window".
 *
 * ── `specialPrice` IS PER SEAT, AND THE NAME DOES NOT SAY SO ──────────────
 * Stated here because a reader will otherwise assume an order total. A public
 * registration carries `attendeesCount` seats and several `attendees`, and the
 * price copied here is `EarlyBirdConfig.special_price`, which is a per-person
 * course price everywhere it is displayed (the banner renders it beside
 * "ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม", per head). NOTHING here multiplies.
 * An admin writing a quotation multiplies by the seat count themselves, as they
 * already do for the ordinary course price.
 *
 * ── AND IT IS DENORMALISED, WHICH IS THE POINT ────────────────────────────
 * Same argument `bundle.name` makes: the EarlyBirdConfig row can be edited,
 * deactivated or deleted, and its deadline WILL pass — after which
 * `getEarlyBirdByCourse` returns null and the price that applied is
 * unrecoverable. An admin reading a six-month-old quotation must still see what
 * was sold. A lookup would show today's answer to a question about last March,
 * and past the deadline it would show nothing at all.
 *
 * `null` rather than 0 for an unset price: 0 is a free course and null is "the
 * config had no price", the same distinction `EarlyBirdConfig.special_price`
 * already makes.
 *
 * ══ NOT CUSTOMER INPUT ═════════════════════════════════════════════════════
 * Deliberately absent from `publicRegistrationSchema`, exactly as `bundle` is.
 * That schema is a plain `z.object()` with no `.passthrough()`, so zod strips
 * an unknown key — a client cannot post an `earlyBird` object and file a
 * registration claiming a discount it was never offered. The tag is derived
 * server-side from `getEarlyBirdByCourse`, at submit.
 */
const EarlyBirdSchema = new mongoose.Schema(
  {
    courseCode:   { type: String, trim: true, required: true },
    scheduleId:   { type: String, trim: true, required: true },
    specialPrice: { type: Number, default: null }, // PER SEAT — see above
    labelTh:      { type: String, trim: true, default: '' },
    deadline:     { type: Date,   default: null },
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

    /**
     * ══ THIS ROW IS ONE LEG OF A BUNDLE QUOTATION REQUEST ══════════════════
     *
     * ABSENT ON AN ORDINARY REGISTRATION. Presence IS the tag — there is no
     * boolean beside it, because a boolean and a subdocument are two facts that
     * can disagree, and the only thing a boolean could say is what `bundle !=
     * null` already says.
     *
     * A customer asked for a package of several courses. One person attends all
     * of them, so ONE FORM was filled in, and it produced **one row per
     * course+round**, each an otherwise ordinary public registration, all
     * carrying the same `requestId`.
     *
     * ══ WHY SEVERAL ROWS AND NOT ONE ROW HOLDING A LIST ════════════════════
     *
     * The alternative was one document with an array of course+round items. It
     * was rejected, and the deciding argument is worth having here rather than
     * in a commit message, because it is the argument that stops someone
     * "simplifying" this later.
     *
     * Every field on this schema that names a course or a round is a SCALAR —
     * `courseId`, `courseCode`, `courseName`, `classId`, `classDate`,
     * `scheduleType`, `attendanceMode` — and nine of the fourteen readers of
     * this collection read one of them. A row holding several courses breaks
     * them. Six of those breaks are SILENT:
     *
     *   · `getRoundRegistrationSummary` (lib/actions/schedules.js) is the SEAT
     *     ACCOUNTING. It is `find({classId})`, and its header records that the
     *     join was measured exact against live data. A row holding several
     *     rounds is visible to ONE of them, so every other round has a person
     *     expected in the room whom nothing counted. No error. No empty state.
     *     A number that is wrong and looks right.
     *
     *   · `course-rename-preview` reads `find({courseCode: from})` under a
     *     regime declared EXACT, on the screen an admin uses to decide whether
     *     a rename is safe. A course that appears only inside a nested list
     *     would report ZERO affected rows.
     *
     *   · and `courseClause`, `getRegistrationCourseOptions`, the public
     *     `searchClauses`, and the list projection all read the scalars too —
     *     each of them returning FEWER rows rather than an error.
     *
     * Under one-row-per-leg every one of those keeps working untouched, and the
     * seat accounting becomes CORRECT rather than merely unbroken: the person
     * genuinely is attending round X of course A and round Y of course B, and
     * each round's summary should count them.
     *
     * ══ WHAT THE SCREENS COUNT, AND WHAT THIS COLLECTION HOLDS ═════════════
     *
     * THE STORAGE IS **LEGS**. THE ADMIN SCREENS COUNT **REQUESTS**.
     *
     * Those are two different sentences about two different things and both are
     * true. A three-course bundle is three documents here, forever, for the
     * reasons above. It is ONE ROW on /admin/registrations, one entry in the
     * ทั้งหมด card, one in the source-toggle badge and one on the dashboard.
     *
     * ── THIS REVERSED, AND THE OLD NOTE'S ARGUMENT IS WHY ────────────────
     * The note that stood here said counts mean LEGS, and it was right at the
     * time. Its deciding argument was:
     *
     *     "it would make the cards disagree with the TABLE BELOW THEM, which
     *      lists legs because legs are what the collection holds"
     *
     * That premise is gone. The table lists REQUESTS now — the team's job with
     * these rows is to produce one quotation from one form, and three rows for
     * one customer made them reassemble by hand what arrived as a single
     * request. The rule the old note was defending is unchanged and is the
     * reason the counts moved WITH the table rather than against it: the cards,
     * the header, the badge and the pager must all count the set the rows are.
     * Which of the two numbers is "right" does not matter if they disagree.
     *
     * Measured before the collection was emptied on 2026-09-05: 46 legs, five
     * of them across two bundle requests → 43 rows, and every number on that
     * screen reads 43.
     *
     * ── WHAT STILL COUNTS LEGS, AND MUST ────────────────────────────────────
     * Anything about SEATS OR ROOMS. `getRoundRegistrationSummary` is
     * `find({classId})` and answers "who is expected in this round" — a
     * bundle's three legs are three different rooms on three different days and
     * that person is expected in each. Same for the rename preview and the
     * course filter, which ask about COURSES and therefore about legs. None of
     * those is the registrations list's number, and each is labelled where it
     * appears.
     *
     * ── HOW THE FOLD IS DONE, SO NOBODY REDOES IT WRONG ─────────────────────
     * By GROUPING IN THE QUERY on `bundle.requestId` (falling back to `_id`),
     * with `$skip`/`$limit` applied AFTER the group — see
     * lib/registrations/foldRequests. NOT by folding a fetched page in
     * JavaScript: that applies pagination over legs, and a request straddling a
     * page boundary then renders twice, incomplete both times.
     *
     * ── AND EVERY PER-ROW ADMIN EDIT IS ONE EDIT PER LEG ────────────────────
     *
     * MEASURED, the first time anyone met it: a bundle request whose
     * `requestInvoice` flag was written wrong had to be corrected on the admin
     * detail screen THREE TIMES — once per leg — because the invoice card, like
     * every other editable card on that screen, edits ONE DOCUMENT.
     *
     * That is the same cost as the counts, arriving through a different door,
     * and it applies to every field an admin can change: the status, the
     * attendee roster, the coordinator, the invoice, an internal note. A
     * three-course bundle is three records to a human as well as to a query.
     *
     * IT IS NOT A BUG AND MUST NOT BE "FIXED" BY MAKING ONE EDIT FAN OUT TO THE
     * SIBLINGS. The legs are genuinely separate registrations — different
     * courses, different rounds, different seats, and an admin may legitimately
     * want to cancel one leg, move one leg to another round, or correct a name
     * on one leg only. A cascading write would take that away and would do it
     * silently, which is worse than the tedium it removes. If the repetition
     * ever becomes worth addressing, the honest shape is a SEPARATE, EXPLICIT
     * "apply to every leg of this request" action that says what it is about to
     * touch — not a hidden widening of the edits that already exist.
     *
     * ══ EVERY FIELD HERE HAS A NAMED READER ════════════════════════════════
     *
     *   pageId + sectionId  the bundle's IDENTITY, and it is a PAIR by ruling.
     *                       A section id is unique within a page and not
     *                       globally — `duplicatePageBuilderPage` keeps section
     *                       ids by design — so a duplicated promotion page
     *                       mints two bundles a quotation could not tell apart
     *                       on the id alone. Read by the form's
     *                       `resolveBundleRequest` guard and by the detail
     *                       screen's หลักสูตร card.
     *   requestId           GROUPS THE LEGS, and that is now load-bearing
     *                       rather than informational: it is the list's
     *                       grouping key (`REQUEST_KEY_EXPR` in
     *                       lib/registrations/foldRequests, read by the list,
     *                       the toggle total and the summary cards), the
     *                       request detail page's sibling lookup, and the
     *                       marker-leg completeness test. Also read by
     *                       `PublicTable`'s course cell and by the email (ONE
     *                       send per request, not one per leg).
     *   name                the bundle's name AS IT WAS AT SUBMISSION. Read by
     *                       the list chip and the detail row.
     *
     * `name` is DENORMALISED on purpose, for the reason `courseName` already is
     * on this schema: the page can be edited, unpublished or deleted, and an
     * admin reading a six-month-old quotation must still see what was sold. A
     * lookup would show today's answer to a question about last March.
     *
     * `itemCount` was considered and REJECTED — its only reader would be a
     * chip that `name` already serves.
     *
     * ══ NOT CUSTOMER INPUT ═════════════════════════════════════════════════
     *
     * Deliberately absent from `publicRegistrationSchema`. The tag is derived
     * SERVER-SIDE from the (pageId, sectionId) pair after the guard has
     * resolved it, so a client cannot post a `bundle` object and file a
     * registration under a package it never opened. The zod schema is what a
     * customer may send; this is what the server concluded.
     *
     * Strings, not ObjectIds, and `requestId` in particular: it points at
     * another RegisterPublic document (the first leg), and the type makes
     * `.populate()` impossible so the pointer cannot quietly become a lookup —
     * the same idiom, for the same reason, as `supersedesRegistrationId` above.
     */
    bundle: { type: BundleSchema, default: undefined },

    /**
     * The Early Bird tag — see EarlyBirdSchema above for the shape, every
     * field's reader, and why it is a sibling of `bundle` rather than sharing
     * one promotion field with it.
     *
     * `default: undefined` so an ordinary registration writes NO KEY at all
     * rather than a null one, and `earlyBird == null` is the whole test for
     * "no Early Bird applied" — the same idiom, for the same reason, as
     * `bundle` directly above it.
     */
    earlyBird: { type: EarlyBirdSchema, default: undefined },

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
