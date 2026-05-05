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
