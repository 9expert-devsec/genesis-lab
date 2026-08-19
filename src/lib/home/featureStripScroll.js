/**
 * The filmstrip's two decisions, as plain functions.
 *
 * ── WHY THEY LEFT THE COMPONENT ─────────────────────────────────────────────
 * Both are pure arithmetic over numbers the DOM hands us, and both encode a
 * rule that is easy to get subtly wrong and impossible to see going wrong:
 *
 *   1. WHICH EDGE FADES ARE HONEST. A fade at an edge with nothing behind it
 *      tells the reader there is more when there is not.
 *   2. WHICH SCROLLS ARE THE VIEWER'S. Getting this wrong in one direction
 *      makes auto-slide stop itself on its own first tick; in the other it
 *      makes the carousel fight the reader's finger.
 *
 * Inside FeatureContentStrip they could only be exercised through a live
 * scroll container with a real compositor — which the node suite has none of,
 * so they were guarded by nothing. Out here they are ordinary functions with
 * ordinary inputs, and the component calls THESE, so a test of them is a test
 * of what actually runs rather than of a second copy that agrees today.
 *
 * NO REACT, NO DOM. Nothing here touches an element; callers read the three
 * numbers off the scroller and pass them in.
 */

/**
 * How close to an edge still counts as "at the edge", in px.
 *
 * Not zero. `scrollLeft` is fractional on a zoomed or fractionally-scaled
 * display and `scrollWidth - clientWidth` rounds independently of it, so an
 * exact comparison leaves a strip that is visually at its end reporting one
 * stray pixel of remaining scroll — which mounts a trailing fade over nothing.
 * That is precisely the lying fade this exists to prevent.
 */
export const EDGE_EPSILON = 2;

/**
 * The scroller's three numbers → everything the strip draws from them.
 *
 * `overflows` gates BOTH the fades and the position bar, so a strip whose
 * content fits gets neither: no fade, because there is nothing either way, and
 * no bar, because a thumb filling its whole track says "all of it is visible"
 * with more ink than saying nothing does.
 *
 * `atStart` / `atEnd` are what make a fade honest — each one is mounted only
 * when its own flag is false.
 *
 * Thumb geometry is in PERCENT of the track, because the track's width is a
 * flex result the component never measures.
 *
 * Defensive on zero: a scroller that has not been laid out yet reports
 * scrollWidth 0, and dividing by it would put NaN into a style attribute.
 */
export function stripScrollState({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const maxScroll = scrollWidth - clientWidth;
  return {
    overflows: maxScroll > EDGE_EPSILON,
    atStart: scrollLeft <= EDGE_EPSILON,
    atEnd: scrollLeft >= maxScroll - EDGE_EPSILON,
    thumbWidth: scrollWidth > 0 ? (clientWidth / scrollWidth) * 100 : 100,
    thumbLeft: scrollWidth > 0 ? (scrollLeft / scrollWidth) * 100 : 0,
  };
}

/**
 * The keys a browser scrolls a container with.
 *
 * Tab is deliberately NOT here. It moves focus through the cards, and taking
 * PERMANENT control of the carousel because someone tabbed past it would be a
 * trap — focus already pauses auto-slide transiently, which is the right
 * strength for that gesture. Enter and Space are not here either: they
 * activate a card, which goes through onSelect and takes control that way.
 */
export const SCROLL_INTENT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Does this key press scroll the strip, and therefore count as the viewer? */
export function isViewerScrollKey(key) {
  return SCROLL_INTENT_KEYS.has(key);
}

/**
 * Does this wheel event mean "scroll the strip", or is it the page going by?
 *
 * A page scrolled vertically with the cursor resting over the strip fires
 * `wheel` on the strip, and treating that as strip intent would stop
 * auto-slide for someone who never touched it. A horizontal trackpad swipe has
 * |deltaX| > |deltaY|; shift+wheel is the keyboard-modified form of the same
 * gesture and reports its movement on deltaY, so it is named explicitly.
 *
 * A tie (equal magnitudes, including 0/0) is NOT intent: a diagonal drift that
 * happens to be balanced is not someone asking for the strip, and 0/0 is an
 * event that moved nothing at all.
 */
export function isViewerWheel({ deltaX = 0, deltaY = 0, shiftKey = false } = {}) {
  return shiftKey || Math.abs(deltaX) > Math.abs(deltaY);
}
