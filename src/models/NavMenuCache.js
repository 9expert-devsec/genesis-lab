import mongoose from 'mongoose';

/**
 * Snapshot of nav mega menu data: per-program course lists + covers,
 * per-skill course lists + covers. Refreshed by Vercel Cron every 3 hours
 * (src/lib/navmenu/syncNavMenuData.js) so the หลักสูตร mega menu reads from
 * MongoDB instead of calling the upstream API at request time.
 *
 * Uses Mixed payloads (same pattern as LandingCache) because the upstream
 * API shapes are not under our control.
 */
const NavMenuCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // 'navmenu_v1'
    data: {
      // { [programId]: { items: [{course_id, course_name}], firstCover: {...}|null } }
      programs: { type: mongoose.Schema.Types.Mixed, default: {} },
      // { [skillUpstreamId]: { items: [...], firstCover: {...}|null } }
      skills:   { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    syncedAt: { type: Date, default: null },
    status:   { type: String, enum: ['ok', 'partial', 'error'], default: 'error' },
  },
  { timestamps: true, collection: 'nav_menu_cache' }
);

export const NavMenuCache =
  mongoose.models.NavMenuCache || mongoose.model('NavMenuCache', NavMenuCacheSchema);

export default NavMenuCache;
