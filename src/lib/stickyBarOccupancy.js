// src/lib/stickyBarOccupancy.js
//
// The rule every sticky bottom bar uses to say how much of the viewport's
// bottom edge it is covering. ONE definition, imported by both bars that have
// one — the course detail bar (CourseStickyCTA) and the masterclass detail bar
// (inline in MasterclassDetailClient).
//
// It lives in lib rather than in one of the two components, and that is the
// point of this file existing at all. A rule shared by two callers that is
// declared inside one of them is a rule with a home-team advantage: the second
// caller either imports across a route boundary for a pure helper, or — far
// more likely, and what this repo keeps getting bitten by — quietly grows its
// own copy. Five schedule-status maps, one horizon constant written three
// ways, and a rate-limit window released in two places all started as one
// definition somebody could not import cleanly.
//
// Pure: no DOM, no React, no store. The callers measure and publish; this
// decides.

/**
 * Pure occupancy resolver: how far up from the viewport's bottom edge this bar
 * reaches RIGHT NOW. State in, number out, so the whole publish rule is
 * testable without a DOM — the effect below is a thin caller, the same shape as
 * `stickyCtaAction` and `shouldShowStickyBar`.
 *
 * This is the HEIGHT of the occupied box only. Where the box sits across the
 * width is a measurement, not a decision, so it is not resolved here: the
 * caller reads the card's left and right off its rect and publishes the two
 * together. Named ...OccupancyHeight rather than ...Clearance because
 * "clearance" is the space something else must leave, which is the consumer's
 * business and deliberately not this file's.
 *
 * ── OCCUPANCY ONLY. DO NOT RE-ADD A GAP HERE ────────────────────────────────
 * This publishes what the bar COVERS and nothing else. Spacing belongs to the
 * consumer, and that split is deliberate in both directions:
 *
 *   The dock is already anchored at bottom-8. That anchor IS its breathing
 *   room — the distance it keeps from the viewport's bottom edge when no bar
 *   is present. A gap added on this side does not replace that anchor, it
 *   STACKS on it: the first version of this function added 12px and the dock's
 *   children landed 44px above the card instead of the nominal 12. With the
 *   term gone the dock sits the same 32px above the bar that it sits above the
 *   viewport edge with no bar at all. One rhythm, not two.
 *
 *   Structurally it matters more. A gap term sourced from the dock's `gap-3`
 *   made THIS file read a class in THAT one, which needed its own guard to
 *   keep the two in step — precisely the two-files-must-agree coupling the
 *   dock was created to end, reintroduced through the back door. No term, no
 *   read, no guard.
 *
 * So: if the spacing ever looks wrong, change it in the dock. Adding a
 * summand here would fix the pixels and lose the property.
 *
 * ── ONE RULE, NOT TWO ───────────────────────────────────────────────────────
 * "Is this bar occupying screen space" has exactly one answer and both ways of
 * going away collapse into it: the X button (`dismissed`) and sliding out of
 * the reveal window (`revealed` false) are the same fact from the consumer's
 * side. Special-casing the X would leave the dock lifted over nothing every
 * time the bar slid away on scroll, which reads as a bug rather than as a
 * missing feature. Unmount is the third way, and it is the caller's cleanup.
 *
 * ── WHY A MEASURED HEIGHT AND NOT A RECT ────────────────────────────────────
 * The bar does NOT unmount when hidden; it slides away behind a 300ms
 * translate. Any rect read during that window reports a position in flight, so
 * a rect-derived clearance would chase the bar down the screen and jitter. The
 * inputs here are therefore a BOOLEAN plus a layout height measured separately
 * (see the caller: offsetHeight, which transforms do not affect).
 *
 * `bottomOffset` is the bar's own distance from the viewport edge. That one IS
 * occupancy — the strip below the card is covered by the bar's box as surely
 * as the card is, and nothing else may be placed there — and it is responsive
 * (this file's className says bottom-2 md:bottom-6). It belongs to this file,
 * so the occupied total is finished here and the consumer measures nothing.
 * Note the difference from a gap: this offset describes the bar, whereas a gap
 * would describe the relationship between the bar and something else.
 *
 * An unmeasured or nonsensical height resolves to 0 rather than to a guess.
 * The failure direction matters: 0 leaves the dock at its resting position,
 * which is merely the status quo, whereas a guessed number moves it somewhere
 * wrong and looks deliberate.
 */
export function stickyBarOccupancyHeight({
  dismissed,
  revealed,
  cardHeight,
  bottomOffset,
}) {
  if (dismissed || !revealed) return 0;
  if (!Number.isFinite(cardHeight) || cardHeight <= 0) return 0;
  const offset = Number.isFinite(bottomOffset) && bottomOffset > 0 ? bottomOffset : 0;
  return cardHeight + offset;
}
