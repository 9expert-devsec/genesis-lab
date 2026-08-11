import mongoose from 'mongoose';

import { OUTLINE_LANGS } from '@/lib/courses/courseOutline';

/**
 * CourseOutlineFile — the GENESIS half of a course outline PDF.
 *
 * ══ WHY A RECORD EXISTS AT ALL WHEN MSDB HOLDS THE PATH ═════════════════════
 *
 * MSDB stores one string: the root-relative path. That is all it should store —
 * it is the CMS's field, and the CMS renders a link from it. Everything else
 * about the file is ours: which Cloudinary id it landed on, how big it was, who
 * pushed it, and how many times it has been replaced.
 *
 * Without this row none of that is answerable. `overwrite: true` means every
 * re-upload destroys the previous bytes at the same id, so "when did this
 * change and who changed it" has no other source — Cloudinary keeps one version
 * and the MSDB string is identical before and after.
 *
 * ── THIS IS NOT A DELIVERY LOOKUP ───────────────────────────────────────────
 * Same warning as LegacyFileMigration, for the same reason: the public URL
 * resolves through the static rewrite in next.config.mjs with no database in
 * the request path. Nothing that serves a file may read this collection. It
 * exists so a human can answer questions about the file, and for nothing else.
 *
 * ── (courseId, lang) IS THE KEY, AND courseId IS THE NORMALISED FORM ────────
 * The normalised (lowercased) course_id, because that is what the path and the
 * Cloudinary public_id are built from — keying on the raw form would let
 * `POWER-BI` and `power-bi` occupy two rows describing one asset, which is the
 * exact collision the lowercase rule exists to prevent.
 */
const CourseOutlineFileSchema = new mongoose.Schema(
  {
    /** Normalised course_id: lowercase, [a-z0-9-] only. See normaliseCourseIdForPath. */
    courseId: { type: String, required: true, trim: true, lowercase: true },
    lang: { type: String, required: true, enum: OUTLINE_LANGS },

    /** Where it landed in Cloudinary. Derived server-side, never client-supplied. */
    publicId: { type: String, required: true, trim: true },
    /** The root-relative path — the same string MSDB is given. */
    legacyPath: { type: String, required: true, trim: true },

    bytes: { type: Number, default: 0 },
    contentType: { type: String, default: 'application/pdf' },
    uploadedAt: { type: Date, default: Date.now },
    /** Admin id/name, from the session — never from the request body. */
    uploadedBy: { type: String, default: '' },

    /**
     * Incremented on every overwrite, starting at 1.
     *
     * The only counter of how many times these bytes have been replaced.
     * Cloudinary keeps one version at a fixed id and MSDB's string never
     * changes, so without this a replacement leaves no trace anywhere.
     */
    version: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'course_outline_files' },
);

/** One row per (course, language). The uniqueness IS the key. */
CourseOutlineFileSchema.index({ courseId: 1, lang: 1 }, { unique: true });

export default mongoose.models.CourseOutlineFile
  || mongoose.model('CourseOutlineFile', CourseOutlineFileSchema);
