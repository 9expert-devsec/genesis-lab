/**
 * What the แขวง/ตำบล field should be doing, given a postcode and how many
 * options the lookup produced.
 *
 * ── THE TRAP THIS REPLACES ──────────────────────────────────────────────────
 * The field was `readOnly={subDistrictOptions.length === 0}` and the value was
 * REQUIRED by the schema at the same time. So a postcode the dataset does not
 * cover produced a field that could not be filled and could not be skipped —
 * the form was unfinishable by any means. A real customer hit this on a
 * masterclass registration.
 *
 * ── WHY THE KEY IS "NO OPTIONS", NOT "LOOKUP RETURNED NULL" ─────────────────
 * There are TWO ways to arrive at the dead end and they look nothing alike from
 * the lookup's side:
 *
 *   · an UNKNOWN postcode — `getDataForZipCode('99999')` → null
 *   · a postcode that EXISTS as a key but carries nothing — 24 of the 978
 *     records in thai-data@3.0.2 have `subDistrictList: null` (81180, 81210,
 *     81190, 40002, 20131, …). The lookup returns a truthy object and the
 *     option list is still empty.
 *
 * Keying on `entry == null` would fix the first and leave the second exactly as
 * broken. Both collapse to "no options", so that is what decides.
 *
 * ── THREE STATES ────────────────────────────────────────────────────────────
 *   locked  fewer than 5 digits — nothing has been asked yet. Unchanged
 *           behaviour: read-only, "กรอกรหัสไปรษณีย์ก่อน".
 *   select  5 digits, options exist — unchanged: the dropdown.
 *   manual  5 digits, no options — TYPEABLE, with a hint saying the code was
 *           not found. The requirement is not relaxed; the value becomes
 *           enterable, which is a different thing.
 *
 * Pure and exported because the runner has no jsdom: this is the only seam
 * where the decision can be tested as behaviour rather than as JSX shape.
 */

export const SUB_DISTRICT_LOCKED = 'locked';
export const SUB_DISTRICT_SELECT = 'select';
export const SUB_DISTRICT_MANUAL = 'manual';

/** A Thai postcode is five digits; the input strips everything else. */
const FULL_POSTCODE_DIGITS = 5;

/**
 * @param {object} input
 * @param {string} [input.postalCode] the raw field value
 * @param {number} [input.optionCount] subdistricts the lookup produced
 * @returns {{
 *   state: 'locked'|'select'|'manual',
 *   readOnly: boolean,
 *   placeholder: string,
 *   hint: string|null,
 * }}
 */
export function subDistrictFieldState({ postalCode = '', optionCount = 0 } = {}) {
  const digits = String(postalCode ?? '').replace(/\D/g, '');

  // `< 5` rather than `!== 5`: a longer value is not "back to the beginning",
  // and the input's maxLength makes it unreachable anyway. Treating it as
  // locked would re-create the trap for anything that ever bypasses that cap.
  if (digits.length < FULL_POSTCODE_DIGITS) {
    return {
      state: SUB_DISTRICT_LOCKED,
      readOnly: true,
      placeholder: 'กรอกรหัสไปรษณีย์ก่อน',
      hint: null,
    };
  }

  if (optionCount > 0) {
    return {
      state: SUB_DISTRICT_SELECT,
      readOnly: false,
      placeholder: 'เลือกหรือพิมพ์',
      hint: null,
    };
  }

  return {
    state: SUB_DISTRICT_MANUAL,
    readOnly: false,
    placeholder: 'พิมพ์แขวง/ตำบล',
    hint:
      'ไม่พบรหัสไปรษณีย์นี้ในระบบ — กรุณากรอก แขวง/ตำบล เขต/อำเภอ และจังหวัด ด้วยตนเอง',
  };
}
