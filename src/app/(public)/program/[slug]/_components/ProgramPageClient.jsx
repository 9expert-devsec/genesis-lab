'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, FileText } from 'lucide-react';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { BlogCard } from '@/app/_components/home/BlogSection';

/**
 * Public program detail page.
 *
 * Three sections:
 *   1. Hero — program icon + name + course count, gradient tinted by
 *      `programcolor` when present.
 *   2. Course grid — all enriched courses for this program. CourseCard
 *      handles the card-level details (cover, schedules, badges).
 *   3. Related blogs — currently the static MOCK_BLOGS until an article
 *      CMS pipeline is wired up.
 *
 * The roadmap image isn't part of the verified `/programs` shape, but
 * we look for likely field names so it shows up if upstream adds one.
 */
export function ProgramPageClient({ program, config, courses, blogs }) {
  const roadmapUrl =
    program?.program_roadmap_url ??
    program?.programroadmapurl ??
    program?.roadmap_url ??
    null;

  const description =
    config?.metaDescription?.trim() ||
    program?.program_description ||
    program?.program_teaser ||
    '';

  const heroBackground = program?.programcolor
    ? `linear-gradient(135deg, ${program.programcolor}22, ${program.programcolor}55)`
    : 'linear-gradient(135deg, #EEF6FF, #DBEEFF)';

  return (
    <main className="min-h-screen bg-9e-ice dark:bg-9e-border pb-16">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: heroBackground }}
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-8 px-4 py-12 lg:grid-cols-2 lg:px-6 lg:py-16">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {program?.programiconurl && (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 p-2 shadow-9e-sm dark:bg-9e-navy/80">
                  <Image
                    src={program.programiconurl}
                    alt={program.program_name ?? ''}
                    width={48}
                    height={48}
                    className="object-contain"
                    unoptimized
                  />
                </div>
              )}
              <div>
                <h1 className="text-3xl font-bold text-9e-navy dark:text-white md:text-4xl">
                  {program?.program_name}
                </h1>
                <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  กลุ่มหลักสูตร {program?.program_name} มีทั้งหมด{' '}
                  <span className="font-bold text-9e-action dark:text-9e-air">
                    {courses.length}
                  </span>{' '}
                  หลักสูตร
                </p>
              </div>
            </div>

            {description && (
              <p className="max-w-xl text-sm leading-relaxed text-9e-navy/80 dark:text-white/80 md:text-base">
                {description}
              </p>
            )}
          </div>

          {roadmapUrl && (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-white shadow-9e-md">
              <Image
                src={roadmapUrl}
                alt={`${program?.program_name ?? ''} Roadmap`}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
                unoptimized
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Course grid ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] pt-10 lg:pt-14">
        <div className="mb-6 flex items-center gap-3">
          {program?.programiconurl && (
            <Image
              src={program.programiconurl}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              unoptimized
            />
          )}
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            หลักสูตรในโปรแกรม
          </h2>
          <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
            {courses.length}
          </span>
        </div>

        {courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-9e-slate-dp-50 dark:border-[#1e3a5f]">
            ยังไม่มีหลักสูตรในโปรแกรมนี้
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start">
            {courses.map((c) => (
              <CourseCard key={c._id ?? c.course_id} course={c} />
            ))}
          </div>
        )}
      </section>

      {/* ── Related blogs ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-4 pt-12 lg:px-6 lg:pt-16">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-9e-brand">
              <FileText className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-9e-navy dark:text-white">
              บทความที่เกี่ยวข้อง
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {blogs.slice(0, 3).map((blog) => (
            <BlogCard key={blog.id} blog={blog} />
          ))}
        </div>
      </section>
    </main>
  );
}
