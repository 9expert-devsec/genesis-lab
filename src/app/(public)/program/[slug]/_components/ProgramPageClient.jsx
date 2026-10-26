'use client';

import Image from 'next/image';
import { RoadmapHeroThumbnail } from '@/components/ui/RoadmapHeroThumbnail';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { FaqAccordionSection } from '@/components/faq/FaqAccordionSection';
import { ProgramOnlineCoursesSection } from '@/components/program/ProgramOnlineCoursesSection';
import { ProgramArticlesSection } from '@/components/program/ProgramArticlesSection';
import { PageCatalogButton } from '@/components/ui/PageCatalogButton';

/**
 * Public program detail page.
 *
 * Two sections:
 *   1. Hero — program icon + name + course count, gradient tinted by
 *      `programcolor` when present.
 *   2. Course grid — all enriched courses for this program. CourseCard
 *      handles the card-level details (cover, schedules, badges).
 *
 * The roadmap image isn't part of the verified `/programs` shape, but
 * we look for likely field names so it shows up if upstream adds one.
 */
export function ProgramPageClient({
  program,
  config,
  courses,
  earlyBirdMap = {},
  faqs = [],
  currentYear,
  skillSlugs = {},
  /**
   * Online courses for this program, fetched server-side by the route — the
   * same flow `faqs` uses. Defaults to `[]` so a route that has not been
   * updated renders the page without the section rather than throwing; the
   * class guard in test/fs/programSectionPropsThreading is what makes sure no
   * route stays in that state.
   */
  onlineCourses = [],
  /**
   * Related articles for this program, capped and ordered by the route. Same
   * default-and-guard arrangement as `onlineCourses` above, and covered by the
   * same class guard — REQUIRED_PROPS carries both names.
   */
  articles = [],
  // getArticles' `total` — every matching article, for the section's badge.
  articlesTotal = 0,
  programNames = {},
  skillNames = {},
}) {
  /**
   * ONE FIELD, NOT THREE.
   *
   * This used to fall through `programroadmapurl` and `roadmap_url` as well,
   * under a comment saying the roadmap "isn't part of the verified /programs
   * shape" — a guess, written before anyone looked. Measured 2026-08-31 across
   * all 27 programs: `program_roadmap_url` is present on 27/27 and populated on
   * 14; the other two spellings are present on ZERO rows and have never fired.
   *
   * They are removed rather than left as insurance, because that is what they
   * actually were: a false assurance about the upstream shape. A reader seeing
   * three candidates reasonably concludes the API is inconsistent about this
   * field. It is not.
   */
  const roadmapUrl = program?.program_roadmap_url ?? null;

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

            {/* The catalog, under the description — nothing at all when the
                program has no file (lib/pageCatalog.hasCatalog). `mt-2` trims
                the button's built-in mt-6 because this column already gaps. */}
            <PageCatalogButton config={config} className="mt-2 self-start" />
          </div>

          {/*
            THE ROADMAP COLUMN — the shared thumbnail + lightbox. It renders
            nothing when there is no roadmap (Canva), and the grid then holds
            the text column alone, as it always has. The box is ISO-216
            landscape (what all 14 program roadmaps are, measured 2026-08-31)
            with object-contain, so its height is reserved before load and a
            roadmap is never cropped. See RoadmapHeroThumbnail.
          */}
          <RoadmapHeroThumbnail
            src={roadmapUrl}
            alt={`${program?.program_name ?? ''} Roadmap`}
            name={program?.program_name ?? ''}
          />
        </div>
      </section>

      {/* ── Course grid ───────────────────────────────────────────── */}
      {/* `px-4 lg:px-6` is the skill page's card-container padding, verbatim
          (SkillPageClient's per-program block) and this page's own hero
          above. Without it the cards ran to the viewport edge on mobile and
          overhung the hero by 24px a side on desktop. ProgramOnlineCoursesSection
          below carries the same string so its columns stay aligned with these. */}
      <section className="mx-auto max-w-[1200px] px-4 pt-10 lg:px-6 lg:pt-14">
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
              <CourseCard
                key={c._id ?? c.course_id}
                course={c}
                earlyBirdScheduleId={
                  earlyBirdMap[String(c.course_id).toUpperCase()] ?? null
                }
                currentYear={currentYear}
                skillSlugs={skillSlugs}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Online courses ────────────────────────────────────────── */}
      <ProgramOnlineCoursesSection
        courses={onlineCourses}
        program={program}
        skillSlugs={skillSlugs}
      />

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <FaqAccordionSection faqs={faqs} />

      {/* ── Related articles ──────────────────────────────────────── */}
      <ProgramArticlesSection
        articles={articles}
        total={articlesTotal}
        program={program}
        programNames={programNames}
        skillNames={skillNames}
      />
    </main>
  );
}
