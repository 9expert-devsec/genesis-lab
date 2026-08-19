"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Globe,
  GraduationCap,
  Lightbulb,
  LineChart,
  Pause,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useSwipe } from "@/hooks/useSwipe";
import { BANNER_TYPES } from "@/lib/banners/bannerTypes";
import { FeatureContentCards } from "./FeatureContentCards";

/**
 * The Feature Content board: section header, the featured card, and the three
 * small cards under it.
 *
 * ── THE FEATURED CARD HAS TWO LAYOUTS, CHOSEN BY TYPE ───────────────────────
 * `image` records are ARTWORK ONLY — the picture fills the whole card and the
 * whole card is one link. There is no badge, headline, description or button
 * over it on desktop, because the artwork already contains all of that: what
 * looks like a button in these banners is painted into the JPEG. Drawing our
 * own chrome on top would double every element the designer already drew.
 *
 * Everything else (`video`, and `course`/`article` when they arrive) keeps the
 * text-left / media-right split, because those records carry real text fields
 * that have to be laid out as text.
 *
 * The branch is on the NORMALISED type from the mapper — never on
 * `banner.type`, and never on a substring. `startsWith('image')` answers true
 * for four different legacy ids and for the new one, which is exactly the bug
 * that shape always turns into.
 *
 * ── THE VIDEO PLAYS HERE, NOT ON YOUTUBE ────────────────────────────────────
 * Facade pattern: the card shows YouTube's thumbnail and a play button, and the
 * <iframe> is created only when someone clicks it. Nothing from youtube.com is
 * requested on page load — this is a landing page, and an eagerly-mounted embed
 * costs ~1MB and several round trips before anyone has asked for a video.
 *
 * ── LEAVING A SLIDE UNMOUNTS ITS PLAYER ─────────────────────────────────────
 * Advancing while a video is playing DESTROYS the iframe. It is not hidden, not
 * paused via postMessage, not left in the tree with `display:none` — removed.
 * A hidden iframe keeps playing audio from a card nobody can see, and there is
 * no way for the viewer to work out where the sound is coming from. See
 * `playingId` below: it is keyed to the item id, so a slide change makes the
 * mount condition false and React takes the node out.
 */

/**
 * The 16 icon names `feature_tags.icon` may hold — see FEATURE_TAG_ICONS in
 * src/lib/schemas/banner.js, which is what the admin form offers.
 *
 * COMPLETE LITERALS, mapped here rather than in the data module, because a
 * database can store `"Sparkles"` and cannot store a React component. An
 * unknown name renders no icon rather than throwing.
 */
const TAG_ICONS = {
  Users,
  TrendingUp,
  Rocket,
  Target,
  Award,
  Lightbulb,
  BookOpen,
  Briefcase,
  Globe,
  Cpu,
  LineChart,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  Zap,
  Star,
};

/** How long each slide holds before the next one, in ms. */
const AUTO_ADVANCE_MS = 5000;

export function FeaturedContentSlider({ copy, items = [] }) {
  const [index, setIndex] = useState(0);
  const cardRef = useRef(null);
  const sectionRef = useRef(null);
  const total = items.length;

  // ── AUTO-SLIDE STATE ──────────────────────────────────────────────────────
  // `userStopped` is SEPARATE from the three transient pauses below and that
  // separation is the whole rule: hover, focus, off-screen and a mounted video
  // all resume by themselves when the condition clears, but a viewer who
  // pressed an arrow or pressed Stop has taken control, and nothing may hand it
  // back except their own Play press. One combined "paused" flag cannot express
  // that — it would resume the moment the pointer left.
  const [userStopped, setUserStopped] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  // prefers-reduced-motion decides whether auto-slide may START at all. It is
  // not a pause: someone with the setting on who presses Play has asked for it
  // explicitly and gets it.
  //
  // ── READ IN AN EFFECT, NOT IN A useState INITIALISER ──────────────────────
  // The initialiser version of this shipped a HYDRATION MISMATCH and React said
  // so out loud: "some attributes of the server rendered HTML didn't match the
  // client properties. This won't be patched up." The server has no matchMedia,
  // so it rendered `data-fc-paused="offscreen"`, while the client's first render
  // computed "reduced-motion" — and because React 19 does not patch mismatched
  // ATTRIBUTES, the DOM kept the server's value permanently.
  //
  // An effect runs after the first client render, so server and client agree on
  // `false` and the correction is an ordinary state update. It also makes the
  // query LIVE: a viewer who turns the setting on mid-visit gets it honoured,
  // which is what a media query is for and what reading it once cannot do.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (total ? (i + 1) % total : 0));
  }, [total]);

  const prev = useCallback(() => {
    setIndex((i) => (total ? (i - 1 + total) % total : 0));
  }, [total]);

  /** Any deliberate navigation: arrows, swipe, or picking a small card. */
  const takeControl = useCallback((move) => {
    setUserStopped(true);
    move();
  }, []);

  // Swipe LEFT reveals the NEXT item — the same direction mapping the banner
  // carousel uses, so two bands on one page do not disagree about the gesture.
  // A swipe is deliberate navigation, so it stops auto-slide like an arrow.
  useSwipe(cardRef, {
    onSwipeLeft: () => takeControl(next),
    onSwipeRight: () => takeControl(prev),
  });

  // ── OFF-SCREEN PAUSE ──────────────────────────────────────────────────────
  // A carousel that advances while nobody is looking is work nobody asked for:
  // it burns a timer, a re-render and an image decode per tick, and on a long
  // page it does that for the entire visit. IntersectionObserver rather than a
  // scroll listener — the browser already tracks this and a scroll handler
  // would run on every frame to recompute what the observer hands over.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // No observer (jsdom, very old browser) → treat as visible rather than
      // permanently frozen. Failing towards "it works" is right for decoration.
      setOnScreen(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      // Any sliver counts. A stricter threshold would stall the carousel while
      // it is half-visible, which reads as broken rather than considerate.
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── THE TIMER ─────────────────────────────────────────────────────────────
  // One effect, and every pause condition is a dependency of it, so there is no
  // "is it still allowed to run?" check inside the callback — the interval
  // simply does not exist while any condition holds. That is why leaving the
  // section cannot leave a stray tick queued.
  const autoPlaying =
    !userStopped &&
    !reducedMotion &&
    !hovering &&
    !focusWithin &&
    !playingId &&
    onScreen &&
    total > 1;

  useEffect(() => {
    if (!autoPlaying) return undefined;
    const id = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [autoPlaying, next]);

  // Changing slide tears the player down. Keyed on the id rather than a bare
  // boolean so that returning to the same slide does not resurrect it.
  const current = Math.min(index, total ? total - 1 : 0);
  const item = total ? items[current] : null;
  useEffect(() => {
    setPlayingId(null);
  }, [current]);

  // The next three, wrapping, and never the current one. `total - 1` is the cap
  // so a pool of 2 yields 1 card and a pool of 3 yields 2 — "show what exists
  // without padding". Each entry carries its index in the POOL, because
  // clicking card 2 must promote pool item 7.
  const upcoming = useMemo(() => {
    const out = [];
    for (let step = 1; step <= Math.min(3, total - 1); step += 1) {
      const at = (current + step) % total;
      out.push({ item: items[at], index: at });
    }
    return out;
  }, [current, items, total]);

  if (!total || !item) return null;

  const hasPool = total > 1;
  const isImageOnly = item.type === BANNER_TYPES.IMAGE;

  return (
    // The pause handlers live on ONE wrapper around the whole section body, so
    // the header arrows, the card and the small cards are all "inside" for the
    // purposes of hover and focus. `onFocus`/`onBlur` (not focusin/focusout
    // listeners) because React's synthetic versions already bubble, which the
    // native ones do not.
    <div
      ref={sectionRef}
      className="flex w-full flex-col gap-8"
      // Auto-slide state, reflected into the DOM so it can be OBSERVED rather
      // than inferred from whether a slide happened to move within a timeout.
      // Six conditions gate the timer and "it did not advance" cannot tell you
      // WHICH one held — including the case where none did and the test simply
      // measured the wrong element. `data-fc-paused` names the reason.
      data-fc-autoplay={autoPlaying ? "on" : "off"}
      data-fc-paused={
        userStopped
          ? "user"
          : reducedMotion
            ? "reduced-motion"
            : playingId
              ? "video"
              : hovering
                ? "hover"
                : focusWithin
                  ? "focus"
                  : !onScreen
                    ? "offscreen"
                    : "none"
      }
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={() => setFocusWithin(false)}
    >
      {/* ── Section header ───────────────────────────────────────────────
          `sm:items-end` so the controls sit on the baseline of the description
          rather than floating level with the eyebrow. Below sm they drop under
          the copy — at 390px there is no room for the text block and three
          controls on one line. */}
      <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-[800px] flex-col gap-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--9e-fc-accent)]">
            {copy.eyebrow}
          </p>
          <h2 className="text-[26px] font-bold leading-tight text-white lg:text-[34px]">
            {copy.title}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--9e-fc-text-muted)]">
            {copy.description}
          </p>
        </div>

        {hasPool ? (
          <div className="flex shrink-0 items-center gap-3">
            <SliderButton
              label={
                autoPlaying
                  ? "หยุดเลื่อนอัตโนมัติ"
                  : "เริ่มเลื่อนอัตโนมัติ"
              }
              onClick={() => setUserStopped((s) => !s)}
            >
              {autoPlaying ? (
                <Pause className="h-4 w-4" strokeWidth={2} />
              ) : (
                <Play className="h-4 w-4" strokeWidth={2} />
              )}
            </SliderButton>
            <SliderButton
              label="คอนเทนต์ก่อนหน้า"
              onClick={() => takeControl(prev)}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </SliderButton>
            <SliderButton
              label="คอนเทนต์ถัดไป"
              onClick={() => takeControl(next)}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </SliderButton>
          </div>
        ) : null}
      </div>

      {/* ── EVERY SLIDE IS RENDERED, STACKED IN ONE GRID CELL ─────────────
          The container therefore sizes itself to the TALLEST slide, and the
          height stops changing when the active slide does.

          ── WHY THIS EXISTS ────────────────────────────────────────────────
          Below lg the two layouts are genuinely different heights — an image
          card is the artwork alone (~150px at 375) while a split card stacks
          thumbnail above title, description and chips (~700px). Rendering one
          at a time meant auto-slide reflowed the whole page every five
          seconds. The empty space under a short slide is the accepted cost;
          a page that jumps under the reader's thumb is not.

          ── WHY CSS AND NOT A MEASURED HEIGHT ──────────────────────────────
          The obvious alternative is to measure the tallest slide in JS and
          set the container to it. That number is wrong the moment anything
          changes it: a resize, a webfont finishing (this section is Thai,
          which reflows hard when LINE Seed loads), a description that wraps
          to one more line, an image whose aspect resolves late. Each of those
          needs its own listener and each is a chance to be wrong until the
          next one fires. A grid track computes the same number from the same
          content, continuously, with nothing to keep in sync.

          `col-start-1 row-start-1` on every child is what overlaps them; the
          track then takes the max of their heights, which is exactly the
          reservation being asked for.

          ── THE INACTIVE SLIDES MUST NOT EXIST FOR THE READER ──────────────
          `invisible` is visibility:hidden, NOT opacity-0 — it keeps the box
          (so the track stays tall) while removing the subtree from the tab
          order and from the accessibility tree. `inert` says the same thing
          explicitly and covers the browsers that treat visibility loosely.
          It is `inert=""` and not `inert={true}` because this is React 18,
          which does not know `inert` is a boolean attribute and would warn.

          The swipe ref moved to this container: it wraps every slide, so the
          gesture works whichever one is showing. */}
      <div ref={cardRef} className="grid">
        {items.map((slide, i) => {
          const active = i === current;
          return (
            <div
              key={slide.id}
              data-fc-slide={active ? "active" : "inactive"}
              aria-hidden={active ? undefined : "true"}
              inert={active ? undefined : "true"}
              className={
                active
                  ? "col-start-1 row-start-1"
                  : "col-start-1 row-start-1 invisible"
              }
            >
              {slide.type === BANNER_TYPES.IMAGE ? (
                <ImageOnlyCard item={slide} active={active} />
              ) : (
                <SplitCard
                  item={slide}
                  active={active}
                  // Belt and braces on `active`: playingId already resets on
                  // every index change, and an inactive slide's play button is
                  // inert, so neither alone should be able to mount a player
                  // off-screen. Both are cheap and the failure they prevent —
                  // audio from a card nobody can see — is the worst one here.
                  isPlaying={active && playingId === slide.id}
                  onPlay={() => setPlayingId(slide.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {hasPool ? (
        <FeatureContentCards
          cards={upcoming}
          onSelect={(at) => takeControl(() => setIndex(at))}
        />
      ) : null}
    </div>
  );
}

/**
 * THE FEATURED FRAME: height = width / 2.5, capped at 480px.
 *
 * ── WHY A RATIO AND NOT A FIXED HEIGHT ──────────────────────────────────────
 * A flat 480px was fine at 1280+, where the container is pinned at its 1200px
 * max-width and 1200/480 IS 2.5:1. Below that the container narrows while 480
 * does not, so the frame gets proportionally taller and `object-cover` takes
 * more and more off the SIDES of art that is always 2.743:1. Measured before
 * this change: 4.3% per side at 1280 and up, 8.5% at 1152, 13.4% at 1024.
 *
 * Nothing readable was being lost even at 13.4% — these banners carry ~258px of
 * empty gradient at each end and every one of the five survived the crop. What
 * WAS being lost is that margin: at 1024 the artwork's headline and logo row
 * sat flush against the frame edge with no gutter at all, which reads as a
 * mistake rather than a design. Restoring it is the point.
 *
 * ── WHY max-h AND NOT ONLY THE RATIO ────────────────────────────────────────
 * Past 1200px of container the ratio would keep growing the card taller with
 * the viewport, so the cap holds it at the designed 480. The two meet exactly
 * at a 1200px container (1200/2.5 = 480), so there is no step where the rule
 * changes hands — it is one continuous curve that simply stops climbing.
 *
 * ── BOTH LAYOUTS TAKE THE SAME CLASSES, AND THAT IS THE REQUIREMENT ─────────
 * An image slide and a video slide MUST be the same height at the same width.
 * They alternate under auto-slide, and a height difference would make the page
 * jump every five seconds. One constant, applied to both shells.
 *
 * `min-h-0` is load-bearing: without it a flex container's automatic minimum
 * size lets tall content override the aspect ratio, and the split card would
 * quietly grow past the image card at narrow widths — reintroducing exactly
 * the mismatch this exists to prevent.
 */
const FEATURED_FRAME = "lg:aspect-[2.5/1] lg:max-h-[480px] lg:min-h-0";

/**
 * The featured card's corner radius.
 *
 * 24px is the Figma value the card has always carried, and it is also exactly
 * `borderRadius['9e-xl']` in tailwind.config.js — so this is the repo's own
 * largest radius token, not a number invented here.
 *
 * TWO CONSTANTS, BOTH COMPLETE LITERALS, and that is not redundancy. Tailwind
 * scans raw text: it can see `rounded-[24px]` and `max-lg:rounded-[24px]`
 * written out, and it can see NEITHER if one is assembled as
 * `"max-lg:" + CARD_RADIUS`. That form emits perfect markup and zero CSS,
 * which this repo has shipped before. Keep them in step by hand; there is no
 * safe way to derive one from the other.
 */
const CARD_RADIUS = "rounded-[24px]";
const CARD_RADIUS_BELOW_LG = "max-lg:rounded-[24px]";

/**
 * `image` records: the artwork, full width, nothing drawn over it.
 *
 * ── object-cover, NOT object-contain ────────────────────────────────────────
 * Measured on all five live image records: the art is 2.743:1 and the frame at
 * 1440 is 1200×480 = 2.500:1, so cover scales to fill the height and takes
 * 8.9% off the WIDTH — 4.4% from each side, and nothing at all off the top or
 * bottom. That is a safe crop for these banners: their text sits centred, and
 * the margin is the empty gradient at each end.
 *
 * The crop grows as the card narrows, because the frame ratio does but the art
 * does not. At a 1024 viewport the frame is ~976×480 = 2.03:1 and cover takes
 * ~26% off the width. `object-center` keeps that symmetric.
 *
 * ── MOBILE GETS THE DESCRIPTION, DESKTOP DOES NOT ───────────────────────────
 * On a phone the artwork is ~340px wide and the text painted inside it is
 * unreadable, so the record's own description is repeated below as real text.
 * On desktop the artwork is legible and the same text would be a duplicate.
 */
function ImageOnlyCard({ item, active }) {
  const body = (
    <>
      {/* ONE ratio below lg, and it is the DESKTOP frame's ratio (1200×480 =
          2.5:1) rather than a phone-shaped one.
          The first attempt used 16:9 here and it cut the banner's own headline
          in half: 16:9 onto 2.743:1 art is a 35% width crop, and "EARLY Bird!
          AI Digital Marketing Creator Masterclass" rendered as "APLY …
          asterclass". These records carry their message INSIDE the picture, so
          a crop that eats the message defeats the type.
          Matching 2.5:1 makes the crop 8.9% of the width at EVERY viewport —
          the same 4.4% off each side the desktop card takes — instead of
          something that worsens as the screen narrows. It is a short band on a
          phone (375/2.5 = 150px) and that is the artwork's real shape. */}
      {/* ── THE ARTWORK ROUNDS ITSELF, BUT ONLY BELOW lg ──────────────────
          From lg the artwork fills the shell (measured: 1198×478 inside a
          1200×480 shell, inset 1px by the border), so it reaches the corners
          and the shell's own `overflow-hidden` + 24px radius already clips it
          round. Nothing to add there, and adding it anyway would round a box
          that sits 1px inside the clip — a hairline of panel showing through
          each corner.

          Below lg the card fills the reserved height and centres the artwork,
          which leaves it inset 216px top and bottom at 375. It never touches
          the shell's corners, so the clip does nothing and the banner rendered
          with square ones inside a rounded panel. It needs its own radius, and
          it is the SAME radius — see CARD_RADIUS above.

          `overflow-hidden` alongside it because the <Image> is a positioned
          fill child: a radius on the wrapper alone would not clip it. */}
      <div
        className={`relative aspect-[2.5/1] w-full overflow-hidden lg:h-full lg:aspect-auto ${CARD_RADIUS_BELOW_LG}`}
      >
        <SlideImage
          item={item}
          active={active}
          sizes="(min-width: 1280px) 1200px, (min-width: 1024px) 92vw, 100vw"
        />
      </div>

      {item.description ? (
        <p className="px-4 pb-4 pt-3 text-[13px] leading-relaxed text-[var(--9e-fc-text-muted)] lg:hidden">
          {item.description}
        </p>
      ) : null}
    </>
  );

  // `max-lg:h-full` + centring: the grid reserves the tallest slide's height,
  // and below lg that is a video card (~568px at 375) against an image card's
  // ~150px band of artwork. Without this the difference was 418px of raw page
  // background under the banner, which reads as a failed render rather than as
  // reserved space. Filling the panel and centring the artwork inside it puts
  // the same empty space behind a border and a background, where it looks like
  // a deliberate frame. The reservation is unchanged — only where the gap sits.
  //
  // From lg the frame's own ratio already governs and every slide is the same
  // height, so none of this applies.
  const shell =
    "block w-full overflow-hidden border border-[var(--9e-fc-panel-border)] " +
    CARD_RADIUS + " " +
    "bg-[var(--9e-fc-panel)] shadow-[0_16px_32px_0_rgba(0,0,0,0.5)] " +
    "max-lg:flex max-lg:h-full max-lg:flex-col max-lg:justify-center " +
    FEATURED_FRAME;

  // No usable link_url → a plain box. Never an <a> with no href: that is not a
  // link, it is a div that lies to the accessibility tree.
  if (!item.href) {
    return (
      <div data-fc-card="image" className={shell}>
        {body}
      </div>
    );
  }

  // Same internal / external / mailto rules the carousel applies, resolved in
  // the mapper. `target=_blank` needs `rel=noopener` or the opened tab can
  // reach back through `window.opener`.
  const external = item.linkKind === "external";
  return (
    <Link
      href={item.href}
      data-fc-card="image"
      aria-label={item.title}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : null)}
      className={`${shell} transition-opacity duration-9e-micro ease-9e hover:opacity-95`}
    >
      {body}
    </Link>
  );
}

/** `video` (and later `course`/`article`): text left, media right. */
function SplitCard({ item, active, isPlaying, onPlay }) {
  return (
    <div
      // Marks the featured card's outer shell. Both layouts carry it, which is
      // what makes "do an image slide and a video slide have the same height?"
      // a question that can be ASKED of the DOM rather than inferred from a
      // class name that may be refactored away.
      data-fc-card="split"
      aria-roledescription="carousel"
      aria-label="คอนเทนต์เด่น"
      className={`flex w-full flex-col-reverse gap-5 overflow-hidden rounded-[24px] border border-[var(--9e-fc-panel-border)] bg-[var(--9e-fc-panel)] p-4 shadow-[0_16px_32px_0_rgba(0,0,0,0.5)] sm:p-5 lg:flex-row lg:gap-7 lg:p-7 ${FEATURED_FRAME}`}
    >
      {/* Details. `lg:min-w-0` is load-bearing on a flex child holding long
          unbroken Thai — without it the panel refuses to shrink below its
          content's intrinsic width and shoves the media off the card. */}
      <div className="flex flex-col justify-center gap-4 lg:h-full lg:min-w-0 lg:flex-1 lg:gap-5">
        <div className="flex flex-col gap-3">
          {item.badge ? (
            <div className="flex w-fit items-center gap-1.5 rounded-lg bg-[var(--9e-fc-badge-bg)] px-3 py-1">
              <Star
                className="h-3.5 w-3.5 shrink-0 text-[var(--9e-fc-accent)]"
                strokeWidth={2}
              />
              <p className="text-xs font-bold text-[var(--9e-fc-accent)]">
                {item.badge}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            {/* Every slot below is guarded. The mapper returns null — never ''
                — for anything the Banner model cannot supply, and today that
                is kicker, both title accents and the subtitle on EVERY record.
                A `''` would still occupy a line box and still pull the gap
                above it; null removes the element. */}
            {item.kicker ? (
              <p className="text-sm font-semibold text-[var(--9e-fc-text-muted)]">
                {item.kicker}
              </p>
            ) : null}

            {/* h3, not h2 — the section already spent its h2 on the heading
                above, and this is one item inside that section. */}
            <h3 className="text-[26px] font-extrabold leading-[1.15] text-white lg:text-[34px]">
              <span className="block">{item.title}</span>
              {item.titleAccent || item.titleHighlight ? (
                <span className="block">
                  {item.titleAccent ? (
                    <span className="text-[var(--9e-fc-accent)]">
                      {item.titleAccent}
                    </span>
                  ) : null}
                  {item.titleAccent && item.titleHighlight ? " " : null}
                  {item.titleHighlight ? (
                    <span className="text-[var(--9e-fc-gold)]">
                      {item.titleHighlight}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </h3>

            {item.subtitle ? (
              <p className="text-sm font-medium text-[var(--9e-fc-text-body)]">
                {item.subtitle}
              </p>
            ) : null}
          </div>

          {item.description ? (
            <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--9e-fc-text-muted)]">
              {item.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {/* NEVER A DEAD BUTTON, and there is only one button now: the
              thumbnail is the play control, so `ดูวิดีโอ` was a second
              affordance for an action the media panel already offers. */}
          {item.href ? (
            <div className="flex flex-wrap gap-3">
              <Link
                href={item.href}
                {...(item.linkKind === "external"
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : null)}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-9e-action px-5 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-action-scale-100"
              >
                <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                ดูรายละเอียด
              </Link>
            </div>
          ) : null}

          {/* The hairline belongs TO the chip row, so it goes when the row
              goes. On a record with no feature_tags a rule with nothing under
              it would read as a rendering fault. */}
          {item.meta.length ? (
            <>
              <hr className="w-full border-0 border-t border-[var(--9e-fc-rule)]" />
              <MetaRow chips={item.meta} />
            </>
          ) : null}
        </div>
      </div>

      {/* Media. 16:9 at every width — the video source is YouTube and YouTube
          is natively 16:9, so any other ratio would letterbox or crop every
          video forever. */}
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-2xl bg-black lg:w-[58%] lg:self-center xl:w-[640px]">
        {isPlaying && item.videoId ? (
          <VideoEmbed videoId={item.videoId} title={item.title} />
        ) : (
          <VideoFacade item={item} active={active} onPlay={onPlay} />
        )}
      </div>
    </div>
  );
}

/**
 * YouTube's play mark, drawn by us.
 *
 * ── OUR SVG, IN OUR MARKUP, AND THAT IS THE WHOLE POINT ─────────────────────
 * The facade exists so that nothing from youtube.com is fetched until someone
 * asks for a video. Getting the real mark by mounting the player early, or by
 * pulling in an iframe_api script, would hand back exactly the ~1MB and the
 * round trips the facade was built to avoid. So the mark is two paths.
 *
 * The geometry is YouTube's own: a 68×48 viewBox, the rounded "TV" body, and a
 * triangle from (27,14) to (45,24) to (27,34). Rendering it at any width keeps
 * those proportions, so it reads as the real control at 68px on the featured
 * slot and would at 40px on a card.
 *
 * `currentColor` on the body rather than a baked red: the hover and focus
 * states are then a text-colour change on the button, which is one rule
 * instead of two elements swapping classes.
 */
function YouTubePlayMark({ className }) {
  return (
    <svg
      viewBox="0 0 68 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M66.52 7.74a8.55 8.55 0 0 0-6.02-6.05C55.19.13 34 0 34 0S12.81.13 7.5 1.69A8.55 8.55 0 0 0 1.48 7.74C0 13.09 0 24 0 24s0 10.91 1.48 16.26a8.55 8.55 0 0 0 6.02 6.05C12.81 47.87 34 48 34 48s21.19-.13 26.5-1.69a8.55 8.55 0 0 0 6.02-6.05C68 34.91 68 24 68 24s0-10.91-1.48-16.26Z"
      />
      <path fill="#fff" d="M27 34V14l18 10-18 10Z" />
    </svg>
  );
}

/**
 * The un-played state: YouTube's own thumbnail, plus the chrome.
 *
 * The whole panel is ONE button when the record has a video, so the click
 * target is the picture rather than a 68px mark in the middle of it.
 *
 * ── NO BRAND CHIP AT THE TOP LEFT ───────────────────────────────────────────
 * A "9Expert" chip used to sit there. It is gone — it labelled our own
 * thumbnail with our own name on our own site.
 *
 * ── WHICH MARKS ARE OURS, MEASURED RATHER THAN ASSUMED ──────────────────────
 * Three things looked like badges on a video thumbnail. Checked against the raw
 * asset (i.ytimg.com/vi/<id>/maxresdefault.jpg), which settled which was which:
 *
 *   top-left  "9Expert" chip        WAS ours   → removed
 *   bottom-right "Watch on YouTube" WAS ours   → removed. The raw thumbnail
 *                                                carries no such mark, so this
 *                                                was our markup despite looking
 *                                                baked in. With the real
 *                                                YouTube play mark now sitting
 *                                                on the same image, two YouTube
 *                                                marks was one too many.
 *   top-right "9Expert" logo        NOT ours   → painted into the video's own
 *                                                thumbnail by whoever made it.
 *                                                Nothing here can remove it,
 *                                                and nothing here should try.
 *
 * So the only chrome this component now draws over a thumbnail is the play
 * control itself.
 */
function VideoFacade({ item, active, onPlay }) {
  const playable = Boolean(item.videoId);

  const content = (
    <>
      <SlideImage
        item={item}
        active={active}
        sizes="(min-width: 1280px) 640px, (min-width: 1024px) 58vw, 100vw"
      />

      {playable ? (
        // Sized as YouTube sizes it — 68px wide on a large thumbnail, smaller
        // on a phone where the thumbnail itself is ~340px. The drop shadow is
        // ours: YouTube's own button sits on video frames that are usually
        // busy, and these thumbnails are too.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 block w-[54px] -translate-x-1/2 -translate-y-1/2 text-[#f00] opacity-90 drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)] transition duration-9e-micro ease-9e group-hover:scale-110 group-hover:opacity-100 sm:w-[68px]"
        >
          <YouTubePlayMark className="block h-auto w-full" />
        </span>
      ) : null}

    </>
  );

  if (!playable) return content;

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`เล่นวิดีโอ ${item.title}`}
      // The global focus rule offsets the ring against --page-bg, which is
      // WHITE in light mode — invisible intent on a black thumbnail. The offset
      // is pinned to the card's own panel colour instead, and inset so the ring
      // is not clipped by the panel's rounded corner.
      className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--9e-fc-accent)] focus-visible:ring-offset-0"
    >
      {content}
    </button>
  );
}

/**
 * The played state. Mounted ONLY after a click, and unmounted the moment the
 * slide changes — see the note at the top of this file for why hiding it is
 * not an acceptable substitute.
 *
 * `youtube-nocookie.com` rather than `youtube.com`: it is the same player
 * without the tracking cookie on a viewer who has not asked for one.
 * `autoplay=1` is honest here — the mount only happens because someone pressed
 * play, so nothing starts by itself.
 */
function VideoEmbed({ videoId, title }) {
  const src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` +
    `?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <iframe
      key={videoId}
      data-feature-video={videoId}
      src={src}
      title={title}
      className="absolute inset-0 h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}

/**
 * The chip row, and its shape changes with the breakpoint because the DATA is
 * a pair, not a sentence.
 *
 * `feature_tags` stores {icon, line1, line2} — a label and a value. Mobile
 * draws that as the mockup does: line1 above line2, with a vertical rule
 * between chips. Desktop has the width to lay the pair on one line, joined by
 * a middle dot. Nothing is dropped at either width.
 *
 * ── WHY MOBILE IS A 2-COLUMN GRID AND NOT A WRAPPING FLEX ROW ───────────────
 * The divider is a `border-l`, so it must only ever appear BETWEEN two chips
 * on the same line — never at the start of one. A wrapping flex row cannot
 * express that: CSS has no "is this item first on its line" selector, so the
 * third chip wraps and draws a stray rule down the left margin. Both the lg
 * row and the mobile row shipped that defect before this comment existed.
 *
 * A 2-column grid makes the position deterministic instead of wrap-dependent:
 * `nth-child(even)` is ALWAYS column two, so `max-lg:even:border-l` is always
 * an internal divider.
 */
function MetaRow({ chips }) {
  return (
    <div className="grid grid-cols-2 items-stretch gap-x-4 gap-y-3 lg:flex lg:flex-wrap lg:gap-x-6">
      {chips.map((chip, i) => {
        const Icon = chip.icon ? TAG_ICONS[chip.icon] : null;
        return (
          <div
            key={`${chip.line1 ?? ""}-${chip.line2 ?? ""}-${i}`}
            className="flex items-center gap-1.5 max-lg:even:border-l max-lg:even:border-[var(--9e-fc-rule)] max-lg:even:pl-4"
          >
            {Icon ? (
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-[var(--9e-fc-text-body)]"
                strokeWidth={2}
              />
            ) : null}
            <span className="flex min-w-0 flex-col leading-tight lg:flex-row lg:items-center lg:gap-1">
              {chip.line1 ? (
                <span className="text-xs text-[var(--9e-fc-text-body)]">
                  {chip.line1}
                </span>
              ) : null}
              {chip.line1 && chip.line2 ? (
                <span
                  aria-hidden="true"
                  className="hidden text-xs text-[var(--9e-fc-text-muted)] lg:inline"
                >
                  ·
                </span>
              ) : null}
              {chip.line2 ? (
                <span className="text-xs text-[var(--9e-fc-text-muted)]">
                  {chip.line2}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A slide's picture, with a one-shot source fallback.
 *
 * ── ONLY THE ACTIVE SLIDE HAS A PICTURE AT ALL ──────────────────────────────
 * Every slide is now in the DOM so the grid can reserve the tallest height,
 * and that turns image loading into a real question: ten cards, one of them a
 * 1.4MB banner, all with layout boxes inside the viewport.
 *
 * `loading="lazy"` does NOT save us here, and that was measured rather than
 * assumed. A `visibility:hidden` element still has a layout box and still
 * intersects the viewport, so the browser treats a lazy image inside it as
 * in-view and fetches it anyway. Measured at 375 with the cache disabled,
 * counting only this section's own image requests:
 *
 *   inactive slides render a lazy <img>   13 requests, 175 KB
 *   inactive slides render no <img>        6 requests,  60 KB
 *
 * The lazy version pulled all five YouTube thumbnails and three extra banners
 * for cards nobody could see.
 *
 * So an inactive slide renders NO <img> at all. Nothing is lost by it: the
 * height these slides exist to contribute comes from the aspect-ratio boxes
 * (`aspect-[2.5/1]` on an image card, `aspect-[16/9]` on a video panel), which
 * size themselves without a pixel of image data. The network profile is
 * therefore identical to rendering one slide at a time — which is what it was
 * before this change, and what it has to stay.
 *
 * `key` on the <Image> resets the fallback when the item changes: without it,
 * an item that had fallen back would keep the previous item's flag and skip
 * straight past its own maxres.
 *
 * WHY A FALLBACK AT ALL: a YouTube `maxresdefault.jpg` is only generated for
 * videos uploaded above a certain resolution. All five ids in the pool have one
 * today — an observation, not a guarantee about the sixth video somebody
 * uploads. `hqdefault.jpg` (480×360) always exists. We swap once and never
 * again, so a broken fallback cannot loop.
 */
function SlideImage({ item, active, sizes }) {
  const [failed, setFailed] = useState(false);
  if (!active) return null;
  const src = failed && item.imageFallback ? item.imageFallback : item.image;

  return (
    <Image
      key={item.id}
      src={src}
      alt={item.imageAlt}
      fill
      sizes={sizes}
      className="object-cover object-center"
      onError={() => setFailed(true)}
    />
  );
}

/** 36px round control, matching the frame. Real <button>s, so Tab / Enter /
 *  Space work natively and the label is announced. The label is passed in
 *  already reflecting state — "หยุด…" vs "เริ่ม…" — because a control whose
 *  name does not change with its function is unusable by screen reader. */
function SliderButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--9e-fc-control-border)] bg-[var(--9e-fc-control)] text-white transition-colors duration-9e-micro ease-9e hover:border-[var(--9e-fc-accent)] hover:text-[var(--9e-fc-accent)]"
    >
      {children}
    </button>
  );
}
