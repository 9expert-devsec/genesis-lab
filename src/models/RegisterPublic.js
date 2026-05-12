import mongoose from 'mongoose';

/**
 * Sub-schema for a single attendee (person actually attending).
 * When coordinator.isAttending === true, attendees[0] is a copy of
 * the coordinator's info (merged server-side on create).
 */
const AttendeeSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName:  { type: String, trim: true, required: true },
    email:     { type: String, trim: true, lowercase: true, required: true },
    phone:     { type: String, trim: true, required: true },
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
    branch:      { type: String, trim: true },
    taxId:       { type: String, trim: true },
    // Only one address sub-document will be populated
    thaiAddress:          { type: ThaiAddressSchema, default: null },
    internationalAddress: { type: InternationalAddressSchema, default: null },
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

    // Meta
    notes:  { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'paid', 'cancelled'],
      default: 'pending',
    },

    // Audit
    source:    { type: String, default: 'web' },
    ipAddress: { type: String },
  },
  { timestamps: true, collection: 'register_public' }
);

RegisterPublicSchema.index({ createdAt: -1, status: 1 });
RegisterPublicSchema.index({ 'coordinator.email': 1 });

// Drop cached model from prior schema shape (Phase 2.5a) so dev HMR
// picks up the new structure. No-op in production.
if (mongoose.models.RegisterPublic) {
  delete mongoose.models.RegisterPublic;
}

export default mongoose.model('RegisterPublic', RegisterPublicSchema);
