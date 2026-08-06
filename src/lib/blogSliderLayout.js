// src/lib/blogSliderLayout.js
//
// How many landing article cards the slider shows at once, and how to keep the
// slide index legal when that number changes.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// BlogSlider used a hardcoded `perPage = 4` at every width from md up, while
// the static grid it stands in for (rendered instead whenever there are ≤ 4
// featured articles) went 2 → 3 → 4 across the same breakpoints. So five
// featured articles produced roughly double the density of four, in the same
// section, and at md the card was 172px wide — too narrow for the title and
// excerpt it already renders, never mind a chip.
//
// ── THE LAYOUT IS CSS; THIS IS ONLY FOR THE ARROWS ──────────────────────────
// Card widths are responsive Tailwind classes, so the slider is laid out
// correctly on the first paint with no JavaScript. What JS still needs perPage
// for is `maxIndex` — whether to show an arrow, and clamping. That is why the
// component may start from the SSR default and correct itself in an effect
// without any hydration mismatch: server and client both render the same
// initial value, and the effect runs after hydration.

/**
 * MUST MATCH tailwind.config.js `screens`.
 *
 * Two sources that have to agree — the CSS breakpoints come from Tailwind, and
 * these drive the arrow arithmetic. They are pinned equal by a test that reads
 * the real config, because a silent divergence here shows up as an arrow that
 * appears one breakpoint early and nothing else.
 */
export const BLOG_SLIDER_BREAKPOINTS = { lg: 1024, xl: 1280 };

/**
 * Cards per view at a given viewport width.
 *
 * Deliberately the same ladder as the static grid: `sm:grid-cols-2
 * lg:grid-cols-3 xl:grid-cols-4`. Below lg it is 2 — the slider only renders
 * inside `hidden md:block`, so widths under 768px never reach a user, but the
 * function is total anyway rather than undefined down there.
 */
export function perPageForWidth(width) {
  if (width >= BLOG_SLIDER_BREAKPOINTS.xl) return 4;
  if (width >= BLOG_SLIDER_BREAKPOINTS.lg) return 3;
  return 2;
}

/**
 * Keep the slide index inside the range `perPage` allows.
 *
 * THE CASE THIS EXISTS FOR: page count depends on perPage, so widening the
 * window shrinks maxIndex. A reader parked on the last page at md (perPage 2,
 * maxIndex = n − 2) who widens to xl (perPage 4, maxIndex = n − 4) is suddenly
 * past the end, and the track scrolls to a blank slide. Narrowing is safe —
 * maxIndex grows — but the clamp covers both directions rather than reasoning
 * about which one can bite.
 */
export function clampSlideIndex(index, itemCount, perPage) {
  const maxIndex = Math.max(0, itemCount - perPage);
  return Math.min(Math.max(0, index), maxIndex);
}
