/**
 * Geometry of the home page client-logo marquee ("องค์กรที่ให้ความไว้วางใจ").
 * Pure; no DOM. The component renders from these numbers and a CSS @keyframes
 * animation does the moving (globals.css, "CLIENT LOGO MARQUEE").
 *
 * ── WHY THE PERIOD IS COMPUTED, NOT MEASURED ────────────────────────────────
 * Every logo sits in a FIXED 140px box (`w-[140px]`) and boxes are 48px apart
 * (`gap-12`). The image inside never changes the box, so one copy's period is
 * exactly count × (140 + 48) — including the trailing gap, which each copy
 * carries as `pr-12`. The old rAF loop measured `scrollWidth / 3`, which is
 * one gap SHORT per copy (the last copy has no trailing gap): 3,932px instead
 * of 3,948px for 21 logos, so every wrap jumped 16px.
 *
 * The ANIMATION itself does not use these pixels for distance: it moves the
 * track by exactly one copy as a PERCENTAGE of its own width, so the loop stays
 * seamless even if the root font size changes the rem-based gap. Pixels are
 * used only for the duration, so each row keeps its px/s speed.
 */

/** The logo box width (`w-[140px]`). */
export const MARQUEE_ITEM_PX = 140;
/** The space between boxes (`gap-12` / trailing `pr-12`, 3rem at 16px). */
export const MARQUEE_GAP_PX = 48;
/** The row's maximum visible width (`max-w-[1200px]`). */
export const MARQUEE_ROW_MAX_PX = 1200;

/** One copy's repeat period in px, trailing gap included. */
export function marqueePeriodPx(count) {
  return Math.max(0, Number(count) || 0) * (MARQUEE_ITEM_PX + MARQUEE_GAP_PX);
}

/**
 * How many copies the track needs. The track slides one period P; at the end
 * of the slide the visible window (up to 1200px) must still be covered, so
 * K·P ≥ P + 1200 → K ≥ 1 + 1200/P. Never fewer than 2.
 * 21 logos: P = 3,948 → K = 2.
 */
export function marqueeCopyCount(count) {
  const period = marqueePeriodPx(count);
  if (period <= 0) return 0;
  return Math.max(2, Math.ceil(1 + MARQUEE_ROW_MAX_PX / period));
}

/** Seconds per period at `speed` px/s — the row's existing speed, unchanged. */
export function marqueeDurationSec(count, speed) {
  const s = Number(speed);
  if (!(s > 0)) return 0;
  return marqueePeriodPx(count) / s;
}

/**
 * The CSS custom properties for one row's track: the one-copy shift as a
 * percentage of the track, and the duration.
 */
export function marqueeTrackVars(count, speed) {
  const copies = marqueeCopyCount(count);
  return {
    '--marquee-shift': copies ? `${(-100 / copies).toFixed(6)}%` : '0%',
    '--marquee-duration': `${marqueeDurationSec(count, speed).toFixed(3)}s`,
  };
}
