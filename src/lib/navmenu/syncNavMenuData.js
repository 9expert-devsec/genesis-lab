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
 */

import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';
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

  let firstCover = null;
  if (items?.[0]?.course_id) {
    const detail = await getCourseByCode(items[0].course_id);
    if (detail) {
      firstCover = {
        course_id: items[0].course_id,
        course_name: items[0].course_name ?? '',
        course_cover_url: detail.course_cover_url ?? null,
      };
    }
  }
  return { items: courseList, firstCover };
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
          programsData[pid] = await buildEntry({ program: pid });
        } catch (err) {
          errors.push(`program:${pid}: ${err.message}`);
          programsData[pid] = { items: [], firstCover: null };
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
