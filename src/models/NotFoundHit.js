import mongoose from 'mongoose';

/**
 * NotFoundHit — ONE document per unique (host, path) that 404s, with a counter.
 *
 * ══ THIS IS A WRITE ON AN UNAUTHENTICATED, BOT-SATURATED PATH ══════════════
 *
 * Anyone on the internet can cause a write here by requesting a URL that does
 * not exist, and most of the traffic that does so is automated. The connection
 * pool is tuned for an Atlas M0 free tier (`maxPoolSize: 5` — see the audit note
 * in lib/db/connect). So the shape of this collection is a safety decision, not
 * a modelling preference, and every part of it is bounded ON PURPOSE:
 *
 *   ONE DOCUMENT PER UNIQUE (host, path), upserted with `$inc`. NOT one per
 *   request. Growth is therefore bounded by the number of DISTINCT paths
 *   anybody asks for, not by how often they ask. A crawler hammering one URL a
 *   million times leaves one row reading `count: 1000000`.
 *
 *   A TTL INDEX on `lastSeen`, 30 days, following webhook_logs — the one
 *   in-repo precedent for a bounded log collection. Its note applies here
 *   verbatim: adjust the TTL, never arbitrary deletes. Because the index is on
 *   LAST seen rather than first, a path that keeps being requested keeps its
 *   row, and one that stops is reclaimed 30 days later. That is the behaviour
 *   wanted: the list is "what is 404ing lately", not "everything ever".
 *
 *   PATH LENGTH IS CAPPED before the write (see recordNotFound). A request line
 *   can carry kilobytes; a row must not.
 *
 * ── WHAT IS DELIBERATELY NOT STORED ───────────────────────────────────────
 * No IP, no user-agent, no referer, no query string, no headers. None of it is
 * needed to answer "which legacy URLs are people still hitting", which is the
 * only question this collection exists for — and all of it would turn a
 * bot-writable table into a personal-data one, on a path with no consent
 * surface and no retention policy of its own beyond the TTL above.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * Not analytics, and not a security log. It cannot answer "how many people",
 * only "how many requests", and a determined caller can inflate any counter or
 * create rows for paths nobody real ever visited. It is a WORKLIST for finding
 * legacy URLs worth writing a redirect for, and it should be read as one.
 */
const TTL_DAYS = 30;

const NotFoundHitSchema = new mongoose.Schema(
  {
    /** Lower-cased, port stripped — the same normalisation the rules use. */
    host: { type: String, required: true, trim: true, lowercase: true },

    /** Normalised, lower-cased, query and fragment already removed. */
    path: { type: String, required: true, trim: true },

    /** `$inc`-ed on every hit. The reason one row can stand for a million. */
    count: { type: Number, default: 0 },

    firstSeen: { type: Date, default: Date.now },
    /** The TTL key — see the model note on why it is LAST and not first. */
    lastSeen: { type: Date, default: Date.now },

    /**
     * Set when an admin turns this row into a rule, so the list can show what
     * has already been dealt with instead of re-offering it every time.
     */
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: false, collection: 'not_found_hits' }
);

/** ONE row per (host, path). The uniqueness is what bounds the collection. */
NotFoundHitSchema.index({ host: 1, path: 1 }, { unique: true });

/** The worklist's order: most-requested first. */
NotFoundHitSchema.index({ count: -1, lastSeen: -1 });

/** Same shape, and same reasoning, as webhook_logs' TTL index. */
NotFoundHitSchema.index(
  { lastSeen: 1 },
  { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 }
);

export default mongoose.models.NotFoundHit ||
  mongoose.model('NotFoundHit', NotFoundHitSchema);
