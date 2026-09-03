/**
 * Stub for `@/lib/actions/course-versions` in the render tier.
 *
 * Same reason as test/stub-course-actions.mjs: CourseForm imports these two for
 * the version-history half of its save, the real module is `'use server'` and
 * its import chain reaches next-auth → next/headers and mongoose at import
 * time, neither of which resolves outside a Next runtime.
 *
 * Throwing rather than returning a benign value, matching every other action
 * stub here: no render test submits, so neither is ever called, and one that
 * somehow did should fail loudly instead of passing against a stub that agrees
 * with everything.
 *
 * The behaviour these stand in for is tested directly against the writer, which
 * is a plain module with an injectable model — see test/pure/courseVersionWriter
 * and test/pure/courseSnapshot.
 */
export async function captureCoursePreImage() {
  throw new Error('stub-course-version-actions: captureCoursePreImage must not be called in a render test');
}
export async function commitCourseVersion() {
  throw new Error('stub-course-version-actions: commitCourseVersion must not be called in a render test');
}
