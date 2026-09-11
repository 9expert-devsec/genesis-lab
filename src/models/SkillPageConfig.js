import mongoose from 'mongoose';

/**
 * SkillPageConfig — admin-managed pretty-URL + SEO layer for the public
 * /skill/[slug] route. Same shape as ProgramPageConfig keyed by skillId.
 *
 * `skillId` matches `skill_id` (short code, e.g. "AI") or `_id` from
 * /skills — the resolver accepts both.
 */
const SkillPageConfigSchema = new mongoose.Schema(
  {
    skillId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    urlSlug: { type: String, default: null, trim: true },

    metaTitle:       { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    ogImage:         { type: String, default: '' },

    isPublished: { type: Boolean, default: true },

    /**
     * THE CATALOG PDF, one per skill, Thai only — see lib/pageCatalog.
     *
     * `path` is the root-relative `/files/catalog/…` string derived from the
     * KEY of this row, never typed; the button on the public page renders on
     * hasCatalog() and on nothing else. The rest mirrors what
     * CourseOutlineFile keeps about an outline: the upload overwrites in
     * place at a fixed Cloudinary id, so `version` is the only record that
     * the bytes were ever replaced. Written by lib/actions/page-catalogs only;
     * saveSkillConfig $sets its own fields and leaves this one alone.
     */
    catalogPdf: {
      path:       { type: String, default: '' },
      bytes:      { type: Number, default: 0 },
      uploadedAt: { type: Date, default: null },
      uploadedBy: { type: String, default: '' },
      version:    { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'skill_page_configs' }
);

SkillPageConfigSchema.pre('save', function preSave(next) {
  if (typeof this.urlSlug === 'string' && this.urlSlug.trim() === '') {
    this.urlSlug = null;
  }
  next();
});

SkillPageConfigSchema.index({ urlSlug: 1 }, { sparse: true });

export default mongoose.models.SkillPageConfig ||
  mongoose.model('SkillPageConfig', SkillPageConfigSchema);
