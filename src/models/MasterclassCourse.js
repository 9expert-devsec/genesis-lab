import mongoose from 'mongoose';

const LicenseChoiceSchema = new mongoose.Schema(
  {
    value:           { type: String, required: true },   // "own" | "9expert"
    label_th:        { type: String, required: true },
    require_detail:  { type: Boolean, default: false },
    detail_type:     { type: String, enum: ['dropdown', 'text', null], default: null },
    detail_options:  { type: [String], default: [] },    // used when detail_type="dropdown"
    detail_label_th: { type: String, default: '' },
    info_popup: {
      type: new mongoose.Schema(
        {
          enabled:        { type: Boolean, default: false },
          html_content:   { type: String,  default: '' },
          checkbox_label: { type: String,  default: 'รับทราบเงื่อนไขทั้งหมด' },
          popup_title:    { type: String,  default: '' },
        },
        { _id: false }
      ),
      default: () => ({ enabled: false, html_content: '', checkbox_label: 'รับทราบเงื่อนไขทั้งหมด' }),
    },
  },
  { _id: false }
);

const CurriculumModuleSchema = new mongoose.Schema(
  {
    module_no: { type: Number, default: 0 },
    title:     { type: String, default: '' },
    topics:    { type: [String], default: [] },
    workshop:  { type: String, default: '' },
    output:    { type: String, default: '' },
    topics_html: { type: String, default: '' },
    content_html: { type: String, default: '' },  // rich text for additional notes
  },
  { _id: false }
);

const CurriculumSessionSchema = new mongoose.Schema(
  {
    session_label: { type: String, default: '' },  // "ภาคเช้า (09:00–12:30)"
    modules:       { type: [CurriculumModuleSchema], default: [] },
  },
  { _id: false }
);

const SystemRequirementsSchema = new mongoose.Schema(
  {
    os:       { type: [String], default: [] },
    browsers: { type: [String], default: [] },
    accounts: { type: [String], default: [] },
    software: { type: [String], default: [] },
  },
  { _id: false }
);

const MasterclassCourseSchema = new mongoose.Schema(
  {
    slug:         { type: String, required: true, unique: true, trim: true, index: true },
    course_code:  { type: String, default: '', trim: true },
    title_th:     { type: String, required: true, trim: true },
    subtitle_th:  { type: String, default: '', trim: true },
    description_html: { type: String, default: '' },
    cover_image_url:  { type: String, default: '' },
    cover_image_public_id: { type: String, default: '' },
    // Hero banner gradient — two Tailwind color stops, used when no cover image
    hero_gradient_from: { type: String, default: '#2486FF' },  // CSS hex
    hero_gradient_to:   { type: String, default: '#005CFF' },
    course_outline_url:    { type: String, default: '' },

    duration_days:  { type: Number, default: 1 },
    duration_hours: { type: Number, default: 7 },
    schedule_days:  { type: [String], default: ['เสาร์'] },
    time_start:     { type: String, default: '09:00' },
    time_end:       { type: String, default: '17:00' },
    level:          { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' },
    tags:           { type: [String], default: [] },

    suitable_for: {
      type: [{
        label:     { type: String, default: '' },
        image_url: { type: String, default: '' },
      }],
      default: [],
      _id: false,
    },
    prerequisites:       { type: [String], default: [] },
    objectives:          { type: [String], default: [] },
    benefits:            { type: [String], default: [] },
    equipment_required:  { type: [String], default: [] },
    system_requirements: { type: SystemRequirementsSchema, default: () => ({}) },
    system_requirements_html: { type: String, default: '' },

    // License options — enable only for courses that require it
    license_options: {
      enabled:  { type: Boolean, default: false },
      choices:  { type: [LicenseChoiceSchema], default: [] },
      global_ack: {
        type: new mongoose.Schema(
          {
            enabled:        { type: Boolean, default: false },
            label_th:       { type: String,  default: 'ยอมรับเงื่อนไขสำหรับผู้เข้าอบรมทุกท่าน' },
            popup_title:    { type: String,  default: '' },
            html_content:   { type: String,  default: '' },
            checkbox_label: { type: String,  default: 'รับทราบเงื่อนไขทั้งหมด' },
          },
          { _id: false }
        ),
        default: () => ({
          enabled: false,
          label_th: 'ยอมรับเงื่อนไขสำหรับผู้เข้าอบรมทุกท่าน',
          popup_title: '',
          html_content: '',
          checkbox_label: 'รับทราบเงื่อนไขทั้งหมด',
        }),
      },
    },

    // Instructor references — array of Instructor._id (ObjectId as String)
    instructor_ids: { type: [String], default: [] },

    curriculum: { type: [CurriculumSessionSchema], default: [] },

    is_published:  { type: Boolean, default: false },
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
    faq_category:  { type: String, default: 'masterclass' },
  },
  { timestamps: true, collection: 'masterclass_courses' }
);

MasterclassCourseSchema.index({ is_published: 1, display_order: 1 });

export default mongoose.models.MasterclassCourse ||
  mongoose.model('MasterclassCourse', MasterclassCourseSchema);
