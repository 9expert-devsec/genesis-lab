/**
 * Per-instructor photo crop on the /about-us card — genesis-only (MSDB has no
 * such fields, and they are never sent upstream).
 *
 * One uniform crop could not fit every photo: the cut-outs are not shot at one
 * scale, so one instructor read far too zoomed in and another sat low. Two
 * optional numbers per instructor correct that:
 *
 *   photo_scale     the image box's height as a % of the panel height
 *   photo_offset_y  how far the box starts below the panel top, as a %
 *   photo_offset_x  how far the box's centre moves right, as a % of the
 *                   panel width (AB-2h; negative moves left)
 *
 * Empty (null) means "use the default", which is AB-2e's uniform crop, so an
 * instructor nobody has adjusted renders exactly as before.
 *
 * Pure: the admin form, the save action and the public card share it.
 */

export const PHOTO_SCALE = Object.freeze({ min: 120, max: 320, default: 225 });
export const PHOTO_OFFSET_Y = Object.freeze({ min: -20, max: 30, default: 2 });
// % of the panel WIDTH; positive moves the photo right. Added in AB-2h to
// centre faces that sit off-centre in their cut-out.
export const PHOTO_OFFSET_X = Object.freeze({ min: -30, max: 30, default: 0 });

/**
 * The box is wider than any photo's aspect needs (130% of the panel width at
 * the default height), so object-contain always fits the HEIGHT. It scales
 * with the height, or a zoomed-in box would hit the width first and stop
 * zooming.
 */
const WIDTH_AT_DEFAULT = 130;

function parseOne(raw, spec, label) {
  if (raw == null) return { ok: true, value: null };
  const text = String(raw).trim();
  if (text === '') return { ok: true, value: null };
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: `${label}ต้องเป็นตัวเลข` };
  }
  const n = Number(text);
  if (n < spec.min || n > spec.max) {
    return { ok: false, error: `${label}ต้องอยู่ระหว่าง ${spec.min} ถึง ${spec.max}` };
  }
  return { ok: true, value: n };
}

/**
 * Server-side validation of the three submitted values. Empty → null (the
 * default); a non-number or an out-of-range value is refused, naming the field.
 *
 * @returns {{ ok: true, value: { photo_scale: number|null, photo_offset_y: number|null,
 *            photo_offset_x: number|null } }
 *          | { ok: false, field: string, error: string }}
 */
export function parsePhotoCrop({ photo_scale, photo_offset_y, photo_offset_x } = {}) {
  const scale = parseOne(photo_scale, PHOTO_SCALE, 'ซูม ');
  if (!scale.ok) return { ok: false, field: 'photo_scale', error: scale.error };
  const offset = parseOne(photo_offset_y, PHOTO_OFFSET_Y, 'เลื่อนขึ้น-ลง ');
  if (!offset.ok) return { ok: false, field: 'photo_offset_y', error: offset.error };
  const offsetX = parseOne(photo_offset_x, PHOTO_OFFSET_X, 'เลื่อนซ้าย-ขวา ');
  if (!offsetX.ok) return { ok: false, field: 'photo_offset_x', error: offsetX.error };
  return {
    ok: true,
    value: { photo_scale: scale.value, photo_offset_y: offset.value, photo_offset_x: offsetX.value },
  };
}

const inRange = (v, spec) =>
  typeof v === 'number' && Number.isFinite(v) && v >= spec.min && v <= spec.max;

/** The values a card renders with: stored ones, else the defaults. */
export function photoCropValues({ photo_scale, photo_offset_y, photo_offset_x } = {}) {
  return {
    scale: inRange(photo_scale, PHOTO_SCALE) ? photo_scale : PHOTO_SCALE.default,
    offsetY: inRange(photo_offset_y, PHOTO_OFFSET_Y) ? photo_offset_y : PHOTO_OFFSET_Y.default,
    offsetX: inRange(photo_offset_x, PHOTO_OFFSET_X) ? photo_offset_x : PHOTO_OFFSET_X.default,
  };
}

/**
 * Inline style for the image box inside .about-instructor-panel. The box is
 * centred by CSS (left: 50% + translateX(-50%)); a horizontal offset moves
 * that centre. Zero emits no `left`, so an instructor without the field
 * renders exactly as before.
 */
export function photoCropStyle({ scale, offsetY, offsetX = 0 }) {
  const width = (WIDTH_AT_DEFAULT * scale) / PHOTO_SCALE.default;
  return {
    top: `${offsetY}%`,
    height: `${scale}%`,
    width: `${Math.round(width * 100) / 100}%`,
    ...(offsetX ? { left: `${50 + offsetX}%` } : {}),
  };
}
