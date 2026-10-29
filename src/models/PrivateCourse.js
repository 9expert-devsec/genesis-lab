import mongoose from 'mongoose';

/**
 * A PRIVATE course — stored in genesis ONLY, never written to MSDB and never in
 * upstream's `/public-course` feed.
 *
 * ── THE FIELDS MIRROR MSDB's `PublicCourse` DOCUMENT, NAME FOR NAME ─────────
 * So the admin form, `shapePayload`, and later the detail components and the
 * private → public conversion (which hands this same body to `createCourse`)
 * all work on it unchanged. Do not rename a field here to something tidier:
 * the point of the mirror is that nothing between the two stores translates.
 *
 * TWO DELIBERATE DIFFERENCES from the MSDB document, both forced by the form:
 *
 *   · `previous_course` / `related_courses` hold course_id CODES, not
 *     ObjectIds. That is what `shapePayload` emits and what CourseForm seeds
 *     its pickers from (`typeof c === 'string' ? c : c?.course_id`); MSDB only
 *     holds ObjectIds because `createCourse` resolves the codes on the way out
 *     (resolveCourseRefs). Conversion goes through that same resolution.
 *   · `program` / `skills` hold MSDB program / skill ids AS STRINGS, which is
 *     what the form posts. Round 2b's custom private taxonomy will need room
 *     here; it is not built yet.
 *
 * Keys MSDB has that `shapePayload` never writes (course_doc_paths,
 * course_lab_paths, course_case_study_paths, exam_links, website_urls, title,
 * bullets) are not stored: genesis does not edit them for public courses
 * either, so a private one has nothing to put there.
 *
 * `course_id` is stored UPPERCASE and is unique here. Uniqueness ACROSS this
 * collection, MSDB and course_extensions is the create guard's job — see
 * lib/courses/courseIdAvailability.
 *
 * URL alias, SEO, gallery and the publish toggle live in CourseExtension,
 * keyed by `course_id` exactly as for a normal course.
 */

const TrainingTopicSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    bullets: { type: [String], default: [] },
  },
  { _id: false }
);

const PrivateCourseSchema = new mongoose.Schema(
  {
    course_id: { type: String, required: true, unique: true, trim: true, uppercase: true },
    course_name: { type: String, required: true, trim: true },
    course_teaser: { type: String, default: '' },

    course_trainingdays: { type: Number, default: 0 },
    course_traininghours: { type: Number, default: 0 },
    course_price: { type: Number, default: 0 },
    course_netprice: { type: Number, default: null },
    course_cover_url: { type: String, default: '' },
    // In the MSDB document; the genesis form does not edit them yet.
    course_roadmap_desktop_url: { type: String, default: '' },
    course_roadmap_mobile_url: { type: String, default: '' },
    course_levels: { type: String, default: '1' },

    course_type_public: { type: Boolean, default: true },
    course_type_inhouse: { type: Boolean, default: false },
    course_workshop_status: { type: Boolean, default: false },
    course_certificate_status: { type: Boolean, default: false },
    course_promote_status: { type: Boolean, default: false },

    sort_order: { type: Number, default: 0 },

    program: { type: String, default: '' },
    skills: { type: [String], default: [] },

    // A CUSTOM private program / skills from `private_taxonomy` (round 2b).
    // PRIVATE-STORE ONLY — nothing like them exists in MSDB, and `program` /
    // `skills` above keep meaning MSDB ids. A course has EXACTLY ONE of
    // `program` or `privateProgram` (lib/courses/privateProgramRule, enforced
    // by the private create/update actions).
    privateProgram: { type: mongoose.Schema.Types.ObjectId, ref: 'PrivateTaxonomy', default: null },
    privateSkills: { type: [mongoose.Schema.Types.ObjectId], ref: 'PrivateTaxonomy', default: [] },

    course_objectives: { type: [String], default: [] },
    course_target_audience: { type: [String], default: [] },
    course_prerequisites: { type: [String], default: [] },
    course_system_requirements: { type: [String], default: [] },

    training_topics: { type: [TrainingTopicSchema], default: [] },

    // The full 8-key outline object exactly as outlineFromFormValue builds it
    // (kind, url, file_id, filename, content_type, size, uploaded_at,
    // download_url). Mixed, so no key is added, dropped or re-typed on save.
    course_outline_en: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    course_outline_th: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    previous_course: { type: String, default: null },
    related_courses: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'private_courses', minimize: false }
);

export const PrivateCourse =
  mongoose.models.PrivateCourse || mongoose.model('PrivateCourse', PrivateCourseSchema);

export default PrivateCourse;
