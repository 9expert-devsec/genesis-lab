import mongoose from 'mongoose';

import { WEBROOT_DOCUMENTS } from '@/lib/webrootDocuments.mjs';

/**
 * WebrootDocumentFile — the record of every replacement of a site-root PDF.
 *
 * ══ WHY THIS EXISTS: THE OVERWRITE DESTROYS ITS OWN HISTORY ═════════════════
 *
 * These three objects are served from a FIXED Blob pathname, because the
 * pathname is the URL and the URL is printed on things. A replacement therefore
 * re-puts at the same key, and Vercel Blob keeps exactly one version there.
 * After the put, nothing anywhere can answer "what was this yesterday, who
 * changed it, and how big was it" — not Blob, not the rewrite, not MSDB.
 *
 * This row is that answer, and `archivePathname` is the half that makes it
 * actionable rather than merely informative: the previous bytes are copied to
 * an archive key BEFORE the overwrite, and this records where they went. A
 * version counter without an archive records an event nobody can undo.
 *
 * ── NOT A DELIVERY LOOKUP ───────────────────────────────────────────────────
 * Same rule as LegacyFileMigration and CourseOutlineFile. The three URLs
 * resolve through static rewrites in next.config.mjs with no database in the
 * request path. Nothing that serves a file may read this collection.
 *
 * ── ONE ROW PER REPLACEMENT, NOT ONE PER DOCUMENT ───────────────────────────
 * Deliberately append-only. A single row per document, updated in place, would
 * overwrite the history of the thing whose history-destroying overwrite is the
 * reason this exists. `version` is the ordinal within a filename.
 */
const WebrootDocumentFileSchema = new mongoose.Schema(
  {
    /** Which of the three. Constrained to the shared list, not free text. */
    filename: { type: String, required: true, trim: true, enum: [...WEBROOT_DOCUMENTS] },

    /** The live key that was overwritten — always webroot-documents/<filename>. */
    blobPathname: { type: String, required: true, trim: true },
    /** The public URL path this serves at. */
    publicPath: { type: String, required: true, trim: true },

    /**
     * Where the PREVIOUS bytes were copied before the overwrite.
     *
     * Empty ONLY on the first ever recorded replacement of a document, where
     * there was no prior row and the pre-existing object was archived anyway —
     * see the action. An empty value on any later row means the archive step
     * was skipped, which is a defect, not a state.
     */
    archivePathname: { type: String, default: '' },

    bytes: { type: Number, default: 0 },
    contentType: { type: String, default: 'application/pdf' },

    /** Content hash of the NEW bytes — what the propagation poll waits for. */
    sha256: { type: String, default: '' },

    uploadedAt: { type: Date, default: Date.now },
    /** From the session. Never from the request body. */
    uploadedBy: { type: String, default: '' },

    /** 1 for the first recorded replacement of this filename, then 2, 3, … */
    version: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'webroot_document_files' },
);

/** Newest-first per document — the query the admin page and any audit makes. */
WebrootDocumentFileSchema.index({ filename: 1, version: -1 });

export default mongoose.models.WebrootDocumentFile
  || mongoose.model('WebrootDocumentFile', WebrootDocumentFileSchema);
