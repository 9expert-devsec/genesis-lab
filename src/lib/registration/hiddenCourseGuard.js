import { isHiddenCourse, loadHiddenCourseIds } from '@/lib/courses/hiddenCourses';

/**
 * Does a public registration name a HIDDEN course (`CourseExtension.isPublished
 * === false`)?
 *
 * The public and in-house POST routes take the course code from the request
 * body and write it straight into Mongo — they never look the course up before
 * the write. Hiding a course removes every link to its form, but a bookmarked
 * or hand-built POST would still be accepted. The routes call this before
 * `.create(...)` and refuse when it says yes.
 *
 * One read of the shared hidden set, whatever the number of codes. Existing
 * registration rows are never read or touched here.
 *
 * @param {string|string[]} codes the course code(s) the request names
 */
export async function namesHiddenCourse(codes, { loadHidden = loadHiddenCourseIds } = {}) {
  const list = (Array.isArray(codes) ? codes : [codes]).filter(
    (c) => typeof c === 'string' && c.trim() !== ''
  );
  if (list.length === 0) return false;
  const hidden = await loadHidden();
  return list.some((code) => isHiddenCourse(hidden, code));
}

/** The body both routes send back for a hidden course — the not-found answer. */
export const HIDDEN_COURSE_RESPONSE = Object.freeze({
  error: 'course_not_found',
  message: 'ไม่พบหลักสูตรนี้',
});
