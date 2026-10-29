/**
 * How a PRIVATE course's program and skills arrive from the form, and the one
 * rule they must satisfy.
 *
 * ── WHY A PREFIX ON THE SAME `program` SELECT ───────────────────────────────
 * The private form shows ONE program picker: MSDB programs, then a "Custom
 * (Private)" group whose option values are `private:<taxonomy _id>`. One
 * select means picking a custom program clears the MSDB one and vice versa by
 * construction, and `shapePayload` — shared with MSDB courses — stays exactly
 * as it is: it reads `program` as it always has, and the private actions split
 * the value here. Custom skills post as their own `private_skills` inputs,
 * which `shapePayload` never reads.
 *
 * A NORMAL course's form never renders the custom group, so its `program` is
 * never prefixed.
 */

export const PRIVATE_PROGRAM_PREFIX = 'private:';

const OBJECT_ID = /^[0-9a-f]{24}$/i;

function getAll(formData, key) {
  if (formData instanceof FormData) return formData.getAll(key);
  const v = formData?.[key];
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

/**
 * `{ program, privateProgram, privateSkills }` for the private store, from the
 * shaped body (its `program`) and the raw form (its `private_skills`).
 */
export function privateTaxonomyFields(body, formData) {
  const raw = String(body?.program ?? '').trim();
  const privateSkills = [...new Set(
    getAll(formData, 'private_skills').map((s) => String(s ?? '').trim()).filter((s) => OBJECT_ID.test(s))
  )];
  if (raw.startsWith(PRIVATE_PROGRAM_PREFIX)) {
    return { program: '', privateProgram: raw.slice(PRIVATE_PROGRAM_PREFIX.length).trim(), privateSkills };
  }
  return { program: raw, privateProgram: null, privateSkills };
}

/**
 * EXACTLY ONE of `program` (an MSDB id) or `privateProgram` (a custom one).
 * Returns null when satisfied, or a refusal bound to the program picker — the
 * form shows it under that field and nothing is written.
 */
export function exactlyOneProgram({ program, privateProgram } = {}) {
  const hasMsdb = Boolean(String(program ?? '').trim());
  const custom = String(privateProgram ?? '').trim();
  if (hasMsdb && custom) {
    return { ok: false, field: 'program', error: 'เลือกโปรแกรมได้เพียงหนึ่งรายการ — โปรแกรมปกติ หรือ Custom (Private) อย่างใดอย่างหนึ่ง' };
  }
  if (!hasMsdb && !custom) {
    return { ok: false, field: 'program', error: 'กรุณาเลือกโปรแกรม' };
  }
  if (custom && !OBJECT_ID.test(custom)) {
    return { ok: false, field: 'program', error: 'โปรแกรม Custom (Private) ไม่ถูกต้อง' };
  }
  return null;
}
