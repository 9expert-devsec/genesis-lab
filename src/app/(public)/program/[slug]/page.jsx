import { notFound, redirect } from 'next/navigation';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { resolveProgramBySlug, getPageLinkability } from '@/lib/resolvePageSlug';
import { getLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { listSkills } from '@/lib/api/skills';
import { getArticles } from '@/lib/actions/articles';
import { PROGRAM_ARTICLE_CARD_FIELDS, PROGRAM_ARTICLE_LIMIT } from '@/lib/articleListFields';
import { buildProgramNames, buildSkillNames } from '@/lib/articleTaxonomy';
import { ProgramPageClient } from './_components/ProgramPageClient';
import { siteCurrentYear } from '@/lib/articlePublishTime';

export const revalidate = 3600;

/**
 * Stable FAQ ref for a program — prefer the upstream business code
 * (`program_id`), fall back to `_id`. Matches the precedence used across the
 * admin order clients and resolvePageSlug so FAQs key on a durable code.
 */
function programRefId(program) {
  return String(program?.program_id ?? program?._id ?? '');
}

/**
 * /program/[slug] is now a transitional route. When the program has an
 * admin-set custom `urlSlug`, the canonical page lives at /<urlSlug> via
 * the catch-all route, so we redirect there. Programs without a custom
 * slug keep rendering inline here (canonical stays /program/<slug>), so
 * existing links never break.
 *
 * We resolve the config first and redirect before doing the heavier
 * course/early-bird fetches, so a redirect doesn't pay for work it
 * throws away.
 */
export default async function ProgramPage({ params }) {
  const { slug } = await params;
  const programsRes = await listPrograms().catch(() => ({ items: [] }));
  const programs = programsRes.items ?? [];

  const resolved = await resolveProgramBySlug(slug, programs);
  if (!resolved) notFound();
  if (resolved.config?.isPublished === false) notFound();

  const custom = resolved.config?.urlSlug?.trim();
  if (custom) redirect(`/${custom}`);

  // No custom slug — render inline under /program/<slug>.
  const { program, config } = resolved;
  const [coursesRes, earlyBirdMap, faqs, linkability, onlineRes, articlesRes, skillsRes] = await Promise.all([
    listPublicCourses().catch(() => ({ items: [] })),
    getAllActiveEarlyBirdMap().catch(() => ({})),
    getLocalFaqsForCourse('program', programRefId(program)).catch(() => []),
    // Server-side, once per render, for the cards' skill capsules. Fails
    // closed to empty maps — a capsule then renders unlinked, never dead.
    getPageLinkability(),
    /**
     * Online courses for the section between the course grid and the FAQ.
     * Filtered upstream by the program SHORT CODE — the same `programRefId`
     * the FAQ ref uses, and deliberately not the `String(program._id)` the
     * course filter below uses. See the note in [...slug]/page.jsx's
     * loadProgram; the divergence is pre-existing and out of scope here.
     *
     * Fails closed to `{ items: [] }` for the reason listPublicCourses does:
     * upstream is a separate service, and a program page that 500s because an
     * optional section could not load is worse than one without the section.
     */
    getOnlineCourses({ program: programRefId(program) }).catch(() => ({ items: [] })),
    /**
     * Related articles, for the section after the FAQ. Same three decisions as
     * the catch-all route's loadProgram, and for the same reasons:
     *   · filtered by the program SHORT CODE, which is what Article.programs
     *     stores;
     *   · NO ordering here — getArticles applies the shipped ARTICLE_SORT, and
     *     a second sort at a call site would be a second owner of it;
     *   · an EXPLICIT select from one named constant, because the read path
     *     .lean()s then JSON-round-trips, so an omitted field vanishes rather
     *     than arriving empty and the pin badge disappears silently.
     */
    getArticles({
      program: programRefId(program),
      active: true,
      limit: PROGRAM_ARTICLE_LIMIT,
      select: PROGRAM_ARTICLE_CARD_FIELDS,
    }).catch(() => ({ items: [] })),
    // For the article cards' skill chips. Same fail-closed shape as
    // listPrograms above — an empty map renders no chips, never a raw id.
    listSkills().catch(() => ({ items: [] })),
  ]);
  const programKey = String(program._id);
  const programCourses = (coursesRes.items ?? []).filter(
    (c) => String(c?.program?._id ?? '') === programKey
  );
  const courses = await enrichCoursesWithDetails(programCourses);

  return (
    <ProgramPageClient
      program={program}
      config={config}
      courses={courses}
      earlyBirdMap={earlyBirdMap}
      faqs={faqs}
      currentYear={siteCurrentYear()}
      skillSlugs={linkability.skillSlugs}
      onlineCourses={onlineRes.items ?? []}
      articles={articlesRes.items ?? []}
      programNames={buildProgramNames(programs)}
      skillNames={buildSkillNames(skillsRes.items ?? [])}
    />
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const programsRes = await listPrograms().catch(() => ({ items: [] }));
  const resolved = await resolveProgramBySlug(slug, programsRes.items ?? []);
  if (!resolved) return {};

  const { program, config } = resolved;
  const title =
    config?.metaTitle?.trim() ||
    `${program.program_name} | 9Expert Training`;
  const description =
    config?.metaDescription?.trim() ||
    program.program_description ||
    program.program_teaser ||
    '';
  const ogImage = config?.ogImage?.trim() || program.programiconurl || '';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}
