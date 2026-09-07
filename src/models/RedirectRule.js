import mongoose from 'mongoose';

/**
 * RedirectRule — one admin-managed (host, exact path) → internal path redirect.
 *
 * ── WHAT IS *NOT* IN THIS COLLECTION, AND WHY ─────────────────────────────
 *
 * WHOLE-HOST redirects. Sending every path on one host to the same path on
 * another is a static fact that changes about twice in a project's life, and it
 * belongs in next.config.mjs where it appears in a diff somebody reviews — the
 * same argument that file's own `redirects()` header already makes about
 * permanent redirects being a promise to search engines. Putting it here would
 * mean a single row could re-point an entire domain with no review.
 *
 * FILE paths. /sites/default/files/* and /files/* are served by static rewrites
 * straight to Cloudinary with no function of ours in the hot path, and roughly
 * 7,000 files depend on that. Nothing here touches them.
 *
 * PATTERNS. Exact paths only — see validateRule. A wildcard rule in a database
 * is a routing change nobody reviewed.
 *
 * ── WHERE IT IS CONSULTED, WHICH IS THE INTERESTING PART ──────────────────
 * NOT in middleware — middleware is Edge and Mongoose cannot run there. Not on
 * every request either. It is read at the 404 boundary, because a legacy
 * redirect is BY DEFINITION a path this app does not serve: if routing resolved
 * the request, no rule was needed. That gives three properties for free rather
 * than by validation:
 *
 *   · zero cost on every request that resolves normally
 *   · a rule STRUCTURALLY CANNOT shadow a live page — the lookup only happens
 *     where the app has already decided it has nothing to serve
 *   · the lookup and the 404 recording are one read and one write on one
 *     request
 *
 * `source` is stored NORMALISED and LOWER-CASED (see normalisePath). The unique
 * index is therefore on the form that is actually compared, so two rules cannot
 * disagree about one URL.
 */
const RedirectRuleSchema = new mongoose.Schema(
  {
    /** Lower-cased, port stripped. Part of the key — see the model note. */
    host: { type: String, required: true, trim: true, lowercase: true },

    /** Exact, normalised, lower-cased request path. Never a pattern. */
    source: { type: String, required: true, trim: true },

    /**
     * Internal path only. Validated at write time AND re-checked at match time
     * — a row can also arrive from a direct database edit or a restored backup,
     * and this value decides where a visitor's browser is sent.
     */
    destination: { type: String, required: true, trim: true },

    /** 308 when true (the default), 307 when false. */
    permanent: { type: Boolean, default: true },

    /** Off without deleting, so a rule can be tested and reverted. */
    isActive: { type: Boolean, default: true },

    /** Free text for whoever reads this in a year. */
    note: { type: String, default: '', trim: true },

    /**
     * Provenance, snapshotted. The audit trail is the authority on who changed
     * what; this is here so the table itself can show it without a second query.
     */
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'redirect_rules' }
);

/** ONE rule per (host, path). The uniqueness IS the key. */
RedirectRuleSchema.index({ host: 1, source: 1 }, { unique: true });

/** The admin table's listing order. */
RedirectRuleSchema.index({ updatedAt: -1 });

export default mongoose.models.RedirectRule ||
  mongoose.model('RedirectRule', RedirectRuleSchema);
