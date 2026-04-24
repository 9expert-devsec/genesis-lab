'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { cn } from '@/lib/utils';

/**
 * Horizontal snap-scroll carousel of course cards with prev/next
 * chevrons. Button visibility tracks `scrollLeft` so the prev arrow
 * doesn't appear at position 0 and the next arrow hides at the end.
 */
export function CourseCarousel({ courses }) {
  const scrollerRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update, courses?.length]);

  const scrollBy = (delta) =>
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });

  if (!courses?.length) {
    return (
      <p className="py-10 text-center text-sm text-9e-slate">
        ยังไม่มีคอร์สในขณะนี้
      </p>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pt-2"
      >
        {courses.map((c) => (
          <div
            key={c._id ?? c.course_id}
            className="w-[330px] shrink-0 snap-start"
          >
            <CourseCard course={c} />
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="ก่อนหน้า"
        onClick={() => scrollBy(-300)}
        className={cn(
          'absolute -left-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-9e-sky text-9e-ice shadow-9e-md transition-opacity duration-9e-micro ease-9e hover:bg-9e-brand',
          canPrev ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="ถัดไป"
        onClick={() => scrollBy(300)}
        className={cn(
          'absolute -right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-9e-sky text-9e-ice shadow-9e-md transition-opacity duration-9e-micro ease-9e hover:bg-9e-brand',
          canNext ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
