'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useInView, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipe } from '@/hooks/useSwipe';

/**
 * ROUND HS-C: split out of the old flat `value: '5K+'` strings into
 * target/suffix/decimals so the count-up can animate a real number and
 * reassemble the exact same displayed string at the end — '5K+', '90K+',
 * '4.9', '700K+', '73' respectively. Verified against the values these
 * replace: target + suffix (decimals=0) or target.toFixed(1) (decimals=1,
 * the รีวิว stat only) reproduces each one exactly.
 */
const STATS = [
  { target: 5, suffix: 'K+', decimals: 0, label: 'องค์กร' },
  { target: 90, suffix: 'K+', decimals: 0, label: 'ผู้เรียน' },
  { target: 4.9, suffix: '', decimals: 1, label: 'รีวิว', star: true },
  { target: 700, suffix: 'K+', decimals: 0, label: 'ผู้ติดตาม' },
  { target: 73, suffix: '', decimals: 0, label: 'หลักสูตร' },
];

/**
 * rAF-based count-up, matching the pattern already established in
 * src/components/portfolio/PortfolioStats.jsx (same cubic ease-out, same
 * "snap to the exact target on the final frame" guarantee — that last
 * `setCount(target)` in the p>=1 branch is what makes the landing value
 * exact regardless of any float drift during the eased ramp).
 *
 * Extended for decimals: PortfolioStats' stats are all integers, but the
 * รีวิว stat here is 4.9, so the value is kept as a float throughout and
 * only rounded at FORMAT time via toFixed, not floored during the ramp.
 */
function useCountUp(target, decimals, duration, active, reduced) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    if (reduced) {
      setCount(target);
      return undefined;
    }
    let start = null;
    let raf = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(eased * target);
      if (p < 1) raf = requestAnimationFrame(step);
      else setCount(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration, reduced]);
  return decimals > 0 ? count.toFixed(decimals) : String(Math.floor(count));
}

function StatNumber({ stat, active, reduced }) {
  const display = useCountUp(stat.target, stat.decimals, 1350, active, reduced);
  return (
    <>
      {display}
      {stat.suffix}
    </>
  );
}

/**
 * Home-page testimonials + corporate stats.
 *
 * `reviews` are admin-curated via the `featured_reviews` collection
 * and hydrated server-side from the public reviews API. Cards rotate
 * on a sliding-window carousel: three visible on desktop with the
 * middle card elevated, one visible on mobile. The stats row below is
 * intentionally hardcoded (corporate marketing numbers, not API-driven).
 */
export function TestimonialStats({ reviews = [] }) {
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' });
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="bg-9e-ice px-4 py-14 dark:bg-9e-card lg:px-6">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="mb-2 text-center text-2xl font-bold text-9e-navy dark:text-white">
          ส่วนหนึ่งของความภาคภูมิใจ
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          9Expert Training
          เป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กรในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี
          เพื่อเพิ่มประสิทธิภาพการทำงานและสร้างความได้เปรียบเหนือคู่แข่ง
        </p>

        <ReviewCarousel reviews={reviews} />

        <div ref={statsRef} className="grid grid-cols-2 text-center md:grid-cols-5">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                'flex flex-col items-center gap-1 border-gray-300 dark:border-[#1e3a5f]',
                i < STATS.length - 1 && 'md:border-r-4'
              )}
            >
              <div className="flex items-center gap-1">
                {s.star && (
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                )}
                <span className="text-2xl font-extrabold text-9e-navy dark:text-white">
                  <StatNumber stat={s} active={statsInView} reduced={shouldReduceMotion} />
                </span>
              </div>
              <span className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const VISIBLE_DESKTOP = 3;
const VISIBLE_MOBILE = 1;

function ReviewCarousel({ reviews }) {
  // Cards visible at once: 1 on mobile, 3 on desktop. Recalculated on
  // resize so the cloned-ghost ring + transform math stays consistent
  // across the breakpoint.
  const [visible, setVisible] = useState(VISIBLE_DESKTOP);
  useEffect(() => {
    const check = () =>
      setVisible(window.innerWidth < 768 ? VISIBLE_MOBILE : VISIBLE_DESKTOP);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Clone the last N and first N reviews onto the ends so we can slide
  // past the edge into a "ghost" copy, then silently reset to the real
  // start/end after the transition finishes. The result is a seamless
  // infinite loop with no empty trailing slots.
  const cloned = useMemo(() => {
    if (reviews.length === 0) return [];
    return [
      ...reviews.slice(-visible),
      ...reviews,
      ...reviews.slice(0, visible),
    ];
  }, [reviews, visible]);

  const [currentIndex, setCurrentIndex] = useState(visible);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  // Snap back to the real-start whenever `visible` flips so the index
  // doesn't dangle inside a now-resized ghost region.
  useEffect(() => {
    setIsTransitioning(false);
    setCurrentIndex(visible);
  }, [visible]);

  const totalSlides = reviews.length;

  // Reset to the real start whenever the source list changes (admin
  // edit, etc.) so we never land in a cloned region.
  useEffect(() => {
    setIsTransitioning(false);
    setCurrentIndex(visible);
  }, [totalSlides, visible]);

  // After sliding into a cloned edge, snap back to the matching real
  // index without animation. The 500ms delay lines up with the
  // transform transition so the user never sees the jump.
  useEffect(() => {
    if (totalSlides === 0) return undefined;
    if (currentIndex >= totalSlides + visible) {
      const t = setTimeout(() => {
        setIsTransitioning(false);
        setCurrentIndex(visible);
      }, 500);
      return () => clearTimeout(t);
    }
    if (currentIndex < visible) {
      const t = setTimeout(() => {
        setIsTransitioning(false);
        setCurrentIndex(totalSlides + visible - 1);
      }, 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [currentIndex, totalSlides, visible]);

  // Re-enable transitions one frame after a silent jump so the next
  // user-driven move animates again.
  useEffect(() => {
    if (!isTransitioning) {
      const t = setTimeout(() => setIsTransitioning(true), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isTransitioning]);

  // Auto-advance every 5s, pause on hover. Skip when there's only one
  // review since rotating a list of one is just visual noise.
  useEffect(() => {
    if (totalSlides <= 1 || isHovered) return undefined;
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setCurrentIndex((i) => i + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [totalSlides, isHovered]);

  if (!totalSlides) return null;

  const next = () => {
    setIsTransitioning(true);
    setCurrentIndex((i) => i + 1);
  };
  const prev = () => {
    setIsTransitioning(true);
    setCurrentIndex((i) => i - 1);
  };
  const showArrows = totalSlides > 1;

  const swipeRef = useRef(null);
  useSwipe(swipeRef, { onSwipeLeft: next, onSwipeRight: prev });

  return (
    <div
      className="relative mb-12"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mobile (visible=1): each card fills the viewport, no centering
          shift — the visible slot IS the current card.
          Desktop (visible=3): shift by one card-width so the current
          card lands in the middle slot, with a peek of prev/next. */}
      <div
        ref={swipeRef}
        className="overflow-hidden"
        style={{ touchAction: 'pan-y', cursor: 'grab' }}
      >
        <div
          className="flex items-stretch"
          style={{
            transform:
              visible === 1
                ? `translateX(-${currentIndex * 100}%)`
                : `translateX(calc(-${currentIndex * (100 / visible)}% + ${100 / visible}%))`,
            transition: isTransitioning
              ? 'transform 500ms ease-in-out'
              : 'none',
          }}
        >
          {cloned.map((review, i) => {
            const isCenter = i === currentIndex;
            const isMobile = visible === 1;
            return (
              <div
                key={i}
                className="flex-shrink-0 px-2"
                style={{
                  width: `${100 / visible}%`,
                  transition:
                    'transform 500ms ease-in-out, opacity 500ms ease-in-out',
                  transform: isCenter ? 'scale(1.05)' : 'scale(0.97)',
                  opacity: isCenter || isMobile ? 1 : 0.75,
                }}
              >
                <ReviewCard review={review} />
              </div>
            );
          })}
        </div>
      </div>

      {showArrows && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="ก่อนหน้า"
            className="absolute -left-4 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-9e-air text-9e-ice shadow-9e-md transition-colors duration-9e-micro ease-9e hover:bg-9e-brand md:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="ถัดไป"
            className="absolute -right-4 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-9e-air text-9e-ice shadow-9e-md transition-colors duration-9e-micro ease-9e hover:bg-9e-brand md:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

function ReviewCard({ review, elevated = false }) {
  if (!review) return null;
  const {
    reviewerName,
    reviewerRole,
    reviewerCompany,
    courseName,
    rating,
    comment,
    avatarUrl,
  } = review;

  const subtitle = [reviewerRole, reviewerCompany].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl p-5 transition-all duration-9e-micro ease-9e',
        elevated
          ? 'scale-[1.02] bg-white shadow-9e-md dark:bg-9e-navy dark:ring-1 dark:ring-[#1e3a5f]'
          : 'bg-gray-50 opacity-90 dark:bg-9e-navy dark:ring-1 dark:ring-[#1e3a5f]/60'
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar src={avatarUrl} name={reviewerName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-9e-navy dark:text-white">
            {reviewerName}
          </p>
          {subtitle && (
            <p className="truncate text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {courseName && (
        <p className="mt-3 line-clamp-1 text-sm font-bold text-9e-navy dark:text-[#48B0FF]">
          {courseName}
        </p>
      )}
      {comment && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {comment}
        </p>
      )}
      <StarRating rating={rating} />
    </article>
  );
}

function Avatar({ src, name }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  if (!src) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-9e-action text-xl font-bold text-white">
        {initial}
      </div>
    );
  }
  // Cloudinary serves 800x800 by default — display is 56px, so request a
  // 112px (2×) crop to save ~95% of the avatar bytes.
  const optimizedSrc = src.includes('res.cloudinary.com')
    ? src.replace('/upload/', '/upload/w_112,h_112,c_fill,f_auto,q_auto/')
    : src;
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-9e-ice">
      <Image
        src={optimizedSrc}
        alt={name ?? ''}
        fill
        sizes="56px"
        className="object-cover"
        unoptimized
      />
    </div>
  );
}

function StarRating({ rating = 5 }) {
  const full = Math.round(Number(rating) || 0);
  return (
    <div className="mt-3 flex gap-[2px] text-lg leading-none" aria-label={`${full} ดาว`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={i < full ? 'text-[#FFBC00]' : 'text-gray-200'}
        >
          ★
        </span>
      ))}
    </div>
  );
}
