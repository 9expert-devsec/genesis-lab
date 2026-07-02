import mongoose from 'mongoose';

/**
 * LocalFaq — admin-managed FAQ scoped to ONE specific course. Completely
 * independent from the upstream Faq sync collection. Admin creates / edits /
 * deletes freely.
 *
 * Each FAQ is attached to a single course via (`course_type`, `ref_id`):
 *   course_type 'public'      → ref_id = upstream course code
 *                               (CourseExtension.courseId / TnhsCourse.course_id)
 *   course_type 'career_path' → ref_id = CareerPath.career_path_id
 *   course_type 'masterclass' → ref_id = MasterclassCourse._id (stringified)
 *
 * There is no "general/fallback" scope: a course with no FAQs simply renders
 * no FAQ section. A doc with an empty `ref_id` matches no course (hidden until
 * an admin reassigns it).
 */
const LocalFaqSchema = new mongoose.Schema(
  {
    course_type: {
      type: String,
      enum: ['public', 'career_path', 'masterclass'],
      required: true,
      index: true,
    },
    ref_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    question_th:   { type: String, required: true, trim: true },
    answer_html:   { type: String, default: '' },
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'local_faqs' }
);

LocalFaqSchema.index({ course_type: 1, ref_id: 1, is_active: 1, display_order: 1 });

export default mongoose.models.LocalFaq ||
  mongoose.model('LocalFaq', LocalFaqSchema);
