import mongoose from 'mongoose';

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

    // ── Notes ──────────────────────────────────────────────────
    message: { type: String, trim: true, maxlength: 2000 },

    // ── Status & meta ──────────────────────────────────────────
    status: {
      type: String,
      enum: ['new', 'contacted', 'quoted', 'closed-won', 'closed-lost'],
      default: 'new',
    },
    adminNotes: { type: String, trim: true },
    source:     { type: String, default: 'web' },
    ipAddress:  { type: String },
  },
  { timestamps: true, collection: 'register_inhouse' }
);

RegisterInhouseSchema.index({ createdAt: -1, status: 1 });

// Drop cached model from prior schema shape so dev HMR picks up the new
// structure. No-op in production.
if (mongoose.models.RegisterInhouse) {
  delete mongoose.models.RegisterInhouse;
}

export default mongoose.model('RegisterInhouse', RegisterInhouseSchema);