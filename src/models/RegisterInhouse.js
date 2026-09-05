import mongoose from 'mongoose';
import { InternalNoteSchema } from './internalNoteSchema';
import { LegacyImportSchema } from './legacyImportSchema';

const ThaiAddressSchema = new mongoose.Schema(
  {
    addressLine: { type: String, trim: true },
    subDistrict: { type: String, trim: true },
    district:    { type: String, trim: true },
    province:    { type: String, trim: true },
    postalCode:  { type: String, trim: true },
  },
  { _id: false }
);

const InternationalAddressSchema = new mongoose.Schema(
  {
    line1:      { type: String, trim: true },
    line2:      { type: String, trim: true },
    city:       { type: String, trim: true },
    state:      { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country:    { type: String, trim: true },
  },
  { _id: false }
);

const RegisterInhouseSchema = new mongoose.Schema(
  {
    // ── Training requirement ───────────────────────────────────
    coursesInterested: [{ type: String }],
    /**
     * min: 15 — the floor, matching the zod rule and the form's stepper.
     *
     * SAFE FOR HISTORICAL DOCUMENTS BELOW 15, and that was checked rather than
     * assumed. Mongoose `min` is a VALIDATOR: it runs on create/save/validate
     * and on updates only when `runValidators: true`. Reads never validate. The
     * only writer that validates is `RegisterInhouse.create` in the API route,
     * which receives zod-parsed data and therefore cannot be below 15 anyway;
     * every admin write goes through `findByIdAndUpdate(..., { runValidators:
     * false })` in src/lib/actions/registrations.js and
     * src/lib/actions/inhouse-registrations.js. There is no `.save()` on this
     * model anywhere. So an old 3-person enquiry still reads, still edits, and
     * still saves.
     */
    participantsCount: { type: Number, min: 15, default: 15 },
    skillLevel: {
      // legacy — never written by the current form
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'mixed'],
    },
    objective:      { type: String, trim: true }, // legacy — never written by the current form
    contentMode: {
      type: String,
      // 'consult' is a legacy VALUE: the card was removed from the form, but
      // documents written before that hold it and must still read back.
      enum: ['standard', 'custom', 'consult'],
      default: 'standard',
    },
    contentDetails: { type: String, trim: true },

    // ── Schedule ───────────────────────────────────────────────
    // The 3-card mode selector is gone; a month plus a note is the whole of it.
    scheduleMode: {
      // legacy — never written by the current form
      type: String,
      enum: ['month', 'dateRange', 'notSure'],
    },
    preferredMonth:    { type: String, trim: true },
    preferredDateFrom: { type: String, trim: true }, // legacy — never written by the current form
    preferredDateTo:   { type: String, trim: true }, // legacy — never written by the current form
    scheduleNote:      { type: String, trim: true },

    // ── Training format ────────────────────────────────────────
    trainingFormat: {
      type: String,
      // 'flexible' is a legacy VALUE, kept so old enquiries still read back.
      // No default: the form now requires an explicit choice.
      enum: ['onsite', 'online', 'flexible'],
    },
    /**
     * THE VENUE, AND WHY IT IS NOT `onsiteAddress`.
     *
     * `onsiteAddress` is a String path and existing documents hold strings in
     * it. Re-typing the same path as a subdocument is a cast failure on READ —
     * every historical enquiry throws when the admin opens it, with no
     * migration and no warning until it happens. So the structured venue is a
     * NEW path and the three legacy strings stay exactly as they are, written
     * by nothing.
     */
    onsiteVenue:     { type: ThaiAddressSchema, default: null },
    onsiteAddress:   { type: String, trim: true },  // legacy — never written by the current form
    onsiteProvince:  { type: String, trim: true },  // legacy — never written by the current form
    onsiteDistrict:  { type: String, trim: true },  // legacy — never written by the current form
    onsiteEquipment: [{ type: String }],            // legacy — never written by the current form
    onlineRegion:    { type: String, trim: true },
    onlineTimezone:  { type: String, trim: true },

    // ── Contact person ─────────────────────────────────────────
    contactFirstName:    { type: String, required: true, trim: true },
    contactLastName:     { type: String, required: true, trim: true },
    contactRole:         { type: String, trim: true },
    contactDepartment:   { type: String, trim: true },
    /**
     * NOT A FORM FIELD ANY MORE — a legacy-compat MIRROR of `quotationCompany`.
     *
     * Three live readers still need it: the admin list projection and its
     * $regex search (listRegistrations in src/lib/actions/registrations.js —
     * this pointed at inhouse-registrations.js until that file's unused list
     * action was deleted), the admin detail row บริษัท / องค์กร, and the
     * confirmation email. Dropping the path
     * would blank all three for every historical document, so it stays
     * required — and it is written in EXACTLY ONE PLACE, the API route. See
     * src/app/api/registration/inhouse/route.js.
     */
    companyName:         { type: String, required: true, trim: true },
    contactEmail:        { type: String, required: true, lowercase: true, trim: true },
    contactPhone:        { type: String, required: true, trim: true },
    contactLine:         { type: String, trim: true },
    preferredContact: {
      type: String,
      enum: ['phone', 'email', 'line'],
      default: 'email',
    },
    preferredContactTime: {
      type: String,
      enum: ['morning', 'afternoon', 'business'],
      default: 'business',
    },

    // ── Quotation ──────────────────────────────────────────────
    quotationCountry: {
      type: String,
      enum: ['TH', 'OTHER'],
      default: 'TH',
    },
    quotationCompany:      { type: String, trim: true },
    taxId:                 { type: String, trim: true },
    /**
     * `branch` is LEGACY READ-ONLY. The structured pair below replaced it, and
     * nothing writes a derived string alongside them — see
     * src/lib/registration/branchLabel.js, which is the only place either shape
     * is turned into a label.
     */
    branch:                { type: String, trim: true }, // legacy — never written by the current form
    branchType: {
      type: String,
      enum: ['head_office', 'branch'],
      default: 'head_office',
    },
    branchCode:            { type: String, trim: true, default: '' },
    thaiAddress:           { type: ThaiAddressSchema, default: null },
    internationalAddress:  { type: InternationalAddressSchema, default: null },

    /**
     * ── THE LEGACY QUOTATION ADDRESS. ONE BLOB, AND IT STAYS ONE BLOB. ──────
     *
     * Drupal collected the invoice address as a SINGLE free-text field. There is
     * no แขวง, no เขต, no postcode and no reliable separator, so it cannot be
     * split into `thaiAddress` without a machine inventing the boundaries — and
     * a guessed district sitting in the province field is indistinguishable from
     * a real one on every row it is wrong about.
     *
     * So it is stored verbatim in a path of its own, and `thaiAddress` stays
     * null on an imported enquiry. A human reading the record sees what was
     * typed.
     *
     * ══ IT MUST NOT BE MERGED INTO `message`. THIS WAS A RULING. ════════════
     *
     * `message` below is THE CUSTOMER'S OWN TEXT. Appending an address to it
     * would put system-generated content into a field the customer believes is
     * theirs and that is shown back to them. The public side carries the same
     * ruling over `notes` — see RegisterPublic.legacyInvoiceAddress.
     *
     * Not `adminNotes` either: that is an append-only internal LOG with an
     * author and a timestamp per entry, and an address is neither an event nor
     * something anyone wrote.
     *
     * Named `legacyInvoiceAddress` on BOTH collections rather than
     * `legacyQuotationAddress` here: it is one field from one legacy source,
     * written by one import. A per-collection name would be two spellings of one
     * thing.
     */
    legacyInvoiceAddress:  { type: String, trim: true },

    // ── Notes ──────────────────────────────────────────────────
    message: { type: String, trim: true, maxlength: 2000 },

    // ── Status & meta ──────────────────────────────────────────
    /**
     * ── NARROWED TO THE THREE, AND THIS WAS THE LAST STEP OF ROUND 2 ───────
     *
     * The vocabulary is pending / quoted / cancelled — the same three the
     * public side uses. See src/lib/registrations/statuses.js for the mapping
     * that got here and, more importantly, for WHAT IT DESTROYED: `contacted`
     * and `closed-won` are gone rather than renamed, and if the sales team
     * wants either back the correct shape is a separate field, not a
     * re-expanded enum.
     *
     * ── THIS LIST WAS THE UNION OF BOTH VOCABULARIES UNTIL A MOMENT AGO ────
     * That was not caution, it was the ordering constraint of the whole round,
     * and it is recorded here because the next person to migrate an enum on
     * this model will need it.
     *
     * Mongoose `enum` is a VALIDATOR: it runs on create/save/validate, and on
     * updates only with `runValidators: true`. READS NEVER VALIDATE — which is
     * exactly what makes narrowing look safe when it is not. Nothing breaks
     * when you open the admin screen. What breaks is the one write that DOES
     * validate (`RegisterInhouse.create` in
     * src/app/api/registration/inhouse/route.js — every admin write goes
     * through findByIdAndUpdate with runValidators false), plus any
     * status-filtered query written against a vocabulary the stored documents
     * do not use yet.
     *
     * So the order was fixed, and is not a preference:
     *   1. widen to the union, and point every writer at the new values;
     *   2. the USER runs scripts/migrate-inhouse-status-vocabulary.mjs --apply;
     *   3. only then this — its own commit, alone, held back until step 2 was
     *      confirmed done.
     *
     * `default: 'pending'` agrees with the API route's explicit `status`. They
     * are two spellings of the entry state and the route is the only real
     * writer; if one moves, move both.
     */
    status: {
      type: String,
      enum: ['pending', 'quoted', 'cancelled'],
      default: 'pending',
    },
    /**
     * ── INTERNAL NOTES. APPEND-ONLY. WAS A STRING, IS NOW AN ARRAY. ─────────
     *
     * The same field on RegisterPublic, running the same mechanism. See
     * lib/registrations/internalNotes for the shape and the append-only
     * reasoning, and models/internalNoteSchema for why the subdocument is
     * shared rather than duplicated.
     *
     * ── THIS IS THE EXPAND PHASE. THE READER STILL TOLERATES A STRING. ─────
     * `readNotes` handles both shapes, so this deploy and the migration are
     * independent and a rollback strands nothing. MEASURED, read-only:
     * `adminNotes` is ABSENT on all 8 in-house documents — the field was never
     * written in production — so the migration has zero rows and this type
     * change breaks nothing that exists. It is still written, still
     * dry-run-by-default, and still required before the String branch of
     * `readNotes` may be removed. THAT NARROWING IS THE CONTRACT PHASE AND IS
     * NOT IN THIS ROUND: last, and alone.
     *
     * `default: undefined` rather than `[]` so an untouched document keeps
     * having NO field, which is what the 8 live documents look like. A default
     * of `[]` would make Mongoose write an empty array on every save and turn
     * "never had a note" into "had notes, has none now" — a distinction the
     * reader relies on and a migration cannot recover.
     */
    adminNotes: {
      type: [InternalNoteSchema],
      default: undefined,
    },
    source:     { type: String, default: 'web' },
    ipAddress:  { type: String },

    /**
     * ══ CARRIED ACROSS FROM DRUPAL, OR NOT. `null` IS "NOT IMPORTED". ═══════
     *
     * ── WHY THIS EXISTS: THE IMPORT IS RE-RUNNABLE ─────────────────────────
     * The legacy import is not a one-shot. It runs once to move the bulk and
     * AGAIN ON CUTOVER NIGHT to catch everything Drupal accepted in between —
     * the same script over the same source table, re-reading every row it has
     * already imported.
     *
     * `legacy.sid` is the Drupal `webform_submission.sid`, and it is what makes
     * that second run INSERT NOTHING IT ALREADY INSERTED. Without it, "have I
     * seen this row?" has no answer that is not a guess: nothing on a legacy
     * submission carries a genesis id, and matching on (company, contact, month)
     * would merge two enquiries one coordinator sent in the same week — an
     * ordinary thing to do, and unrecoverable once merged.
     *
     * The unique partial index below is what ENFORCES it. The field alone is a
     * label; the index is the guarantee.
     *
     * A `sid` is unique WITHIN a Drupal webform, and the two webforms land in
     * two collections — so each collection carries its own index over its own
     * key space, and `legacy.webformId` is what tells a reader which space a
     * given sid belongs to.
     *
     * See models/legacyImportSchema.js for the field-by-field reasoning and for
     * why the subdocument is shared with RegisterPublic rather than copied.
     */
    legacy: { type: LegacyImportSchema, default: null },
  },
  { timestamps: true, collection: 'register_inhouse' }
);

RegisterInhouseSchema.index({ createdAt: -1, status: 1 });

/**
 * ══ THE DEDUP GUARANTEE: UNIQUE, AND PARTIAL ════════════════════════════════
 *
 * UNIQUE is the point — it is what turns "the import script checks first" into
 * "a second insert cannot happen". A check-then-insert in application code is
 * two round trips with a gap in the middle, and the catch-up run is exactly the
 * situation where two invocations could overlap.
 *
 * ── PARTIAL, AND THIS HALF IS NOT AN OPTIMISATION ──────────────────────────
 * A plain unique index treats a MISSING field as null and indexes it, so every
 * document born here — the 8 existing enquiries and every one the web form takes
 * tomorrow — would collide with the others on a shared null, and the SECOND
 * non-imported enquiry would fail to save. `partialFilterExpression` keeps them
 * out of the index entirely, so uniqueness is asserted over imported documents
 * and nothing else.
 *
 * ── `$exists: true`, AND WHAT IT DOES NOT COVER ────────────────────────────
 * It excludes a document with `legacy: null` (the default) and one whose
 * `legacy` subdocument omits `sid`. It does NOT exclude one written with an
 * explicit `legacy.sid: null` — that field exists and would be indexed, so a
 * second such document would collide. The import writes the subdocument whole,
 * with a real sid from MySQL, so that shape is not produced; it is written down
 * because it is the one way this index can surprise someone.
 *
 * BUILDING IT IS A DEPLOY-TIME EVENT, NOT A CODE ONE. Mongoose only creates
 * indexes when autoIndex is on, and a unique index cannot be built over data
 * that already violates it. Declaring it BEFORE the import is deliberate: the
 * constraint exists from the first inserted row rather than being added
 * afterwards over data that may already need it.
 */
RegisterInhouseSchema.index(
  { 'legacy.sid': 1 },
  { unique: true, partialFilterExpression: { 'legacy.sid': { $exists: true } } }
);

// Drop cached model from prior schema shape so dev HMR picks up the new
// structure. No-op in production.
if (mongoose.models.RegisterInhouse) {
  delete mongoose.models.RegisterInhouse;
}

export default mongoose.model('RegisterInhouse', RegisterInhouseSchema);