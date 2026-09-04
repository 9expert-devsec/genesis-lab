import { notFound, permanentRedirect, redirect } from 'next/navigation';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { notFoundOrRedirect } from '@/lib/redirects/notFoundBoundary';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import {
  PUBLIC_SCHEDULE_STATUSES,
  listSchedulesByCourse,
} from '@/lib/api/schedules';
import { resolveCourse } from '@/lib/resolveCourse';
import { courseRedirectTarget, courseRedirectFn } from '@/lib/courses/courseRedirect';
import { resolveHiddenCourseForAdmin } from '@/lib/courses/adminCoursePreview';
import { inhouseRegistrationHref } from '@/lib/courseRegistrationHref';
import { getCareerPathBySlug } from '@/lib/career-paths/getCareerPaths';
import { getLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { CareerPathDetail } from './_components/CareerPathDetail';
import { FaqAccordionSection } from '@/components/faq/FaqAccordionSection';
import { CourseCard } from '@/components/course/CourseCard';
import { CourseHero } from './_components/CourseHero';
import { SkillBreadcrumb } from './_components/SkillBreadcrumb';
import { ScheduleSection } from './_components/ScheduleSection';
import { CourseDescription } from './_components/CourseDescription';
import { CourseObjectives } from './_components/CourseObjectives';
import { CourseTarget } from './_components/CourseTarget';
import { CoursePrerequisites } from './_components/CoursePrerequisites';
import { CourseRequirements } from './_components/CourseRequirements';
import { CourseOutline } from './_components/CourseOutline';
import { prepareOutlineRichHtml } from '@/lib/courses/courseOutlineView';
import { CourseRoadmap } from './_components/CourseRoadmap';
import { SidebarNav } from './_components/SidebarNav';
import { CourseSectionTabs } from './_components/CourseSectionTabs';
import { SECTION_ANCHOR_CLASS } from '@/lib/courseSectionNav';
import { InhouseCTA } from './_components/InhouseCTA';
import { PDFDownload } from './_components/PDFDownload';
import { RelatedCourses } from './_components/RelatedCourses';
import { siteCurrentYear } from '@/lib/articlePublishTime';
import { CourseStickyCTA } from './_components/CourseStickyCTA';
import { EarlyBirdBanner } from './_components/EarlyBirdBanner';
import { CoursePromoSection } from './_components/CoursePromoSection';
import {
  getEarlyBirdByCourse,
  getActiveCoursePromos,
  getAllActiveEarlyBirdMap,
} from '@/lib/actions/course-promos';
import { dbConnect } from '@/lib/db/connect';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import {
  getPageLinkability,
  resolveProgramBySlug,
  resolveSkillBySlug,
} from '@/lib/resolvePageSlug';
import { chipHref, programHref, skillHref } from '@/lib/utils';
import { listSkills } from '@/lib/api/skills';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { getArticles } from '@/lib/actions/articles';
import { PROGRAM_ARTICLE_CARD_FIELDS, PROGRAM_ARTICLE_LIMIT } from '@/lib/articleListFields';
import { buildProgramNames, buildSkillNames } from '@/lib/articleTaxonomy';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';
import { buildCourseJsonLd } from '@/lib/courses/buildCourseJsonLd';
import { courseCanonicalUrl } from '@/lib/courses/courseCanonicalPath';
import { attachAliases, loadCourseAliasMap } from '@/lib/courses/hiddenCourses';
import {
  getCustomPageBySlug,
  getCustomPageBySlugAny,
  findCustomPageByHistoricalSlug,
} from '@/lib/actions/customPages';
import { buildPageJsonLd } from '@/lib/customPages/buildPageJsonLd';
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';
import { isPromotionPage } from '@/lib/pageBuilder/promotionMode';
import { CustomPageView } from './_components/CustomPageView';
import {
  getPageBuilderPageBySlugAny,
  findPageBuilderPageByHistoricalSlug,
} from '@/lib/actions/pageBuilder';
import { PageBuilderView } from '@/components/pageBuilder/PageBuilderView';
import { stripDraft } from '@/lib/pageBuilder/draftState';

/**
 * Catch-all route for legacy-style pattern URLs:
 *   /<slug>-training-course   → course detail (real data)
 *   /<custom-alias>           → same course, but matched by
 *                               CourseExtension.urlAlias
 *   /<slug>-career-path       → career path detail (Phase 3 placeholder)
 *   /<slug>-all-courses       → catalog by skill or program (Phase 3 placeholder)
 *
 * Resolution flow:
 *   resolveCourse() tries alias first, then the `-training-course`
 *   suffix. If neither hits, fall through to the placeholder branches
 *   so career-path / all-courses URLs keep working.
 */

export const revalidate = 3600;

/**
 * Stable FAQ refs for program/skill — prefer the upstream business code
 * (`program_id` / `skill_id`), fall back to `_id`. Same precedence as the
 * admin order clients and resolvePageSlug, so FAQs key on a durable code
 * rather than a re-issuable ObjectId.
 */
function programRefId(program) {
  return String(program?.program_id ?? program?._id ?? '');
}
function skillRefId(skill) {
  return String(skill?.skill_id ?? skill?._id ?? '');
}

function segmentFromSlug(slug) {
  const segment = Array.isArray(slug) ? slug.join('/') : String(slug ?? '');
  if (segment.includes('/')) return null;
  return segment;
}

// Resolve a custom page for either public (published) or preview (any status
// with a matching token) access. Returns { page, isPreview } or null.
async function resolveCustomPageForRequest(segment, searchParams) {
  const sp = await searchParams;               // App Router: searchParams is a promise
  const token = sp?.preview ? String(sp.preview) : '';
  if (token) {
    const draft = await getCustomPageBySlugAny(segment);
    if (draft && draft.previewToken && draft.previewToken === token) {
      return { page: draft, isPreview: true };
    }
    // token present but wrong/!match → fall through to published-only
  }
  const published = await getCustomPageBySlug(segment);
  if (published) return { page: published, isPreview: false };
  return null;
}

// The publish-window rules moved to lib/pageBuilder/visibility.js — ONE
// definition, because the 2B editor's publish dialog must give the author the
// SAME answer this route gives the visitor. A second copy would drift into
// telling an author a page is live while this route 404s it. The ISR caveat
// (revalidate = 3600, so a scheduled page goes live within the hour, not on the
// second) is documented there.

// ── ADMIN PREVIEW OF A HIDDEN COURSE ──────────────────────────────────────
// Same shape as resolveCustomPageForRequest above — `?preview=` on this route,
// gated, falling through to the ordinary answer when it does not apply — so
// this route has ONE preview idiom rather than two. The gate itself lives in
// lib/courses/adminCoursePreview because a page file can export nothing but
// Next's own contract, and "no session means no course" is a claim that needs a
// callable function to prove, not a grep over this file.

// Resolve a PUBLIC builder page. Reads any-status (the published-only action
// can't express the date window) and gates in JS. Preview lives on its own
// /preview/[slug] route and never resolves here.
async function resolveBuilderPageForRequest(segment) {
  const page = await getPageBuilderPageBySlugAny(segment);
  if (!page) return null;
  // stripDraft HERE rather than inside getPageBuilderPageBySlugAny, because
  // that reader is shared with /preview/[slug] and previewAccess, which are
  // allowed to see a draft (and in round 3 will render it). This is a PUBLIC
  // request path: an unpublished edit must never reach it.
  return isPubliclyVisible(page) ? stripDraft(page) : null;
}

// ── Program / skill pretty-URL pages ────────────────────────────────
// These used to live under /program/[slug] and /skill/[slug]; they now
// render at the bare slug (e.g. /canva, /power-bi-all-courses) matched
// by the admin custom `urlSlug` only. A cheap indexed probe on the
// *PageConfig collection short-circuits the common case (course aliases
// hitting this catch-all) before any heavier list/enrich work runs, so
// existing course pages pay almost nothing for this addition.

async function loadProgram(slug) {
  await dbConnect();
  const cfg = await ProgramPageConfig.findOne({ urlSlug: slug }).lean();
  if (!cfg || cfg.isPublished === false) return null;

  const [programsRes, coursesRes, earlyBirdMap, linkability] = await Promise.all([
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
    getAllActiveEarlyBirdMap().catch(() => ({})),
    // For the course cards' skill capsules. The course-detail branch below
    // already resolves this for its chips; the program and skill branches
    // return BEFORE reaching it, which is why each loader fetches its own.
    getPageLinkability(),
  ]);

  const resolved = await resolveProgramBySlug(slug, programsRes.items ?? []);
  if (!resolved) return null;

  const { program, config } = resolved;
  const programKey = String(program._id);
  const programCourses = (coursesRes.items ?? []).filter(
    (c) => String(c?.program?._id ?? '') === programKey
  );
  const courses = await enrichCoursesWithDetails(programCourses);
  const faqs = await getLocalFaqsForCourse('program', programRefId(program)).catch(() => []);
  /**
   * THE SHORT CODE, not `program._id`, and that is a decision rather than a
   * copy of the line above. The course filter three lines up matches on
   * `String(program._id)`; ProgramPageConfig.programId and Article.programs
   * both store `program_id`, so the two new sections speak the short code and
   * the existing filter is left exactly as it is. Upstream accepts either
   * spelling (audit 7a98eb3 §2.2), so this is about agreeing with the stores
   * that have no choice, not about what the API needs.
   */
  const programCode = programRefId(program);
  /**
   * Both new sections and their name maps, in one Promise.all — they are
   * independent of each other and of everything above, so serialising them
   * would add three round trips to the page for nothing.
   *
   * ORDER IS NOT SET HERE. `getArticles` applies the shipped comparator
   * (ARTICLE_SORT: pinned first, then pinOrder, then sortKey desc), which is
   * the same order /articles uses. A second `.sort()` at this call site would
   * be a second owner of that decision — the exact arrangement lib/articleRank
   * exists to prevent.
   *
   * The SELECT is explicit and comes from one named constant, because the read
   * path `.lean()`s and then JSON-round-trips: a field left out does not arrive
   * empty, it does not arrive at all, and the pin badge silently vanishes. See
   * PROGRAM_ARTICLE_CARD_FIELDS for which two fields that catches.
   */
  const [onlineCourses, articles, skillsRes] = await Promise.all([
    getOnlineCourses({ program: programCode })
      .then((r) => r.items ?? [])
      .catch(() => []),
    getArticles({
      program: programCode,
      active: true,
      limit: PROGRAM_ARTICLE_LIMIT,
      select: PROGRAM_ARTICLE_CARD_FIELDS,
    })
      .then((r) => r.items ?? [])
      .catch(() => []),
    listSkills().catch(() => ({ items: [] })),
  ]);
  return {
    program, config, courses, earlyBirdMap, faqs,
    skillSlugs: linkability.skillSlugs,
    onlineCourses,
    articles,
    programNames: buildProgramNames(programsRes.items ?? []),
    skillNames: buildSkillNames(skillsRes.items ?? []),
  };
}

function courseInSkill(course, skillId) {
  const arr = Array.isArray(course?.skills) ? course.skills : [];
  return arr.some((s) => {
    if (typeof s === 'string') return s === skillId;
    return s?._id === skillId || s?.skill_id === skillId;
  });
}

async function loadSkill(slug) {
  await dbConnect();
  const cfg = await SkillPageConfig.findOne({ urlSlug: slug }).lean();
  if (!cfg || cfg.isPublished === false) return null;

  const [skillsRes, programsRes, coursesRes, linkability] = await Promise.all([
    listSkills().catch(() => ({ items: [] })),
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
    // See the note in loadProgram: this branch returns before the
    // course-detail linkability read, so it does its own.
    getPageLinkability(),
  ]);

  const resolved = await resolveSkillBySlug(slug, skillsRes.items ?? []);
  if (!resolved) return null;

  const { skill, config } = resolved;
  const skillId = String(skill._id);
  const enriched = await enrichCoursesWithDetails(coursesRes.items ?? []);
  const skillCourses = enriched.filter((c) => courseInSkill(c, skillId));

  const ordered = await getOrderedPrograms(programsRes.items ?? []).catch(
    () => programsRes.items ?? []
  );
  const coursesByProgram = ordered
    .map((prog) => ({
      program: prog,
      courses: skillCourses.filter(
        (c) => String(c?.program?._id ?? '') === String(prog._id)
      ),
    }))
    .filter((g) => g.courses.length > 0);

  const faqs = await getLocalFaqsForCourse('skill', skillRefId(skill)).catch(() => []);
  return {
    skill, config, coursesByProgram, totalCourses: skillCourses.length, faqs,
    skillSlugs: linkability.skillSlugs,
  };
}

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);
  if (!segment) return {};

  const pageUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/${segment}`;

  // Program / skill custom-slug metadata. Cheap indexed probe first so
  // course-alias hits don't pay for the program/skill list fetches.
  if (
    !segment.endsWith('-training-course') &&
    !segment.endsWith('-career-path')
  ) {
    await dbConnect();
    const [progCfg, skillCfg] = await Promise.all([
      ProgramPageConfig.findOne({ urlSlug: segment }).lean(),
      SkillPageConfig.findOne({ urlSlug: segment }).lean(),
    ]);

    if (progCfg && progCfg.isPublished !== false) {
      const programsRes = await listPrograms().catch(() => ({ items: [] }));
      const resolved = await resolveProgramBySlug(segment, programsRes.items ?? []);
      if (resolved) {
        const { program, config } = resolved;
        const title =
          config?.metaTitle?.trim() ||
          `${program.program_name}`;
        const description =
          config?.metaDescription?.trim() ||
          program.program_description ||
          program.program_teaser ||
          '';
        const ogImage = config?.ogImage?.trim() || program.programiconurl || '';
        return {
          title,
          description,
          alternates: { canonical: pageUrl },
          openGraph: {
            title,
            description,
            url: pageUrl,
            images: ogImage ? [{ url: ogImage }] : [],
          },
        };
      }
    }

    if (skillCfg && skillCfg.isPublished !== false) {
      const skillsRes = await listSkills().catch(() => ({ items: [] }));
      const resolved = await resolveSkillBySlug(segment, skillsRes.items ?? []);
      if (resolved) {
        const { skill, config } = resolved;
        const title =
          config?.metaTitle?.trim() ||
          `${skill.skill_name}`;
        const description =
          config?.metaDescription?.trim() ||
          skill.skill_description ||
          skill.skill_teaser ||
          '';
        const ogImage = config?.ogImage?.trim() || skill.skilliconurl || '';
        return {
          title,
          description,
          alternates: { canonical: pageUrl },
          openGraph: {
            title,
            description,
            url: pageUrl,
            images: ogImage ? [{ url: ogImage }] : [],
          },
        };
      }
    }
  }

  // Career-path detail pages live under this catch-all too; resolve them
  // first so their metadata wins over any accidental course-name collision.
  if (segment.endsWith('-career-path')) {
    const careerPath = await getCareerPathBySlug(segment);
    if (careerPath) {
      const title =
        `${careerPath.title} | เส้นทางอาชีพ`.trim();
      const description =
        careerPath.short_description?.slice(0, 160) ||
        careerPath.tagline?.slice(0, 160) ||
        '';
      const ogImage = careerPath.hero_image_url || '';
      return {
        title,
        description,
        alternates: { canonical: pageUrl },
        openGraph: {
          title,
          description,
          url: pageUrl,
          images: ogImage ? [{ url: ogImage }] : [],
        },
      };
    }
  }

  const resolved = await resolveCourse(segment);
  if (resolved) {
    const { course, extension } = resolved;
    const title =
      extension?.metaTitle?.trim() ||
      `${course.course_name}`;
    const description =
      extension?.metaDescription?.trim() ||
      course.course_teaser?.slice(0, 160) ||
      '';
    const ogImage =
      extension?.ogImage?.trim() || course.course_cover_url || '';

    /**
     * ── THE COURSE CANONICAL DOES NOT FOLLOW THE REQUEST ──────────────────
     * Every other branch in this function uses `pageUrl`, which is the URL the
     * visitor arrived at, and that is correct for them: a career path, a
     * program, a skill, a custom page and a builder page each have ONE URL, so
     * self-canonicalising says something true.
     *
     * A course has two — the admin's alias and the derived
     * /<code>-training-course — and both serve 200. Self-canonicalising there
     * meant each of the 77 aliased courses shipped two pages that each declared
     * THEMSELVES canonical, which is the site telling a crawler to pick for us.
     *
     * So this branch, and only this branch, asks courseCanonicalPath. Reaching
     * the code URL now emits the alias; reaching the alias emits the same
     * alias. `pageUrl` remains the fallback for the case the helper cannot name
     * — no course_id and no alias — because the old behaviour is the right
     * thing to degrade to.
     *
     * NOTHING ABOUT RESOLUTION CHANGES. Both URLs still serve 200. This is a
     * declaration, not a redirect.
     */
    const canonicalUrl =
      courseCanonicalUrl(course, extension, process.env.NEXT_PUBLIC_SITE_URL) || pageUrl;

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        images: ogImage ? [{ url: ogImage }] : [],
      },
    };
  }

  // Builder page metadata — same precedence tier as custom pages, after every
  // built-in resolver. Builder is probed first purely for determinism: Phase 1
  // guarantees a slug can exist in only ONE of the two collections (the shared
  // guard rejects a slug that is live OR historical in the other), so the two
  // can never both match and the order is arbitrary. Builder wins the coin
  // toss as the go-forward primitive.
  const bp = await resolveBuilderPageForRequest(segment);
  if (bp) {
    const seo = bp.seo ?? {};
    const base = process.env.NEXT_PUBLIC_SITE_URL;
    // Promotion mode (Phase 2): a promotion page's one home is /promotions/<slug>,
    // so its canonical points there even when a crawler hits the bare slug before
    // the component's 308 fires. Non-promotion pages keep seo.canonicalUrl ‖ bare.
    const canonical = isPromotionPage(bp)
      ? `${base}/promotions/${segment}`
      : (seo.canonicalUrl || `${base}/${segment}`);
    const title = seo.metaTitle || bp.title;
    const description = seo.metaDescription || '';
    const ogTitle = seo.ogTitle || title;
    const ogDesc = seo.ogDescription || description;
    return {
      title,
      description,
      alternates: { canonical },
      robots: seo.noIndex ? { index: false, follow: false } : undefined,
      openGraph: {
        title: ogTitle,
        description: ogDesc,
        url: canonical,
        type: seo.ogType || 'website',
        images: seo.ogImage ? [{ url: seo.ogImage }] : [],
        siteName: '9Expert Training',
        locale: 'th_TH',
      },
      twitter: {
        card: seo.twitterCard || 'summary_large_image',
        title: ogTitle,
        description: ogDesc,
        images: seo.ogImage ? [seo.ogImage] : [],
      },
    };
  }

  // Custom page metadata — lowest priority, after every built-in resolver.
  const cp = await resolveCustomPageForRequest(segment, searchParams);
  if (cp) {
    const customPage = cp.page;
    const base = process.env.NEXT_PUBLIC_SITE_URL;
    const canonical = customPage.canonicalUrl || `${base}/${segment}`;
    const title = customPage.metaTitle || customPage.title;
    const description = customPage.metaDescription || '';
    const ogTitle = customPage.ogTitle || title;
    const ogDesc = customPage.ogDescription || description;
    return {
      title,
      description,
      alternates: { canonical },
      // Force noindex for preview renders so a shared preview URL can never
      // get indexed, regardless of the page's own noIndex setting.
      robots: (cp.isPreview || customPage.noIndex) ? { index: false, follow: false } : undefined,
      openGraph: {
        title: ogTitle,
        description: ogDesc,
        url: canonical,
        type: customPage.ogType || 'website',
        images: customPage.ogImage ? [{ url: customPage.ogImage }] : [],
        siteName: '9Expert Training',
        locale: 'th_TH',
      },
      twitter: {
        card: customPage.twitterCard || 'summary_large_image',
        title: ogTitle,
        description: ogDesc,
        images: customPage.ogImage ? [customPage.ogImage] : [],
      },
    };
  }

  return {};
}

export default async function CatchAllPage({ params, searchParams }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);

  /**
   * ── EXIT 1: A MULTI-SEGMENT PATH ──────────────────────────────────────────
   * `segmentFromSlug` returns null for anything containing a slash, so
   * `/a/b/c` leaves this route HERE, before any resolver runs. That makes this
   * the only place a multi-segment legacy URL can be caught — and a Drupal site
   * carries a great many of them.
   *
   * Does not return: it either throws a redirect or throws notFound().
   */
  if (!segment) await notFoundOrRedirect(slug);

  // Program / skill pretty-URL pages (custom admin slug, no prefix).
  // Skip obvious course / career-path suffixes so we don't probe the DB
  // on every course-alias hit. The probe inside loadProgram/loadSkill
  // makes a non-custom slug fall straight through to the logic below.
  if (
    !segment.endsWith('-training-course') &&
    !segment.endsWith('-career-path')
  ) {
    const programData = await loadProgram(segment);
    if (programData) {
      return (
        <ProgramPageClient
          program={programData.program}
          config={programData.config}
          courses={programData.courses}
          earlyBirdMap={programData.earlyBirdMap}
          faqs={programData.faqs}
          currentYear={siteCurrentYear()}
          skillSlugs={programData.skillSlugs}
          onlineCourses={programData.onlineCourses}
          articles={programData.articles}
          programNames={programData.programNames}
          skillNames={programData.skillNames}
        />
      );
    }

    const skillData = await loadSkill(segment);
    if (skillData) {
      return (
        <SkillPageClient
          skill={skillData.skill}
          coursesByProgram={skillData.coursesByProgram}
          totalCourses={skillData.totalCourses}
          faqs={skillData.faqs}
          currentYear={siteCurrentYear()}
          skillSlugs={skillData.skillSlugs}
        />
      );
    }
  }

  // Career-path detail — handled before course resolution so the
  // `-career-path` suffix can't accidentally match a course alias.
  // 404 when the record is missing or inactive; the duplicate
  // PagePlaceholder fallthrough was removed.
  if (segment.endsWith('-career-path')) {
    const careerPath = await getCareerPathBySlug(segment);
    if (!careerPath || careerPath.is_active === false) notFound();
    const faqs = await getLocalFaqsForCourse(
      'career_path',
      careerPath.career_path_id
    );
    return <CareerPathDetail careerPath={careerPath} faqs={faqs} />;
  }

  // All-courses catalog — public listing filtered by skill or program.
  // We can't tell up-front which one `catalogSlug` refers to, so call
  // listPublicCourses() unfiltered and let the user scan the grid.
  if (segment.endsWith('-all-courses')) {
    const catalogSlug = segment.slice(0, -'-all-courses'.length);
    const { items: courses = [] } = await listPublicCourses().catch(() => ({
      items: [],
    }));
    if (courses.length === 0) notFound();
    return (
      <section className="mx-auto max-w-[1200px] px-4 py-12">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wider text-9e-action">
            หลักสูตรทั้งหมด
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            {catalogSlug.replace(/-/g, ' ')}
          </h1>
        </header>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.course_id} course={course} />
          ))}
        </div>
      </section>
    );
  }

  // Course resolver handles both alias and `-training-course` suffix.
  //
  // The admin-preview arm runs ONLY when the public answer was null, so the
  // happy path — every published course — does exactly the work it did before
  // this existed. See resolveHiddenCourseForAdmin for why that ordering is
  // load-bearing rather than tidy, and for the correction to the reason this
  // comment originally gave (the full-route cache, which this route does not
  // have: `next build` reports /[...slug] as ƒ Dynamic, and did before this
  // change too).
  const publicResolved = await resolveCourse(segment);
  const resolved =
    publicResolved ?? (await resolveHiddenCourseForAdmin(segment, searchParams));
  if (resolved) {
    const { course, extension } = resolved;
    const isHiddenPreview = publicResolved === null;

    /**
     * ══ THE CANONICAL REDIRECT IS RAISED HERE, IN THE PAGE ═════════════════
     *
     * `resolveCourse` is called by BOTH `generateMetadata` and this render, so
     * the redirect had to be raised in exactly one of them. It is raised here,
     * for three reasons:
     *
     *   · THE PAGE IS THE THING THAT REDIRECTS. `generateMetadata` exists to
     *     describe a document; a request that redirects has no document to
     *     describe. Raising it there would make a description function control
     *     the response, which is not what it is for.
     *   · IT IS THE CHEAPER PLACE. Sitting above the Promise.allSettled below,
     *     a redirected request skips seven upstream fetches — schedules,
     *     programs, early bird, promos, FAQs, skills, linkability — that would
     *     be discarded.
     *   · ONE RAISER, ONE STATUS. Raising in both would be two call sites for
     *     one rule, which is how the two would eventually disagree about the
     *     status the switch selects.
     *
     * WHAT THE OTHER PATH DOES: `generateMetadata` still runs and still returns
     * metadata, computing the same canonical it always did. It does not throw,
     * does not redirect, and cannot double-redirect. Next discards that metadata
     * when the render redirects, so the cost is one wasted resolve and the
     * benefit is that the metadata path keeps exactly the behaviour U2 gave it.
     *
     * ── NOT FOR THE ADMIN PREVIEW ARM ────────────────────────────────────────
     * `isHiddenPreview` means the public resolve returned null and an
     * authenticated admin is previewing an unpublished course. Redirecting that
     * would drop `?preview=1` — `redirect()` takes a path, not the query — and
     * the destination would then resolve as a public request, find the course
     * unpublished, and 404. So preview renders where it was asked for, exactly
     * as before this round.
     */
    if (!isHiddenPreview) {
      const canonicalRedirect = courseRedirectTarget({
        requestedPath: `/${segment}`,
        course,
        extension,
      });
      // Throws NEXT_REDIRECT — nothing below runs when a target is returned.
      if (canonicalRedirect) {
        courseRedirectFn({ redirect, permanentRedirect })(canonicalRedirect);
      }
    }

    // Parallelise schedules + programs. `/programs` carries `programcolor`
    // which the hero gradient uses; the course detail response doesn't
    // include it. If the programs fetch fails we fall through to the
    // skillcolor fallback in CourseDetail.
    const [
      scheduleRes, programsRes, earlyBirdRes, coursePromosRes, faqsRes,
      skillsRes, linkabilityRes,
    ] =
      await Promise.allSettled([
        // All three statuses — the detail page's ตารางอบรม block is where a
        // buyer decides; a round that is full is information, not noise, and
        // hiding it makes the course look like it simply has fewer dates.
        listSchedulesByCourse(course._id, {
          limit: 10,
          status: PUBLIC_SCHEDULE_STATUSES,
        }),
        listPrograms(),
        getEarlyBirdByCourse(course.course_id),
        getActiveCoursePromos(course.course_id),
        getLocalFaqsForCourse('public', course.course_id),
        // Both feed the SkillBreadcrumb chips only. listSkills is already
        // warm on this route (the program/skill branches above call it) and
        // both run inside the existing allSettled, so neither adds latency.
        listSkills(),
        getPageLinkability(),
      ]);
    const schedules =
      scheduleRes.status === 'fulfilled' ? scheduleRes.value.items : [];
    const programs =
      programsRes.status === 'fulfilled' ? programsRes.value.items : [];
    const earlyBird =
      earlyBirdRes.status === 'fulfilled' ? earlyBirdRes.value : null;
    const coursePromos =
      coursePromosRes.status === 'fulfilled' ? coursePromosRes.value : [];
    const faqs =
      faqsRes.status === 'fulfilled' ? faqsRes.value : [];
    const liveSkills =
      skillsRes.status === 'fulfilled' ? skillsRes.value.items ?? [] : [];
    const linkability =
      linkabilityRes.status === 'fulfilled'
        ? linkabilityRes.value
        : {
            programSlugs: {}, skillSlugs: {},
            programBlocked: new Set(), skillBlocked: new Set(),
          };

    // Chip hrefs, resolved ONCE here — not per chip, and never on the client.
    // A skill missing from the live /skills list stays unlinked: its
    // /skill/<slug> destination would not resolve.
    const liveSkillIds = new Set(
      liveSkills.flatMap((s) =>
        [s?._id, s?.skill_id].filter(Boolean).map((v) => String(v).toLowerCase())
      )
    );
    const skillHrefs = {};
    for (const s of Array.isArray(course.skills) ? course.skills : []) {
      const key = s?._id ?? s?.skill_id;
      if (!key) continue;
      const known = [s._id, s.skill_id]
        .filter(Boolean)
        .some((v) => liveSkillIds.has(String(v).toLowerCase()));
      if (!known) continue;
      const href = chipHref(s, 'skill', linkability, skillHref);
      if (href) skillHrefs[String(key)] = href;
    }
    const courseProgramHref = chipHref(
      course.program, 'program', linkability, programHref
    );

    // Course + BreadcrumbList JSON-LD (separate <script> tags, as Google
    // recommends). courseUrl mirrors the slug logic in buildCourseJsonLd.
    const courseJsonLd = buildCourseJsonLd({
      course,
      extension,
      schedules,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });
    // The BreadcrumbList's last item is the course itself, so it is the same
    // claim as the canonical tag and must be the same URL. This was a fourth
    // copy of the rule — `${SITE}/${extension.urlAlias}` — and carried the same
    // double-slash defect buildCourseJsonLd had, since an alias already starts
    // with one.
    const courseUrl =
      courseCanonicalUrl(course, extension, process.env.NEXT_PUBLIC_SITE_URL);
    const breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'หน้าแรก',
          item: process.env.NEXT_PUBLIC_SITE_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: course.program?.program_name ?? 'หลักสูตร',
          item: `${process.env.NEXT_PUBLIC_SITE_URL}/training-course`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: course.course_name,
          item: courseUrl,
        },
      ],
    };

    return (
      <>
        {/* Structured data is SUPPRESSED on a preview. A hidden course is one
            an admin has taken off the site; emitting Course + BreadcrumbList
            JSON-LD for it would be publishing machine-readable claims about a
            page that officially does not exist. The banner sits outside the
            article for the same reason the builder-page one does — nothing in
            the rendered course can style it away. */}
        {isHiddenPreview ? (
          <div className="bg-9e-lime/20 border-b border-9e-lime px-4 py-2 text-center text-sm font-medium text-[var(--text-primary)]">
            ตัวอย่างหลักสูตรที่ซ่อนอยู่ (ยังไม่เผยแพร่) — เฉพาะผู้ดูแลระบบ
          </div>
        ) : (
          <>
            {courseJsonLd && (
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
              />
            )}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
          </>
        )}
        {/* `skillSlugs` is REUSED, not refetched — `linkability` is already
            resolved above for this page's own skill chips. It travels on to
            RelatedCourses, whose cards carry capsules of their own. */}
        <CourseDetail
          course={course}
          relatedCoursesWithAliases={attachAliases(
            Array.isArray(course.related_courses) ? course.related_courses : [],
            await loadCourseAliasMap(),
          )}
          skillHrefs={skillHrefs}
          skillSlugs={linkability.skillSlugs}
          courseProgramHref={courseProgramHref}
          extension={extension}
          schedules={schedules}
          programs={programs}
          earlyBird={earlyBird}
          coursePromos={coursePromos}
          faqs={faqs}
        />
      </>
    );
  }

  // ── Builder page — same tier as custom pages (see generateMetadata for why
  //    the order between the two is arbitrary but deterministic). ──
  const builderPage = await resolveBuilderPageForRequest(segment);
  if (builderPage) {
    // Promotion mode (Phase 2): a promotion-type builder page lives ONLY at
    // /promotions/<slug> — one public home, no duplicate content. Divert the
    // bare-slug URL there with a 308 (permanentRedirect throws, so this is the
    // last thing this branch does; the function body has no enclosing try/catch,
    // like the historical-slug redirects at the bottom). ONE rule for BOTH kinds
    // (standalone AND MSDB-linked) — no per-discriminator branching.
    if (isPromotionPage(builderPage)) {
      permanentRedirect(`/promotions/${builderPage.slug}`);
    }
    // JSON-LD HOOK POINT — generation is 2C, deliberately not built here.
    // When it lands, derive the document from builderPage.jsonLd (+ seo) and
    // emit it as a <script type="application/ld+json"> right here, exactly as
    // the course and custom-page branches above do. Never emit Review or
    // AggregateRating.
    return <PageBuilderView page={builderPage} />;
  }

  // ── Custom page — lowest-priority resolver (after course resolution). ──
  const cp = await resolveCustomPageForRequest(segment, searchParams);
  if (cp) {
    const customPage = cp.page;
    const jsonLdData = buildPageJsonLd(customPage, process.env.NEXT_PUBLIC_SITE_URL);
    return (
      <>
        {jsonLdData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
          />
        )}
        {cp.isPreview && (
          <div className="bg-9e-lime/20 border-b border-9e-lime px-4 py-2 text-center text-sm font-medium text-[var(--text-primary)]">
            ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — เฉพาะผู้ดูแลระบบ
          </div>
        )}
        <CustomPageView page={customPage} />
      </>
    );
  }

  // 301 redirect for renamed slugs — only reached when nothing else matched.
  // permanentRedirect emits 308 (permanent), which throws internally, so these
  // must sit outside any try/catch and be the last thing before notFound().
  //
  // Both page types are checked. They CANNOT both hit: the shared slug guard
  // rejects any slug that already exists as a live OR historical slug in the
  // other collection, so a slug string lives in at most one collection. The
  // order below is therefore determinism (e.g. for a hand-seeded doc that
  // bypassed the guard), not a tiebreak.
  const historicalBuilder = await findPageBuilderPageByHistoricalSlug(segment);
  if (historicalBuilder?.slug && historicalBuilder.slug !== segment) {
    permanentRedirect(`/${historicalBuilder.slug}`);
  }

  const historical = await findCustomPageByHistoricalSlug(segment);
  if (historical?.slug && historical.slug !== segment) {
    permanentRedirect(`/${historical.slug}`);
  }

  /**
   * ── EXIT 2: EVERY RESOLVER MISSED ─────────────────────────────────────────
   * The admin-managed redirect table is consulted LAST, after every resolver
   * above — including the two historical-slug redirects immediately preceding
   * this — has had its chance.
   *
   * That ordering is the mechanism behind "a rule cannot shadow a live page".
   * It is not enforced by validating rules against a list of routes, which
   * would go stale the day someone adds a page; it is true by construction,
   * because this line is only reached when the app has already established it
   * has nothing to serve.
   *
   * Does not return.
   */
  await notFoundOrRedirect(slug);
}

function CourseDetail({
  course,
  /**
   * `course.related_courses` with each row's `urlAlias` attached.
   *
   * Attached by the async page rather than here: those rows are EMBEDDED in
   * upstream's detail response and never pass through `listPublicCourses`, so
   * nothing else would have given them an alias — and the lookup is async while
   * this component is not.
   */
  relatedCoursesWithAliases = [],
  skillHrefs = {},
  skillSlugs = {},
  courseProgramHref = null,
  extension,
  schedules,
  programs,
  earlyBird,
  coursePromos,
  faqs = [],
}) {
  const hasSchedules = Boolean(schedules?.length);
  const isInhouseOnly = !course.course_price || Number(course.course_price) === 0;
  // Sticky-bar navigation target — only an inhouse-only course navigates (to
  // the in-house quote). A public course with no open sessions instead
  // scrolls to the top so the hero's Public/Inhouse buttons let the user pick;
  // null signals that in-page-scroll behaviour to the bar.
  const stickyInhouseHref = isInhouseOnly
    ? inhouseRegistrationHref(course.course_id)
    : null;
  /**
   * ── ALIASES FOR THE COURSES THIS PAGE LINKS TO, BUT DID NOT FETCH ─────────
   * `related_courses` and `previous_course` are EMBEDDED in upstream's detail
   * response — they never pass through `listPublicCourses`, so nothing has
   * attached `urlAlias` to them and the related-course cards and the
   * breadcrumb's prerequisite chip would both emit the code form while every
   * list surface emitted the alias.
   *
   * COSTS NO EXTRA QUERY. `loadCourseAliasMap` is a projection of the one
   * per-request read `loadHiddenCourseIds` already performs, and the public
   * header calls that on every page through getNavMenuData — so by the time
   * this runs, React.cache is answering from memory.
   */
  // Attached by the async page above and passed in, because THIS COMPONENT IS
  // SYNCHRONOUS — an `await` here compiles to "await isn't allowed in a
  // non-async function" and only `next build` says so, since no test tier
  // compiles this route.
  const relatedCourses = relatedCoursesWithAliases;
  // NOT plumbed to SkillBreadcrumb, and that is a finding rather than an
  // omission: its prerequisite <Link> is COMMENTED OUT (SkillBreadcrumb.jsx:97),
  // so `previousHref` is computed there and never rendered. Attaching an alias
  // for it would be plumbing a dead path. The component calls the shared helper
  // anyway, so it emits the canonical URL if that block is ever revived.
  const hasRelated = relatedCourses.length > 0;
  const gallery = Array.isArray(extension?.gallery) ? extension.gallery : [];
  // `getEarlyBirdByCourse` joins the linked Promotion as `promotion` so
  // the banner can render the thumbnail without a second DB hit.
  const earlyBirdPromotion = earlyBird?.promotion ?? null;

  // Hero gradient base — prefer the program's `programcolor` (carried on
  // `/programs`, not on the course detail). Fall back to the first
  // skill's `skillcolor`, then a brand blue as a last resort.
  const programMatch = programs?.find((p) => p?._id === course.program?._id);
  const heroColor =
    programMatch?.programcolor ??
    course.skills?.[0]?.skillcolor ??
    '#005CFF';

  return (
    <article className="bg-[var(--page-bg)]">
      <CourseHero course={course} heroColor={heroColor} gallery={gallery} />
      <SkillBreadcrumb
        course={course}
        skillHrefs={skillHrefs}
        programHref={courseProgramHref}
      />

      {/* Mobile-only sticky jump links; the sidebar copy is hidden below lg.
          Kept as a component rather than inline markup on purpose — see the
          "WHY A COMPONENT AND NOT INLINE MARKUP" note in CourseSectionTabs.jsx,
          which is also where the reasoning lives so that this call site carries
          no element names in prose. That is not tidiness: the depth counter in
          test/render/stickyBarButtonCoordination scans this span as RAW TEXT,
          so tag names written here between the article and the aside are
          counted as if they were markup. */}
      <CourseSectionTabs
        course={course}
        hasSchedules={hasSchedules}
        hasRelated={hasRelated}
        hasFaqs={Boolean(faqs?.length)}
      />

      {/* pb-36 below lg reserves room for the fixed CourseStickyCTA bar so the
          reflowed sidebar (Course Outline downloads) can scroll clear of it on
          small screens; this is content-length-independent (works when a short
          course has no RelatedCourses below). lg keeps the original pb-8 — the
          large-screen bar is centered and its presentation is unchanged. */}
      <div className="mx-auto max-w-[1200px] px-4 pt-8 pb-36 lg:pb-8">
        {/* id="course-content" marks the content zone (main column + sidebar).
            CourseStickyCTA hides once this element's bottom scrolls above the
            viewport — i.e. before the related-courses section / footer — and
            reappears on scrolling back up. */}
        <div
          id="course-content"
          className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_300px]"
        >
          <div className="min-w-0 space-y-10">
            {/* MOBILE slot for the course-outline downloads. Below lg the aside
                reflows to the very bottom of the page, so the sidebar copy is
                unreachable in practice — the same defect fb03dc1 fixed for the
                section nav, one component later in the same aside.

                Inside the content wrapper rather than beside the tab strip, so
                it takes the body's px-4 inset and the column's space-y-10
                rhythm without inventing a width. The strip is full-bleed with
                its padding on the scroll track; this is a rounded, bordered
                card and belongs with the body content, indented from the edge.

                NOT sticky, deliberately. SECTION_ANCHOR_CLASS is currently
                scroll-mt-36 = 80 header + 48 strip + 16, and a second sticky
                element would force that number up again in a place nobody
                remembers to look; and this card is several times the strip's
                height, so pinning it would permanently spend a third of a
                phone screen on two download buttons. */}
            <PDFDownload course={course} className="lg:hidden" layout="row" />
            {earlyBird && (
              <EarlyBirdBanner
                earlyBird={earlyBird}
                earlyBirdPromotion={earlyBirdPromotion}
                schedules={schedules}
                course={course}
              />
            )}
            {Array.isArray(coursePromos) && coursePromos.length > 0 && (
              <CoursePromoSection coursePromos={coursePromos} />
            )}
            {!isInhouseOnly && (
              <ScheduleSection
                course={course}
                schedules={schedules}
                earlyBird={earlyBird}
                currentYear={siteCurrentYear()}
              />
            )}
            <CourseDescription course={course} extension={extension} />
            <CourseObjectives course={course} extension={extension} />
            <CourseTarget course={course} extension={extension} />
            <CoursePrerequisites course={course} extension={extension} />
            <CourseRequirements course={course} extension={extension} />
            {/* Rich section-7 bullets are resolved and SANITISED SERVER-SIDE.
                CourseOutline is a client component; importing the sanitiser
                there would ship parse5 + sanitize-html to the browser to
                re-clean stored content on every page view. Returns null for
                every course today — no rich copy exists and there is no
                backfill — so the plain path is reached exactly as before. */}
            <CourseOutline
              course={course}
              richHtml={prepareOutlineRichHtml({ course, extension })}
            />
            <CourseRoadmap course={course} />
            <FaqAccordionSection
              faqs={faqs}
              id="faq"
              className={SECTION_ANCHOR_CLASS}
              headingClassName="mb-4 border-l-4 border-9e-brand pl-3 text-lg font-bold text-[var(--text-primary)]"
            />
          </div>

          {/* relative z-50 raises the sidebar above the fixed CourseStickyCTA
              bar (z-40) so the Course Outline downloads stay clickable where the
              centered bar's box passes behind this column at lg+. `relative`
              (overridden by lg:sticky at lg) makes the z-index apply at every
              breakpoint; no ancestor creates a stacking context that would trap
              it. z-50 matches the app's elevated-UI tier (header, back-to-top). */}
          <aside className="relative z-50 space-y-4 lg:sticky lg:top-24">
            <SidebarNav
              course={course}
              hasSchedules={hasSchedules}
              hasRelated={hasRelated}
              hasFaqs={Boolean(faqs?.length)}
            />
            {/* <InhouseCTA courseId={course.course_id} /> */}
            {/* DESKTOP slot. `hidden lg:flex`, not `lg:block` — the card's root
                is a flex row and block would stack its icon above its text.
                Without the `hidden` half the card ships TWICE below lg, which
                looks right in a screenshot of the top of the page and is wrong
                on every real one.

                `layout="stacked"` puts the buttons under the label, which is
                what a ~300px column wants. Said here rather than as an `lg:`
                class on purpose: this slot is the NARROW one despite being the
                lg one, so a breakpoint would read backwards. */}
            <PDFDownload course={course} className="hidden lg:flex" layout="stacked" />
          </aside>
        </div>
      </div>

      <RelatedCourses
        courses={relatedCourses}
        currentYear={siteCurrentYear()}
        skillSlugs={skillSlugs}
      />

      <CourseStickyCTA
        title={course.course_name}
        coverUrl={course.course_cover_url}
        hasSchedules={hasSchedules}
        inhouseHref={stickyInhouseHref}
      />
    </article>
  );
}
