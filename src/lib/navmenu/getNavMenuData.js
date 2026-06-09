import { dbConnect } from '@/lib/db/connect';
import NavMenuCache from '@/models/NavMenuCache';

/**
 * Read the nav mega menu snapshot built by syncNavMenuData(). Returns the
 * per-program / per-skill maps keyed by id, or empty maps on any failure
 * so the header never breaks on a missing/transient cache.
 */
const CACHE_KEY = 'navmenu_v1';

const EMPTY = { programs: {}, skills: {} };

export async function getNavMenuData() {
  try {
    await dbConnect();
    const doc = await NavMenuCache.findOne({ key: CACHE_KEY }).lean().exec();
    if (!doc?.data) return EMPTY;
    // JSON round-trip guarantees plain, serializable values (string keys,
    // no ObjectId/Date instances) before this crosses the Server→Client
    // Component boundary as a prop.
    return JSON.parse(
      JSON.stringify({
        programs: doc.data.programs ?? {},
        skills:   doc.data.skills   ?? {},
      })
    );
  } catch {
    return EMPTY;
  }
}
