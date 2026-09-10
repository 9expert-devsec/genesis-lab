import { paletteByKey } from '@/lib/brand/palette';

/**
 * THE CONTENT OF /logo-page, as data.
 *
 * Every string here is the approved copy from the Master Brand Guideline v1.0,
 * ported from prompts/logo-page-content-reference.html. It sits in a module
 * rather than inline in the JSX for two reasons: the fifteen logo cards become
 * one loop over two lists instead of fifteen near-identical blocks, and it
 * keeps page.jsx free of colour LITERALS — every hex the page prints is either
 * read from the brand palette or declared exactly once, here.
 *
 * ── THE ASSET FILES ARE NOT IN THIS REPO ────────────────────────────────────
 * All 31 files are already uploaded and served from the legacy `/files` root,
 * which next.config.mjs rewrites to Cloudinary delivery. Referenced by path
 * only; nothing here is imported, bundled, or committed.
 *
 *   /files/ci-svg/<shape>-<variant>.svg   vector, delivered untransformed
 *   /files/ci/<shape>-<variant>.png       raster
 *   /files/ci/wallpaper-desktop.png       8000 x 4500, ~4.7 MB on disk
 */

/** `/files/...` — the served path, not a repo path. */
export const svgHref = (shape, variant) => `/files/ci-svg/${shape}-${variant}.svg`;
export const pngHref = (shape, variant) => `/files/ci/${shape}-${variant}.png`;

/**
 * THE FIVE APPROVED LOGO INKS.
 *
 * ── `tile` IS NOT DECORATION AND DOES NOT FOLLOW THE THEME ──────────────────
 * It records which background the guideline says this ink is FOR: a Cloud Base
 * logo is the knockout, so it can only be shown on dark; a Deep Navy logo can
 * only be shown on light. See LogoVariantGrid, where that is enforced.
 *
 * ── WHERE EACH HEX COMES FROM ───────────────────────────────────────────────
 * Three of the five inks ARE brand palette colours and read their hex from the
 * palette, so a value can never be printed here that the swatch grid further up
 * the page disagrees with.
 *
 * State Deep and State Light are the other two, and they are NOT brand palette
 * colours — they are logo inks and nothing else. They carry their own hex here,
 * which is the only place either value appears, and they are deliberately
 * absent from src/lib/brand/palette.js and from the colour-system section.
 */
export const LOGO_VARIANTS = Object.freeze([
  Object.freeze({
    key: 'nineblue',
    name: paletteByKey['nine-blue'].name,
    hex: paletteByKey['nine-blue'].hex,
    tile: 'light',
  }),
  Object.freeze({
    key: 'deepnavy',
    name: paletteByKey['deep-navy'].name,
    hex: paletteByKey['deep-navy'].hex,
    tile: 'light',
  }),
  Object.freeze({
    key: 'cloud',
    name: paletteByKey['cloud-base'].name,
    hex: paletteByKey['cloud-base'].hex,
    tile: 'dark',
  }),
  Object.freeze({ key: 'statedeep', name: 'State Deep', hex: '#5E6A7E', tile: 'light' }),
  Object.freeze({ key: 'statelight', name: 'State Light', hex: '#B7C3D4', tile: 'dark' }),
]);

/**
 * THE THREE LOGO SHAPES. `stageHeight` caps the artwork inside its tile so the
 * three grids read as one system: the signature lockup is wide and short, the
 * symbol and square marks are close to 1:1 and get more room.
 */
export const LOGO_SHAPES = Object.freeze([
  Object.freeze({
    key: 'signature',
    title: 'Signature Logo',
    blurb: 'โลโก้หลักแนวนอน ใช้เป็นค่าเริ่มต้นในสื่อทั่วไป · 5 รูปแบบสีที่ได้รับอนุมัติ',
    alt: 'Signature Logo',
    stageHeight: 'max-h-[74px]',
  }),
  Object.freeze({
    key: 'symbol',
    title: 'Symbol Logo',
    blurb: 'สัญลักษณ์เดี่ยว ใช้เมื่อพื้นที่จำกัด เช่น ไอคอนหรือ favicon · 5 รูปแบบสีที่ได้รับอนุมัติ',
    alt: 'Symbol Logo',
    stageHeight: 'max-h-[104px]',
  }),
  Object.freeze({
    key: 'square',
    title: 'Square Logo',
    blurb: 'ทรงสี่เหลี่ยมจัตุรัส ใช้กับช่องทางที่บังคับสัดส่วน 1:1 · 5 รูปแบบสีที่ได้รับอนุมัติ',
    alt: 'Square Logo',
    stageHeight: 'max-h-[104px]',
  }),
]);

/** ระบบสีของแบรนด์ — the two guidance columns beneath the swatch grid. */
export const COLOR_GUIDANCE = Object.freeze({
  do: Object.freeze({
    title: 'หลักการใช้สี',
    items: Object.freeze([
      'ให้สีน้ำเงินเป็นตัวนำในงานส่วนใหญ่',
      'ใช้ Action Blue เมื่อต้องการเน้นการกระทำ เช่น ปุ่ม',
      'ใช้ Cloud Base เปิดพื้นที่ ลดความอึดอัดของเลย์เอาต์',
      'เลือกคู่สีที่คอนทราสต์ชัดเจน อ่านง่าย',
      'ตรวจค่าสีก่อนส่งออกทุกครั้ง',
    ]),
  }),
  dont: Object.freeze({
    title: 'สิ่งที่ควรหลีกเลี่ยง',
    items: Object.freeze([
      'ใช้สีเน้นมากเกินไปจนแย่งความสนใจกันเอง',
      'วาง Signal Lime เป็นตัวอักษรบนพื้นสว่าง คอนทราสต์ต่ำเกินไป ให้ใช้เป็นพื้นปุ่มหรือ badge แล้วใส่ตัวอักษรสี Deep Navy',
      'แทนค่าสีโดยพลการ หรือกะสีด้วยสายตา',
    ]),
  }),
});

/** ขนาดเล็กที่สุดที่ใช้ได้ — four columns, four rows. */
export const MINIMUM_SIZE_COLUMNS = Object.freeze([
  'รูปแบบโลโก้',
  'หน้าจอ',
  'งานพิมพ์',
  'หมายเหตุ',
]);

export const MINIMUM_SIZE_ROWS = Object.freeze([
  Object.freeze(['Signature Logo (Primary)', '160 px', '35 mm', 'ใช้งานหลักในสื่อส่วนใหญ่']),
  Object.freeze(['Square Logo (Secondary)', '120 px', '25 mm', 'ใช้เมื่อพื้นที่จำกัดในแนวตั้ง']),
  Object.freeze(['Wordmark', '90 px', '20 mm', 'ใช้เฉพาะกรณีที่ได้รับอนุมัติ']),
  Object.freeze(['Symbol', '24 px', '8 mm', 'เหมาะกับไอคอนและ favicon']),
]);

/** การวางโลโก้บนพื้นหลัง — the do / avoid pair. */
export const BACKGROUND_GUIDANCE = Object.freeze({
  do: Object.freeze({
    title: 'ทำได้',
    items: Object.freeze([
      'โลโก้สีน้ำเงินบนพื้นหลังอ่อนหรือขาว',
      'โลโก้สีขาว หรือ Cloud Base บนพื้นสีเข้ม',
      'วางบนภาพได้ ถ้าภาพเรียบและตัดกับโลโก้เพียงพอ',
      'เหลือพื้นที่ว่างรอบโลโก้ให้หายใจ',
    ]),
  }),
  dont: Object.freeze({
    title: 'ห้ามทำ',
    items: Object.freeze([
      'วางบนพื้นหลังที่สีใกล้เคียงกับโลโก้',
      'วางบนภาพที่มีรายละเอียดรบกวนมากเกินไป',
      'วางทับองค์ประกอบสำคัญของภาพ',
      'ใช้พื้นหลังที่คอนทราสต์ต่ำ',
    ]),
  }),
});

/** การใช้โลโก้ที่ไม่ถูกต้อง — the eight prohibitions, one full-width column. */
export const PROHIBITIONS = Object.freeze({
  title: 'ข้อห้าม',
  items: Object.freeze([
    'ห้ามยืดโลโก้',
    'ห้ามบีบสัดส่วนโลโก้',
    'ห้ามหมุนโลโก้',
    'ห้ามเปลี่ยนเป็นสีอื่นนอกเหนือที่กำหนด',
    'ห้ามใส่เงาหรือเอฟเฟกต์',
    'ห้ามจัดองค์ประกอบใหม่',
    'ห้ามใช้พื้นหลังที่อ่านยาก',
    'ห้ามเปลี่ยนรูปแบบตัวอักษร',
  ]),
});

/** ความหมายของโลโก้ — the four design elements. */
export const LOGO_MEANING = Object.freeze([
  Object.freeze({
    key: 'nine',
    title: 'เลข 9',
    detail: 'สื่อถึงอัตลักษณ์ของแบรนด์ 9Expert และการจดจำที่ชัดเจน',
  }),
  Object.freeze({
    key: 'compass',
    title: 'เข็มทิศ / ทิศทาง',
    detail: 'สื่อถึงการนำทาง การชี้เป้า และการพาผู้เรียนไปสู่ความเชี่ยวชาญ',
  }),
  Object.freeze({
    key: 'forward',
    title: 'การเคลื่อนไปข้างหน้า',
    detail: 'สะท้อนการพัฒนาอย่างต่อเนื่องและความก้าวหน้าด้านเทคโนโลยี',
  }),
  Object.freeze({
    key: 'simple',
    title: 'รูปทรงที่เรียบง่าย',
    detail: 'ช่วยให้แบรนด์ดูทันสมัย น่าเชื่อถือ และใช้งานได้หลากหลาย',
  }),
]);

/** The four brand keywords, printed with the meaning grid. */
export const BRAND_KEYWORDS = Object.freeze(['Expertise', 'Direction', 'Growth', 'Clarity']);

/**
 * THE WALLPAPER.
 *
 * `downloadHref` is the stored asset. `previewHref` is THE SAME FILE requested
 * through the `/_img/w800` delivery variant next.config.mjs already defines
 * (f_webp,q_80,w_800,c_limit). Measured against the deployed site: 14,286 bytes
 * of WebP, against 39,296 for the default w_1600 variant and ~4.7 MB for the
 * stored 8000 x 4500 PNG. See WallpaperPanel for why the preview must not be
 * the download URL.
 */
export const WALLPAPER = Object.freeze({
  downloadHref: '/files/ci/wallpaper-desktop.png',
  previewHref: '/_img/w800/files/ci/wallpaper-desktop.png',
  alt: 'Wallpaper 9Expert สำหรับเดสก์ท็อป',
  width: 8000,
  height: 4500,
  blurb: 'วอลเปเปอร์เดสก์ท็อปลายอัตลักษณ์ 9Expert ความละเอียด 8000 × 4500 พิกเซล',
  note: 'ไฟล์ PNG ขนาดประมาณ 4.7 MB เหมาะกับจอ 4K และจอกว้าง',
  cta: 'ดาวน์โหลด Wallpaper',
});
