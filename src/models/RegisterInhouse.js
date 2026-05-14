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
    participantsCount: { type: Number, min: 1, default: 15 },
    skillLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'mixed'],
      default: 'mixed',
    },
    objective:      { type: String, trim: true },
    contentMode: {
      type: String,
      enum: ['standard', 'custom', 'consult'],
      default: 'standard',
    },
    contentDetails: { type: String, trim: true },

    // ── Schedule ───────────────────────────────────────────────
    scheduleMode: {
      type: String,
      enum: ['month', 'dateRange', 'notSure'],
      default: 'notSure',
    },
    preferredMonth:    { type: String, trim: true },
    preferredDateFrom: { type: String, trim: true },
    preferredDateTo:   { type: String, trim: true },
    scheduleNote:      { type: String, trim: true },

    // ── Training format ────────────────────────────────────────
    trainingFormat: {
      type: String,
      enum: ['onsite', 'online', 'flexible'],
      default: 'flexible',
    },
    onsiteAddress:   { type: String, trim: true },
    onsiteProvince:  { type: String, trim: true },
    onsiteDistrict:  { type: String, trim: true },
    onsiteEquipment: [{ type: String }],
    onlineRegion:    { type: String, trim: true },
    onlineTimezone:  { type: String, trim: true },

    // ── Contact person ─────────────────────────────────────────
    contactFirstName:    { type: String, required: true, trim: true },
    contactLastName:     { type: String, required: true, trim: true },
    contactRole:         { type: String, trim: true },
    contactDepartment:   { type: String, trim: true },
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
    branch:                { type: String, trim: true },
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