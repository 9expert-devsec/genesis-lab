'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipe } from '@/hooks/useSwipe';

export const MOCK_BLOGS = [
  {
    id: 1,
    category: 'บทความวิดีโอ',
    title: 'Claude Cowork vs Copilot Cowork เปรียบเทียบ AI Agent สองค่ายใหญ่ ใครเหมาะกับคุณ?',
    excerpt:
      'Claude Cowork vs Copilot Cowork จะเลือกใช้ AI Agent ตัวไหน มาดูกันในบทความนี้เลยว่า คุณเหมาะกับเครื่องมือไหน',
    thumbnail: '/mock-article/cover-article-claude-cowork-vs-copilot-cowork.png.webp',
    tags: ['Artificial Intelligence'],
    slug: '#',
  },
  {
    id: 2,
    category: 'บทความวิดีโอ',
    title: 'อ่าน เขียน ข้อมูลจบได้ใน Power BI ด้วย Translytical',
    excerpt:
      'หากพูดถึงการแก้ไขข้อมูลและอัปเดตข้อมูล Power BI หากเป็นเมื่อก่อนทางผู้ใช้คงจะตอบว่าไม่สามารถทำได้...',
    thumbnail: '/mock-article/cover-what-is-translytical.png.webp',
    tags: ['Power Platform', 'Business', 'Data'],
    slug: '#',
  },
  {
    id: 3,
    category: 'บทความวิดีโอ',
    title: 'เจาะลึก 3 เครื่องมือ AI Automation ยกระดับธุรกิจด้วย Agentic AI',
    excerpt:
      'เปลี่ยนงานซ้ำซ้อนให้เป็นระบบอัจฉริยะด้วยกลยุทธ์ Agentic AI ผ่าน 3 เครื่องมือระดับโลก...',
    thumbnail: '/mock-article/cover-articles-3-ai-agent-automation-tools_0.jpg.webp',
    tags: ['Business', 'Artificial Intelligence'],
    slug: '#',
  },
];

/**
 * Static mockup matching the design reference. No props, no API —
 * swap to real data via a server-fetch adapter once the article CMS
 * pipeline is in place.
 *
 * Mobile renders a swipeable, auto-advancing carousel; desktop keeps
 * the 3-column grid since all three cards already fit.
 */
export function BlogSection() {
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
            className="flex items-center gap-1 text-sm font-medium text-9e-brand hover:underline dark:text-white"
          >
            ดูบทความทั้งหมด
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        {/* Desktop: static 3-col grid */}
        <div className="mt-6 hidden grid-cols-3 gap-6 md:grid">
          {MOCK_BLOGS.map((blog) => (
            <BlogCard key={blog.id} blog={blog} />
          ))}
        </div>

        {/* Mobile: swipe + auto-slide carousel */}
        <BlogCarousel blogs={MOCK_BLOGS} />
      </div>
    </section>
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
      className="mt-6 md:hidden"
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
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-9e-card dark:ring-1 dark:ring-[#1e3a5f]">
      <div className="relative aspect-video w-full overflow-hidden bg-9e-ice dark:bg-9e-navy">
        <Image
          src={blog.thumbnail}
          alt={blog.title}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover"
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {blog.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#E2E8F0] px-2 py-[2px] text-xs text-9e-slate-dp-50 dark:border-[#1e3a5f] dark:text-[#94a3b8]"
              >
                {tag}
              </span>
            ))}
          </div>
          <a
            href={blog.slug}
            className="whitespace-nowrap text-sm font-medium text-9e-action hover:underline dark:text-[#48B0FF]"
          >
            อ่านเพิ่มเติม ...
          </a>
        </div>
      </div>
    </div>
  );
}
