'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { HeroPdfButton } from '@/components/ui/HeroPdfButton';

/**
 * Gradient hero with centered pill search input.
 *
 * Search is locally-controlled for immediate typing feedback; the debounced
 * value (300ms) is reported back via `onDebouncedChange` so the parent can
 * filter without re-rendering on every keystroke.
 */
export function HeroSearch({ defaultValue = '', onDebouncedChange }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const t = setTimeout(() => {
      onDebouncedChange?.(value);
    }, 300);
    return () => clearTimeout(t);
  }, [value, onDebouncedChange]);

  return (
    <section className="relative overflow-hidden bg-9e-gradient-hero py-12  dark:bg-gradient-to-b dark:from-[#0a1628] dark:to-[#0d1e36] md:py-16">
      {/* Decorative blurred circles */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-[1200px] px-4 text-center lg:px-6">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          หลักสูตรทั้งหมด
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-base text-white/80">
          สอนแบบปูพื้นความรู้ เทคโนโลยีเพื่อ &ldquo;ขับเคลื่อนประเทศไทย&rdquo;
        </p>

        <div className="mx-auto mt-6 flex max-w-xl items-center gap-3 rounded-full bg-white px-5 py-3 shadow-md dark:bg-[#111d2c] dark:shadow-none dark:ring-1 dark:ring-[#1e3a5f]">
          <Search
            className="h-5 w-5 flex-none text-9e-slate-dp-50"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ค้นหาหลักสูตร"
            aria-label="ค้นหาหลักสูตร"
            className="min-w-0 flex-1 border-0 bg-transparent text-9e-navy placeholder:text-9e-slate-lt-400 dark:placeholder:text-9e-slate-dp-400 focus:outline-none focus:ring-0 dark:text-white"
          />
        </div>

        {/*
          ── THE CATALOG PDF, MOVED HERE IN ROUND TC-CAT ────────────────────
          It used to be a full-width card section after the results grid — an
          icon tile, a heading, a two-line description, this button, and a
          caption reading "ไฟล์ PDF · ขนาดประมาณ 44.6 MB · เปิดในแท็บใหม่".
          All of that is deleted; only the button survives, and it now sits in
          the hero the way /schedule's does.

          THE CAPTION IS GONE ON PURPOSE — not shortened, not moved into a
          tooltip, and the size is not folded into the label. The file is still
          44.6 MB and that is still a real cost on a phone; the bare button was
          chosen anyway, with that known.

          IT IS SAFE ABOVE THE STICKY BAR, WHICH THE OLD PLACEMENT WAS NOT.
          The deleted section's own comment argued it could not live near the
          top because FilterBar is `sticky top-20` and a block above it would
          push the bar, the results count and every card down. That reasoning
          was about being a SIBLING between the hero and the bar. Inside the
          hero's own container it displaces nothing outside the band.

          The href is a hardcoded site-root path — one of the three
          WEBROOT_DOCUMENTS rewritten to Vercel Blob. NOT CMS-managed, unlike
          /schedule's, whose url comes from Mongo. Moving the button changed
          neither the URL nor how the bytes are served.
        */}
        <HeroPdfButton href="/9expert-training-course-catalog.pdf">
          ดาวน์โหลดแคตตาล็อกหลักสูตร
        </HeroPdfButton>
      </div>
    </section>
  );
}
