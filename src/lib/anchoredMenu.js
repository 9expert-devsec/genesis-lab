// src/lib/anchoredMenu.js
//
// WHERE A DISCLOSURE SHEET GOES, given its trigger's box and the viewport's.
//
// Pure arithmetic over two rectangles. No DOM, no React, no measurement — the
// caller measures and applies; this decides. That split is the whole point:
// the part of "the menu opens in the right place" that can actually be tested
// is the part that is arithmetic, and it is all in here.
//
// ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
// The attendee roster's per-row "•••" opened DOWNWARD unconditionally, from a
// `top-[30px]` class. On the LAST row of a roster the sheet was laid out below
// the bottom edge of the admin shell's scrollport — see the note in
// detailShell's OverflowMenu for exactly which box does the cutting — and the
// items under the fold could not be reached at all, because the admin shell is
// `h-screen overflow-hidden` and the document has no scrollbar to reach them
// with.
//
// Two things had to change and they are not the same thing:
//
//   1. the sheet had to stop living in a clipped coordinate space, which is
//      `position: fixed` and belongs to the component;
//   2. the sheet had to stop assuming there is room below it, which is this
//      file. Escaping the clip while still opening downward would move the
//      same defect one box outward — off the VIEWPORT instead of off the
//      scrollport — and a reader would have no more recourse there than here.
//
// ── IT RETURNS AN EDGE, NOT A TOP ───────────────────────────────────────────
// The flipped placement is expressed as `bottom`, pinning the sheet's BOTTOM
// edge above the trigger, rather than as a `top` computed by subtracting the
// height. Both are the same pixel when the sheet RENDERS at the height it was
// measured at — and it does not always, because the maxHeight below clamps it.
// A sheet measured at 5000 and clamped to 802, placed by subtracting 5000,
// lands at top -4190 with its far edge at -3388: the entire sheet above the
// window, which is the original defect pointing the other way.
//
// An anchored `bottom` cannot do that. The gap above the trigger is exact by
// construction and any discrepancy between the measured and the rendered
// height spends itself at the FAR end, where the maxHeight is already waiting.
//
// ── AND A maxHeight, ALWAYS ─────────────────────────────────────────────────
// Returned on both placements, not only when it bites. A sheet that is taller
// than either side of the trigger has no good placement, and the honest answer
// is the roomier side with a scrollbar — not the roomier side with the tail
// hanging off the viewport, which is the original defect wearing a different
// hat.

/**
 * How close to the viewport's edge a sheet may come. Not zero: a menu flush
 * against the bottom of the window reads as clipped even when it is whole,
 * and the shadow that says "this floats" has nowhere to fall.
 */
export const MENU_VIEWPORT_MARGIN = 8;

/**
 * Decide where a sheet of `height` goes when it hangs off `trigger`.
 *
 * `trigger` and `viewport` are in the frame getBoundingClientRect reports in —
 * viewport coordinates, origin top-left — which is also the frame
 * `position: fixed` resolves against, so the caller applies the result without
 * converting anything.
 *
 * `gap` is the distance between the trigger's edge and the sheet's, and it is
 * the caller's because it is measured geometry: 2px under the 28px row
 * trigger, 4px under the 38px status-bar one, 6px under the 39px ตัวกรอง
 * summary. Those were the `top-[30px]` / `top-[42px]` / `top-[45px]` classes
 * this replaced, and they are preserved rather than harmonised — the design
 * file says what it says.
 *
 * Returns null for a REFUSAL — a measurement that is not usable — rather than
 * throwing or guessing. The realistic caller is a scroll handler running on
 * every frame of a flick, and a throw on the one tick that produced a NaN
 * would take down the page for a cosmetic offset. A refusal leaves the sheet
 * wherever it last legitimately was, which is the only honest fallback: there
 * is no safe direction to guess a position toward.
 */
export function anchoredMenuPosition({
  trigger,
  viewport,
  height,
  gap = 4,
  margin = MENU_VIEWPORT_MARGIN,
}) {
  if (!trigger || !viewport) return null;
  const nums = [
    trigger.top, trigger.bottom, trigger.right,
    viewport.width, viewport.height,
    height, gap, margin,
  ];
  if (!nums.every((n) => Number.isFinite(n))) return null;

  // The space each way, already net of the gap and the viewport margin — so
  // these are the heights a sheet could actually occupy, not the raw distances
  // to the edges. Clamped at 0: a trigger scrolled past the top edge has
  // NEGATIVE room above, and a negative maxHeight is not a thing.
  const roomBelow = Math.max(viewport.height - trigger.bottom - gap - margin, 0);
  const roomAbove = Math.max(trigger.top - gap - margin, 0);

  /*
   * FLIP ONLY WHEN IT HELPS, and that second clause is load-bearing.
   *
   * `height > roomBelow` alone would flip a sheet that does not fit BELOW into
   * a space that is even smaller ABOVE — which happens on a short viewport,
   * where nothing fits anywhere, and produces the worse of the two answers
   * every time. Comparing the two rooms means the fallback for "no placement
   * fits" is the roomier one, and maxHeight then makes it usable.
   *
   * Note the asymmetry: ties keep the sheet BELOW. Downward is the resting
   * behaviour a reader expects from a "•••", and a flip is a concession to
   * geometry rather than a preference — so it needs a strictly better reason,
   * not an equal one.
   */
  const above = height > roomBelow && roomAbove > roomBelow;

  /*
   * RIGHT-ALIGNED TO THE TRIGGER, which is what `right-0` inside a
   * `relative` wrapper meant before this and is preserved exactly. As a
   * distance in from the viewport's right edge, because that is what
   * `position: fixed` wants.
   *
   * Clamped to the margin so a trigger sitting at or past the right edge — a
   * narrow window, a sidebar mid-collapse — cannot push the sheet off it.
   */
  const right = Math.max(viewport.width - trigger.right, margin);

  return above
    ? {
        placement: 'above',
        right,
        bottom: viewport.height - trigger.top + gap,
        maxHeight: roomAbove,
      }
    : {
        placement: 'below',
        right,
        top: trigger.bottom + gap,
        maxHeight: roomBelow,
      };
}
