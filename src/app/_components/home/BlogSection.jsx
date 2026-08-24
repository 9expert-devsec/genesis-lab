'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipe } from '@/hooks/useSwipe';
import { ProgramOverlay, SkillChips } from '@/components/articles/ArticleTaxonomyChips';
import { clampSlideIndex, perPageForWidth } from '@/lib/blogSliderLayout';

/** ROUND HS-C: same whole-section fade-up as ProgramSelector, for consistency. */
const FADE_UP_VARIANTS = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

/**
 * Real articles only — server fetches via `getFeaturedArticlesForLanding`
 * and passes them in. If nothing is featured, the section disappears
 * entirely rather than showing a placeholder.
 *
 * Desktop renders a 1–4 column grid for short lists or a 4-up arrow
 * slider when there are more than 4 cards; mobile is a swipeable,
 * auto-advancing carousel with dot indicators.
 */
export function BlogSection({ articles = [], programNames = {}, skillNames = {} }) {
  // Hooks before the early return — React requires unconditional hook calls.
  const shouldReduceMotion = useReducedMotion();

  if (articles.length === 0) return null;

  const blogs = articles.map((a) => ({
    id:        a._id ?? a.slug,
    // TAXONOMY IDS, NOT A PRE-RENDERED LABEL. The card used to carry
    // `category` (articleType, always บทความ or บทความวิดีโอ) and free-text
    // `tags`; it now shows the same PROGRAM overlay and SKILL chips as
    // ArticleCard on /articles, resolved through the shared name maps.
    programs:  Array.isArray(a.programs) ? a.programs : [],
    skills:    Array.isArray(a.skills) ? a.skills : [],
    title:     a.title ?? '',
    excerpt:   a.excerpt ?? '',
    thumbnail: a.coverUrl && a.coverUrl.trim() !== ''
                 ? a.coverUrl
                 : '/mock-article/cover-article-claude-cowork-vs-copilot-cowork.png.webp',
    slug:      `/articles/${a.slug}`,
  }));

  // ROUND HS-B: bg-[var(--page-bg)], no dark: override — --page-bg is
  // 0D1B2A in dark mode, the same value dark:bg-9e-navy used to name
  // explicitly, so the override was redundant once the base class reads
  // the var directly.
  return (
    <motion.section
      className="bg-[var(--page-bg)] px-4 py-12 lg:px-6"
      variants={FADE_UP_VARIANTS}
      initial={shouldReduceMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
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
                <BlogCard key={blog.id} blog={blog} programNames={programNames} skillNames={skillNames} />
              ))}
            </div>
          ) : (
            <BlogSlider blogs={blogs} programNames={programNames} skillNames={skillNames} />
          )}
        </div>

        {/* Mobile: swipe + auto-slide carousel */}
        <div className="mt-6 md:hidden">
          <BlogCarousel blogs={blogs} programNames={programNames} skillNames={skillNames} />
        </div>
      </div>
    </motion.section>
  );
}

/**
 * Desktop slider: 4 cards visible, advances one card at a time. Arrows
 * disappear at the bounds so the track can't be pushed past the edges.
 */
function BlogSlider({ blogs, programNames, skillNames }) {
  const [index, setIndex] = useState(0);

  // PERPAGE IS FOR THE ARROWS, NOT FOR THE LAYOUT. Card widths are responsive
  // Tailwind classes below, so the slider is laid out correctly on the first
  // paint with no JavaScript at all — which is what keeps this hydration-safe:
  // server and client both render this initial 4, and the effect corrects it
  // afterwards. Nothing about the geometry depends on the correction.
  const [perPage, setPerPage] = useState(4);

  useEffect(() => {
    const apply = () => setPerPage(perPageForWidth(window.innerWidth));
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  // Page count moves with perPage, so widening the window shrinks maxIndex and
  // can leave the reader parked past the end, looking at a blank slide.
  useEffect(() => {
    setIndex((i) => clampSlideIndex(i, blogs.length, perPage));
  }, [perPage, blogs.length]);

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
        {/* The STEP still comes from JS because it is multiplied by `index`,
            which is state. Safe: index is 0 on the server AND on the client's
            first render, and translateX(0) is the same string whatever perPage
            says, so there is nothing to mismatch. It only starts to matter
            after a click, long after hydration.

            The WIDTHS below are CSS, not JS — responsive Tailwind classes
            matching the grid this slider stands in for (2 at md, 3 at lg, 4 at
            xl), so the layout is right on the first paint with no JavaScript.
            The old fixed /4 gave a 172px card at md, too narrow for the title
            and excerpt it already renders, let alone a chip; and five featured
            articles rendered at roughly double the density of four in the same
            section. Underscores are Tailwind's escape for the spaces calc()
            requires around `-`. */}
        <div
          className="flex gap-4 transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(calc(-${index} * (100% / ${perPage} + 16px / ${perPage})))` }}
        >
          {blogs.map((blog) => (
            <div
              key={blog.id}
              className="w-[calc((100%_-_16px)/2)] flex-shrink-0 lg:w-[calc((100%_-_32px)/3)] xl:w-[calc((100%_-_48px)/4)]"
            >
              <BlogCard blog={blog} programNames={programNames} skillNames={skillNames} />
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

function BlogCarousel({ blogs, programNames, skillNames }) {
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
              <BlogCard blog={blog} programNames={programNames} skillNames={skillNames} />
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

export function BlogCard({ blog, programNames = {}, skillNames = {} }) {
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
        {/* CAP 2. This row is absolutely positioned and cannot wrap out of the
            way like the skill row below, so its budget is the CARD EDGE — not
            the cover art, whose layout varies (most article covers are legacy
            files and some carry no logo at all; see the note on ProgramOverlay).
            The narrowest card this renders on is 288px, at xl in either the
            grid or the slider, giving 264px usable against a widest-real-pair
            of 185.8px. It used to be 172px, where 2 overflowed — that was the
            slider showing 4 per view at every width, fixed alongside this. */}
        <ProgramOverlay ids={blog.programs} names={programNames} cap={2} />
      </div>

      <div className="flex flex-col gap-2 p-4">
        <h3 className="line-clamp-3 text-base font-bold leading-snug text-9e-navy dark:text-white">
          {blog.title}
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {blog.excerpt}
        </p>

        {/* CAP 2, passed explicitly because /articles passes 3 and the two
            differ for a measured reason. This grid is xl:grid-cols-4 at gap-4
            inside max-w-[1200px] → (1200 - 48) / 4 = 288px per card, against
            384px there: 25% narrower, and a third chip wraps. */}
        <SkillChips ids={blog.skills} names={skillNames} cap={2} />
      </div>
    </Link>
  );
}
