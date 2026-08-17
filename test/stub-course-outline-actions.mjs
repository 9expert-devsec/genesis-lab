/**
 * Stub for `@/lib/actions/course-outlines` in the render tier.
 *
 * Reached indirectly: CourseForm renders CourseOutlineUpload, which imports
 * these two server actions for its upload flow. Same next-auth → next/headers
 * chain as the other action stubs.
 *
 * Throwing rather than resolving: no render test uploads anything, and a test
 * that somehow did should fail loudly instead of passing against a stub.
 */
export async function signCourseOutlineUpload() {
  throw new Error('stub-course-outline-actions: signCourseOutlineUpload must not be called in a render test');
}
export async function recordCourseOutlineUpload() {
  throw new Error('stub-course-outline-actions: recordCourseOutlineUpload must not be called in a render test');
}
