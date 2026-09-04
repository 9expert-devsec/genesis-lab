/**
 * Is a refused save's message ABOUT THE SLUG?
 *
 * ── WHY THIS EXISTS, AND WHY IT IS A MODULE RATHER THAN AN INLINE CHECK ────
 * The slug input used to sit in the editor's main column, beside the H1, with
 * its own red ring and its own error line. It now lives only in ตั้งค่าหน้า →
 * ข้อมูลหน้า, which is CLOSED when บันทึกฉบับร่าง or เผยแพร่ is pressed. A save
 * refused because the slug is malformed, reserved, already taken, or colliding
 * with an MSDB promotion would otherwise report itself in a header band that
 * names a field the author cannot see — or, if the dialog were opened blindly on
 * every failure, would open it for a missing BODY too. So the refusal has to be
 * classified, and the classification has to be testable.
 *
 * CustomPageForm cannot be imported by the test suite at all — it calls
 * `useEditor()` from @tiptap/react at the top of its body and drags the whole
 * Tiptap graph in — so a check written inline there is a check nothing can
 * execute. Same wall, same answer, as customPagePreviewBanner.
 *
 * ── THE RULE, AND WHY IT IS A SUBSTRING AND NOT A LIST ────────────────────
 * Every message that can refuse a save for the slug names it, and no other
 * message does. Measured over every string the two paths can produce:
 *
 *   CLIENT (CustomPageForm.buildFormData)
 *     'กรุณาใส่ slug'
 *     'slug ต้องเป็น a-z, 0-9 และ - เท่านั้น'
 *   SERVER (lib/pages/slugGuard.js + lib/actions/customPages.js)
 *     'กรุณาระบุ slug'                            (empty)
 *     'slug นี้เป็นเส้นทางระบบ ใช้ไม่ได้'          (reserved)
 *     'Slug นี้ถูกใช้แล้ว'                          (cross-collection, and 11000)
 *     'Slug นี้ชนกับโปรโมชันใน MSDB — ใช้ไม่ได้'   (promotion guard)
 *     'slug: …'                                    (Zod, via firstZodMessage,
 *                                                   which prefixes the PATH)
 *
 * and the messages that must NOT match:
 *
 *     'กรุณาใส่ชื่อหน้าเพจ'  'กรุณาใส่เนื้อหา'  'Editor ยังไม่พร้อม'
 *     'บันทึกไม่สำเร็จ'  'เผยแพร่ไม่สำเร็จ'  'ไม่พบหน้าเพจ'
 *     'title: …'  'body: …'
 *
 * A hardcoded LIST would have to be edited every time a guard reworded itself,
 * and the failure of a stale list is silent: the dialog simply stops opening.
 * The substring is what all seven share and none of the eight has, and the test
 * asserts both directions against the real strings rather than against
 * paraphrases.
 *
 * Case-insensitive because the guards disagree about the capital S, which is
 * cosmetic and not worth unifying at the cost of a behaviour that depends on it.
 *
 * PURE — no React, no db, no next/*. The editor imports it.
 */
export function isSlugError(message) {
  return String(message ?? '').toLowerCase().includes('slug');
}
