/**
 * Thai labels for the §6/§7 preset vocabularies.
 *
 * Labels only — the vocabularies themselves are the schema's
 * (lib/schemas/sections/base.js), and the value→class maps are presets.js.
 * This is a third, purely cosmetic layer, so unlike presets.js it does NOT
 * assert completeness: a missing label falls back to the raw enum value, which
 * is ugly and immediately visible rather than silently wrong. A missing CLASS
 * renders an unstyled element and must break the build; a missing LABEL just
 * reads badly for one release.
 */

export const CONTAINER_WIDTH_LABELS = {
  small: 'แคบ', medium: 'ปานกลาง', large: 'กว้าง', full: 'เต็มความกว้างจอ',
};

export const SPACING_LABELS = {
  none: 'ไม่มี', small: 'น้อย', medium: 'ปานกลาง', large: 'มาก', xl: 'มากที่สุด',
};

export const BACKGROUND_LABELS = {
  default: 'ตามธีมของหน้า', white: 'ขาว', light: 'ฟ้าอ่อน', soft_gray: 'เทาอ่อน',
  dark: 'น้ำเงินเข้ม', brand_gradient: 'ไล่สีแบรนด์', image: 'รูปภาพ',
};

export const VISIBILITY_LABELS = {
  all: 'ทุกอุปกรณ์', desktop_only: 'เดสก์ท็อปเท่านั้น', mobile_only: 'มือถือเท่านั้น', hidden: 'ซ่อนทุกที่',
};

export const ACCENT_LABELS = {
  brand_blue: 'น้ำเงินแบรนด์', navy: 'กรมท่า', cyan: 'ฟ้า',
  purple: 'ม่วง', orange: 'ส้ม', green: 'เขียว',
};

/**
 * ── ROUND 39 ──────────────────────────────────────────────────────────────
 * The sentinel that means "not a preset — the author typed a colour".
 *
 * It is NOT a member of BACKGROUNDS or ACCENTS and must never become one: a
 * mode is not a value. It rides in the same `<select>` as the presets because
 * that is the choice an author is actually making — which colour is this — and
 * because the accent select already carries a non-enum sentinel (`''`, meaning
 * ตามธีมของหน้า) so the shape is the file's own precedent rather than a new one.
 */
export const CUSTOM_COLOR_OPTION = 'custom';
export const CUSTOM_COLOR_LABEL = 'กำหนดเอง';

export const GRADIENT_DIRECTION_LABELS = {
  to_bottom:       'บนลงล่าง',
  to_top:          'ล่างขึ้นบน',
  to_right:        'ซ้ายไปขวา',
  to_left:         'ขวาไปซ้าย',
  to_bottom_right: 'ทแยงลงขวา',
  to_bottom_left:  'ทแยงลงซ้าย',
};

// Used by the per-type layout/style controls (item 5b).
export const RATIO_LABELS = {
  '50-50': '50 : 50', '40-60': '40 : 60', '60-40': '60 : 40', '30-70': '30 : 70', '70-30': '70 : 30',
};

export const MOBILE_BEHAVIOR_LABELS = {
  stack: 'วางซ้อนกัน', reverse_stack: 'สลับลำดับบนมือถือ', hide: 'ซ่อนบนมือถือ', carousel: 'เลื่อนแนวนอนบนมือถือ',
};

export const BUTTON_STYLE_LABELS = {
  primary: 'หลัก', secondary: 'รอง', outline: 'เส้นขอบ', ghost: 'โปร่ง',
};

// Used by the per-type card style control (item 5b) — the Card components
// (price_card / stat_card / icon_card) are the readers of style.cardStyle.
// `promo` (round 59) is the one COMPOSITE value — edge + surface + lift at once,
// which no other single value can express. Its label says what it is FOR rather
// than which three treatments it applies, because the author picks an intent.
export const CARD_STYLE_LABELS = {
  plain: 'เรียบ', border: 'เส้นขอบ', shadow: 'เงา', filled: 'พื้นทึบ', gradient: 'ไล่สี',
  promo: 'โปรโมชัน',
};

export const COLUMNS_LABELS = {
  1: '1 คอลัมน์', 2: '2 คอลัมน์', 3: '3 คอลัมน์', 4: '4 คอลัมน์', auto_fit: 'อัตโนมัติ',
};

export const labelFor = (map, value) => map?.[value] ?? String(value);
