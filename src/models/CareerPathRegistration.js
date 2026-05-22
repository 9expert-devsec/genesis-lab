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
