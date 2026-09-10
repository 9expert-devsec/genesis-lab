/**
 * THE 9Expert BRAND PALETTE — one definition, read by every surface that needs
 * a brand colour as DATA rather than as a Tailwind class.
 *
 * ── WHY A MODULE AND NOT SIX SWATCH DIVS ────────────────────────────────────
 * The /logo-page brand-asset page has to PRINT these values: name, hex, RGB,
 * CMYK, and the role sentence that says what each colour is for. A page that
 * hardcodes them is a second copy of the palette that nobody diffs, and the
 * first time a colour moves in tailwind.config.js the page keeps teaching the
 * old one — with a green suite, because nothing compares the two.
 *
 * So the values live here, the page renders FROM here, and
 * test/pure/brandPalette.test.mjs reads BOTH this module and the real
 * tailwind.config.js and asserts they agree. Neither side is retyped in the
 * test; a drift in either direction goes red.
 *
 * ── PROVENANCE. DO NOT "CORRECT" THESE BACK ─────────────────────────────────
 * The official Master Brand Guideline PDF v1.0 (21 July 2026) MISPRINTS three
 * of the values below. The values in this file are the corrected ones, verified
 * against the actual logo SVG artwork in /files/ci-svg/:
 *
 *   Cloud Base   PDF prints #48FAFD          — correct value is #F8FAFD.
 *                (#48FAFD is a bright cyan; the artwork's near-white is
 *                #F8FAFD, which is also --9e-ice in tailwind.config.js.)
 *   Nine Blue    PDF prints RGB 36, 134, 225 — correct triplet is 36, 134, 255.
 *   Action Blue  PDF prints RGB 0, 92, 225   — correct triplet is 0, 92, 255.
 *
 * The two RGB misprints are the same typo twice: the final 255 lost its middle
 * digit. Both hexes end in FF, so the artwork settles it — 0xFF is 255, not 225.
 *
 * Anyone reconciling this file against the PDF will find these three and be
 * tempted to "fix" them. Don't. Fix the PDF.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * State Deep (#5E6A7E) and State Light (#B7C3D4) are LOGO COLOUR VARIANTS — two
 * of the five approved inks a logo file ships in. They are not brand palette
 * colours, they have no role sentence, and they must not appear in a swatch
 * grid that claims to be "the six brand colours". They live with the logo
 * assets, in src/app/(public)/logo-page/logoAssets.js.
 */

/**
 * @typedef  {object}          BrandColor
 * @property {string}          key    stable id — safe as a React key / lookup
 * @property {string}          name   display name, as printed in the guideline
 * @property {string}          hex    `#RRGGBB`, uppercase
 * @property {[number,number,number]}        rgb   R, G, B  (0–255)
 * @property {[number,number,number,number]} cmyk  C, M, Y, K (0–100)
 * @property {string}          role   Thai sentence: what this colour is FOR
 * @property {string|null}     tailwindKey
 *           The colour's counterpart inside the `9e` group of
 *           tailwind.config.js — i.e. `9e.brand` is `'brand'`. `null` means the
 *           colour has no theme token at all, which the parity test reports by
 *           name rather than silently skipping. It is a POINTER, not a value:
 *           the test resolves it against the real config, so this file never
 *           holds a second copy of the hex under another name.
 */

/** @type {readonly BrandColor[]} */
export const BRAND_PALETTE = Object.freeze([
  Object.freeze({
    key: 'nine-blue',
    name: 'Nine Blue',
    hex: '#2486FF',
    rgb: [36, 134, 255],
    cmyk: [86, 47, 0, 0],
    role: 'ตัวแทนแบรนด์หลัก ใช้กับโลโก้และองค์ประกอบสำคัญ',
    tailwindKey: 'brand',
  }),
  Object.freeze({
    key: 'action-blue',
    name: 'Action Blue',
    hex: '#005CFF',
    rgb: [0, 92, 255],
    cmyk: [100, 64, 0, 0],
    role: 'ใช้กับปุ่ม CTA และจุดที่ต้องการแรงดึงสายตา',
    tailwindKey: 'action',
  }),
  Object.freeze({
    key: 'air-blue',
    name: 'Air Blue',
    hex: '#48B0FF',
    rgb: [72, 176, 255],
    cmyk: [72, 31, 0, 0],
    role: 'เสริมมิติ ความเคลื่อนไหว และไฮไลต์รอง',
    tailwindKey: 'air',
  }),
  Object.freeze({
    key: 'deep-navy',
    name: 'Deep Navy',
    hex: '#0D1B2A',
    rgb: [13, 27, 42],
    cmyk: [69, 36, 0, 84],
    role: 'ข้อความหลัก และพื้นหลังสีเข้ม',
    tailwindKey: 'navy',
  }),
  Object.freeze({
    key: 'cloud-base',
    name: 'Cloud Base',
    hex: '#F8FAFD',
    rgb: [248, 250, 253],
    cmyk: [2, 1, 0, 1],
    role: 'พื้นหลังหลัก เปิดพื้นที่ให้เลย์เอาต์อ่านง่าย',
    tailwindKey: 'ice',
  }),
  Object.freeze({
    key: 'signal-lime',
    name: 'Signal Lime',
    hex: '#D4F73F',
    rgb: [212, 247, 63],
    cmyk: [21, 0, 89, 0],
    role: 'สีเน้น ใช้กับ CTA, Badge และ Highlight เท่านั้น',
    tailwindKey: 'lime',
  }),
]);

/** Keyed lookup, so a caller that wants ONE colour does not scan the array. */
export const paletteByKey = Object.freeze(
  Object.fromEntries(BRAND_PALETTE.map((c) => [c.key, c])),
);

/** `#2486FF` → `RGB 36, 134, 255` — formatting lives here, not in the markup. */
export function formatRgb(color) {
  return `RGB ${color.rgb.join(', ')}`;
}

/** `#2486FF` → `CMYK 86, 47, 0, 0`. */
export function formatCmyk(color) {
  return `CMYK ${color.cmyk.join(', ')}`;
}
