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

/**
 * THE TIE CONVENTION FOR THIS LIST — decided, not inherited.
 *
 * `display_order` alone left ties UNDEFINED (Mongo promises no order for
 * documents equal on every sort key), and ties are reachable: delete does not
 * renumber the survivors and create uses `rows.length`, so deleting the middle
 * of [0,1,2] makes the next create collide at 2.
 *
 * The featured-* family resolves its ties with `createdAt: -1`, which surfaces
 * the NEWEST row at the TOP of its tie group. This list deliberately DIVERGES
 * and uses `createdAt: 1` — oldest first.
 *
 * Why diverge: those five menus are curated "what should we promote right now"
 * lists, where a new entry appearing at the top of its group is useful. A
 * course's FAQ list is a HAND-ORDERED document that a reader works down in
 * sequence; a newly added question jumping above questions an admin already
 * placed would reorder their prose without them asking. Appending after the
 * rows it ties with is the behaviour that matches how the list is used.
 *
 * `_id: 1` was the other candidate and is rejected: ObjectIds are only roughly
 * time-ordered, they are opaque to a reader debugging an order, and they would
 * give this admin a THIRD tie rule. `createdAt` is already on the model
 * (`timestamps: true`), so this costs nothing.
 *
 * The client comparator in src/lib/localFaqList.js mirrors this exactly, and
 * test/fs/localFaqTieConvention.test.mjs asserts the two agree — the failure
 * that rule exists to prevent is silent, because a client that orders
 * differently from the server looks correct until the next page load.
 */
const DISPLAY_SORT = { display_order: 1, createdAt: 1 };

/** Active local FAQs for one specific course, ordered for display. */
export async function getLocalFaqsForCourse(course_type, ref_id) {
  await dbConnect();
  if (!ref_id) return [];
  const docs = await LocalFaq.find({ course_type, ref_id, is_active: true })
    .sort(DISPLAY_SORT)
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
    .sort(DISPLAY_SORT)
    .lean();
  return serialize(docs);
}

/** Every local FAQ (all courses, all statuses) — for the admin overview. */
export async function getAllLocalFaqs() {
  await dbConnect();
  const docs = await LocalFaq.find({})
    .sort({ course_type: 1, ref_id: 1, ...DISPLAY_SORT })
    .lean();
  return serialize(docs);
}
