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

import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';
import CourseExtension from '@/models/CourseExtension';
import { listPublicCourses, getCourseByCode } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
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

  return {
    status,
    errors,
    programCount: Object.keys(programsData).length,
    skillCount: Object.keys(skillsData).length,
  };
}
