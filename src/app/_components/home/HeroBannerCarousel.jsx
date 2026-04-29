'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(true);
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
    if (dragRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current.moved = false;
    }
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
              <BannerSlide banner={b} isActive={i === current} />
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="ก่อนหน้า"
              className="hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 z-30
                w-10 h-10 bg-white/80 hover:bg-white dark:bg-9e-card/80 dark:hover:bg-9e-card rounded-full shadow-9e-md
                items-center justify-center transition-colors"
            >
              <ChevronLeft size={20} className="text-9e-navy dark:text-white" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="ถัดไป"
              className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 z-30
                w-10 h-10 bg-white/80 hover:bg-white dark:bg-9e-card/80 dark:hover:bg-9e-card rounded-full shadow-9e-md
                items-center justify-center transition-colors"
            >
              <ChevronRight size={20} className="text-9e-navy dark:text-white" />
            </button>
          </>
        )}
      </div>

      {/* Dots + Play/Pause — centered on the full section */}
      {total > 1 && (
        <div className="absolute bottom-5 left-0 right-0 flex justify-center z-20 px-4">
          <div className="flex items-center gap-3 bg-black/25 backdrop-blur-sm px-3 py-2 rounded-full">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`ไปยังสไลด์ ${i + 1}`}
                onClick={() => setCurrent(i)}
                className="relative flex h-9 w-9 items-center justify-center"
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
              className="flex h-9 w-9 items-center justify-center
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

function BannerSlide({ banner, isActive = true }) {
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
            sizes="1440px"
          />
          {banner.link_text && banner.link_url && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 lg:left-[360px] lg:translate-x-0">
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

    case 'youtube': {
      return (
        <div className="w-full h-full flex items-center">
          <div className="mx-auto max-w-[1200px] w-full px-4 lg:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-8 items-center">
              {/* Video: first on mobile (order-1), right column on desktop (order-2) */}
              {banner.youtube_id && (
                <div className="relative aspect-video rounded-9e-lg overflow-hidden shadow-9e-lg order-1 lg:order-2">
                  <iframe
                    src={`https://www.youtube.com/embed/${banner.youtube_id}?rel=0`}
                    title={banner.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              )}

              {/* Text: below video on mobile (order-2, centered), left column on desktop (order-1) */}
              <div className="space-y-4 order-2 lg:order-1 text-center lg:text-left">
                <h2 className="text-xl lg:text-2xl xl:text-3xl font-bold text-9e-navy dark:text-white leading-tight">
                  {banner.title}
                </h2>
                {banner.slide_text && (
                  <div
                    className="text-9e-slate dark:text-[#94a3b8] text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: banner.slide_text }}
                  />
                )}
                {banner.link_url && banner.link_text && (
                  <div className="flex justify-center lg:justify-start">
                    <a
                      href={banner.link_url}
                      className="inline-flex items-center px-6 py-3 bg-[#19B5FE] hover:bg-[#0071BC]
                        text-white font-bold rounded-full text-sm transition-colors shadow-9e-md"
                    >
                      {banner.link_text}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
