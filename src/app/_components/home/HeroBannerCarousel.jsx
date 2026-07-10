'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useSwipe } from '@/hooks/useSwipe';

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
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
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
      const iframe = sectionRef.current?.querySelector('iframe');
      if (iframe && document.activeElement === iframe) {
        setIsPlaying(false);
      }
    }
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  // Touch swipe — the hook attaches native touch listeners with
  // { passive: false } on touchmove so iOS Safari doesn't pre-empt
  // the gesture.
  useSwipe(trackContainerRef, {
    onSwipeLeft: next,
    onSwipeRight: prev,
  });

  // Mouse drag (desktop only) — pointer events fire for mouse; we
  // filter by pointerType so touch goes through useSwipe alone.
  function handlePointerDown(e) {
    if (e.pointerType !== 'mouse') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers throw if called on a non-capturable target — safe to ignore
    }
    dragRef.current = { startX: e.clientX, isDragging: true, moved: false };
    setIsHovered(true);
    setIsPointerDown(true);
  }

  function handlePointerMove(e) {
    if (e.pointerType !== 'mouse') return;
    if (!dragRef.current.isDragging) return;
    if (Math.abs(e.clientX - dragRef.current.startX) > 5) {
      dragRef.current.moved = true;
    }
  }

  function handlePointerUp(e) {
    if (e.pointerType !== 'mouse') return;
    if (!dragRef.current.isDragging) return;
    const diff = e.clientX - dragRef.current.startX;
    dragRef.current.isDragging = false;
    setIsHovered(false);
    setIsPointerDown(false);
    if (Math.abs(diff) > 50) {
      if (diff < 0) next();
      else prev();
    }
  }

  // Suppress click events that finish a mouse drag so links inside
  // slides don't fire when the user was swiping with the mouse. Touch
  // swipes are already suppressed by preventDefault() inside useSwipe.
  function handleClickCapture(e) {
    // Never block clicks on interactive elements inside the carousel — the
    // capture-phase preventDefault would otherwise swallow CTA <a> links
    // inside image slides.
    if (e.target.closest('button, a, [role="button"]')) {
      dragRef.current.moved = false;
      return;
    }
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
          touchAction: isMobile ? 'pan-y' : 'auto',
          cursor: isMobile ? 'grab' : 'auto',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClickCapture={handleClickCapture}
      >
        {/* Sliding track — all slides laid out horizontally, transformed into view.
            translateX % is relative to the TRACK'S own width (N × container),
            so moving by 1 container-width is (100 / N)%, not 100%. */}
        <div
          className={`flex h-full ${
            isPointerDown ? '' : 'transition-transform duration-500 ease-in-out'
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
              <BannerSlide banner={b} isActive={i === current} isFirst={i === 0} />
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
        <div className="absolute bottom-5 left-0 right-0 flex justify-center z-20 px-4">
          <div className="flex items-center gap-3 bg-black/25 px-3 py-2 rounded-full">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`ไปยังสไลด์ ${i + 1}`}
                onClick={() => setCurrent(i)}
                className="relative flex h-11 w-11 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-200 ${
                    i === current
                      ? 'w-8 h-2.5 bg-white shadow-9e-sm'
                      : 'w-2.5 h-2.5 bg-white/50 hover:bg-white/80'
                  }`}
                />
              </button>
            ))}

            <span aria-hidden className="w-px h-3 bg-white/40 mx-1" />

            <button
              type="button"
              onClick={() => setIsPlaying((v) => !v)}
              aria-label={isPlaying ? 'หยุดสไลด์' : 'เล่นสไลด์'}
              className="flex h-11 w-11 items-center justify-center
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
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Memoize so the filtered array keeps a stable identity across renders
  // — otherwise `[total]` effects and the track map re-fire unnecessarily.
  const banners = useMemo(
    () =>
      allBanners.filter((b) => {
        if (b.type === 'youtube') return true;
        if (isMobile) {
          return b.type === 'image_mobile' || b.type === 'image_button_mobile';
        }
        return b.type === 'image_desktop' || b.type === 'image_button_desktop';
      }),
    [allBanners, isMobile]
  );

  return { banners, isMobile };
}

function BannerSlide({ banner, isActive = true, isFirst = false }) {
  switch (banner.type) {
    case 'image_desktop':
    case 'image_mobile': {
      if (!banner.image_url) return null;
      const content = (
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
        </div>
      );
      if (!banner.link_url) return content;
      const external = banner.link_url.startsWith('http');
      const openLink = () => {
        if (external) {
          window.open(banner.link_url, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = banner.link_url;
        }
      };
      return (
        <div
          role="link"
          tabIndex={0}
          onClick={openLink}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openLink();
            }
          }}
          className="block w-full h-full cursor-pointer"
        >
          {content}
        </div>
      );
    }

    case 'image_button_desktop':
    case 'image_button_mobile': {
      if (!banner.image_url) return null;
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
          {banner.link_text && banner.link_url && (
            <div className="absolute bottom-24 left-8 lg:left-16">
              <a
                href={banner.link_url}
                className="px-7 py-3 bg-[#19B5FE] hover:bg-[#0071BC] text-white font-bold
                  rounded-full text-sm shadow-9e-md transition-colors whitespace-nowrap"
              >
                {banner.link_text}
              </a>
            </div>
          )}
        </div>
      );
    }

    case 'youtube':
      return <YouTubeHeroSlide banner={banner} />;

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
function YouTubeHeroSlide({ banner }) {
  const tags = Array.isArray(banner.feature_tags) ? banner.feature_tags.slice(0, 3) : [];
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
      <div
        aria-hidden
        className="pointer-events-none absolute right-6 top-8 h-24 w-32 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#2486FF 1.5px, transparent 1.5px)',
          backgroundSize: '14px 14px',
        }}
      />

      <div className="relative mx-auto flex h-full max-w-[1200px] items-center px-4 lg:px-6">
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-10">
          {/* LEFT — text card. On mobile it goes BELOW the video (order-2). */}
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl bg-white/90 dark:bg-9e-card/90 backdrop-blur-sm shadow-9e-lg p-6 lg:p-8 space-y-4">
              <h2 className="text-xl lg:text-2xl xl:text-3xl font-bold text-9e-navy dark:text-white leading-tight">
                {banner.title}
              </h2>

              {banner.slide_text && (
                <div
                  className="text-9e-slate-dp-50 dark:text-[#94a3b8] text-sm leading-relaxed lg:line-clamp-4"
                  dangerouslySetInnerHTML={{ __html: banner.slide_text }}
                />
              )}

              {banner.link_url && banner.link_text && (
                <a
                  href={banner.link_url}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#19B5FE] hover:bg-[#0071BC]
                    text-white font-bold rounded-full text-sm transition-colors shadow-9e-md"
                >
                  {banner.link_text}
                </a>
              )}

              {/* Feature tags row */}
              {hasTags && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                  {tags.map((t, i) => {
                    if (!t.line1 && !t.line2 && !t.icon) return null;
                    const Ico = t.icon ? LucideIcons[t.icon] : null;
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        {Ico && (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-9e-air/15 text-9e-action">
                            <Ico size={18} />
                          </span>
                        )}
                        <div className="min-w-0">
                          {t.line1 && (
                            <p className="text-sm font-bold text-9e-navy dark:text-white leading-snug">{t.line1}</p>
                          )}
                          {t.line2 && (
                            <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8] leading-snug">{t.line2}</p>
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
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${banner.youtube_id}?rel=0&controls=0&modestbranding=1&playsinline=1`}
                  title={banner.title || 'YouTube video'}
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
