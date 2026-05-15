'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { useSwipe } from '@/hooks/useSwipe';

// ── Config ─────────────────────────────────────────────────────────

/** How long each slide stays before auto-advancing (ms) */
const AUTO_PLAY_INTERVAL = 3500;

/** Slides visible at each breakpoint */
const SLIDES_AT_BREAKPOINT = { sm: 1, md: 2, lg: 4 };

// ── Main Component ─────────────────────────────────────────────────

export default function AtmosphereSection({ photos }) {
  if (!photos || photos.length === 0) return null;

  const total = photos.length;

  const [current,       setCurrent]       = useState(0);
  const [slidesPerView, setSlidesPerView] = useState(SLIDES_AT_BREAKPOINT.lg);
  const [paused,        setPaused]        = useState(false);
  const [lightbox,      setLightbox]      = useState(null);
  const [noTransition,  setNoTransition]  = useState(false);

  const trackRef     = useRef(null);
  const containerRef = useRef(null);
  const timerRef     = useRef(null);

  // ── Responsive slidesPerView ─────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if      (window.innerWidth < 768)  setSlidesPerView(SLIDES_AT_BREAKPOINT.sm);
      else if (window.innerWidth < 1024) setSlidesPerView(SLIDES_AT_BREAKPOINT.md);
      else                               setSlidesPerView(SLIDES_AT_BREAKPOINT.lg);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Navigation helpers ───────────────────────────────────────────
  const prev = useCallback(() =>
    setCurrent((c) => (c - 1 + total) % total), [total]);

  const next = useCallback(() => {
    setCurrent((c) => {
      // When we've advanced past the last real photo, snap back instantly
      if (c + 1 >= total) {
        return 0;
      }
      return c + 1;
    });
  }, [total]);

  // Briefly disable transition so the snap-back to index 0 is invisible
  useEffect(() => {
    if (current === 0) {
      setNoTransition(true);
      const t = setTimeout(() => setNoTransition(false), 50);
      return () => clearTimeout(t);
    }
  }, [current]);

  // ── Auto-play: advance by 1 every AUTO_PLAY_INTERVAL ms ─────────
  useEffect(() => {
    if (paused || lightbox !== null) return;
    timerRef.current = setInterval(next, AUTO_PLAY_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [next, paused, lightbox]);

  // ── Swipe support ────────────────────────────────────────────────
  useSwipe(trackRef, { onSwipeLeft: next, onSwipeRight: prev });

  // ── Lightbox keyboard + scroll-lock ─────────────────────────────
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape')     setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i + 1) % total);
      if (e.key === 'ArrowLeft')  setLightbox((i) => (i - 1 + total) % total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, total]);

  useEffect(() => {
    document.body.style.overflow = lightbox !== null ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [lightbox]);

  // ── Dot indicators (show max 15 to avoid overflow) ───────────────
  const maxDots   = 15;
  const showDots  = total <= maxDots;

  return (
    <section
      className="bg-9e-navy py-20 dark:bg-[var(--page-bg)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-bold text-white lg:text-4xl">
            ภาพบรรยากาศการอบรม
          </h2>
          <p className="mt-3 font-thai text-white/60">
            ห้องเรียนที่พร้อมด้วยอุปกรณ์ทันสมัยและบรรยากาศที่เอื้อต่อการเรียนรู้
          </p>
        </div>

        {/* Carousel */}
        <div
          className="relative"
          ref={containerRef}
          style={{ transform: 'translateZ(0)', isolation: 'isolate' }}
        >

          {/* Prev button */}
          <button
            type="button"
            onClick={() => { prev(); setPaused(true); }}
            aria-label="ก่อนหน้า"
            className="absolute -left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/25 md:flex lg:-left-6"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Next button */}
          <button
            type="button"
            onClick={() => { next(); setPaused(true); }}
            aria-label="ถัดไป"
            className="absolute -right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/25 md:flex lg:-right-6"
          >
            <ChevronRight size={20} />
          </button>

          {/* Track */}
          <div
            ref={trackRef}
            className="overflow-hidden rounded-9e-lg"
            style={{ touchAction: 'pan-y' }}
          >
            <div
              className={noTransition
                ? 'flex'
                : 'flex transition-transform duration-500 ease-in-out'}
              style={{
                // Track holds original + clone set; each item = (1 / slidesPerView) of visible width
                width:      `${((total + slidesPerView) / slidesPerView) * 100}%`,
                transform:  `translateX(-${(current / (total + slidesPerView)) * 100}%)`,
                willChange: 'transform',
              }}
            >
              {/* Original photos */}
              {photos.map((photo, i) => (
                <div
                  key={photo._id ?? i}
                  className="shrink-0 px-1.5"
                  style={{ width: `${100 / (total + slidesPerView)}%` }}
                >
                  <PhotoCard
                    photo={photo}
                    onClick={() => { setLightbox(i); setPaused(true); }}
                  />
                </div>
              ))}
              {/* Clone of first N slides to fill the gap at the end */}
              {photos.slice(0, slidesPerView).map((photo, i) => (
                <div
                  key={`clone-${photo._id ?? i}`}
                  className="shrink-0 px-1.5"
                  style={{ width: `${100 / (total + slidesPerView)}%` }}
                  aria-hidden="true"
                >
                  <PhotoCard
                    photo={photo}
                    onClick={() => { setLightbox(i); setPaused(true); }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Dot indicators */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {showDots ? (
              photos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setCurrent(i); setPaused(true); }}
                  aria-label={`ไปยังภาพที่ ${i + 1}`}
                  className={
                    'rounded-full transition-all duration-300 ' +
                    (i === current
                      ? 'h-2 w-6 bg-9e-brand'
                      : 'h-2 w-2 bg-white/30 hover:bg-white/60')
                  }
                />
              ))
            ) : (
              /* Compact counter when too many slides */
              <p className="font-en text-sm text-white/50">
                {current + 1} / {total}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onClose={() => { setLightbox(null); setPaused(false); }}
          onPrev={() => setLightbox((i) => (i - 1 + total) % total)}
          onNext={() => setLightbox((i) => (i + 1) % total)}
        />
      )}
    </section>
  );
}

// ── PhotoCard ──────────────────────────────────────────────────────

function PhotoCard({ photo, onClick }) {
  return (
    <div
      className="group relative cursor-zoom-in overflow-hidden rounded-9e-lg"
      style={{ aspectRatio: '4/3' }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      aria-label={`ดูภาพขยาย: ${photo.caption_th || 'บรรยากาศการฝึกอบรม'}`}
    >
      <img
        src={photo.image_url}
        alt={photo.caption_th || 'บรรยากาศการฝึกอบรม'}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        draggable={false}
        loading="lazy"
      />

      {/* Zoom overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-9e-navy/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="rounded-full bg-white/90 p-3 shadow-9e-md">
          <ZoomIn size={18} className="text-9e-navy" />
        </div>
      </div>

      {/* Caption */}
      {photo.caption_th && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="absolute bottom-3 left-3 right-3 z-10 font-thai text-xs font-medium text-white drop-shadow">
            {photo.caption_th}
          </p>
        </>
      )}
    </div>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────

function Lightbox({ photos, index, onClose, onPrev, onNext }) {
  const photo = photos[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="ภาพขยาย"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="ปิด"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
      >
        <X size={20} />
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        aria-label="ก่อนหน้า"
        className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        aria-label="ถัดไป"
        className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
      >
        <ChevronRight size={24} />
      </button>

      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo.image_url}
          alt={photo.caption_th || 'บรรยากาศการฝึกอบรม'}
          className="max-h-[85vh] max-w-[88vw] rounded-9e-lg object-contain shadow-9e-lg"
          draggable={false}
        />
        {photo.caption_th && (
          <p className="mt-3 text-center font-thai text-sm text-white/80">{photo.caption_th}</p>
        )}
        <p className="mt-2 text-center font-en text-xs text-white/50">
          {index + 1} / {photos.length}
        </p>
      </div>
    </div>
  );
}