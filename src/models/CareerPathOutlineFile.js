import mongoose from 'mongoose';
import { CAREER_OUTLINE_LANGS } from '@/lib/careerPaths/careerPathOutline';

/**
 * CareerPathOutlineFile — which bytes landed at a career path's outline path,
 * and when. Mirrors CourseOutlineFile one-for-one (own collection, NOT a
 * discriminator on it — a career path is not a course and the two key spaces
 * must never be joined).
 *
 * ── WHAT IS AND IS NOT AUTHORITATIVE HERE ────────────────────────────────────
 * The LINK the public button renders is `links.outlineUrl` in MSDB, written by
 * the form save; the 6-hour sync overwrites the genesis mirror's `links` from
 * upstream, so nothing may rely on this row to know where the button points.
 * This row is the upload ledger: bytes, uploader, version — the history an
 * admin sees, and what a rename audit can compare against.
 *
 * Keyed on (slugKey, lang) rather than the MSDB _id because the FILENAME is
 * keyed on the slug: the row describes a file, and a career path created in
 * the form has no _id until MSDB answers, but has a slug from the first
 * keystroke. `careerPathId` is recorded when known.
 */
const CareerPathOutlineFileSchema = new mongoose.Schema(
  {
    slugKey: { type: String, required: true, trim: true, lowercase: true },
    lang: { type: String, required: true, enum: CAREER_OUTLINE_LANGS },
    careerPathId: { type: String, default: '', trim: true },
    publicId: { type: String, required: true, trim: true },
    legacyPath: { type: String, required: true, trim: true },
    bytes: { type: Number, default: 0 },
    contentType: { type: String, default: 'application/pdf' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: '' },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'career_path_outline_files' },
);

CareerPathOutlineFileSchema.index({ slugKey: 1, lang: 1 }, { unique: true });

export default mongoose.models.CareerPathOutlineFile
  || mongoose.model('CareerPathOutlineFile', CareerPathOutlineFileSchema);
