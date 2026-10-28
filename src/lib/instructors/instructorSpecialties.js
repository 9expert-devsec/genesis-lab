/**
 * An instructor's specialties ("ความเชี่ยวชาญ") — shown on the /about-us card
 * under "เชี่ยวชาญด้าน:", joined with " | ". Pure, so the save action and the
 * tests share one rule. Local-only field: MSDB has no equivalent.
 */

export const MAX_SPECIALTIES = 15;
export const MAX_SPECIALTY_LENGTH = 60;

/**
 * Trim, drop empties, de-duplicate (first spelling wins, case-insensitive),
 * then enforce the limits: at most 15 items, each at most 60 characters.
 *
 * @returns {{ ok: true, specialties: string[] } | { ok: false, error: string }}
 */
export function normalizeSpecialties(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  const tooLong = out.find((s) => s.length > MAX_SPECIALTY_LENGTH);
  if (tooLong) {
    return { ok: false, error: `ความเชี่ยวชาญแต่ละรายการยาวได้ไม่เกิน ${MAX_SPECIALTY_LENGTH} ตัวอักษร: "${tooLong}"` };
  }
  if (out.length > MAX_SPECIALTIES) {
    return { ok: false, error: `ใส่ความเชี่ยวชาญได้ไม่เกิน ${MAX_SPECIALTIES} รายการ` };
  }
  return { ok: true, specialties: out };
}

/** The card's line under "เชี่ยวชาญด้าน:". */
export function specialtiesLine(specialties) {
  return (Array.isArray(specialties) ? specialties : []).filter(Boolean).join(' | ');
}
