'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipe } from '@/hooks/useSwipe';

/**
 * Real articles only — server fetches via `getFeaturedArticlesForLanding`
 * and passes them in. If nothing is featured, the section disappears
 * entirely rather than showing a placeholder.
 *
 * Desktop renders a 1–4 column grid for short lists or a 4-up arrow
 * slider when there are more than 4 cards; mobile is a swipeable,
 * auto-advancing carousel with dot indicators.
 */
export function BlogSection({ articles = [] }) {
  if (articles.length === 0) return null;

  const blogs = articles.map((a) => ({
    id:        a._id ?? a.slug,
    category:  a.articleType === 'video' ? 'บทความวิดีโอ' : 'บทความ',
    title:     a.title ?? '',
    excerpt:   a.excerpt ?? '',
    thumbnail: a.coverUrl && a.coverUrl.trim() !== ''
                 ? a.coverUrl
                 : '/mock-article/cover-article-claude-cowork-vs-copilot-cowork.png.webp',
    tags:      Array.isArray(a.tags) ? a.tags : [],
    slug:      `/articles/${a.slug}`,
  }));

  return (
    <section className="bg-9e-ice px-4 py-12 dark:bg-9e-navy lg:px-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-9e-brand">
              <FileText className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-9e-navy dark:text-white">
              บทความ
            </h2>
          </div>
          <Link
            href="/articles"
            className="flex items-center gap-1 text-sm font-medium text-9e-action hover:underline dark:text-white"
          >
            ดูบทความทั้งหมด
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        {/* Desktop: static grid for ≤4, slider with arrows for >4 */}
        <div className="mt-6 hidden md:block">
          {blogs.length <= 4 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {blogs.map((blog) => (
                <BlogCard key={blog.id} blog={blog} />
              ))}
            </div>
          ) : (
            <BlogSlider blogs={blogs} />
          )}
        </div>

        {/* Mobile: swipe + auto-slide carousel */}
        <div className="mt-6 md:hidden">
          <BlogCarousel blogs={blogs} />
        </div>
      </div>
    </section>
  );
}

/**
 * Desktop slider: 4 cards visible, advances one card at a time. Arrows
 * disappear at the bounds so the track can't be pushed past the edges.
 */
function BlogSlider({ blogs }) {
  const [index, setIndex] = useState(0);
  const perPage  = 4;
  const maxIndex = Math.max(0, blogs.length - perPage);

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(maxIndex, i + 1));

  return (
    <div className="relative">
      {index > 0 && (
        <button
          type="button"
          onClick={prev}
          aria-label="ก่อนหน้า"
          className="absolute -left-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--surface-border)] bg-white shadow-sm hover:bg-9e-ice dark:bg-[#111d2c] dark:hover:bg-[#0D1B2A]"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}

      <div className="overflow-hidden pb-4">
        <div
          className="flex gap-4 transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(calc(-${index} * (100% / ${perPage} + 16px / ${perPage})))` }}
        >
          {blogs.map((blog) => (
            <div
              key={blog.id}
              className="flex-shrink-0"
              style={{ width: `calc((100% - ${(perPage - 1) * 16}px) / ${perPage})` }}
            >
              <BlogCard blog={blog} />
            </div>
          ))}
        </div>
      </div>

      {index < maxIndex && (
        <button
          type="button"
          onClick={next}
          aria-label="ถัดไป"
          className="absolute -right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--surface-border)] bg-white shadow-sm hover:bg-9e-ice dark:bg-[#111d2c] dark:hover:bg-[#0D1B2A]"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      )}
    </div>
  );
}

function BlogCarousel({ blogs }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const carouselRef = useRef(null);
  const total = blogs.length;

  // Auto-advance every 3s, pause on hover. Single-card lists don't
  // loop — nothing to advance to.
  useEffect(() => {
    if (isPaused || total <= 1) return undefined;
    const timer = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % total);
    }, 3000);
    return () => clearInterval(timer);
  }, [isPaused, total]);

  // iOS-safe swipe (uses native touchmove with passive:false so iOS
  // Safari doesn't pre-empt horizontal swipes for vertical scroll).
  useSwipe(carouselRef, {
    onSwipeLeft: () =>
      setCurrentIndex((i) => (total ? (i + 1) % total : 0)),
    onSwipeRight: () =>
      setCurrentIndex((i) => (total ? (i - 1 + total) % total : 0)),
  });

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        ref={carouselRef}
        className="overflow-hidden"
        style={{ touchAction: 'pan-y', cursor: 'grab' }}
      >
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {blogs.map((blog) => (
            <div key={blog.id} className="w-full flex-shrink-0 px-1">
              <BlogCard blog={blog} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {blogs.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrentIndex(i)}
            aria-label={`ไปบทความที่ ${i + 1}`}
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              i === currentIndex
                ? 'bg-9e-action dark:bg-[#48B0FF]'
                : 'bg-[#CBD5E1] dark:bg-[#1e3a5f]'
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function BlogCard({ blog }) {
  return (
    <Link
      href={blog.slug}
      className="group block overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-9e-card dark:ring-1 dark:ring-[#1e3a5f]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-9e-ice dark:bg-9e-navy">
        <Image
          src={blog.thumbnail}
          alt={blog.title}
          fill
          sizes="(max-width: 768px) 100vw, 25vw"
          className="object-cover transition-opacity group-hover:opacity-90"
        />
        <span className="absolute left-3 top-3 rounded-full bg-9e-brand px-3 py-1 text-xs font-bold text-white">
          {blog.category}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <h3 className="line-clamp-3 text-base font-bold leading-snug text-9e-navy dark:text-white">
          {blog.title}
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {blog.excerpt}
        </p>

        {blog.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {blog.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#E2E8F0] px-2 py-[2px] text-xs text-9e-slate-dp-50 dark:border-[#1e3a5f] dark:text-[#94a3b8]"
              >
                {tag}
              </span>
            ))}
            {blog.tags.length > 2 && (
              <span className="rounded-full border border-[#E2E8F0] px-2 py-[2px] text-xs font-medium text-9e-action dark:border-[#1e3a5f] dark:text-[#48B0FF]">
                +{blog.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
