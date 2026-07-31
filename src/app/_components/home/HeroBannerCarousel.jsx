"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useSwipe } from "@/hooks/useSwipe";
import { resolveBannerLink, warnBlockedBannerLink } from "@/lib/bannerLinkUrl";

/**
 * Public hero banner carousel.
 *
 * - Auto-advances every 5s. Pauses on hover, when the user clicks Pause,
 *   or when they click the YouTube iframe (window blur while the iframe
 *   holds focus).
 * - Filters banner types by viewport: desktop (≥ lg) sees
 *   `image_desktop` / `image_button_desktop` / `youtube`; mobile sees
 *   `image_mobile` / `image_button_mobile` / `youtube`.
 * - YouTube slide re-orders on mobile: video on top, text below, centered.
 */
export function HeroBannerCarousel({ banners: allBanners }) {
  const { banners, isMobile } = useFilteredBanners(allBanners ?? []);
  const total = banners.length;

  const [current, setCurrent] = useState(0);
  // Respect prefers-reduced-motion — initialize isPlaying to false if user prefers reduced motion
  const [isPlaying, setIsPlaying] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  // Distinct from isPointerDown: true only once a mouse drag crosses the 5px
  // threshold, false on a plain press. Gates the YouTube iframe's
  // pointer-events-none — see the note on handlePointerDown for why this must
  // NOT engage on mere pointer-down.
  const [isActivelyDragging, setIsActivelyDragging] = useState(false);
  const intervalRef = useRef(null);
  const sectionRef = useRef(null);
  const trackContainerRef = useRef(null);
  const dragRef = useRef({ startX: 0, isDragging: false, moved: false });

  const next = useCallback(() => {
    setCurrent((i) => (total ? (i + 1) % total : 0));
  }, [total]);

  const prev = useCallback(() => {
    setCurrent((i) => (total ? (i - 1 + total) % total : 0));
  }, [total]);

  // Reset index when the filtered list changes (e.g., resize across breakpoint)
  useEffect(() => {
    setCurrent(0);
  }, [total]);

  // Auto-advance while playing and not hovered
  useEffect(() => {
    if (total <= 1) return undefined;
    if (!isPlaying || isHovered) return undefined;
    intervalRef.current = setInterval(next, 3000);
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, isHovered, next, total]);

  // Pause when the YouTube iframe steals focus (user clicked Play inside)
  useEffect(() => {
    function handleBlur() {
      const iframe = sectionRef.current?.querySelector("iframe");
      if (iframe && document.activeElement === iframe) {
        setIsPlaying(false);
      }
    }
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // Touch swipe — the hook attaches native touch listeners with
  // { passive: false } on touchmove so iOS Safari doesn't pre-empt
  // the gesture.
  useSwipe(trackContainerRef, {
    onSwipeLeft: next,
    onSwipeRight: prev,
  });

  // Mouse drag (desktop only) — pointer events fire for mouse; touch goes
  // through useSwipe alone (filtered by pointerType below).
  //
  // We deliberately DO NOT call setPointerCapture. Capturing the pointer on
  // pointerdown retargets the subsequent click — a compatibility mouse event —
  // to this container, so a plain click on a CTA <a> / image link is dispatched
  // at the container (an ANCESTOR of the link) and navigation silently no-ops.
  // That was the desktop-only dead-link bug. Instead we track the drag with
  // window-level listeners registered on pointerdown, so a click that never
  // moves is never captured and native anchor behaviour is left intact.
  //
  // KNOWN LIMITATION of not capturing: while the cursor is over the YouTube
  // slide's CROSS-ORIGIN iframe, pointer events go to the iframe's own document
  // and this window stops receiving them, so a drag crossing the video card
  // would lose tracking mid-gesture. Mitigation: the video card is given
  // `pointer-events-none` while ACTIVELY DRAGGING (isActivelyDragging), so the
  // iframe cannot swallow the drag.
  //
  // That mitigation does TWO jobs, and the second one is load-bearing rather
  // than a nicety: it is also what lets the terminating POINTERUP reach this
  // window when the drag is released over the video. Without it, a drag that
  // ends on the iframe never runs onUp — so isActivelyDragging stays true, the
  // three window listeners stay attached, and the next click is suppressed by a
  // `moved` flag nothing ever cleared. The transparency is self-healing: once
  // the threshold makes the iframe transparent, every remaining event of that
  // gesture — move AND up — is guaranteed to come back to us.
  //
  // WHY THE GATE IS "actively dragging", NOT "pointer down": engaging
  // pointer-events-none on mousedown — before the 5px threshold — would make the
  // iframe stop hit-testing during a plain click-to-play, so the click could
  // resolve against an ancestor and the video would not play. That is the very
  // click-lands-on-an-ancestor failure this change exists to fix, moved to a new
  // place. Gating on the threshold keeps the iframe interactive for every click
  // and only makes it transparent once a real drag is underway.
  //
  // RESIDUAL COST, documented and accepted: a drag that STARTS on the iframe
  // cannot be tracked at all and will not advance the carousel. The mechanism is
  // NOT "the threshold isn't reached in time" — handlePointerDown NEVER RUNS.
  // The pointerdown is dispatched inside the iframe's own document and does not
  // cross the cross-origin boundary, so this component never learns a gesture
  // began, registers no listeners, and has no state to flip. NO THRESHOLD VALUE
  // CAN HELP: lowering the 5px, or engaging pointer-events-none on pointerdown,
  // fixes nothing here (there is no pointerdown to act on) and reintroduces the
  // dead-click bug described above. Do not "fix" it that way. The trade is
  // deliberate — clicking the video (common) must win over dragging from exactly
  // on top of it (rare), and a drag started anywhere else on the slide still
  // crosses the video fine.
  const dragCleanupRef = useRef(null);

  const handlePointerDown = useCallback(
    (e) => {
      if (e.pointerType !== "mouse") {
        // A touch interaction. Clear any stale mouse-drag flag before its click:
        // `moved` gates click-suppression, a touch pointerdown fires BEFORE the
        // touch's compatibility click, and a mouse drag that produced no click
        // (e.g. released outside the window) would otherwise leave moved===true
        // and swallow the next tap on a hybrid device.
        dragRef.current.moved = false;
        return;
      }
      dragRef.current = { startX: e.clientX, isDragging: true, moved: false };
      setIsHovered(true);
      setIsPointerDown(true);
      setIsActivelyDragging(false);

      const onMove = (ev) => {
        if (Math.abs(ev.clientX - dragRef.current.startX) > 5) {
          dragRef.current.moved = true;
          // State (not just the ref) so the iframe gate re-renders once, at the
          // threshold crossing. React bails on setState(true) when already true,
          // so this fires exactly one re-render per drag.
          setIsActivelyDragging(true);
        }
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        dragCleanupRef.current = null;
      };
      const onUp = (ev) => {
        const diff = ev.clientX - dragRef.current.startX;
        cleanup();
        dragRef.current.isDragging = false;
        setIsHovered(false);
        setIsPointerDown(false);
        setIsActivelyDragging(false);
        // `moved` is intentionally NOT reset here. The click fires AFTER this
        // pointerup, and handleClickCapture must still see moved===true to
        // suppress the drag's click. It is cleared by that click handler, or —
        // if the drag produced no click — by the next pointerdown (either type).
        if (Math.abs(diff) > 50) {
          if (diff < 0) next();
          else prev();
        }
      };
      const onCancel = () => {
        cleanup();
        dragRef.current.isDragging = false;
        dragRef.current.moved = false; // a cancel is followed by no click
        setIsHovered(false);
        setIsPointerDown(false);
        setIsActivelyDragging(false);
      };

      dragCleanupRef.current = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [next, prev],
  );

  // Remove any dangling drag listeners if we unmount mid-gesture.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Suppress the click that terminates a mouse drag so a swipe doesn't also fire
  // the link under the cursor. `moved` ALONE decides: a plain click (no movement
  // past the 5px threshold) has moved===false and passes straight through to the
  // anchor; a drag has moved===true and is cancelled even when released over a
  // CTA. Touch swipes are already suppressed by preventDefault() inside useSwipe.
  function handleClickCapture(e) {
    if (dragRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
    dragRef.current.moved = false;
  }

  if (!total) return null;

  const showPause = isPlaying && !isHovered;

  return (
    <section
      ref={sectionRef}
      className="w-full relative bg-gradient-to-br from-white to-[#E8F4FD] dark:from-9e-navy dark:to-9e-card min-[1537px]:py-[16px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Container: full-width below 1537px, capped at 1440px and rounded above.
          Mobile swipe is handled by useSwipe via trackContainerRef;
          mouse drag is handled by pointer events filtered to
          pointerType==='mouse'. */}
      <div
        ref={trackContainerRef}
        className="relative mx-auto h-[550px] max-sm:h-[700px] overflow-hidden
          min-[1537px]:max-w-[1440px] min-[1537px]:rounded-3xl
          select-none"
        style={{
          touchAction: isMobile ? "pan-y" : "auto",
          cursor: isMobile ? "grab" : "auto",
        }}
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
      >
        {/* Sliding track — all slides laid out horizontally, transformed into view.
            translateX % is relative to the TRACK'S own width (N × container),
            so moving by 1 container-width is (100 / N)%, not 100%. */}
        <div
          className={`flex h-full ${
            isPointerDown ? "" : "transition-transform duration-500 ease-in-out"
          }`}
          style={{
            transform: `translateX(-${(current * 100) / total}%)`,
            width: `${total * 100}%`,
          }}
        >
          {banners.map((b, i) => (
            <div
              key={b._id ?? i}
              className="h-full shrink-0"
              style={{ width: `${100 / total}%` }}
            >
              <BannerSlide
                banner={b}
                isActive={i === current}
                isFirst={i === 0}
                isDragging={isActivelyDragging}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Arrows live OUTSIDE the overflow-hidden track so they (a) can't be
          clipped at the right edge when a scrollbar appears and (b) don't
          fight with the track's pointerdown drag handler. The section is
          already `relative`, so absolute positioning anchors here. */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="ก่อนหน้า"
            className="hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 z-40
              w-10 h-10 bg-white/80 hover:bg-white dark:bg-9e-card/80 dark:hover:bg-9e-card rounded-full shadow-9e-md
              items-center justify-center transition-colors"
          >
            <ChevronLeft size={20} className="text-9e-navy dark:text-white" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="ถัดไป"
            className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 z-40
              w-10 h-10 bg-white/80 hover:bg-white dark:bg-9e-card/80 dark:hover:bg-9e-card rounded-full shadow-9e-md
              items-center justify-center transition-colors"
          >
            <ChevronRight size={20} className="text-9e-navy dark:text-white" />
          </button>
        </>
      )}

      {/* Dots + Play/Pause — centered on the full section */}
      {total > 1 && (
        <div className="absolute bottom-5 left-0 right-0 flex justify-center z-20 px-4 pointer-events-none">
          <div className="flex items-center  bg-black/25 px-4 py-2 rounded-full pointer-events-auto">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`ไปยังสไลด์ ${i + 1}`}
                onClick={() => setCurrent(i)}
                className="relative flex w-6 h-6 lg:h-8 lg:w-8 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-200 ${
                    i === current
                      ? "w-6 h-1.5 lg:w-8 lg:h-2.5 bg-white shadow-9e-sm"
                      : "w-1.5 h-1.5 lg:w-2.5 lg:h-2.5 bg-white/50 hover:bg-white/80"
                  }`}
                />
              </button>
            ))}

            <span aria-hidden className="w-px h-3 bg-white/40 mx-2" />

            <button
              type="button"
              onClick={() => setIsPlaying((v) => !v)}
              aria-label={isPlaying ? "หยุดสไลด์" : "เล่นสไลด์"}
              className="flex w-6 h-6 lg:h-8 lg:w-8 items-center justify-center
                text-white hover:text-white/80 transition-colors"
            >
              {showPause ? (
                <Pause size={14} fill="white" />
              ) : (
                <Play size={14} fill="white" />
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Filter banners by viewport. `youtube` is shown on both; image types
 * are mobile-only vs desktop-only based on their suffix.
 *
 * Server render + initial client render see `isMobile = false` (desktop
 * banners) — the effect re-checks on mount. A brief flash on narrow
 * screens is acceptable here since the hero is above the fold anyway.
 */
function useFilteredBanners(allBanners) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024); // lg breakpoint
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Memoize so the filtered array keeps a stable identity across renders
  // — otherwise `[total]` effects and the track map re-fire unnecessarily.
  const banners = useMemo(
    () =>
      allBanners.filter((b) => {
        if (b.type === "youtube") return true;
        if (isMobile) {
          return b.type === "image_mobile" || b.type === "image_button_mobile";
        }
        return b.type === "image_desktop" || b.type === "image_button_desktop";
      }),
    [allBanners, isMobile],
  );

  return { banners, isMobile };
}

/**
 * Resolve a banner's link_url, and make a refusal audible.
 *
 * Every clickable surface in this file goes through here so the three slide
 * types cannot drift apart — they read ONE admin field and must treat it the
 * same way. See src/lib/bannerLinkUrl.js for why the guard is a blocklist.
 */
function bannerLinkFor(banner) {
  const link = resolveBannerLink(banner.link_url);
  if (link.kind === "blocked") warnBlockedBannerLink(banner);
  return link;
}

/**
 * Render `children` inside the anchor element the resolved link calls for.
 * Callers must check `link.href` first — this renders nothing meaningful for
 * an unlinked banner, because "no link" is a layout decision (a bare div, a
 * hidden CTA) that only the caller can make.
 *
 * `rel="noopener noreferrer"` is not decoration: without it the opened tab
 * gets a live `window.opener` handle back to this page.
 */
function BannerAnchor({ link, className, children }) {
  // ── draggable={false} IS LOAD-BEARING, NOT TIDINESS ────────────────────────
  // An <a href> is a NATIVE DRAG SOURCE: mousedown plus movement starts a link
  // drag with a ghost image and a URL payload. Once the browser begins that
  // drag it STOPS DELIVERING pointermove, so the carousel's window listeners
  // go silent mid-gesture — the drag never crosses the 5px threshold, `moved`
  // stays false, no slide change, and the user is left dragging a translucent
  // copy of the banner across the page.
  //
  // The old `<div role="link">` was not a drag source, so this is a hazard the
  // anchor INTRODUCED. The <Image> inside always was one and already carried
  // draggable={false}; the anchor extends that surface to the entire slide, and
  // the CTA anchors on the image_button and YouTube slides are drag sources for
  // their link text too. All three branches below therefore opt out.
  if (link.kind === "external") {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        className={className}
      >
        {children}
      </a>
    );
  }
  // mailto: / tel: — a plain anchor. next/link would try to route them, and
  // target="_blank" would leave a blank tab behind after the handoff.
  if (link.kind === "plain") {
    return (
      <a href={link.href} draggable={false} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={link.href} draggable={false} className={className}>
      {children}
    </Link>
  );
}

function BannerSlide({ banner, isActive = true, isFirst = false, isDragging = false }) {
  switch (banner.type) {
    case "image_desktop":
    case "image_mobile": {
      if (!banner.image_url) return null;
      const image = (
        <Image
          src={banner.image_url}
          alt={banner.title}
          fill
          draggable={false}
          className="object-cover object-center"
          priority={isActive}
          fetchPriority={isFirst ? "high" : "auto"}
          sizes="1440px"
        />
      );

      // `<Image fill>` is position:absolute and needs a POSITIONED ANCESTOR or
      // it escapes to the nearest one (the track) and the slide renders blank.
      // That ancestor used to be a wrapper div inside the click handler; the
      // anchor replaces the wrapper, so `relative w-full h-full` moves ONTO the
      // anchor rather than disappearing with the div it used to sit on.
      const boxClass = "relative w-full h-full";
      const link = bannerLinkFor(banner);
      if (!link.href) return <div className={boxClass}>{image}</div>;

      // WHY A REAL ANCHOR AND NOT role="link" + onClick: the previous version
      // navigated from a click handler on a <div>, which meant the browser
      // never treated it as a link — no middle-click, no ctrl/cmd-click, no
      // "open in new tab", no status-bar preview, nothing for a crawler to
      // follow, and — the actual reported bug — nothing at all when the click
      // was retargeted away from the div by the carousel's pointer capture.
      // A real href needs none of that to work. The hand-rolled tabIndex and
      // Enter/Space keydown handling are deleted with it: an <a href> is
      // focusable and Enter-activated natively, and the handwritten version
      // also fired on Space, which an anchor must NOT do (Space scrolls).
      return (
        <BannerAnchor link={link} className={`${boxClass} block cursor-pointer`}>
          {image}
        </BannerAnchor>
      );
    }

    case "image_button_desktop":
    case "image_button_mobile": {
      if (!banner.image_url) return null;
      // Same link_url field, same admin form, same refusal rules as the
      // full-image slide above — the CTA is just a smaller click target.
      const buttonLink = bannerLinkFor(banner);
      return (
        <div className="relative w-full h-full">
          <Image
            src={banner.image_url}
            alt={banner.title}
            fill
            draggable={false}
            className="object-cover object-center"
            priority={isActive}
            fetchPriority={isFirst ? "high" : "auto"}
            sizes="1440px"
          />
          {banner.link_text && buttonLink.href && (
            <div className="absolute bottom-24 left-8 lg:left-16">
              <BannerAnchor
                link={buttonLink}
                className="px-7 py-3 bg-[#19B5FE] hover:bg-[#0071BC] text-white font-bold
                  rounded-full text-sm shadow-9e-md transition-colors whitespace-nowrap"
              >
                {banner.link_text}
              </BannerAnchor>
            </div>
          )}
        </div>
      );
    }

    case "youtube":
      return <YouTubeHeroSlide banner={banner} isDragging={isDragging} />;

    default:
      return null;
  }
}

/**
 * YouTube slide — two-column card layout (reference style 03).
 *
 * LEFT: a white rounded card with title, description, CTA, and up to 3
 * feature tags (from banner.feature_tags). RIGHT: a separate video card
 * with a plain iframe (user clicks inside to play — no custom overlay).
 * On mobile the video sits on top (order-1) and the text card below.
 */
function YouTubeHeroSlide({ banner, isDragging = false }) {
  const ctaLink = bannerLinkFor(banner);
  const tags = Array.isArray(banner.feature_tags)
    ? banner.feature_tags.slice(0, 3)
    : [];
  const hasTags = tags.some((t) => t.line1 || t.line2 || t.icon);

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-white to-[#E8F4FD] dark:from-9e-navy dark:to-9e-card">
      {/* ── Style-03 decorative background ──────────────────────────── */}
      {/* Layer 1: large soft blob, bottom-left, brand air tone */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-40 h-[28rem] w-[28rem]
          rounded-full bg-9e-air/25 blur-3xl dark:bg-9e-air/10"
      />
      {/* Layer 2: secondary blob, top-left, cooler action tone, offset for organic overlap */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72
          rounded-full bg-9e-action/15 blur-3xl dark:bg-9e-action/10"
      />
      {/* Layer 3: crisp organic blob outline, bottom-left, no blur (the visible curved shape in ref 03) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80
          rounded-[45%_55%_60%_40%/50%_45%_55%_50%] bg-9e-air/10 dark:bg-9e-air/5"
      />
      {/* Layer 4: dotted grid pattern, top-right corner (radial-dot CSS, no image asset) */}
      {/* <div
        aria-hidden
        className="pointer-events-none absolute right-6 top-8 h-24 w-32 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: "radial-gradient(#2486FF 1.5px, transparent 1.5px)",
          backgroundSize: "14px 14px",
        }}
        
      /> */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem]
          rounded-full bg-9e-air/25 blur-3xl dark:bg-9e-air/10"
      />
      {/* <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-20 h-80 w-80
          rounded-full bg-9e-air/10 dark:bg-9e-air/5"
      /> */}

      <div className="relative mx-auto flex h-full max-w-[1200px] items-center px-4 lg:px-6">
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-10">
          {/* LEFT — text card. On mobile it goes BELOW the video (order-2). */}
          <div className="order-2 lg:order-1">
            <div className="rounded-9e-xl bg-white/90 dark:bg-9e-card/90 backdrop-blur-sm shadow-9e-lg p-6 lg:p-8 flex flex-col gap-2">
              <div className="h-[84px] lg:h-[126px] flex items-center justify-center lg:justify-start">
                <h2 className="text-xl lg:text-2xl xl:text-3xl font-bold text-9e-navy dark:text-white text-center lg:text-left line-clamp-3 lg:leading-[1.4] xl:leading-[1.4]">
                  {banner.title}
                </h2>
              </div>

              {banner.slide_text && (
                <div
                  className="text-9e-slate-dp-50 dark:text-[#94a3b8] text-sm leading-relaxed line-clamp-4 text-center lg:text-left h-[91px]"
                  dangerouslySetInnerHTML={{ __html: banner.slide_text }}
                />
              )}

              {ctaLink.href && banner.link_text && (
                <div className="flex justify-center lg:justify-start">
                  <BannerAnchor
                    link={ctaLink}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#19B5FE] hover:bg-[#0071BC]
                    text-white font-bold rounded-full text-sm transition-colors shadow-9e-md"
                  >
                    {banner.link_text}
                  </BannerAnchor>
                </div>
              )}

              {/* Feature tags row */}
              {hasTags && (
                <div className="flex justify-center lg:justify-start gap-4 pt-2">
                  {tags.map((t, i) => {
                    if (!t.line1 && !t.line2 && !t.icon) return null;
                    const Ico = t.icon ? LucideIcons[t.icon] : null;
                    return (
                      <div
                        key={i}
                        className="flex items-center lg:items-start gap-2.5 flex-col lg:flex-row w-full max-w-[155px]"
                      >
                        {Ico && (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-9e-air/15 text-9e-action">
                            <Ico size={18} />
                          </span>
                        )}
                        <div className="min-w-0">
                          {t.line1 && (
                            <p className="text-sm font-bold text-9e-navy dark:text-white leading-snug text-center lg:text-left line-clamp-2">
                              {t.line1}
                            </p>
                          )}
                          {t.line2 && (
                            <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8] leading-snug text-center lg:text-left line-clamp-2">
                              {t.line2}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — video card. First on mobile (order-1), right column on desktop (order-2). */}
          <div className="order-1 lg:order-2">
            {banner.youtube_id && (
              <div
                className={`relative aspect-video w-full rounded-2xl overflow-hidden${
                  isDragging ? " pointer-events-none" : ""
                }`}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${banner.youtube_id}?rel=0&controls=0&modestbranding=1&playsinline=1`}
                  title={banner.title || "YouTube video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
