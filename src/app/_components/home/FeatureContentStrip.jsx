"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  isViewerScrollKey,
  isViewerWheel,
  slidePosition,
  stripScrollState,
} from "@/lib/home/featureStripScroll";

/**
 * The filmstrip under the featured card: EVERY item in the pool, scrolled
 * horizontally, with the one currently in the featured slot highlighted — and,
 * above it, the control row that drives the card.
 *
 * Figma: `Desktop Featured Content Carousel Mockup` (38:3012) and
 * `Mobile Featured Content Carousel Mockup` (38:3231), file
 * TLKzWZOYVUHl0PHUTseUD9.
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
 * ── THE DESCRIPTION LINE IS A DELIBERATE DIVERGENCE FROM THE MOCKUP ─────────
 * Both carousel frames draw a card body of chip + title and nothing else. This
 * keeps `cardSubtitle` underneath, on purpose and against the drawing: it is
 * the only thing on a strip card that distinguishes two records whose titles
 * begin with the same words, and the pool is now the whole collection rather
 * than three cards. Everything else on this row follows the mockup.
 *
 * ── IMAGES ARE COVERED AND CROPPED. THIS REVERSES A RULING. ─────────────────
 * The slot used to be the design's ~2.56:1 with `object-contain`, chosen so
 * that 2.74 banner art letterboxed by a few percent rather than losing any of
 * itself. The mockup replaces that with a 16:9 frame and says how it is filled:
 * its own note reads "Card Banner: Cover + Focal Point".
 *
 * 16:9 onto 2.743 art is a 35.2% width crop — measured on all five live
 * records, every one of which is exactly 2.743 — and a CENTRED 35% crop eats
 * the first word of every banner's headline (see the note on `image_focal` in
 * src/models/Banner.js for what "EARLY … Masterclass" becomes). That is what
 * the focal point exists for: `item.objectPosition` is the record's own stored
 * anchor, or the centre when it has none, resolved once in the mapper.
 *
 * A YouTube `maxresdefault` is 1280×720 — 16:9 exactly — so a video card
 * crops nothing at all and the pillarboxing this slot used to show is gone.
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
 * The line under the strip on a phone, from the mobile mockup (node 38:3456).
 *
 * Mobile only, and that is what the mockup draws — the desktop frame has no
 * such line. It is also the honest place for it: the sentence begins with
 * "ปัดซ้าย–ขวา" (swipe left–right), which is a gesture a mouse does not have.
 */
const STRIP_HINT =
  "ปัดซ้าย–ขวา หรือเลือกการ์ด เพื่อดูการเปลี่ยนระหว่าง Banner และ Video Template";

/**
 * The filmstrip, the control row above it, its edge fades, and the hint line.
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

  // Edge state drives the two fades, and now ONLY the two fades — the bar above
  // is the carousel's position, not the scroller's. See stripScrollState.
  const [scrollState, setScrollState] = useState({
    atStart: true,
    atEnd: true,
    overflows: false,
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
  // scroll event. Without it the fades are correct on first paint and wrong
  // from the first reflow onwards.
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
    //
    // It costs nothing at the start: card 0 would want a negative scrollLeft to
    // honour the inset, which clamps to 0 — and the leading fade is not mounted
    // there anyway.
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

  const position = slidePosition({ index: activeIndex, total: items.length });

  return (
    <div data-fc-strip-region="" className="flex flex-col gap-3">
      {/* ── THE CONTROL ROW ──────────────────────────────────────────────────
          BELOW THE STAGE AND ABOVE THE STRIP, which is where both mockup frames
          put it (desktop node 38:3043, mobile 38:3286) and which is why it is
          the FIRST child of this component rather than the last: the slider
          renders the stage, then this, so "first child here" is "between them"
          without either component knowing about the other's box.

          It used to sit below the strip, and before that at the top right of
          the section opposite the heading — a full featured card away from the
          row it drives, and on a phone above the fold while the cards were cut
          off below it.

          ── AND THE ARROWS ARE ON THE LEFT AT EVERY WIDTH NOW ───────────────
          This row used to be `flex-row-reverse … lg:flex-row`, put there
          because FloatingActionDock is `fixed right-4 … lg:right-8` and owns
          the bottom-right corner: three controls at the row's right edge parked
          the next-arrow underneath the chat launcher on a phone, in the state a
          visitor sees before touching anything.

          The mockup independently puts the buttons at the row's left edge at
          BOTH widths (desktop x=0 of 1480, mobile x=0 of 398), so the reversal
          is gone rather than merely still working: one order, no breakpoint,
          and the collision it was avoiding cannot come back because there is no
          width at which these controls sit on the right. Nothing else is fixed
          at the bottom left — the dock is the only fixed corner container. */}
      <div className="flex items-center gap-3 lg:gap-4">
        {controls}

        {/* ── THE POSITION BAR ─────────────────────────────────────────────
            THIS IS THE CAROUSEL'S POSITION, NOT THE SCROLLER'S, and the change
            of meaning is the point. It used to be a scroll thumb: how far along
            the strip's own overflow the reader had scrolled. The mockup names
            this element `ตำแหน่งสไลด์` — slide position — draws its fill at
            exactly one third beside a `03 / 09` counter, and gives it a fixed
            5px track (1230×5 desktop, 178×5 mobile). On a nine-card strip a
            scroll thumb would have read 48% where this reads 33%, so the two
            were never the same fact drawn twice; they were two facts, one of
            which nobody asked for.

            aria-hidden, and that is not laziness. The strip already conveys
            position to assistive tech properly: every card is a real button
            with a real name, and the active one carries `aria-current`. A
            screen reader user gets "showing X in the main card, current" —
            which is the fact. A second announcement of the same fact as a
            geometric ratio would be noise, and this control cannot be operated
            by keyboard because it is not interactive at all.

            NOT INTERACTIVE, ON PURPOSE. There is no drag handler. A thumb that
            looks draggable and is not is worse than a plain indicator, so it
            gets no grab cursor and no hover state either. */}
        <div
          aria-hidden="true"
          data-fc-position-bar=""
          className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--9e-fc-control)]"
        >
          <div
            data-fc-position-thumb=""
            className="h-full rounded-full bg-[var(--9e-fc-accent)] transition-[width] duration-9e-micro ease-9e"
            // Inline, because this is a continuous measurement of a live index
            // over a live total. There is no class for "33.3% wide", and
            // Tailwind could not emit one if there were.
            style={{ width: `${position.percent}%` }}
          />
        </div>

        {/* The counter. `tabular-nums` so the digits do not shift the box as
            the index advances — the label is fixed-width by construction (both
            sides padded to the width of the total, see slidePosition) and a
            proportional font would undo that at the glyph level.

            NOT aria-hidden, unlike the bar: this one says the fact in words,
            and it is the only place the pool's SIZE is stated. `aria-live` is
            deliberately absent — an announcement every five seconds during
            auto-slide would be unusable. */}
        <span
          data-fc-counter=""
          className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--9e-fc-text-muted)]"
        >
          {position.label}
        </span>
      </div>

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
          // the heading above. It is also what the mobile mockup draws: its
          // card row is 414 wide inside a 398 section, i.e. peeking past the
          // section edge rather than stopping at it.
          //
          // `scroll-pl-12 md:scroll-pl-16` IS THE FADE'S CLEARANCE, and the
          // numbers are the fade's own widths — 48px, 64px from md, matching
          // .fc-strip-fade in globals.css. A snapped card therefore comes to
          // rest just past the gradient instead of under it, and what the fade
          // covers is the tail of the PREVIOUS card, which is what a fade is
          // for. The effect above reads this same property back rather than
          // hard-coding it, so the two cannot disagree.
          //
          // `snap-mandatory` at every width, not just mobile: the programmatic
          // target above is a card's leading edge, which IS a snap point, so
          // snapping has nothing to correct and desktop wheel-scrolling lands
          // card-aligned instead of mid-card.
          //
          // `scrollbar-hide` is the repo's existing utility (globals.css): the
          // position bar above is the readout, and a native bar under a dark
          // panel reads as a rendering fault next to it.
          className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-12 scroll-pr-4 px-4 pb-1 md:scroll-pl-16 md:scroll-pr-0 md:px-0"
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
                //
                // ── `lg:w-[22%]` IS THE MOCKUP'S CARD, NOT A TUNED NUMBER ───
                // The desktop frame is 1920 wide with a 1480 content column and
                // a 330px card: 330/1480 = 22.3%. This section's content column
                // is the repo's own `max-w-[1200px]`, not the Figma's 1480 —
                // the same normalisation the section header already documents
                // for the previous 1440 artboard — so the card is expressed as
                // that RATIO rather than as the artboard's pixels.
                //
                // A percentage rather than the scaled 264px because it keeps
                // the mockup's promise at every lg width instead of only at the
                // 1200 cap. Four cards plus three 16px gaps is 88% + 48px, so
                // at a 1200 container that is 1152px and leaves 48px — one more
                // gap and an 80px peek of the fifth card, which is 30% of a
                // card against the mockup's own 28%. At a 976 container (a 1024
                // viewport) the same expression still yields four full cards
                // and a 53px peek. A fixed pixel width gives three at that
                // width, which is the layout this replaced.
                //
                // Below lg the width stays in pixels: a percentage of a 375px
                // phone would shrink the card as the phone got smaller, which
                // is the wrong direction — the text inside has a floor.
                className={`group flex w-[280px] shrink-0 snap-start flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-[opacity,border-color,background-color] duration-9e-micro ease-9e md:w-[320px] lg:w-[22%] ${
                  active
                    ? "border-[var(--9e-fc-accent)] bg-[var(--9e-fc-panel)] opacity-100"
                    : "border-[var(--9e-fc-panel-border)] bg-[var(--9e-fc-panel)] opacity-60 hover:border-[var(--9e-fc-accent)] hover:opacity-100"
                }`}
              >
                {/* 16:9, from both mockup frames — 328×184.5 desktop and
                    308×173.25 mobile are each 1.7778 to four figures. A ratio
                    and not a fixed height, because the card width is now a
                    percentage and a fixed height would drift off the ratio at
                    every width it is not exactly right at. */}
                <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg">
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

                  {/* Kept against the mockup — see the header. Collapses on
                      every image record, which have no slide_text. */}
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
            `atEnd` are read from the same scroll numbers as each other, so the
            two fades can never disagree — and a strip that fits with no
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

      {/* The mobile mockup's closing line. `lg:hidden` because the desktop
          frame does not draw it and because it describes a swipe. */}
      <p
        data-fc-hint=""
        className="text-center text-[11px] leading-relaxed text-[var(--9e-fc-text-muted)] lg:hidden"
      >
        {STRIP_HINT}
      </p>
    </div>
  );
}

/** Cropped thumbnail with the same one-shot maxres→hq fallback the featured
 *  slot uses. Kept local rather than shared: the two differ in `sizes` and in
 *  nothing else, and a shared component would need both passed in anyway.
 *
 *  ── COVER, AND THE ANCHOR COMES FROM THE RECORD ────────────────────────────
 *  See the header. `object-position` is a per-record measurement out of the
 *  database, so it is an inline style — there is no class for "34% 61%" and
 *  Tailwind could not emit one if there were. The mapper resolves it to the
 *  centre when the record has no focal point, so this never has a fallback of
 *  its own to drift from that one.
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
      // 22% of a 1200 container is 264; the two smaller steps are the pixel
      // widths above. Ordered widest-first, as the spec requires.
      sizes="(min-width: 1024px) 264px, (min-width: 768px) 320px, 280px"
      className="object-cover"
      style={{ objectPosition: item.objectPosition }}
      onError={() => setFailed(true)}
    />
  );
}
