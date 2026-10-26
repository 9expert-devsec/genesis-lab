'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { toKebab } from '@/lib/slug';
import { FaqAccordionSection } from '@/components/faq/FaqAccordionSection';
import { ProgramArticlesSection } from '@/components/program/ProgramArticlesSection';
import { ProgramOnlineCoursesSection } from '@/components/program/ProgramOnlineCoursesSection';
import { PageCatalogButton } from '@/components/ui/PageCatalogButton';

/**
 * Public skill detail page.
 *
 * Layout:
 *   1. Gradient hero with the skill icon, name, count, and teaser.
 *   2. Per-program sections — each has its own course grid so users
 *      can scan how a skill is broken down across programs.
 *   3. Optional roadmap image when `skill_roadmap_url` is present.
 */
export function SkillPageClient({
  skill,
  // The SkillPageConfig row, for the catalog button. `null` when the skill has
  // no config, which hasCatalog reads as no file — the program page already
  // took `config` for its description; this is the same prop for the same row.
  config = null,
  coursesByProgram,
  totalCourses,
  faqs = [],
  currentYear,
  skillSlugs = {},
  /**
   * Online courses for this skill, filtered upstream by the route — the
   * program page's section and card, filtered by skill instead.
   */
  onlineCourses = [],
  /**
   * Related articles for this skill, capped and ordered by the route — the
   * program page's section and props, filtered by Article.skills instead.
   */
  articles = [],
  articlesTotal = 0,
  programNames = {},
  skillNames = {},
}) {
  const description =
    skill?.skill_description || skill?.skill_teaser || '';
  const roadmapUrl = skill?.skill_roadmap_url ?? null;

  return (
    <main className="min-h-screen bg-9e-ice dark:bg-9e-border pb-16">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-9e-action to-[#0047CC] py-14 text-center dark:from-[#0a1628] dark:to-[#0d1e36]">
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

          {/* The catalog, under the description — nothing at all when the
              skill has no file (lib/pageCatalog.hasCatalog). */}
          <PageCatalogButton config={config} />
        </div>
      </section>

      {/* ── Roadmap ───────────────────────────────────────────────── */}
      {/*
        THE FRAME HUGS THE IMAGE. This was a fixed 16:7 box with a `fill`
        image and `object-contain`; measured 2026-10-26 the two skill roadmaps
        are 2500x1664 (power-platform, 1.502) and 5266x3724 (automation,
        1.414), so the box painted ~200px of white bar on each side — a white
        slab in dark mode. Same move ProgramPageClient made for its roadmap:
        no fixed ratio, `h-auto w-full`, the frame's height following the
        image, and the card-surface / border tokens instead of a white
        literal. The image is not altered.

        FULL WIDTH, NOT SHRINK-TO-FIT. A fit-content frame around a full-width
        image is a circular percentage: before the image loads the frame
        collapses to the browser's 300px default and then jumps — measured
        CLS 0.24 on desktop. Both roadmaps are wider than the 1200px column,
        so full width is their natural-width cap anyway.
      */}
      {roadmapUrl && (
        <section className="mx-auto max-w-[1200px] px-4 pt-10 lg:px-6">
          <div className="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-sm">
            <Image
              src={roadmapUrl}
              alt={`${skill?.skill_name ?? ''} Roadmap`}
              // Seeds an aspect ratio so the space is reserved before load;
              // the browser switches to the image's true ratio once it
              // arrives. A placeholder, not a constraint.
              width={2500}
              height={1664}
              sizes="(max-width: 1280px) 100vw, 1200px"
              className="block h-auto w-full"
              unoptimized
            />
          </div>
        </section>
      )}

      {/* ── Per-program sections ──────────────────────────────────── */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 pt-12 lg:px-6 lg:pt-16">
        {coursesByProgram.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-9e-slate-dp-50 dark:border-[#1e3a5f]">
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
                  <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
                    {courses.length}
                  </span>
                  {programSlug && (
                    <Link
                      href={`/program/${programSlug}`}
                      className="ml-auto text-sm font-medium text-9e-action hover:underline dark:text-9e-air"
                    >
                      ดูหลักสูตรใน Program นี้ →
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {courses.map((c) => (
                    <CourseCard
                      key={c._id ?? c.course_id}
                      course={c}
                      currentYear={currentYear}
                      skillSlugs={skillSlugs}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* ── Online courses ────────────────────────────────────────── */}
      {/* Same slot as the program page: after the course grids, before the
          FAQ. Renders nothing when the skill has no online courses. */}
      <ProgramOnlineCoursesSection
        courses={onlineCourses}
        skillSlugs={skillSlugs}
        title="หลักสูตรออนไลน์ใน Skill นี้"
      />

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <FaqAccordionSection faqs={faqs} />

      {/* ── Related articles ──────────────────────────────────────── */}
      <ProgramArticlesSection
        articles={articles}
        total={articlesTotal}
        skill={skill}
        programNames={programNames}
        skillNames={skillNames}
        title="บทความเกี่ยวกับ Skill นี้"
      />
    </main>
  );
}
