/**
 * Stub for `@/lib/actions/courses` in the render tier.
 *
 * CourseForm imports these for its submit handler. The real module is
 * `'use server'` and its import chain reaches next-auth → next/headers, which
 * does not resolve outside a Next runtime — the same reasoning as the article
 * and registration action stubs already registered in the loader.
 *
 * The render tests assert STRUCTURE (what is in the header, what is in the
 * rail, what is behind the one tab). None of them submits, so these are never
 * called; they exist so the module graph resolves. The save decision itself is
 * a pure function and is tested directly — see test/pure/courseSaveOutcome.
 */
export async function createCourse() {
  throw new Error('stub-course-actions: createCourse must not be called in a render test');
}
export async function updateCourse() {
  throw new Error('stub-course-actions: updateCourse must not be called in a render test');
}
export async function deleteCourse() {
  throw new Error('stub-course-actions: deleteCourse must not be called in a render test');
}
