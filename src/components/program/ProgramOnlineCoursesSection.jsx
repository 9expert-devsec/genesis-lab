'use client';

import Image from 'next/image';
import { OnlineCourseCard } from '@/app/_components/home/OnlineCourseCard';

/**
 * The online courses belonging to one program, on the program page.
 *
 * Sits between the course grid and the FAQ. Data is fetched server-side in the
 * route and handed down as a prop — the same flow as `faqs`, deliberately, so
 * there is one story for how a program-page section gets its rows rather than
 * two.
 *
 * ── EMPTY MEANS INVISIBLE, AND THAT IS THE COMMON CASE HERE ────────────────
 *
 * Same guard as FaqAccordionSection: no rows, no section — no heading, no
 * empty box, no dashed placeholder. The course grid above DOES render a
 * placeholder when it is empty ("ยังไม่มีหลักสูตรในโปรแกรมนี้"), and this
 * deliberately does not copy that, because the two empties mean different
 * things. A program with no classroom courses is a surprise worth stating; a
 * program with no ONLINE courses is the norm.
 *
 * Measured 2026-08-31 (docs/audit/program-page-sections.md §2.6): of 27
 * programs, 14 have zero online courses and 10 more have exactly one. Only MSE
 * (10) fills a row. So this section is ABSENT on more than half the program
 * pages by design, and a placeholder would have been 14 pages of apology.
 *
 * ── WHY A GRID AND NOT A CAROUSEL ──────────────────────────────────────────
 *
 * The home page shows these cards in a `CourseCarousel`. Here it is a plain
 * grid, and the distribution above is the reason: a carousel at n=1 is a
 * single slide with two arrows that do nothing, and n=1 is the SECOND most
 * common case on this page. A CSS grid needs no special case — one item is one
 * item, left-aligned in the first column, the same width as its neighbours
 * would be. Nothing centres it, nothing stretches it.
 *
 * The grid literal is identical to the course grid's above it, so the two
 * sections' cards line up column-for-column.
 *
 * ── CONTAINER MATCHES THE COURSE GRID EXACTLY, INCLUDING ITS px ────────────
 *
 * `mx-auto max-w-[1200px] px-4 … lg:px-6`, copied verbatim from
 * ProgramPageClient's course-grid section. The two used to share a container
 * with NO horizontal padding — this note once said the missing padding was
 * "a pre-existing question about the page, not this section's to answer" —
 * and the page answered it: the cards ran to the viewport edge on mobile and
 * overhung the hero on desktop, while the skill page's identical cards sat
 * inside `px-4 lg:px-6`. Both sections now carry that padding, and the
 * reason they are pinned to each other is unchanged: an edit to one that the
 * other does not follow insets it relative to its neighbour, and the two
 * visibly disagree.
 *
 * @param {Array}  courses    online-course rows, already filtered to the program
 * @param {object} program    for the heading icon; optional
 * @param {object} skillSlugs id → catalogue slug map for the cards' capsules
 */
export function ProgramOnlineCoursesSection({
  courses = [],
  program,
  skillSlugs = {},
  title = 'หลักสูตรออนไลน์ในโปรแกรม',
  id = 'online-courses',
}) {
  if (!courses?.length) return null;

  return (
    <section id={id} className="mx-auto max-w-[1200px] px-4 pt-10 lg:px-6 lg:pt-14">
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
        <h2 className="text-lg font-bold text-9e-navy dark:text-white">{title}</h2>
        <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
          {courses.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start">
        {courses.map((c) => (
          <OnlineCourseCard
            key={c._id ?? c.o_course_id}
            course={c}
            skillSlugs={skillSlugs}
          />
        ))}
      </div>
    </section>
  );
}
