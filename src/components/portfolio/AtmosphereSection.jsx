'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { useSwipe } from '@/hooks/useSwipe';

export default function AtmosphereSection({ photos }) {
  if (!photos || photos.length === 0) return null;

  const total = photos.length;
  const [current, setCurrent] = useState(0);
  const [slidesPerView, setSlidesPerView] = useState(3);
  const [lightbox, setLightbox] = useState(null);
  const trackRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 768) setSlidesPerView(1);
      else if (window.innerWidth < 1024) setSlidesPerView(2);
      else setSlidesPerView(3);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + total) % total);
  }, [total]);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % total);
  }, [total]);

  useSwipe(trackRef, { onSwipeLeft: next, onSwipeRight: prev });

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  useEffect(() => {
    document.body.style.overflow = lightbox !== null ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [lightbox]);

  // Track width = (total / slidesPerView) * 100% of container
  // Each slide = (100 / total)% of track = (100 / slidesPerView)% of container
  // Moving by 1 photo = (100 / total)% of track
  const translateXPercent = (current * 100) / total;

  return (
    <section className="bg-white py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-bold text-9e-navy dark:text-white lg:text-4xl">
            บรรยากาศการฝึกอบรม
          </h2>
          <p className="mt-3 font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
            ห้องเรียนที่พร้อมด้วยอุปกรณ์ทันสมัยและบรรยากาศที่เอื้อต่อการเรียนรู้
          </p>
        </div>

        <div className="relative" ref={containerRef}>
          <button
            type="button"
            onClick={prev}
            aria-label="ก่อนหน้า"
            className="absolute -left-4 top-[140px] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-9e-md transition-all duration-9e-micro hover:bg-9e-ice md:flex dark:bg-9e-card dark:hover:bg-9e-border lg:-left-6"
          >
            <ChevronLeft size={20} className="text-9e-navy dark:text-white" />
          </button>

          <button
            type="button"
            onClick={next}
            aria-label="ถัดไป"
            className="absolute -right-4 top-[140px] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-9e-md transition-all duration-9e-micro hover:bg-9e-ice md:flex dark:bg-9e-card dark:hover:bg-9e-border lg:-right-6"
          >
            <ChevronRight size={20} className="text-9e-navy dark:text-white" />
          </button>

          <div
            ref={trackRef}
            className="overflow-hidden"
            style={{ touchAction: 'pan-y' }}
          >
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{
                width: `${(total / slidesPerView) * 100}%`,
                transform: `translateX(-${translateXPercent}%)`,
              }}
            >
              {photos.map((photo, i) => (
                <div
                  key={photo._id ?? i}
                  className="shrink-0 px-2"
                  style={{ width: `${100 / total}%` }}
                >
                  <PhotoCard
                    photo={photo}
                    onClick={() => setLightbox(i)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-2">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`ไปยังภาพที่ ${i + 1}`}
                className={
                  'rounded-full transition-all duration-9e-micro ' +
                  (i === current
                    ? 'h-2 w-6 bg-9e-brand'
                    : 'h-2 w-2 bg-9e-slate-lt-300 hover:bg-9e-brand/50 dark:bg-9e-slate-dp-200')
                }
              />
            ))}
          </div>
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox((i) => (i - 1 + total) % total)}
          onNext={() => setLightbox((i) => (i + 1) % total)}
        />
      )}
    </section>
  );
}

function PhotoCard({ photo, onClick }) {
  return (
    <div
      className="group relative h-[300px] cursor-zoom-in overflow-hidden rounded-9e-lg"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`ดูภาพขยาย: ${photo.caption_th || 'บรรยากาศการฝึกอบรม'}`}
    >
      <img
        src={photo.image_url}
        alt={photo.caption_th || 'บรรยากาศการฝึกอบรม'}
        className="h-full w-full object-cover transition-transform duration-9e-reveal group-hover:scale-105"
        draggable={false}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-9e-navy/30 opacity-0 transition-opacity duration-9e-micro group-hover:opacity-100">
        <div className="rounded-full bg-white/90 p-3 shadow-9e-md">
          <ZoomIn size={20} className="text-9e-navy" />
        </div>
      </div>

      {photo.caption_th && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="absolute bottom-4 left-4 right-4 z-10 font-thai text-sm text-white drop-shadow">
            {photo.caption_th}
          </p>
        </>
      )}
    </div>
  );
}

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
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="ปิด"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X size={20} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        aria-label="ก่อนหน้า"
        className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        aria-label="ถัดไป"
        className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
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
          <p className="mt-3 text-center font-thai text-sm text-white/80">
            {photo.caption_th}
          </p>
        )}
        <p className="mt-2 text-center font-en text-xs text-white/50">
          {index + 1} / {photos.length}
        </p>
      </div>
    </div>
  );
}
