import mongoose from 'mongoose';

/**
 * CareerPathRegistration — user-submitted enrollments from the public
 * /career-path-register/[slug] form.
 *
 * Status values mirror the legacy PHP workflow so cross-system reports
 * stay consistent during the migration. The Thai enum is intentional —
 * it appears in the admin UI verbatim.
 */

const AttendeeSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: '' },
    lastName:  { type: String, default: '' },
    email:     { type: String, default: '' },
    phone:     { type: String, default: '' },
  },
  { _id: true }
);

const SelectedCourseSchema = new mongoose.Schema(
  {
    courseName: { type: String, required: true },
    courseCode: { type: String, default: '' },  // upstream course_id (e.g. PAM-DSK)
    round:      { type: String, default: '' },
    startDate:  { type: String, default: '' },
    endDate:    { type: String, default: '' },

    /**
     * THE ROUND'S ACTUAL TRAINING DAYS — raw ISO `YYYY-MM-DD` strings, exactly
     * as they come off the MSDB schedule. Never a formatted label.
     *
     * ── WHY THE THREE FIELDS ABOVE ARE NOT ENOUGH ────────────────────────────
     * `round` is a label formatted in the visitor's BROWSER at submit, and
     * `startDate`/`endDate` are the first and last day. A round on 8, 10 and 12
     * ต.ค. — nothing on the 9th or the 11th — reduces to "8–12" under all three,
     * which advertises two days of training that do not exist. That is the
     * defect src/lib/schedule/roundDateLabel.js was written to end; the day list
     * is what lets a reader state the round correctly instead of assuming the
     * days between the endpoints are real.
     *
     * FORWARD-ONLY: documents written before this field existed have no day list
     * and keep the "8–12" defect. Nothing backfills them, because the day list
     * is not recoverable from what they stored — a reader falls back to `round`.
     *
     * NOT FORMATTED HERE, and not by the form either. Turning days into a label
     * is one job with one home (roundDateLabel.js); a second copy alongside the
     * raw data is how `round` came to disagree with the schedule in the first
     * place.
     */
    dates:      { type: [String], default: [] },
    type:       { type: String, default: '' },
    scheduleId: { type: String, default: '' },  // MSDB schedule _id, for traceability
  },
  { _id: false }
);

const CareerPathRegistrationSchema = new mongoose.Schema(
  {
    careerPathId: { type: String, required: true, index: true },
    careerName:   { type: String, required: true },
    careerSlug:   { type: String, required: true, index: true },

    // Selected courses (the picks from Step 1 of the registration form)
    selectedCourses: [SelectedCourseSchema],

    // Contact person
    contactFirstName: { type: String, required: true },
    contactLastName:  { type: String, required: true },
    contactEmail:     { type: String, required: true },
    contactPhone:     { type: String, default: '' },
    isCoordinator:    { type: Boolean, default: false },

    // Attendees
    attendeeCount: { type: Number, default: 1 },
    skipAttendee:  { type: Boolean, default: false },
    attendees:     [AttendeeSchema],

    // Tax / receipt
    taxType:       { type: String, enum: ['personal', 'company'], default: 'personal' },
    taxFirstName:  { type: String, default: '' },
    taxLastName:   { type: String, default: '' },
    companyName:   { type: String, default: '' },

    /**
     * `companyBranch` is LEGACY READ-ONLY, and its history is worth stating
     * plainly: unlike its counterpart `invoice.branch` on RegisterPublic, which
     * holds real free text on pre-split documents, THIS path has been the empty
     * string on every document ever written. The form mapped it from
     * `invoice.branch`, a key `InvoiceFields` stopped writing when the
     * structured pair replaced it — so the customer's branch was collected on
     * screen, stripped by zod, and never stored. The path stays declared because
     * the admin screen still reads it and because dropping a path is how a
     * historical value disappears silently; nothing writes it.
     *
     * `branchType` / `branchCode` are the Thai Revenue-Department concepts and
     * apply to `invoiceCountry: 'TH'`. `branchFree` is the 'Other country'
     * counterpart, where a 5-digit branch number is meaningless. These are the
     * SAME THREE NAMES AND THE SAME ENUM RegisterPublic uses, deliberately: the
     * label for any of them is computed by src/lib/registration/branchLabel.js,
     * and a reader that has to translate dialects between two registration
     * collections is a reader that will eventually translate one of them wrong.
     */
    companyBranch: { type: String, default: '' },
    branchType:    { type: String, enum: ['head_office', 'branch'], default: 'head_office' },
    branchCode:    { type: String, default: '' },
    branchFree:    { type: String, default: '' },

    companyTaxId:  { type: String, default: '' },
    personalTaxId: { type: String, default: '' },

    /**
     * WHICH ADDRESS SHAPE THE FIVE COLUMNS BELOW ARE HOLDING.
     *
     * A Thai and an international address are squashed into one flat set here —
     * line1+line2 → taxAddress, state → province, city → subdistrict — and
     * without this flag nothing downstream can tell which mapping produced them.
     * `province` holding "California" reads as a Thai province to every reader
     * that does not know to ask.
     *
     * The name mirrors what the public flow's routes call the same value
     * (`invoiceCountry`, from src/lib/registration/build-public.js) and the enum
     * mirrors `invoice.country` on RegisterPublic.
     */
    invoiceCountry: { type: String, enum: ['TH', 'OTHER'], default: 'TH' },

    taxAddress:    { type: String, default: '' },
    province:      { type: String, default: '' },
    district:      { type: String, default: '' },
    subdistrict:   { type: String, default: '' },
    zipcode:       { type: String, default: '' },

    /**
     * The country the customer TYPED — 'Singapore', 'Japan' — which the flat
     * squash above had nowhere to put and simply discarded. RegisterPublic
     * carries it at `invoice.internationalAddress.country` and marks it
     * required; an invoice address without its country cannot be posted.
     *
     * Empty for `invoiceCountry: 'TH'`, where the country is the flag.
     */
    countryName:   { type: String, default: '' },

    note: { type: String, default: '' },

    status: {
      type: String,
      enum: [
        'ลงทะเบียน',
        'ออกใบเสนอราคาแล้ว',
        'รอเพิ่มข้อมูลผู้เรียน',
        'สำเร็จ',
        'มีรอบถูกยกเลิก',
        'ยกเลิก',
        'ใบเสนอราคาหมดอายุ',
      ],
      default: 'ลงทะเบียน',
    },
  },
  { timestamps: true, collection: 'career_path_registrations' }
);

CareerPathRegistrationSchema.index({ createdAt: -1 });
CareerPathRegistrationSchema.index({ status: 1 });
CareerPathRegistrationSchema.index({ contactEmail: 1 });

export default mongoose.models.CareerPathRegistration ||
  mongoose.model('CareerPathRegistration', CareerPathRegistrationSchema);
