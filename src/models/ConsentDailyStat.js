import mongoose from 'mongoose';

/**
 * Aggregate cookie-consent choices, one document per (UTC+7 date, host)
 * (round CB-C §4). Counters only — written with `$inc` by
 * src/app/api/consent-stats/route.js, read by /admin/consent-stats.
 *
 * Nothing here identifies a visitor: no id, no IP, no user agent, no cookie,
 * nothing finer than the day. `host` exists because dev, preview and
 * production share this database, and a developer's clicks must be separable
 * from www's.
 *
 * Field meanings are in src/lib/consentStats.js (incrementsFor).
 */
const ConsentDailyStatSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // 'YYYY-MM-DD', Asia/Bangkok
    host: { type: String, required: true, lowercase: true, trim: true },
    decisions: { type: Number, default: 0 },
    accept_all: { type: Number, default: 0 },
    reject_all: { type: Number, default: 0 },
    custom: { type: Number, default: 0 },
    custom_analytics: { type: Number, default: 0 },
    custom_marketing: { type: Number, default: 0 },
    analytics_granted: { type: Number, default: 0 },
    marketing_granted: { type: Number, default: 0 },
    via_layer2: { type: Number, default: 0 },
  },
  { timestamps: false, collection: 'consent_daily_stats' }
);

ConsentDailyStatSchema.index({ date: 1, host: 1 }, { unique: true });

export default mongoose.models.ConsentDailyStat ||
  mongoose.model('ConsentDailyStat', ConsentDailyStatSchema);
