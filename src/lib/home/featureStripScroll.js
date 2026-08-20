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
 * The scroller's three numbers → the edge state the strip draws from them.
 *
 * `overflows` gates the fades: a strip whose content fits gets neither, because
 * there is nothing behind either edge.
 *
 * `atStart` / `atEnd` are what make a fade honest — each one is mounted only
 * when its own flag is false.
 *
 * ── IT USED TO RETURN A THUMB TOO, AND THAT WAS A DIFFERENT MEASUREMENT ─────
 * `thumbWidth` / `thumbLeft` described HOW FAR ALONG THE SCROLLER the strip
 * was. The track above the strip no longer shows that: the Figma names it
 * `ตำแหน่งสไลด์` — slide position — and draws its fill at exactly 1/3 beside a
 * `03 / 09` counter, which is the carousel's index, not a scroll offset. On a
 * nine-card strip the two disagree by a lot (a scroll thumb would read 48%
 * where the slide bar reads 33%), so keeping both would have been two bars
 * claiming to be the same fact.
 *
 * The scroll geometry went with it rather than being left computed and
 * unrendered. `slidePosition` below is what the track uses now.
 *
 * Defensive on zero: a scroller that has not been laid out yet reports
 * scrollWidth 0, and every branch here still answers.
 */
export function stripScrollState({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const maxScroll = scrollWidth - clientWidth;
  return {
    overflows: maxScroll > EDGE_EPSILON,
    atStart: scrollLeft <= EDGE_EPSILON,
    atEnd: scrollLeft >= maxScroll - EDGE_EPSILON,
  };
}

/**
 * Where the carousel is, as the control row draws it: a fill percentage and the
 * `03 / 09` counter beside it.
 *
 * ── ONE FUNCTION, BECAUSE THEY MUST AGREE ──────────────────────────────────
 * The bar and the counter are two renderings of one fact, sitting 1200px apart
 * on the same row. Computed separately they drift the moment one of them is
 * changed to be 1-based and the other is not — and a bar that says a third
 * while the text says `04 / 09` is the kind of defect nobody files because each
 * half looks right on its own.
 *
 * ── THE COUNTER IS 1-BASED AND THE FILL IS TOO ─────────────────────────────
 * Slide 1 of 9 fills 1/9, not 0. A bar that is empty on the first slide says
 * "nothing has been seen yet", which is wrong the moment the first card is on
 * screen — and the last slide then fills it completely, which is the fact.
 *
 * ── PADDING IS TWO DIGITS, OR THE WIDTH OF THE TOTAL WHEN THAT IS MORE ──────
 * The Figma shows `03 / 09` at NINE items, so the leading zero is not the width
 * of the total — at nine that width is one. It is a floor of two, which is the
 * convention the label is copying and the thing that stops `9 / 9` reading as a
 * fragment. The floor alone would print `03 / 100` at a hundred items, mixing
 * widths inside one label, so the width is the larger of the two: two digits up
 * to 99, and the total's own width past it.
 *
 * An empty or single-item pool returns 0% and no label: the control row does
 * not mount at all below two items, and a `01 / 01` counter beside a full bar
 * is ink spent saying there is nothing to move through.
 */
export function slidePosition({ index = 0, total = 0 } = {}) {
  if (!Number.isFinite(total) || total < 2) return { percent: 0, label: null };
  const at = Math.min(Math.max(Math.trunc(index) || 0, 0), total - 1);
  const width = Math.max(2, String(total).length);
  return {
    percent: ((at + 1) / total) * 100,
    label: String(at + 1).padStart(width, '0') + ' / ' + String(total).padStart(width, '0'),
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
