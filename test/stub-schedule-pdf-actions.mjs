/**
 * Stub for `@/lib/actions/schedule-pdf` in the render tier — reached by
 * SchedulePDFClient. Same policy as the other action stubs: throw rather than
 * resolve, so a render test that somehow uploads or deletes fails loudly.
 */
export async function getSchedulePDF() {
  throw new Error('stub-schedule-pdf-actions: getSchedulePDF must not be called in a render test');
}
export async function signSchedulePDFUpload() {
  throw new Error('stub-schedule-pdf-actions: signSchedulePDFUpload must not be called in a render test');
}
export async function recordSchedulePDFUpload() {
  throw new Error('stub-schedule-pdf-actions: recordSchedulePDFUpload must not be called in a render test');
}
export async function deleteSchedulePDF() {
  throw new Error('stub-schedule-pdf-actions: deleteSchedulePDF must not be called in a render test');
}
