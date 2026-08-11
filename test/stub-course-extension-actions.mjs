/**
 * Stub for `@/lib/actions/course-extensions` in the render tier.
 *
 * Same reason as test/stub-course-actions.mjs: CourseForm imports
 * `saveCourseExtension` for the second half of its save, the real module is
 * `'use server'` and reaches next-auth + mongoose at import time.
 *
 * Throwing rather than returning a benign `{ ok: true }` is deliberate — a
 * render test that accidentally submits should fail loudly, not silently
 * "succeed" against a stub that always agrees.
 */
export async function getCourseExtension() {
  throw new Error('stub-course-extension-actions: getCourseExtension must not be called in a render test');
}
export async function getCourseExtensionByAlias() {
  throw new Error('stub-course-extension-actions: getCourseExtensionByAlias must not be called');
}
export async function listCourseExtensions() {
  throw new Error('stub-course-extension-actions: listCourseExtensions must not be called');
}
export async function saveCourseExtension() {
  throw new Error('stub-course-extension-actions: saveCourseExtension must not be called in a render test');
}
/**
 * CourseForm's create arm calls this BEFORE createCourse, so the stub must
 * export it or the whole module fails to import and every render test that
 * mounts the form contributes ZERO tests — which is what the runner's per-file
 * meta-control caught when this was missing.
 */
export async function checkAliasAvailable() {
  throw new Error('stub-course-extension-actions: checkAliasAvailable must not be called in a render test');
}
export async function deleteCourseExtension() {
  throw new Error('stub-course-extension-actions: deleteCourseExtension must not be called');
}
