import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';

/**
 * Read the nav mega menu snapshot built by syncNavMenuData(), plus the
 * admin-managed custom URL slugs from ProgramPageConfig / SkillPageConfig.
 *
 * The course-list maps (`programs` / `skills`) come from the cached
 * snapshot; the slug maps (`programSlugs` / `skillSlugs`) are a small
 * live read so an admin slug edit reflects in the nav immediately (the
 * save action revalidates the public layout). Returns empty maps on any
 * failure so the header never breaks on a missing/transient cache.
 */
const CACHE_KEY = 'navmenu_v1';

const EMPTY = { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {} };

export async function getNavMenuData() {
  try {
    await dbConnect();

    // Snapshot + slug configs in parallel.
    const [doc, programConfigs, skillConfigs] = await Promise.all([
      NavMenuCache.findOne({ key: CACHE_KEY }).lean().exec(),
      ProgramPageConfig.find({ urlSlug: { $nin: [null, ''] } })
        .select('programId urlSlug')
        .lean(),
      SkillPageConfig.find({ urlSlug: { $nin: [null, ''] } })
        .select('skillId urlSlug')
        .lean(),
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
      })
    );
  } catch {
    return EMPTY;
  }
}
