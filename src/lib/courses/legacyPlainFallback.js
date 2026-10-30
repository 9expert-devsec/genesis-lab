import { isEmptyRichHtml } from '@/lib/richTextEmpty';
import { formatBulletLines, parseBulletLines } from '@/lib/courses/bulletLines';

/**
 * Section 6's read-only "the page is showing the old list" note.
 *
 * Since ADM-1 the four legacy plain textareas (course_objectives,
 * course_target_audience, course_prerequisites, course_system_requirements)
 * are no longer rendered — only their rich editors are. The plain values are
 * NOT gone: they still ride the save as hidden inputs, and the public page
 * still falls back to them while the rich field is empty. Without a note the
 * admin would be looking at an empty editor above a page that shows a list.
 *
 * The count uses the payload's own round trip (format → parse = what `linesOf`
 * will send), so N is exactly the number of items the public page renders.
 * The emptiness test is the public components' own `isEmptyRichHtml`.
 */

/** How many plain items the public page is rendering instead of `rich`. 0 = no note. */
export function legacyFallbackCount(rich, plain) {
  if (!isEmptyRichHtml(rich)) return 0;
  return parseBulletLines(formatBulletLines(plain)).length;
}

/** The note's text for a count, or null when there is nothing to say. */
export function legacyFallbackNote(count) {
  return count > 0
    ? `หน้าเว็บกำลังแสดงรายการเดิม ${count} รายการ — กรอกในช่องนี้เพื่อแทนที่`
    : null;
}
