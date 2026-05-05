'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSwipe } from '@/hooks/useSwipe';

/**
 * Carousel for the /promotions hero banners.
 *
 * - Auto-advances every 4s; pauses on hover.
 * - Manual arrows live OUTSIDE the overflow-hidden track (HeroBannerCarousel
 *   had a bug where arrows were clipped / fought with the drag handler;
 *   same lesson applied here from the start).
 * - Single banner → static render, no arrows / dots.
 * - Empty list → renders nothing.
 */
export function PromotionBannerCarousel({ banners }) {
  const items = Array.isArray(banners) ? banners.filter((b) => b?.image_url) : [];
  const total = items.length;

  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef(null);
  const trackRef = useRef(null);

  const next = useCallback(() => {
    setCurrent((i) => (total ? (i + 1) % total : 0));
  }, [total]);

  const prev = useCallback(() => {
    setCurrent((i) => (total ? (i - 1 + total) % total : 0));
  }, [total]);

  // Reset when the banner list changes (admin reorder etc.)
  useEffect(() => {
    setCurrent(0);
  }, [total]);

  useEffect(() => {
    if (total <= 1 || isHovered) return undefined;
    intervalRef.current = setInterval(next, 4000);
    return () => clearInterval(intervalRef.current);
  }, [total, isHovered, next]);

  useSwipe(trackRef, {
    onSwipeLeft: next,
    onSwipeRight: prev,
  });

  if (total === 0) return null;

  // Single-banner render: no carousel chrome.
  if (total === 1) {
    return <BannerSlide banner={items[0]} priority />;
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={trackRef}
        className="overflow-hidden rounded-2xl"
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{
            transform: `translateX(-${(current * 100) / total}%)`,
            width: `${total * 100}%`,
          }}
        >
          {items.map((b, i) => (
            <div
              key={b._id ?? i}
              className="shrink-0"
              style={{ width: `${100 / total}%` }}
            >
              <BannerSlide banner={b} priority={i === current} />
            </div>
          ))}
        </div>
      </div>

      {/* Arrows — outside overflow-hidden, anchored to the relative wrapper.
          z-40 keeps them above the dot pill. */}
      <button
        type="button"
        onClick={prev}
        aria-label="ก่อนหน้า"
        className="absolute left-3 top-1/2 z-40 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-md transition-colors hover:bg-white md:flex dark:bg-[#111d2c]/85 dark:hover:bg-[#111d2c]"
      >
        <ChevronLeft size={20} className="text-[#0D1B2A] dark:text-white" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="ถัดไป"
        className="absolute right-3 top-1/2 z-40 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-md transition-colors hover:bg-white md:flex dark:bg-[#111d2c]/85 dark:hover:bg-[#111d2c]"
      >
        <ChevronRight size={20} className="text-[#0D1B2A] dark:text-white" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-3 left-0 right-0 z-30 flex justify-center px-4">
        <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-sm">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`ไปยังสไลด์ ${i + 1}`}
              onClick={() => setCurrent(i)}
              className="relative flex h-6 w-6 items-center justify-center"
            >
              <span
                aria-hidden
                className={`block rounded-full transition-all duration-200 ${
                  i === current
                    ? 'h-2 w-6 bg-white'
                    : 'h-2 w-2 bg-white/50 hover:bg-white/80'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BannerSlide({ banner, priority = false }) {
  const img = (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-9e-ice md:aspect-[16/5] dark:bg-[#0D1B2A]">
      <Image
        src={banner.image_url}
        alt={banner.alt_text || 'โปรโมชั่น'}
        fill
        priority={priority}
        sizes="(min-width: 1024px) 1200px, 100vw"
        className="object-cover"
        draggable={false}
      />
    </div>
  );

  if (!banner.link_url) return img;

  const external = /^https?:\/\//i.test(banner.link_url);
  return (
    <a
      href={banner.link_url}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="block"
    >
      {img}
    </a>
  );
}
