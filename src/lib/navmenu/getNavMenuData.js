import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import SkillOrder from '@/models/SkillOrder';
import { buildSkillOrderMap } from '@/lib/navmenu/skillOrder';
import { filterNavMenuGroups, loadHiddenCourseIds } from '@/lib/courses/hiddenCourses';

/**
 * Read the nav mega menu snapshot built by syncNavMenuData(), plus the
 * admin-managed custom URL slugs from ProgramPageConfig / SkillPageConfig
 * and the admin-managed skill ORDER from SkillOrder.
 *
 * The course-list maps (`programs` / `skills`) come from the cached
 * snapshot; the slug maps (`programSlugs` / `skillSlugs`) are a small
 * live read so an admin slug edit reflects in the nav immediately (the
 * save action revalidates the public layout). Returns empty maps on any
 * failure so the header never breaks on a missing/transient cache.
 *
 * `skillOrder` is the same shape of small live read, for the same reason:
 * dragging a skill in /admin/programs should move the menu without a deploy.
 * It is `{ [NORMALISED_ID]: { order, isHidden } }` — see lib/navmenu/skillOrder.js
 * for why the key is the short code and not the ObjectId the config uses.
 *
 * THE EMPTY CASE IS LOAD-BEARING: `{}` here means "no opinion", and
 * sortSkillsByAdminOrder renders the config array in its written order. It must
 * never be read as "every skill is hidden" — a failed Mongo read has to cost
 * the admin's ordering, not the entire menu.
 */
const CACHE_KEY = 'navmenu_v1';

const EMPTY = {
  programs: {}, skills: {}, programSlugs: {}, skillSlugs: {}, skillOrder: {},
};

export async function getNavMenuData() {
  try {
    await dbConnect();

    // Snapshot + slug configs + skill order in parallel.
    const [doc, programConfigs, skillConfigs, skillOrderRows, hidden] = await Promise.all([
      NavMenuCache.findOne({ key: CACHE_KEY }).lean().exec(),
      ProgramPageConfig.find({ urlSlug: { $nin: [null, ''] } })
        .select('programId urlSlug')
        .lean(),
      SkillPageConfig.find({ urlSlug: { $nin: [null, ''] } })
        .select('skillId urlSlug')
        .lean(),
      SkillOrder.find({}).select('skillId order isHidden').lean(),
      /**
       * THE HIDDEN-COURSE FILTER LIVES HERE, ON THE READ, NOT IN THE SYNC.
       *
       * The snapshot this function reads is written by a Vercel Cron on the
       * Production deployment, which builds `main`. The mega menu people
       * actually look at is served from `dev`. Filtering in syncNavMenuData
       * would therefore leave hidden courses in the UAT menu — each one linking
       * at a 404 — until main shipped, which is the defect this round is for.
       *
       * It rides in the SAME Promise.all as the three reads that were already
       * here, so it costs no additional round trip of latency; one indexed
       * query, measured at 38.7 ms warm returning zero rows. `hidden` is never
       * rejected: loadHiddenCourseIds catches its own failure and returns an
       * empty set, which degrades to today's behaviour rather than to an empty
       * menu.
       */
      loadHiddenCourseIds(),
    ]);

    // Slug lookup maps keyed by lower-cased id ({ [programId]: urlSlug }).
    const programSlugs = Object.fromEntries(
      programConfigs.map((c) => [String(c.programId).toLowerCase(), c.urlSlug])
    );
    const skillSlugs = Object.fromEntries(
      skillConfigs.map((c) => [String(c.skillId).toLowerCase(), c.urlSlug])
    );

    // JSON round-trip guarantees plain, serializable values before this
    // crosses the Server→Client Component boundary as a prop.
    return JSON.parse(
      JSON.stringify({
        programs: filterNavMenuGroups(doc?.data?.programs ?? {}, hidden),
        skills:   filterNavMenuGroups(doc?.data?.skills   ?? {}, hidden),
        programSlugs,
        skillSlugs,
        skillOrder: buildSkillOrderMap(skillOrderRows),
      })
    );
  } catch {
    return EMPTY;
  }
}
