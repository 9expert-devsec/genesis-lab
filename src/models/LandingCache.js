import mongoose from 'mongoose';

/**
 * Snapshot of all data needed to render the public home page.
 *
 * The home page (src/app/page.jsx) reads this single document instead
 * of fanning out to 10+ external API calls per request. A scheduled
 * sync job (src/lib/landing/syncLandingData.js) refreshes the snapshot
 * — if it fails, the previous successful copy stays put so the home
 * page never breaks on a transient upstream outage.
 *
 * Stored payloads are intentionally `Mixed` because the upstream API
 * shapes are not under our control; locking them into a strict schema
 * would force a redeploy whenever a field is added upstream.
 */
const landingCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "homepage_v1"

    data: {
      banners:                 { type: mongoose.Schema.Types.Mixed, default: [] },
      programs:                { type: mongoose.Schema.Types.Mixed, default: [] },
      skills:                  { type: mongoose.Schema.Types.Mixed, default: [] },
      newCoursesWithSchedules: { type: mongoose.Schema.Types.Mixed, default: [] },
      onlineCoursesForSection: { type: mongoose.Schema.Types.Mixed, default: [] },
      reviews:                 { type: mongoose.Schema.Types.Mixed, default: [] },
    },

    syncedAt:      { type: Date, default: null },
    status:        { type: String, enum: ['ok', 'partial', 'error'], default: 'error' },
    source:        { type: String, default: 'external_api' },
    schemaVersion: { type: Number, default: 1 },
    // Renamed from `errors` — Mongoose reserves `errors` on Documents
    // for ValidationError accumulation, which collides with this field.
    syncErrors:    { type: [String], default: [] },

    sections: {
      banners:       { type: Number, default: 0 },
      programs:      { type: Number, default: 0 },
      skills:        { type: Number, default: 0 },
      newCourses:    { type: Number, default: 0 },
      onlineCourses: { type: Number, default: 0 },
      reviews:       { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'landing_cache' }
);

export const LandingCache =
  mongoose.models.LandingCache ||
  mongoose.model('LandingCache', landingCacheSchema);

export default LandingCache;
