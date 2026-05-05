import mongoose from 'mongoose';

/**
 * ProgramPageConfig — admin-managed pretty-URL + SEO layer for the
 * public /program/[slug] route. Mirrors the CourseExtension pattern.
 *
 * `programId` matches `program_id` (short upstream code, e.g. "DEV") or
 * `_id` from /programs — the resolver in /program/[slug]/page.jsx
 * accepts both.
 */
const ProgramPageConfigSchema = new mongoose.Schema(
  {
    programId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Custom URL slug (no leading slash). Empty/null → fall back to the
    // program_name → kebab-case slug at resolve time.
    urlSlug: { type: String, default: null, trim: true },

    metaTitle:       { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    ogImage:         { type: String, default: '' },

    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'program_page_configs' }
);

// Empty-string urlSlug would conflict on the unique sparse index across
// rows; coerce to null so the index just ignores them.
ProgramPageConfigSchema.pre('save', function preSave(next) {
  if (typeof this.urlSlug === 'string' && this.urlSlug.trim() === '') {
    this.urlSlug = null;
  }
  next();
});

ProgramPageConfigSchema.index({ urlSlug: 1 }, { sparse: true });

export default mongoose.models.ProgramPageConfig ||
  mongoose.model('ProgramPageConfig', ProgramPageConfigSchema);
