import mongoose from 'mongoose';
import { DEFAULT_TAGLINE } from '@/lib/about/aboutText';

/**
 * AboutConfig — single-doc store for /about-us text (tagline, description,
 * mission, vision) and the site's admin-typed headline stats, all edited at
 * /admin/about. Of the text, only `tagline` is rendered on /about-us today.
 *
 * `stats` feeds the Home, About and Portfolio stat strips through
 * src/lib/stats/getSiteStats.js. Each field is null until an admin saves it,
 * and a null field falls back to FALLBACK_STATS (src/lib/stats/statsInput.js).
 * Course and masterclass counts are computed there and are not stored here.
 */
const StatsSchema = new mongoose.Schema(
  {
    organizations: { type: Number, default: null, min: 0 },
    setListed:     { type: Number, default: null, min: 0 },
    learners:      { type: Number, default: null, min: 0 },
    followers:     { type: Number, default: null, min: 0 },
    // Shown on Home only (★ รีวิว).
    rating:        { type: Number, default: null, min: 0, max: 5 },
  },
  { _id: false }
);

const AboutConfigSchema = new mongoose.Schema(
  {
    // Rendered as the /about-us hero's small line; see src/lib/about/aboutText.js.
    tagline:     { type: String, default: DEFAULT_TAGLINE },
    description: { type: String, default: '' },
    mission:     { type: String, default: '' },
    vision:      { type: String, default: '' },
    stats:       { type: StatsSchema, default: () => ({}) },
    // Free text, e.g. "ข้อมูลตั้งแต่ปี 2015 – สิงหาคม 2026".
    statsAsOf:   { type: String, default: '' },
  },
  { timestamps: true, collection: 'about_config' }
);

export default mongoose.models.AboutConfig ||
  mongoose.model('AboutConfig', AboutConfigSchema);
