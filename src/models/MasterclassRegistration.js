import mongoose from 'mongoose';

// Reuse address sub-schemas inline (same shape as RegisterPublic)
const ThaiAddressSchema = new mongoose.Schema(
  {
    addressLine: { type: String, trim: true, required: true },
    subDistrict: { type: String, trim: true, required: true },
    district:    { type: String, trim: true, required: true },
    province:    { type: String, trim: true, required: true },
    postalCode:  { type: String, trim: true, required: true },
  },
  { _id: false }
);

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

const InvoiceSchema = new mongoose.Schema(
  {
    type:        { type: String, enum: ['individual', 'corporate'], required: true },
    country:     { type: String, enum: ['TH', 'OTHER'], default: 'TH' },
    firstName:   { type: String, trim: true },
    lastName:    { type: String, trim: true },
    companyName: { type: String, trim: true },
    branch:      { type: String, trim: true },
    taxId:       { type: String, trim: true },
    thaiAddress:          { type: ThaiAddressSchema,          default: null },
    internationalAddress: { type: InternationalAddressSchema, default: null },
  },
  { _id: false }
);

const PricingSnapshotSchema = new mongoose.Schema(
  {
    price_type:   { type: String, enum: ['normal', 'early_bird'], required: true },
    pricePerSeat: { type: Number, required: true, min: 0 },
    seats:        { type: Number, default: 1 },
    subtotal:     { type: Number, required: true, min: 0 },
    vatRate:      { type: Number, default: 0.07 },
    vatAmount:    { type: Number, required: true, min: 0 },
    total:        { type: Number, required: true, min: 0 },
    currency:     { type: String, default: 'THB' },
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    method:         { type: String, enum: ['pending', 'quote', 'credit_card', 'promptpay'], required: true },
    omiseChargeId:  { type: String, default: null },
    omiseStatus:    { type: String, default: null },
    paidAt:         { type: Date, default: null },
    failureCode:    { type: String, default: null },
    failureMessage: { type: String, default: null },
    receiptSentAt:  { type: Date, default: null },
  },
  { _id: false }
);

const ConsentSchema = new mongoose.Schema(
  {
    accepted:      { type: Boolean, default: false },
    acceptedAt:    { type: Date, default: null },
    ipAddress:     { type: String, default: null },
    dataChecked:   { type: Boolean, default: false },
    noRefund:      { type: Boolean, default: false },
    changePolicy:  { type: Boolean, default: false },
    termsAccepted: { type: Boolean, default: false },
  },
  { _id: false }
);

const MasterclassRegistrationSchema = new mongoose.Schema(
  {
    // FKs
    course_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'MasterclassCourse', required: true },
    batch_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'MasterclassBatch', required: true },

    // Snapshots (frozen at registration time)
    course_title:     { type: String, trim: true },
    batch_label:      { type: String, trim: true },
    batch_date_label: { type: String, trim: true },
    venue_name:       { type: String, trim: true },

    // Coordinator — the person who filled in the form (may also be an attendee)
    coordinator: {
      firstName:    { type: String, trim: true },
      lastName:     { type: String, trim: true },
      email:        { type: String, trim: true, lowercase: true },
      phone:        { type: String, trim: true },
      isAttending:  { type: Boolean, default: false },
    },

    // Multi-attendee list (resolved at registration time)
    attendeesCount:         { type: Number, default: 1, min: 1 },
    attendeesListProvided:  { type: Boolean, default: true },
    attendees: [
      {
        firstName: { type: String, trim: true },
        lastName:  { type: String, trim: true },
        email:     { type: String, trim: true, lowercase: true },
        phone:     { type: String, trim: true },
        _id:       false,
      },
    ],

    // Single attendee (Masterclass = 1 person per registration)
    attendee: {
      firstName: { type: String, trim: true, required: true },
      lastName:  { type: String, trim: true, required: true },
      email:     { type: String, trim: true, lowercase: true, required: true },
      phone:     { type: String, trim: true, required: true },
      lineId:    { type: String, trim: true },
    },

    // License (Masterclass-specific)
    license_choice: { type: String, default: null },   // "own" | "9expert"
    license_level:  { type: String, default: null },   // "Pro" / "Team" etc.
    license_detail: { type: String, default: null },   // free-text
    license_scope:  { type: String, enum: ['all', 'per_attendee'], default: 'all' },
    license_per_attendee: { type: [mongoose.Schema.Types.Mixed], default: null }, // per-slot { choice, level, detail }

    // Invoice
    request_invoice: { type: Boolean, default: false },
    invoice:         { type: InvoiceSchema, default: null },

    // Pricing + Payment (same Omise pattern as RegisterPublic)
    pricing: { type: PricingSnapshotSchema, default: null },
    payment: { type: PaymentSchema, default: null },
    consent: { type: ConsentSchema, default: null },

    notes:     { type: String, trim: true, maxlength: 500 },
    status:    { type: String, enum: ['pending', 'confirmed', 'paid', 'cancelled'], default: 'pending' },
    source:    { type: String, default: 'web' },
    ipAddress: { type: String },
  },
  { timestamps: true, collection: 'masterclass_registrations' }
);

MasterclassRegistrationSchema.index({ createdAt: -1, status: 1 });
MasterclassRegistrationSchema.index({ batch_id: 1, status: 1 });
MasterclassRegistrationSchema.index({ 'attendee.email': 1 });
MasterclassRegistrationSchema.index({ 'coordinator.email': 1 });

if (mongoose.models.MasterclassRegistration) delete mongoose.models.MasterclassRegistration;
export default mongoose.model('MasterclassRegistration', MasterclassRegistrationSchema);
