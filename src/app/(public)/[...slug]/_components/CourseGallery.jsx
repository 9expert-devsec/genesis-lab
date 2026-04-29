'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Course gallery — image slides interleaved with YouTube embeds.
 *
 * Auto-advances every 5s. Pauses while:
 *   - the user hovers over the gallery
 *   - the current slide is a YouTube video (so the user can finish
 *     watching without the carousel jumping away)
 */

const AUTO_MS = 5000;

function YouTubeSlide({ videoId, isActive }) {
  return (
    <div className="relative aspect-video w-full">
      <iframe
        className="absolute inset-0 h-full w-full rounded-2xl"
        src={`https://www.youtube.com/embed/${videoId}?rel=0`}
        title="Course video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        // `loading="lazy"` for non-active slides keeps initial paint
        // light when several videos are queued.
        loading={isActive ? 'eager' : 'lazy'}
      />
    </div>
  );
}

function ImageSlide({ url, alt, isActive }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-9e-ice">
      <Image
        src={url}
        alt={alt || 'รูปภาพหลักสูตร'}
        fill
        sizes="(max-width: 1024px) 100vw, 960px"
        className="object-cover"
        draggable={false}
        priority={isActive}
      />
    </div>
  );
}

export function CourseGallery({ gallery = [] }) {
  // Sort defensively — DB write paths re-number `order`, but a hand-
  // edited document might not.
  const items = useMemo(
    () => [...gallery].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [gallery]
  );

  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const total = items.length;

  // Snap back to first slide if the gallery shrinks past the cursor.
  useEffect(() => {
    if (current >= total) setCurrent(0);
  }, [current, total]);

  // Auto-advance — paused on hover and on YouTube slides (caller is
  // probably watching). Runs only when there's more than one slide.
  useEffect(() => {
    if (total <= 1) return undefined;
    if (isPaused) return undefined;
    if (items[current]?.type === 'youtube') return undefined;
    const timer = setInterval(() => {
      setCurrent((i) => (i + 1) % total);
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [isPaused, current, total, items]);

  if (total === 0) return null;

  const prev = () => setCurrent((i) => (i - 1 + total) % total);
  const next = () => setCurrent((i) => (i + 1) % total);

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {items.map((item, i) => (
            <div key={i} className="w-full flex-shrink-0">
              {item.type === 'youtube' ? (
                <YouTubeSlide videoId={item.videoId} isActive={i === current} />
              ) : (
                <ImageSlide url={item.url} alt={item.alt} isActive={i === current} />
              )}
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="ก่อนหน้า"
            className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 shadow-9e-md transition-colors hover:bg-white dark:bg-9e-navy/80 dark:hover:bg-9e-navy"
          >
            <ChevronLeft className="h-5 w-5 text-9e-navy dark:text-white" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="ถัดไป"
            className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 shadow-9e-md transition-colors hover:bg-white dark:bg-9e-navy/80 dark:hover:bg-9e-navy"
          >
            <ChevronRight className="h-5 w-5 text-9e-navy dark:text-white" />
          </button>

          <div className="mt-3 flex justify-center gap-2">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`ไปยังสไลด์ ${i + 1}`}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  i === current
                    ? 'bg-9e-primary dark:bg-[#48B0FF]'
                    : 'bg-[#CBD5E1] dark:bg-[#1e3a5f]'
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
