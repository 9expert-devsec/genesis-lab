'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { FaqAccordionSection } from '@/components/faq/FaqAccordionSection';
import { ProgramOnlineCoursesSection } from '@/components/program/ProgramOnlineCoursesSection';
import { ProgramArticlesSection } from '@/components/program/ProgramArticlesSection';

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

  /**
   * The lightbox is opened by state and closed by the shared component.
   *
   * `roadmapButtonRef` is handed to ImageLightbox as `image.trigger` so focus
   * returns to the button rather than the top of the document — the same
   * contract ArticleDetailClient uses, where it passes the clicked <img>.
   *
   * THE LIGHTBOX SHOWS THE SAME URL AS THE THUMBNAIL. No Cloudinary transform
   * is derived for it: the source is already 5266px wide, and a derived URL
   * would be a second spelling of the asset that nothing guards.
   */
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const roadmapButtonRef = useRef(null);

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

          {/*
            THE FRAME FOLLOWS THE IMAGE — no fixed ratio, and never a crop.

            This was `relative aspect-video` with a `fill` <Image>. Measured
            2026-08-31: all 14 roadmaps are 5266x3724 (ISO-216 landscape,
            ratio 1.414), so inside a 16:9 box `object-contain` left EXACTLY
            20% of the white plate as empty letterbox bars — on every one of
            them, min 20%, median 20%, max 20%.

            `object-cover` would fill that space and is not an option here: a
            roadmap carries text at its edges, so cropping loses content
            rather than framing. The fix is to drop the fixed ratio instead,
            which is the same move CourseRoadmap.jsx already made for the same
            reason ("the container no longer forces a 16:9 box — roadmaps are
            wide"), using the repo's standard `h-auto w-full` sizing.

            The hero grid is `items-center`, so the column has no height to
            satisfy and simply reflows to whatever the image is.
          */}
          {roadmapUrl && (
            <button
              ref={roadmapButtonRef}
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`ดูผังการเรียนรู้ ${program?.program_name ?? ''} แบบเต็มจอ`}
              className="group block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-white shadow-9e-md transition-shadow duration-9e-micro ease-9e hover:shadow-9e-lg"
            >
              <Image
                src={roadmapUrl}
                alt={`${program?.program_name ?? ''} Roadmap`}
                // Seeds an aspect ratio so the space is reserved before load;
                // the browser uses the image's true intrinsic ratio once it
                // arrives. Do NOT "correct" these to match a differently sized
                // roadmap — they are a placeholder, not a constraint.
                width={5266}
                height={3724}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="h-auto w-full object-contain"
                unoptimized
              />
            </button>
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
        program={program}
        programNames={programNames}
        skillNames={skillNames}
      />

      {/*
        THE LIGHTBOX, mounted unconditionally and gated on its own `image`.

        It returns null when `image` is falsy, which is also how it decides not
        to lock body scroll — so a program with no roadmap mounts a component
        that renders nothing and touches nothing. `plate` is ON because a
        roadmap is a light-background diagram, often a transparent PNG, which
        would otherwise bleed into the dark backdrop.
      */}
      <ImageLightbox
        image={
          lightboxOpen && roadmapUrl
            ? {
                src: roadmapUrl,
                alt: `${program?.program_name ?? ''} Roadmap`,
                trigger: roadmapButtonRef.current,
              }
            : null
        }
        onClose={() => setLightboxOpen(false)}
        plate
      />
    </main>
  );
}
