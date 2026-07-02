/**
 * Read-side helpers for LocalFaq — per-course admin-managed FAQs.
 *
 * Shared across public (course detail), career path, and masterclass reads —
 * lives here rather than in a course-type-specific module so the ownership is
 * clear. All writes go through src/lib/actions/local-faqs.js.
 */
import { dbConnect } from '@/lib/db/connect';
import LocalFaq from '@/models/LocalFaq';

function serialize(v) {
  return JSON.parse(JSON.stringify(v));
}

/** Active local FAQs for one specific course, ordered for display. */
export async function getLocalFaqsForCourse(course_type, ref_id) {
  await dbConnect();
  if (!ref_id) return [];
  const docs = await LocalFaq.find({ course_type, ref_id, is_active: true })
    .sort({ display_order: 1 })
    .lean();
  return serialize(docs);
}

/**
 * All local FAQs for one specific course, INCLUDING inactive ones — for admin
 * editors, which need to show/toggle inactive rows.
 */
export async function getAllLocalFaqsForCourse(course_type, ref_id) {
  await dbConnect();
  if (!ref_id) return [];
  const docs = await LocalFaq.find({ course_type, ref_id })
    .sort({ display_order: 1 })
    .lean();
  return serialize(docs);
}

/** Every local FAQ (all courses, all statuses) — for the admin overview. */
export async function getAllLocalFaqs() {
  await dbConnect();
  const docs = await LocalFaq.find({})
    .sort({ course_type: 1, ref_id: 1, display_order: 1 })
    .lean();
  return serialize(docs);
}
