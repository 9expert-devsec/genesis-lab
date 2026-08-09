import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import SkillOrder from '@/models/SkillOrder';
import { buildSkillOrderMap } from '@/lib/navmenu/skillOrder';

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
    const [doc, programConfigs, skillConfigs, skillOrderRows] = await Promise.all([
      NavMenuCache.findOne({ key: CACHE_KEY }).lean().exec(),
      ProgramPageConfig.find({ urlSlug: { $nin: [null, ''] } })
        .select('programId urlSlug')
        .lean(),
      SkillPageConfig.find({ urlSlug: { $nin: [null, ''] } })
        .select('skillId urlSlug')
        .lean(),
      SkillOrder.find({}).select('skillId order isHidden').lean(),
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
        programs: doc?.data?.programs ?? {},
        skills:   doc?.data?.skills   ?? {},
        programSlugs,
        skillSlugs,
        skillOrder: buildSkillOrderMap(skillOrderRows),
      })
    );
  } catch {
    return EMPTY;
  }
}
