'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, FileText } from 'lucide-react';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { BlogCard } from '@/app/_components/home/BlogSection';
import { toKebab } from '@/lib/slug';

/**
 * Public skill detail page.
 *
 * Layout:
 *   1. Gradient hero with the skill icon, name, count, and teaser.
 *   2. Per-program sections — each has its own course grid so users
 *      can scan how a skill is broken down across programs.
 *   3. Optional roadmap image when `skill_roadmap_url` is present.
 *   4. Related mock blogs.
 */
export function SkillPageClient({ skill, coursesByProgram, totalCourses, blogs }) {
  const description =
    skill?.skill_description || skill?.skill_teaser || '';
  const roadmapUrl = skill?.skill_roadmap_url ?? null;

  return (
    <main className="min-h-screen bg-9e-ice dark:bg-9e-border pb-16">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-9e-primary to-[#0047CC] py-14 text-center dark:from-[#0a1628] dark:to-[#0d1e36]">
        <div className="mx-auto max-w-[900px] px-4 lg:px-6">
          {skill?.skilliconurl && (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 p-3 backdrop-blur">
              <Image
                src={skill.skilliconurl}
                alt={skill.skill_name ?? ''}
                width={48}
                height={48}
                className="object-contain"
                unoptimized
              />
            </div>
          )}
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            {skill?.skill_name}
          </h1>
          <p className="mt-3 text-sm text-white/80">
            กลุ่ม Skill {skill?.skill_name} มีทั้งหมด{' '}
            <span className="font-bold text-white">{totalCourses}</span>{' '}
            หลักสูตร
          </p>
          {description && (
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/80">
              {description}
            </p>
          )}
        </div>
      </section>

      {/* ── Roadmap ───────────────────────────────────────────────── */}
      {roadmapUrl && (
        <section className="mx-auto max-w-[1200px] px-4 pt-10 lg:px-6">
          <div className="overflow-hidden rounded-2xl bg-white shadow-9e-sm">
            <div className="relative aspect-[16/7] w-full">
              <Image
                src={roadmapUrl}
                alt={`${skill?.skill_name ?? ''} Roadmap`}
                fill
                sizes="(max-width: 1280px) 100vw, 1200px"
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
        </section>
      )}

      {/* ── Per-program sections ──────────────────────────────────── */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 pt-12 lg:px-6 lg:pt-16">
        {coursesByProgram.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-9e-slate dark:border-[#1e3a5f]">
            ยังไม่มีหลักสูตรใน Skill นี้
          </p>
        ) : (
          coursesByProgram.map(({ program, courses }) => {
            const programSlug = toKebab(program?.program_name);
            return (
              <section key={program?._id ?? program?.program_id}>
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
                    {program?.program_name}
                  </h2>
                  <span className="rounded-full bg-9e-sky/20 px-2 py-0.5 text-xs font-bold text-9e-primary dark:bg-[#111d2c] dark:text-9e-sky">
                    {courses.length}
                  </span>
                  {programSlug && (
                    <Link
                      href={`/program/${programSlug}`}
                      className="ml-auto text-sm font-medium text-9e-primary hover:underline dark:text-9e-sky"
                    >
                      ดูหลักสูตรใน Program นี้ →
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {courses.map((c) => (
                    <CourseCard key={c._id ?? c.course_id} course={c} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

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
