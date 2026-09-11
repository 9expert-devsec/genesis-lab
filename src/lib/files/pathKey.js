/**
 * Normalise an entity key for use as a path segment. Pure; no I/O.
 *
 * ── LIFTED OUT OF lib/courses/courseOutline ─────────────────────────────────
 * This was normaliseCourseIdForPath, word for word. The catalog PDF on a
 * program or skill page needs the identical rule for the identical reason —
 * the key becomes a Cloudinary public_id signed `overwrite: true`, so whoever
 * can shape it can choose which asset is destroyed — and the choice was
 * between a second copy of the rule and one rule that takes the field's name
 * for its message. normaliseCourseIdForPath still exists and delegates here.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * Lowercased, because Cloudinary FOLDS public_id case: `POWER-BI` and
 * `power-bi` are one asset, so two keys differing only in case would silently
 * overwrite each other. Then REFUSED — never sanitised — if anything outside
 * [a-z0-9-] remains: a silently stripped character is a second key that maps
 * to the same path, which is the collision the rule exists to prevent.
 *
 * Returns `{ ok: true, value }` or `{ ok: false, reason }` NAMING the offending
 * input and the field, so an admin can find it in a 40-field form.
 *
 * @param {unknown} raw            the key as typed
 * @param {object}  [names]
 * @param {string}  [names.label]  the field's name for the message — 'course_id', 'program_id', …
 * @param {string}  [names.noun]   what to ask the admin to fill in — 'รหัสหลักสูตร', 'รหัสโปรแกรม', …
 */
export function normaliseKeyForPath(raw, { label = 'id', noun = 'รหัส' } = {}) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: `${label} ว่าง — กรอก${noun}ก่อนอัปโหลด` };

  const value = text.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(value)) {
    return {
      ok: false,
      reason: `${label} "${text}" มีอักขระที่ใช้ในชื่อไฟล์ไม่ได้ — รองรับเฉพาะ a-z 0-9 และ - `
        + `(ตรวจแล้วได้ "${value}")`,
    };
  }
  return { ok: true, value };
}
