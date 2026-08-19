"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  isViewerScrollKey,
  isViewerWheel,
  stripScrollState,
} from "@/lib/home/featureStripScroll";

/**
 * The filmstrip under the featured card: EVERY item in the pool, scrolled
 * horizontally, with the one currently in the featured slot highlighted.
 *
 * ── WHAT THIS REPLACED, AND WHY THE MEANING HAD TO CHANGE ───────────────────
 * It used to show "the next three" — a window that moved every five seconds
 * while the strip itself stayed put. With a pool of ten that told the viewer
 * nothing: not how many items exist, not where they are in them, and not that
 * the row had anything to do with the card above. Three cards out of ten, all
 * of them different three cards a moment later.
 *
 * Now the strip is the WHOLE pool and it does not shift under the reader. What
 * moves is the highlight. That is the trade this component exists to make: a
 * fixed list with a moving marker is a position indicator; a moving list with
 * no marker is just churn. `aria-current` carries the same fact to assistive
 * tech, so it is not conveyed by colour alone.
 *
 * ── THEY ARE BUTTONS, NOT LINKS ─────────────────────────────────────────────
 * Clicking one does not navigate: it promotes that item into the featured slot
 * above. So this is a <button> with the pool index it selects, and the parent
 * owns the index. A link here would take the reader off the page at the exact
 * moment they were browsing the pool, and the featured card already carries
 * the real destination.
 *
 * ── THE RIGHT-HAND META SLOT IS GONE FOR GOOD ───────────────────────────────
 * The Figma drew a second value opposite the chip — "4.8 ★ (120 รีวิว)",
 * "95K views", "เริ่มเรียนได้ทันที". Nothing in this system can supply any of
 * them: there is no rating, no review count and no view count anywhere in the
 * data, and inventing one would be a number on a card that means nothing. The
 * chip keeps the left of that row to itself.
 *
 * ── THE PRICE LINE IS BUILT AND RENDERS NOTHING ─────────────────────────────
 * `price` is populated for `course` records only, and no course record exists
 * yet — so today this slot collapses on every single card. That is deliberate
 * rather than premature: the collapse path is the one that actually runs in
 * production, so it is worth having under test before anything can fill it.
 *
 * ── IMAGES ARE CONTAINED, NEVER CROPPED ─────────────────────────────────────
 * Same ruling as the featured card. The slot is the design's ~2.56:1, which is
 * close enough to the 1920×700 (2.74) legacy art that those letterbox by only
 * a few percent; a 16:9 YouTube thumbnail pillarboxes instead. The empty space
 * is the card's own panel colour and is meant to be visible — it marks which
 * records still carry legacy sizing, and it disappears by itself once Step C
 * gives the image type a 16:9 upload spec.
 *
 * ── COLOURS ─────────────────────────────────────────────────────────────────
 * Defined in the "FEATURE CONTENT SECTION" block at the bottom of
 * src/app/globals.css. TONE_CLASSES holds COMPLETE class literals, never
 * strings assembled from a key — Tailwind only emits what it can see as whole
 * text, and a class built by concatenation compiles to nothing at all while
 * the markup still looks perfect.
 */
const TONE_CLASSES = {
  gold: "bg-[var(--9e-fc-gold-bg)] text-[var(--9e-fc-gold)]",
  red: "bg-[var(--9e-fc-red-bg)] text-[var(--9e-fc-red)]",
  cyan: "bg-[var(--9e-fc-cyan-bg)] text-[var(--9e-fc-cyan)]",
};

/**
 * The edge/thumb arithmetic and the "is this the viewer?" predicates live in
 * src/lib/home/featureStripScroll.js. They moved out so they could be TESTED:
 * inside here they were reachable only through a live scroll container with a
 * real compositor, which the node suite does not have, so they were guarded by
 * nothing. This component calls those functions, so the tests exercise what
 * actually runs.
 */

/**
 * Sub-pixel slack when asking "is the active card fully inside the scrollport?".
 * Rect maths is fractional and a card that is visually flush can read as 0.3px
 * outside, which would make the strip re-scroll on every tick for no reason.
 */
const VISIBILITY_EPSILON = 2;

/**
 * The filmstrip, its edge fades, its position bar, and the controls that drive
 * the card above it.
 *
 * `controls` is a NODE, not a set of callbacks: the Play/Stop and arrow buttons
 * are bound to auto-slide state that lives in FeaturedContentSlider, and
 * threading six props down here so this component could rebuild them would put
 * that state in two places. This component owns where they sit; the slider owns
 * what they do.
 */
export function FeatureContentStrip({
  items = [],
  activeIndex = 0,
  onSelect,
  onTakeControl,
  reducedMotion = false,
  controls = null,
}) {
  const stripRef = useRef(null);

  // Edge state drives the two fades; `thumb` drives the position bar. Both are
  // derived from the same read of the same three numbers, in one place, so they
  // can never disagree about where the strip is.
  const [scrollState, setScrollState] = useState({
    atStart: true,
    atEnd: true,
    overflows: false,
    thumbWidth: 100,
    thumbLeft: 0,
  });

  const syncScrollState = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // Read the three numbers here, decide what they mean in the pure module.
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollState(stripScrollState({ scrollLeft, scrollWidth, clientWidth }));
  }, []);

  // ── WHAT IS OBSERVED, AND WHY EACH ONE IS NEEDED ──────────────────────────
  // `scroll` alone is not enough: the numbers also change when nothing scrolls.
  // A ResizeObserver on the strip catches the viewport changing and the web
  // font finishing (this section is Thai, and LINE Seed reflows the card titles
  // hard when it lands), either of which changes scrollWidth without a single
  // scroll event. Without it the fades and the thumb are correct on first paint
  // and wrong from the first reflow onwards.
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    syncScrollState();
    el.addEventListener("scroll", syncScrollState, { passive: true });
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(syncScrollState);
      ro.observe(el);
      // The content box too — a card growing is a scrollWidth change that
      // observing only the container cannot see.
      for (const child of el.children) ro.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", syncScrollState);
      ro?.disconnect();
    };
  }, [syncScrollState, items.length]);

  // ── KEEPING THE ACTIVE CARD IN VIEW ───────────────────────────────────────
  //
  // `scrollTo` ON THE STRIP, NEVER `scrollIntoView`. This is the single most
  // load-bearing line in the file. `scrollIntoView` walks every scrollable
  // ancestor up to the document and scrolls each one — including the page — so
  // on a home page it yanks the reader vertically every five seconds.
  //
  // ── THE PART THAT IS EASY TO GET WRONG ────────────────────────────────────
  // `block: 'nearest'` LOOKS like the fix and is not, and testing it carelessly
  // will tell you it is. Measured in Chrome against this page, page movement in
  // px, with a no-op run first to prove none of it is reflow drift:
  //
  //                                     strip 100%   50%     10% visible
  //     no-op (baseline)         1440        0        0        0
  //     scrollIntoView nearest   1440        0     +112     +205
  //     strip.scrollTo({left})   1440        0        0        0
  //     no-op (baseline)          375        0        0        0
  //     scrollIntoView nearest    375        0     +123     +224
  //     strip.scrollTo({left})    375        0        0        0
  //
  // With the strip fully on screen `nearest` moves nothing, which is why a
  // quick check passes it. But the section resumes auto-advance the moment ANY
  // sliver of it intersects the viewport — IntersectionObserver at threshold 0,
  // see the observer in FeaturedContentSlider — so "partly cut off" is not an
  // edge case here, it is the state the carousel spends most of its ticks in.
  // In that state `nearest` scrolls the page by up to 224px, unprompted, while
  // the reader is looking at the hero above.
  //
  // `block: 'nearest'` bounds HOW FAR the page moves. It does not stop it
  // moving, and no option does, because scrolling ancestors is what the method
  // is for. Setting `scrollLeft` — which is all `scrollTo` is, plus a behaviour
  // — touches one element and cannot reach the page at all: 0px in all six
  // cases above.
  //
  // ── AND IT ONLY MOVES WHEN IT HAS TO ──────────────────────────────────────
  // If the active card is already fully visible, nothing happens. Motion the
  // viewer did not ask for is the thing this whole component exists to reduce,
  // and re-centring a card that is already on screen is exactly that. When it
  // does move, it aligns the active card to the leading edge — which is also a
  // snap point, so scroll-snap has nothing to correct afterwards.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const card = el.children[activeIndex];
    if (!card) return;

    const stripBox = el.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();

    // Rects rather than offsetLeft: offsetLeft is measured from the offset
    // PARENT, which is only this element while it stays positioned, and it
    // ignores the strip's own scroll padding. This arithmetic holds whatever
    // the box model does.
    const fullyVisible =
      cardBox.left >= stripBox.left - VISIBILITY_EPSILON &&
      cardBox.right <= stripBox.right + VISIBILITY_EPSILON;
    if (fullyVisible) return;

    // ── LAND THE CARD CLEAR OF THE LEADING FADE, NOT UNDER IT ───────────────
    // Aligning the active card flush with the scrollport's left edge parks it
    // directly beneath the leading fade, which is 48px of solid-to-transparent
    // sitting at exactly that edge — so the one card the strip exists to
    // highlight was the one card rendered half-dimmed. Measured at 1440 before
    // this line: the active card's leading 64px was under the gradient.
    //
    // The inset is READ FROM `scroll-padding-left` rather than repeated here.
    // That property is what scroll-snap already uses to place a snapped card,
    // so taking the same number means the programmatic target and the browser's
    // own snap position are the same position by construction — no drift, and
    // one place (the class list below) to change the fade's clearance.
    const inset = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const target = el.scrollLeft + (cardBox.left - stripBox.left) - inset;
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollTo({
      left: Math.max(0, Math.min(target, maxScroll)),
      // prefers-reduced-motion gets an instant jump. The value is passed down
      // rather than read again here, so the whole section answers one query —
      // see the live matchMedia listener in FeaturedContentSlider.
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeIndex, reducedMotion]);

  // ── TELLING A FINGER APART FROM OUR OWN scrollTo ──────────────────────────
  //
  // A viewer who scrolls the strip has taken control, and auto-slide must stop
  // for good — otherwise the next advance scrolls the strip back and they are
  // fighting it. But the effect above scrolls the strip too, and if THAT
  // counted as taking control the carousel would stop itself on its first tick.
  //
  // The separation is by INPUT, not by timing. A `scroll` event cannot tell you
  // who caused it, so this listens for the things only a human produces:
  // pointerdown, a horizontally-intended wheel, and the keys that scroll a
  // container. Assigning `scrollLeft` fires none of them — it produces a
  // `scroll` event and nothing else. So the distinction is structural: there is
  // no flag to set, no timeout to expire, and no window in which a programmatic
  // scroll can be mistaken for a real one.
  //
  // The rejected alternative was a `programmatic` ref set before scrollTo and
  // cleared on `scrollend` or a timer. Both failure modes are bad and one is
  // silent: `scrollend` is not in Safari until 26, so the fallback timer is the
  // real implementation, and a smooth scroll that runs long leaves the flag set
  // while the viewer touches the strip (their swipe is ignored), while a timer
  // that fires early makes our own scroll stop the carousel.
  //
  // WHEEL IS FILTERED ON INTENT. A page scrolled vertically with the cursor
  // resting over the strip fires `wheel` here, and treating that as strip
  // intent would stop auto-slide for someone who never touched the strip. A
  // horizontal trackpad swipe has |deltaX| > |deltaY|; shift+wheel is the
  // keyboard-modified form of the same gesture and reports deltaY, so it is
  // named explicitly.
  const handleWheel = useCallback(
    (event) => {
      if (isViewerWheel(event)) onTakeControl?.();
    },
    [onTakeControl]
  );

  // Only the keys that actually scroll a container. Tab must NOT be here: it
  // moves focus through the cards and taking permanent control of the carousel
  // because someone tabbed past it would be a trap. Focus already pauses
  // auto-slide transiently, which is the right strength for that gesture.
  const handleKeyDown = useCallback(
    (event) => {
      if (isViewerScrollKey(event.key)) onTakeControl?.();
    },
    [onTakeControl]
  );

  if (items.length < 2) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* The fades are absolutely positioned against THIS box, so it has to be
          the one whose edges match the strip's visible edges — including the
          `-mx-4` bleed below md. Putting them inside the scroller instead would
          make them scroll away with the content, which is the classic version
          of this bug. */}
      <div className="relative -mx-4 md:mx-0">
        <div
          ref={stripRef}
          data-fc-strip=""
          onPointerDown={onTakeControl}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          // MOBILE: `-mx-4` on the parent plus `px-4` here bleeds the track to
          // the viewport edge, so a card can scroll all the way out instead of
          // stopping 16px short, while the first card still starts flush with
          // the heading above.
          //
          // `scroll-pl-12 md:scroll-pl-16` IS THE FADE'S CLEARANCE, and the
          // numbers are the fade's own widths — 48px, 64px from md, matching
          // .fc-strip-fade in globals.css. A snapped card therefore comes to
          // rest just past the gradient instead of under it, and what the fade
          // covers is the tail of the PREVIOUS card, which is what a fade is
          // for. The effect above reads this same property back rather than
          // hard-coding it, so the two cannot disagree.
          //
          // It costs nothing at the start: card 0 would want a negative
          // scrollLeft to honour the inset, which clamps to 0 — and the leading
          // fade is not mounted there anyway.
          //
          // `snap-mandatory` at every width, not just mobile: the programmatic
          // target above is a card's leading edge, which IS a snap point, so
          // snapping has nothing to correct and desktop wheel-scrolling lands
          // card-aligned instead of mid-card. This is requirement 4 — the
          // browser's own snapping and its own momentum, with no JS re-implement.
          //
          // `scrollbar-hide` is the repo's existing utility (globals.css): the
          // position bar below is the scroll readout, and a native bar under a
          // dark panel reads as a rendering fault next to it.
          className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-12 scroll-pr-4 px-4 pb-1 md:gap-5 md:scroll-pl-16 md:scroll-pr-0 md:px-0"
        >
          {items.map((item, index) => {
            const tone = TONE_CLASSES[item.tone] ?? TONE_CLASSES.cyan;
            const active = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                data-fc-strip-card={active ? "active" : "idle"}
                // `aria-current` and not `aria-selected`: these are not tabs and
                // there is no tablist. "true" is the generic value and is the
                // right one — none of page/step/location/date/time describes
                // "this is the one showing above".
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect?.(index)}
                aria-label={`แสดง ${item.title} ในการ์ดหลัก`}
                // ── THE ACTIVE CARD IS MARKED THREE WAYS, DELIBERATELY ──────
                // Border colour, panel brightness and opacity all move at once.
                // One of them alone is a colour difference on a dark panel that
                // a reader with low contrast vision or a bad screen can miss
                // entirely, and the whole point of the strip is that the marker
                // is findable at a glance.
                className={`group flex w-[280px] shrink-0 snap-start flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-[opacity,border-color,background-color] duration-9e-micro ease-9e md:w-[320px] ${
                  active
                    ? "border-[var(--9e-fc-accent)] bg-[var(--9e-fc-panel)] opacity-100"
                    : "border-[var(--9e-fc-panel-border)] bg-[var(--9e-fc-panel)] opacity-60 hover:border-[var(--9e-fc-accent)] hover:opacity-100"
                }`}
              >
                {/* aspect-[2.56/1] rather than the Figma's flat 140px height:
                    the ratio is the thing the ruling fixes, and a fixed height
                    would drift off it at every card width. */}
                <div className="relative aspect-[2.56/1] w-full shrink-0 overflow-hidden rounded-lg">
                  <CardImage item={item} />
                </div>

                {/* ── THE TEXT BLOCK RESERVES ITS TALLEST STATE BELOW md ────
                    Measured at 375 across the pool, the block comes out
                    47 / 67 / 87 / 107px depending on whether the title wraps to
                    two lines and whether the record has a subtitle at all.
                    Cards of different heights in one row make the row's own
                    height the tallest of whatever happens to be rendered, and
                    the strip is now the whole pool, so that is every shape at
                    once. 107px is the measured worst case, not a guess.

                    Below md only: from md the titles `truncate` to one line and
                    the heights are already constant. */}
                <div className="flex min-w-0 flex-col gap-2 max-md:min-h-[107px]">
                  {item.cardBadge ? (
                    <span
                      className={`w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
                    >
                      {item.cardBadge}
                    </span>
                  ) : null}
                  {/* No second value opposite the chip — see the note above. */}

                  {/* Two lines on a phone, one line from md. The Figma
                      truncates to a single line, and at the designed width the
                      Thai titles fit. A mobile card is 280px and they do not —
                      a one-line rule there cuts "5 งาน Excel ประจำที่ Copilot…"
                      mid-phrase. There is no mobile frame to be faithful to, so
                      the phone gets the second line and md+ keeps the design. */}
                  <p className="line-clamp-2 text-sm font-bold text-white md:truncate">
                    {item.title}
                  </p>

                  {/* Course price. Null on every record today; see the header.
                      The three parts are independent — a course with a price
                      but no "was" price renders two spans, not a struck-through
                      blank. */}
                  {item.price ? (
                    <div className="flex flex-wrap items-baseline gap-2">
                      {item.price.prefix ? (
                        <span className="text-xs text-[var(--9e-fc-text-muted)]">
                          {item.price.prefix}
                        </span>
                      ) : null}
                      {item.price.now ? (
                        <span className="text-[15px] font-extrabold text-[var(--9e-fc-emerald)]">
                          {item.price.now}
                        </span>
                      ) : null}
                      {item.price.was ? (
                        <span className="text-[11px] text-[var(--9e-fc-text-muted)] line-through">
                          {item.price.was}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Collapses on every image record — no slide_text. */}
                  {item.cardSubtitle ? (
                    <p className="line-clamp-2 text-xs text-[var(--9e-fc-text-muted)] md:truncate">
                      {item.cardSubtitle}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* MOUNTED ONLY WHEN THERE IS SOMETHING BEHIND THEM. `atStart` and
            `atEnd` are read from the same scroll numbers as the thumb, so the
            fade and the bar can never disagree — and a strip that fits with no
            overflow gets neither, because `overflows` is false and both edge
            flags are true. */}
        {scrollState.overflows && !scrollState.atStart ? (
          <div
            aria-hidden="true"
            data-fc-fade="start"
            className="fc-strip-fade fc-strip-fade-start"
          />
        ) : null}
        {scrollState.overflows && !scrollState.atEnd ? (
          <div
            aria-hidden="true"
            data-fc-fade="end"
            className="fc-strip-fade fc-strip-fade-end"
          />
        ) : null}
      </div>

      {/* ── THE BAR ROW ──────────────────────────────────────────────────────
          The arrows and Play/Stop used to sit at the top right of the section,
          level with the heading and a full card's height away from the strip
          they drive — on a phone they were above the fold while the cards were
          cut off below it, so they read as unrelated chrome. They belong next
          to the thing they move.

          ── AND BELOW lg THEY GO ON THE LEFT ────────────────────────────────
          FloatingActionDock is `fixed right-4 … lg:right-8` and describes
          itself as "the ONE fixed container that owns the bottom-right" — the
          chat launcher and the scroll-to-top button live in it. Putting these
          three controls at the row's right edge on a phone parked the
          next-arrow underneath that dock, and not transiently: the strip sits
          near the bottom of the first screenful, so the collided state is what
          a visitor sees before touching anything. Scrolling clears it, which
          is no defence — it means the control is unusable exactly when it is
          first offered.

          `flex-row-reverse` rather than a second copy of the controls or an
          `order-*` on each child: one property, applied once, and DOM order is
          untouched — which matters because the bar must stay before the
          controls for anything that reads the tree in order. Nothing is fixed
          at the bottom LEFT (the dock is the only fixed corner container), so
          the left edge is genuinely free.

          From lg the dock moves to `right-8`, the section is 1200px wide with
          the controls nowhere near the viewport edge, and the layout is signed
          off — so `lg:flex-row` puts it back exactly as it was. */}
      <div className="flex flex-row-reverse items-center gap-4 lg:flex-row">
        {/* ── THE POSITION BAR ─────────────────────────────────────────────
            aria-hidden, and that is not laziness. The strip already conveys
            position to assistive tech properly: every card is a real button
            with a real name, and the active one carries `aria-current`. A
            screen reader user gets "showing X in the main card, current" —
            which is the fact. A second announcement of the same fact as a
            geometric ratio would be noise, and this control cannot be operated
            by keyboard because it is not interactive at all.

            NOT INTERACTIVE, ON PURPOSE, FOR NOW. There is no drag handler. A
            thumb that looks draggable and is not is worse than a plain
            indicator, so it gets no grab cursor and no hover state either.

            It disappears entirely when the strip does not overflow: a thumb
            filling its whole track says "all of it is visible", which is what
            the absence of a bar already says, with less ink. */}
        {scrollState.overflows ? (
          <div
            aria-hidden="true"
            data-fc-position-bar=""
            className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--9e-fc-control)]"
          >
            <div
              data-fc-position-thumb=""
              className="h-full rounded-full bg-[var(--9e-fc-accent)]"
              // Inline, because these are continuous measurements of a live
              // scroll offset. There is no class for "31.4% wide, 12.7% along",
              // and Tailwind could not emit one if there were.
              style={{
                width: `${scrollState.thumbWidth}%`,
                marginInlineStart: `${scrollState.thumbLeft}%`,
              }}
            />
          </div>
        ) : (
          // Keeps the controls at the right of the row when the bar is absent.
          <div className="min-w-0 flex-1" />
        )}

        {controls}
      </div>
    </div>
  );
}

/** Contained thumbnail with the same one-shot maxres→hq fallback the featured
 *  slot uses. Kept local rather than shared: the two differ in `sizes` and in
 *  nothing else, and a shared component would need both passed in anyway.
 *
 *  ── LAZY, AND HERE IT ACTUALLY WORKS ───────────────────────────────────────
 *  next/image is lazy by default and this component does not opt out. That was
 *  worth checking rather than assuming, because the featured stack proved lazy
 *  loading does NOT save anything for a `visibility:hidden` slide — such an
 *  element still has a layout box inside the viewport, so the browser fetches
 *  it anyway. A card scrolled off the side of a scroll container is a different
 *  case: it is genuinely outside the scrollport, and the measurement is in the
 *  commit message. */
function CardImage({ item }) {
  const [failed, setFailed] = useState(false);
  const src = failed && item.imageFallback ? item.imageFallback : item.image;

  return (
    <Image
      key={item.id}
      src={src}
      alt={item.imageAlt}
      fill
      sizes="(min-width: 768px) 320px, 280px"
      className="object-contain object-center"
      onError={() => setFailed(true)}
    />
  );
}
