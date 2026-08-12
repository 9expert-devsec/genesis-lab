/**
 * Build a nav menu course-data snapshot and upsert it into NavMenuCache.
 *
 * For every ordered program: fetch all courses + the first course's cover.
 * For every configured skill:  fetch all courses + the first course's cover.
 *
 * Runs as a Vercel Cron (every 3 hours, see vercel.json) so the mega menu
 * never calls the upstream API at request time — it reads from MongoDB via
 * getNavMenuData() instead. A failure on any single program/skill is
 * isolated (Promise.allSettled) so one bad upstream row can't sink the
 * whole snapshot; the overall status downgrades to 'partial'.
 *
 * Programs with zero public courses (e.g. online-only programs) are
 * intentionally excluded from the snapshot: the mega menu is a public-course
 * browser, so an empty program has nothing to show and must not appear.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';
import CourseExtension from '@/models/CourseExtension';
import { listPublicCourses, getCourseByCode } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { bustUpstream, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';
import { skills as SKILLS_CONFIG } from '@/config/site';

const CACHE_KEY = 'navmenu_v1';

/**
 * Fetch a course list + first-course cover for one program/skill filter.
 * Returns { items, firstCover } — never throws (caller handles via allSettled).
 */
async function buildEntry(filter) {
  const { items } = await listPublicCourses(filter);
  const courseList = (items ?? []).map((c) => ({
    course_id: c.course_id,
    course_name: c.course_name ?? '',
  }));

  // Enrich with urlAlias from CourseExtension — the upstream list API
  // doesn't carry it. Stored aliases keep a leading slash (e.g.
  // "/power-bi-...-training-course"); strip it so courseHref() yields a
  // single-slash URL on the client.
  const courseIds = courseList.map((c) => c.course_id).filter(Boolean);
  const extensions = await CourseExtension.find(
    { courseId: { $in: courseIds } },
    { courseId: 1, urlAlias: 1 }
  ).lean();
  const aliasMap = Object.fromEntries(
    extensions.map((e) => [
      String(e.courseId).toUpperCase(),
      e.urlAlias ? String(e.urlAlias).replace(/^\/+/, '') : null,
    ])
  );

  const courseListWithAlias = courseList.map((c) => ({
    ...c,
    urlAlias: aliasMap[String(c.course_id).toUpperCase()] ?? null,
  }));

  let firstCover = null;
  if (items?.[0]?.course_id) {
    const detail = await getCourseByCode(items[0].course_id);
    if (detail) {
      firstCover = {
        course_id: items[0].course_id,
        course_name: items[0].course_name ?? '',
        course_cover_url: detail.course_cover_url ?? null,
        urlAlias: aliasMap[String(items[0].course_id).toUpperCase()] ?? null,
      };
    }
  }
  return { items: courseListWithAlias, firstCover };
}

export async function syncNavMenuData() {
  await dbConnect();
  const errors = [];

  // BEFORE the first read, not after the write — the same rule syncFaqs,
  // syncPromotions, syncCareerPaths, syncInstructors and program-order already
  // follow, and this job was the one that did not.
  //
  // Every read below is cached for an hour under one of these tags. Without
  // the bust, a manual resync (the admin button, POST /api/admin/navmenu/sync)
  // re-reads the SAME cached response the last run saw and writes it into
  // NavMenuCache with a fresh `syncedAt` and status 'ok' — so a course
  // published upstream ten minutes ago is still missing from the mega menu
  // afterwards, and the sync reports success. The admin's only recourse is to
  // press the button again in an hour, which looks like the button not
  // working.
  //
  // The per-course `course:<id>` tags set by getCourseByCode are NOT busted:
  // they are per-record and this job does not know the id set until after the
  // list read. Those only feed the cover image, so a stale one shows an old
  // thumbnail rather than a missing menu entry. Named here so the gap is a
  // decision rather than an oversight.
  bustUpstream(UPSTREAM_TAGS.PROGRAMS, UPSTREAM_TAGS.PUBLIC_COURSES);

  // ── Programs ──────────────────────────────────────────────────────
  const programsData = {};
  try {
    const raw = await listPrograms();
    const programs = await getOrderedPrograms(raw.items).catch(() => raw.items ?? []);

    await Promise.allSettled(
      programs.map(async (p) => {
        const pid = String(p.program_id ?? p._id ?? '');
        try {
          const entry = await buildEntry({ program: pid });
          // Mega menu is a public-course browser: omit programs that have
          // no public courses (e.g. online-only programs) so they don't
          // render as empty menu items.
          if (entry.items.length > 0) {
            programsData[pid] = entry;
          }
        } catch (err) {
          errors.push(`program:${pid}: ${err.message}`);
          // omit on error — an empty program has nothing to show
        }
      })
    );
  } catch (err) {
    errors.push(`listPrograms: ${err.message}`);
  }

  // ── Skills ────────────────────────────────────────────────────────
  const skillsData = {};
  await Promise.allSettled(
    SKILLS_CONFIG.map(async (s) => {
      const sid = s.upstreamId;
      try {
        skillsData[sid] = await buildEntry({ skill: sid });
      } catch (err) {
        errors.push(`skill:${sid}: ${err.message}`);
        skillsData[sid] = { items: [], firstCover: null };
      }
    })
  );

  // ── Upsert ────────────────────────────────────────────────────────
  const status = errors.length === 0 ? 'ok' : 'partial';
  await NavMenuCache.findOneAndUpdate(
    { key: CACHE_KEY },
    {
      $set: {
        'data.programs': programsData,
        'data.skills':   skillsData,
        syncedAt: new Date(),
        status,
      },
    },
    { upsert: true, new: true }
  );

  /**
   * REGENERATE THE PAGES THAT BAKED THE OLD MENU. Writing the cache is only
   * half the job — the same half syncLandingData used to stop at.
   *
   * getNavMenuData() reads Mongo through mongoose, NOT through `fetch`. That
   * means it carries no Next cache tag and there is nothing to `revalidateTag`:
   * its result is captured into the statically rendered output and can only be
   * released by a path revalidation. Measured on this branch: `/` is ○ Static
   * (Revalidate 1h), `/training-course` ○ Static (30m), `/policies` ○ Static
   * (1h). So a snapshot written here reached a visitor only when an unrelated
   * ISR timer happened to expire.
   *
   * MEASURED, and why the scope is 'layout' rather than a bare path. Three
   * surfaces mount PublicHeader, and they do not share one URL prefix:
   *
   *   src/app/(public)/layout.jsx:15   every route in the (public) group
   *   src/app/page.jsx:122             the home page, mounted INLINE because
   *                                    it sits outside the group and does not
   *                                    inherit that layout
   *   src/app/not-found.jsx:9          the 404 page
   *
   * `revalidatePath('/')` alone covers only the home page — a visitor on
   * /training-course would still be served the stale menu, which is most of the
   * site. `(public)` is a route GROUP, so it contributes no path segment and
   * there is no expression that selects exactly its routes; the alternative is
   * enumerating ~30 paths that rot the moment a route is added.
   *
   * 'layout' at '/' is also the idiom this repo already uses for precisely
   * "the header changed" — eight existing call sites, including
   * page-configs.js:86 which busts the nav slug maps that this same menu reads,
   * and site-notifications.js:48. Home's own comment (page.jsx:63) names it as
   * the mechanism that keeps the inline header and the group layout in step.
   * Copying it keeps one pattern rather than adding a second.
   *
   * Here rather than in the two callers because the invariant belongs to the
   * WRITE: whoever rewrites the snapshot has, by definition, made the rendered
   * menu stale. Both callers forgetting it is what that looks like when it is
   * spread across call sites.
   *
   * Guarded exactly as syncLandingData is: `revalidatePath` throws outside a
   * request/render scope, and failing to regenerate must not fail a sync that
   * has already written successfully — the next write tries again.
   */
  try {
    revalidatePath('/', 'layout');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[syncNavMenuData] revalidatePath("/", "layout") skipped:',
      err?.message ?? err
    );
  }

  return {
    status,
    errors,
    programCount: Object.keys(programsData).length,
    skillCount: Object.keys(skillsData).length,
  };
}
