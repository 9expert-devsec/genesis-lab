'use server';

/**
 * Gather what a course-code rename would touch. READS ONLY.
 *
 * ── NO WRITE REACHES THIS FILE, AND THAT IS ENFORCED ───────────────────────
 * Every query below is a `find` / `distinct` / `countDocuments`. There is no
 * save, no update, no upsert, no delete, no `revalidate*`, and no
 * `triggerLandingSync`. That is asserted structurally in
 * test/fs/renamePreviewReadOnly, over this file AND the pure planner it calls,
 * rather than promised here — a comment claiming read-only is exactly what a
 * later edit slips a write past.
 *
 * It is also why the preview is its OWN module rather than a `dryRun: true`
 * branch inside a rename action. A flag means the write path and the preview
 * path share a function, so "does the preview write" becomes a question about
 * control flow that no source scan can answer. Two modules make it a question
 * about imports, which one can.
 *
 * ── WHY IT READS FULL ROWS FOR SOME STORES AND COUNTS FOR OTHERS ───────────
 * The admin has to be able to SEE what moves. For the small stores that is the
 * rows themselves, projected to the fields that identify them. For the ones
 * that can be large — schedules, registrations — an identifying projection is
 * still returned but capped, and the count is the whole truth. A preview that
 * silently truncated would understate a blast radius, which is the one lie this
 * screen must not tell.
 */

import { dbConnect } from '@/lib/db/connect';
import { requireAdmin } from '@/lib/actions/auth';
import { listPublicCourses } from '@/lib/api/public-courses';
import { normalizeCourseCode } from '@/lib/courses/courseOrder';
import { buildRenamePreview } from '@/lib/courses/renameCoursePreview';

import { CourseExtension } from '@/models/CourseExtension';
import CourseOutlineFile from '@/models/CourseOutlineFile';
import ProgramOrder from '@/models/ProgramOrder';
import SkillOrder from '@/models/SkillOrder';
import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import CoursePromoLink from '@/models/CoursePromoLink';
import { FeaturedCourse } from '@/models/FeaturedCourse';
import { FeaturedOnlineCourse } from '@/models/FeaturedOnlineCourse';
import { NavFeaturedOnlineCourse } from '@/models/NavFeaturedOnlineCourse';
import ScheduleLocal from '@/models/ScheduleLocal';
import Promotion from '@/models/Promotion';
import Article from '@/models/Article';
import RegisterPublic from '@/models/RegisterPublic';
import CareerPathRegistration from '@/models/CareerPathRegistration';

/** How many identifying rows to carry back per store. The COUNT is unbounded. */
const ROW_SAMPLE = 25;

/**
 * Match a code the way the store itself does.
 *
 * EXACT stores get an exact filter, because that is what their own reads use —
 * querying case-insensitively here would report rows the migration's own
 * exact-match update would then miss, which is a preview that overstates
 * success. The normalised stores get the normalised form for the same reason.
 */
const exact = (field, code) => ({ [field]: code });

export async function previewCourseCodeRename({ oldCode, newCode } = {}) {
  await requireAdmin('courses');
  await dbConnect();

  const from = String(oldCode ?? '').trim();
  const to = String(newCode ?? '').trim();
  const upper = normalizeCourseCode(from);
  const lower = from.toLowerCase();

  const [
    upstream,
    extensionRows,
    extensionAll,
    outlineRows,
    programRows,
    skillRows,
    earlyBirdRows,
    promoLinkRows,
    featuredRows,
    featuredOnlineRows,
    navFeaturedRows,
    scheduleRows,
    scheduleCount,
    promotionRows,
    articleRows,
    registerRows,
    registerCount,
    careerRegRows,
    careerRegCount,
  ] = await Promise.all([
    listPublicCourses({ includeHidden: true }).catch(() => ({ items: [] })),
    CourseExtension.find(exact('courseId', from), { courseId: 1, urlAlias: 1, isPublished: 1 }).lean(),
    CourseExtension.distinct('courseId'),
    // `legacyPath` is the stored root-relative path and `publicId` the blob key
    // — both derived from the code, which is why the objects have to move and
    // not just the row.
    CourseOutlineFile.find({ courseId: lower }, { courseId: 1, lang: 1, legacyPath: 1, publicId: 1 }).lean(),
    ProgramOrder.find({ courseOrder: upper }, { programId: 1, courseOrder: 1, courseOrderSource: 1, _id: 0 }).lean(),
    SkillOrder.find({ courseOrder: upper }, { skillId: 1, courseOrder: 1, courseOrderSource: 1, _id: 0 }).lean(),
    EarlyBirdConfig.find(exact('course_id', from), { course_id: 1 }).lean(),
    CoursePromoLink.find(exact('course_id', from), { course_id: 1, promotion_id: 1, display_order: 1 }).lean(),
    FeaturedCourse.find(exact('course_id', from), { course_id: 1, course_name: 1 }).lean(),
    FeaturedOnlineCourse.find(exact('course_id', from), { course_id: 1, course_name: 1 }).lean(),
    NavFeaturedOnlineCourse.find(exact('course_id', from), { course_id: 1, course_name: 1 }).lean(),
    ScheduleLocal.find(exact('course_id', from), { course_id: 1, _id: 1 }).limit(ROW_SAMPLE).lean(),
    ScheduleLocal.countDocuments(exact('course_id', from)),
    Promotion.find({ related_course_ids: from }, { promotion_id: 1, title: 1, related_course_ids: 1 }).lean(),
    Article.find({ relatedCourses: from }, { slug: 1, title: 1, relatedCourses: 1 }).lean(),
    RegisterPublic.find({ courseCode: from }, { courseCode: 1, courseId: 1, _id: 1 }).limit(ROW_SAMPLE).lean(),
    RegisterPublic.countDocuments({ courseCode: from }),
    CareerPathRegistration.find({ courseCode: from }, { courseCode: 1, _id: 1 }).limit(ROW_SAMPLE).lean(),
    CareerPathRegistration.countDocuments({ courseCode: from }),
  ]);

  const msdbCodes = (upstream.items ?? []).map((c) => String(c?.course_id ?? '')).filter(Boolean);

  const preview = buildRenamePreview({
    oldCode: from,
    newCode: to,
    msdbCodes,
    extensionCodes: (extensionAll ?? []).map(String),
    urlAlias: extensionRows?.[0]?.urlAlias ?? '',
    outlineLangs: (outlineRows ?? []).map((r) => r.lang).filter(Boolean),
    matches: {
      courseExtension: extensionRows ?? [],
      courseOutlineFile: outlineRows ?? [],
      programOrder: programRows ?? [],
      skillOrder: skillRows ?? [],
      earlyBirdConfig: earlyBirdRows ?? [],
      coursePromoLink: promoLinkRows ?? [],
      featuredCourse: featuredRows ?? [],
      featuredOnlineCourse: featuredOnlineRows ?? [],
      navFeaturedOnlineCourse: navFeaturedRows ?? [],
      scheduleLocal: scheduleRows ?? [],
      promotion: promotionRows ?? [],
      article: articleRows ?? [],
      registerPublic: registerRows ?? [],
      careerPathRegistration: careerRegRows ?? [],
    },
  });

  /**
   * The capped stores carry their TRUE count alongside the sample, so a reader
   * cannot mistake "25 rows shown" for "25 rows exist".
   */
  const trueCounts = {
    scheduleLocal: scheduleCount,
    registerPublic: registerCount,
    careerPathRegistration: careerRegCount,
  };

  return JSON.parse(JSON.stringify({
    ...preview,
    stores: preview.stores.map((s) =>
      trueCounts[s.key] == null ? s : { ...s, count: trueCounts[s.key], sampled: s.rows?.length ?? 0 }
    ),
    historical: preview.historical.map((h) =>
      trueCounts[h.key] == null ? h : { ...h, count: trueCounts[h.key] }
    ),
    rowSampleCap: ROW_SAMPLE,
  }));
}
