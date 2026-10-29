/**
 * Is this course_id free — in BOTH stores — before anything is written?
 *
 * ── WHY A DUPLICATE CODE IS DANGEROUS RATHER THAN MERELY WRONG ──────────────
 * `saveCourseExtension` writes a WHOLE document keyed by the course_id CODE,
 * upserting. So creating a course whose code is already in use does not fail —
 * it silently OVERWRITES the existing course's SEO, URL alias, gallery and
 * `omisePaymentEnabled` (which defaults back to false, switching off that
 * course's card/PromptPay flow on the public registration wizard). Nothing on
 * screen reports it, and the damage is to a DIFFERENT course than the one being
 * created.
 *
 * MSDB may or may not reject the duplicate itself; that is not something to
 * rely on, because the extension write is ours and happens regardless.
 *
 * ── BOTH STORES, NOT JUST MSDB ──────────────────────────────────────────────
 * An extension row can outlive its course — a course deleted upstream leaves
 * `course_extensions` untouched. So "no MSDB course with this code" is not
 * enough: a new course could inherit a dead row's alias and gallery and appear
 * pre-configured with another course's SEO. Both are checked; either one blocks.
 *
 * ── CASE ────────────────────────────────────────────────────────────────────
 * Comparison is case-insensitive, and the caller's lookups must be too. MSDB's
 * `?course_id=` is EXACT-MATCH and case-sensitive (verified: `COPILOT-STU` → 1
 * row, `copilot-stu` → 0), so an exact lookup alone would let "MSE-L1" be
 * created alongside an existing "mse-l1" — two courses one keystroke apart,
 * sharing one extension row.
 */

/**
 * The canonical form of a typed course_id: trimmed and UPPERCASE.
 *
 * The form's input already uppercases as you type, so this is the second line
 * of the same rule rather than the only one — it also covers a value that
 * arrives from anywhere other than that input.
 */
export function normaliseCourseId(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * @param {object} input
 * @param {string} input.code                the code being created
 * @param {string|null} [input.existingCourseId]    matching MSDB course_id, or null
 * @param {string|null} [input.existingExtensionId] matching extension courseId, or null
 * @param {string|null} [input.existingPrivateId]   matching private_courses course_id, or null
 * @returns {{ field: 'course_id', error: string }|null} null when the code is free
 *
 * THREE STORES since private courses: MSDB, course_extensions, and genesis's
 * own `private_courses`. A private course normally HAS an extension row, so
 * the extension check usually catches it too — but not when its extension
 * write failed, and a code shared by a private course and a public one would
 * put both on one extension row. Both create paths run this same check.
 */
export function courseIdConflict({
  code,
  existingCourseId = null,
  existingExtensionId = null,
  existingPrivateId = null,
} = {}) {
  const wanted = normaliseCourseId(code);
  if (!wanted) return null; // "required" is a different error, raised elsewhere

  // Reported verbatim so the admin can see the CASE they collided with — the
  // whole point when the existing row differs only by capitalisation.
  if (existingCourseId) {
    return {
      field: 'course_id',
      error:
        `รหัสหลักสูตร "${existingCourseId}" มีอยู่แล้วในระบบ — `
        + 'กรุณาใช้รหัสอื่น (การใช้รหัสซ้ำจะเขียนทับ SEO และแกลเลอรีของหลักสูตรเดิม)',
    };
  }

  // Before the extension check: a private course usually has an extension row
  // too, and "used by a Private Course" is the message that says what it is.
  if (existingPrivateId) {
    return {
      field: 'course_id',
      error:
        `รหัสหลักสูตร "${existingPrivateId}" ถูกใช้โดย Private Course แล้ว — `
        + 'กรุณาใช้รหัสอื่น',
    };
  }

  if (existingExtensionId) {
    return {
      field: 'course_id',
      error:
        `รหัสหลักสูตร "${existingExtensionId}" มีข้อมูล SEO/แกลเลอรีค้างอยู่ในระบบ — `
        + 'กรุณาใช้รหัสอื่น หรือลบข้อมูลเดิมก่อน',
    };
  }

  return null;
}
