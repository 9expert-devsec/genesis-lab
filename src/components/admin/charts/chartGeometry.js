/**
 * Pure geometry for the admin charts — no React, no DOM. Unit-tested in
 * test/pure/chartGeometry.
 */

/**
 * "Nice" y-axis ticks from 0: steps of 1, 2 or 5 × 10^n, 4–6 ticks (3–5
 * intervals), the top rounded UP to a whole step. The smallest step that fits
 * wins, so the chart uses the most of its height.
 *
 * `integer`: never a fractional step (counts). A small integer max that cannot
 * reach 4 ticks with step 1 gets 0..3 instead of 0, 0.5, 1.
 *
 * @returns {{ top: number, step: number, ticks: number[] }}
 */
export function niceTicks(max, { integer = false } = {}) {
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  const exp = Math.floor(Math.log10(m));
  for (let e = exp - 2; e <= exp + 1; e++) {
    for (const mult of [1, 2, 5]) {
      const step = mult * 10 ** e;
      if (integer && step < 1) continue;
      const intervals = Math.ceil(m / step - 1e-9);
      if (intervals >= 3 && intervals <= 5) return build(step, intervals);
    }
  }
  return build(1, Math.max(3, Math.ceil(m)));
}

function build(step, intervals) {
  // Rounded to the step's own precision so 0.2 × 3 prints as 0.6, not 0.6000000000000001.
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => Number((i * step).toFixed(digits)));
  return { top: ticks[ticks.length - 1], step, ticks };
}

/** Index of the x in `xs` (ascending) nearest to `x`. -1 for an empty list. */
export function nearestIndex(x, xs) {
  if (!xs?.length) return -1;
  let best = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  }
  return best;
}

/**
 * Where the tooltip card goes, in container pixels. It sits to the RIGHT of
 * the guide line unless that would overflow the container, then to the LEFT;
 * either way it is clamped inside [0, containerWidth - cardWidth], so it is
 * never clipped — even when the card is wider than the space on both sides.
 *
 * @returns {{ side: 'left'|'right', left: number }}
 */
export function cardPosition({ anchorX, cardWidth, containerWidth, gap = 12 }) {
  const maxLeft = Math.max(0, containerWidth - cardWidth);
  const right = anchorX + gap;
  if (right + cardWidth <= containerWidth) return { side: 'right', left: Math.min(right, maxLeft) };
  const left = anchorX - gap - cardWidth;
  return { side: 'left', left: Math.min(Math.max(0, left), maxLeft) };
}

/** The tooltip's lines as one sentence, for the aria-live region. */
export function tooltipText(point) {
  if (!point) return '';
  const meta = (point.meta ?? []).map((m) => `${m.label} ${m.value}`);
  return [point.line1, point.line2, ...meta].filter(Boolean).join(' · ');
}

/**
 * Line 2 of the tooltip for a point: the formatted value, or why there is none.
 * `notCollectedBefore`: index of the first collected point (see LineChart).
 */
export function pointValueText(value, index, notCollectedBefore, format) {
  if (typeof value === 'number' && Number.isFinite(value)) return format(value);
  if (Number.isFinite(notCollectedBefore) && index < notCollectedBefore) return 'ยังไม่เริ่มเก็บ';
  return 'ไม่มีข้อมูล';
}
