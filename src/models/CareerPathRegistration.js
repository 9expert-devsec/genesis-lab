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
    companyBranch: { type: String, default: '' },
    companyTaxId:  { type: String, default: '' },
    personalTaxId: { type: String, default: '' },
    taxAddress:    { type: String, default: '' },
    province:      { type: String, default: '' },
    district:      { type: String, default: '' },
    subdistrict:   { type: String, default: '' },
    zipcode:       { type: String, default: '' },

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
