import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import MasterclassCourse from '@/models/MasterclassCourse';

const PUBLIC_LISTING = '/masterclass';

/**
 * Bust the public masterclass pages after a change to BATCH STATE — a paid
 * registration (`registered_count`, and the auto-flip to `full`), or an admin
 * deleting one. Content edits already go through lib/actions/masterclass.js;
 * this exists because /masterclass and /masterclass/[slug] are ISR (1h) since
 * the caching round, and seat state used to refresh only the admin paths, so a
 * batch could read `open` for up to an hour after it filled.
 *
 * Takes the registration's `course_id` (every MasterclassRegistration carries
 * one) and resolves the slug itself, so the three writers add one line each
 * and nothing about the seat accounting moves. Never throws: a missed
 * revalidation costs at most the hour; a payment route that 500s after the
 * charge succeeded costs a great deal more.
 */
export async function revalidateMasterclassPublic(courseId) {
  try {
    revalidatePath(PUBLIC_LISTING);
    if (!courseId) return;
    await dbConnect();
    const course = await MasterclassCourse.findById(courseId).select('slug').lean();
    if (course?.slug) revalidatePath(`${PUBLIC_LISTING}/${course.slug}`);
  } catch (err) {
    console.warn('[masterclass] public revalidation skipped:', err?.message ?? err);
  }
}
