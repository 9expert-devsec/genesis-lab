/**
 * What the canvas device toggle can and cannot show, as a value.
 *
 * ── THE MEASUREMENT THIS EXISTS TO REPORT ─────────────────────────────────
 * `previewViewport` sets an OUTER max-width (VIEWPORT_MAXW in CanvasPanel) around
 * the one real render. Tailwind's `sm:` / `md:` / `lg:` compile to VIEWPORT media
 * queries, and a media query asks the browser window, not the box the element is
 * in — so clamping a div changes nothing about which of them apply:
 *
 *   presets.js COLUMNS_CLASS[3]     'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
 *   presets.js RATIO_CLASS['50-50'] 'lg:grid-cols-2'
 *   presets.js VISIBILITY_CLASS     desktop_only 'hidden md:block'
 *                                   mobile_only  'block md:hidden'
 *
 * On a 1440px screen in "มือถือ" mode a 3-column grid still renders three
 * columns, and — the inversion that matters most — a `mobile_only` section
 * DISAPPEARS while a `desktop_only` section SHOWS. Exactly backwards from what
 * the control appears to promise.
 *
 * ── WHY A CAVEAT AND NOT A FIX, HERE ──────────────────────────────────────
 * Making the preview real means container queries or an iframe, which is a
 * behavioural change to how the canvas renders and belongs in its own round with
 * its own verification. This module changes nothing about the render; it only
 * stops the toolbar claiming something false in the meantime. It must therefore
 * survive WITHOUT that later fix — and when the fix lands, this is the thing to
 * delete, along with the toolbar's call to it.
 *
 * Pure on purpose: the predicate and the copy are testable without a DOM, and
 * the toolbar's only job is to render what this returns.
 */

/** Thai copy for the caveat. One string, so the toolbar cannot reword it. */
export const PREVIEW_VIEWPORT_CAVEAT =
  'จำลองความกว้างเท่านั้น — breakpoint ยังอิงขนาดหน้าต่างเบราว์เซอร์จริง '
  + 'section ที่ตั้งค่าให้แสดงเฉพาะมือถือ/เดสก์ท็อปจะสลับกัน ตรวจของจริงที่ปุ่ม “ดูตัวอย่าง”';

/**
 * Should the toolbar show the caveat for this viewport?
 *
 * TRUE for anything that is not 'desktop'. Stated as "not desktop" rather than
 * as a list of the clamped viewports so that adding a fourth device to VIEWPORTS
 * cannot silently arrive without its caveat — the failure would otherwise be a
 * new preset that lies, with nothing red.
 *
 * 'desktop' applies NO clamp at all (VIEWPORT_MAXW.desktop is null), so there is
 * nothing to be misled about: the canvas is simply the page at the width of the
 * centre column. An unknown value is treated as clamped, which is the fail-closed
 * direction — a caveat that appears when it need not is noise; one that is
 * missing when it is needed is the defect.
 */
export function previewViewportCaveat(viewport) {
  return viewport === 'desktop' ? null : PREVIEW_VIEWPORT_CAVEAT;
}
