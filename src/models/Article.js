import mongoose from 'mongoose';

/**
 * Article — Genesis-owned content (no MSDB sync).
 *
 * Tags / programs / skills are stored as flat string arrays for cheap
 * filter queries. `programs` and `skills` hold upstream identifiers
 * (program_id / skill_id) so the admin UI can resolve them to display
 * names without an extra lookup on the public side.
 *
 * `relatedArticles` is a Mongo ObjectId ref array; `relatedCourses` is
 * a course_id string array (matches how every other model in this
 * project stores course references).
 */
const ArticleSchema = new mongoose.Schema(
  {
    slug:            { type: String, required: true, unique: true, trim: true },
    title:           { type: String, required: true, trim: true },
    excerpt:         { type: String, trim: true, default: '' },
    content:         { type: String, required: true },
    coverUrl:        { type: String, default: '' },
    coverPublicId:   { type: String, default: '' },

    // Taxonomy — tags keep the casing the admin typed.
    tags:            [{ type: String, trim: true }],
    programs:        [{ type: String, trim: true }],  // program_id values; empty = "None"
    skills:          [{ type: String, trim: true }],  // skill_id values; optional

    // Relations
    relatedArticles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
    relatedCourses:  [{ type: String }],              // course_id strings

    // Classification
    articleType:     { type: String, enum: ['article', 'video'], default: 'article' },

    // SEO
    seoTitle:        { type: String, trim: true, default: '' },
    seoDescription:  { type: String, trim: true, default: '' },
    focusKeyword:    { type: String, trim: true, default: '' },

    // Publishing
    author:          { type: String, trim: true, default: '' },
    publishedAt:     { type: Date },
    active:          { type: Boolean, default: true },

    // Pin this article to the top of /articles page (always shows first)
    isPinnedOnArticlePage: { type: Boolean, default: false },
    // Display order when multiple articles are pinned (lower = first)
    pinOrder:              { type: Number,  default: 0 },

    // Show this article in the Landing page BlogSection
    featuredOnLanding:     { type: Boolean, default: false },

    // Schema.org JSON-LD configuration. `overrides` lets the admin
    // pin specific JSON-LD fields without having to touch raw JSON;
    // `rawOverride` (gated by `rawOverrideEnabled`) lets a superadmin
    // ship a hand-crafted document straight through. `validation*`
    // are scratch fields the admin form writes after a Preview pass.
    jsonLd: {
      enabled:    { type: Boolean, default: true },
      schemaType: {
        type: String,
        enum: ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'],
        default: 'Article',
      },
      overrides: {
        headline:      { type: String, default: '' },
        description:   { type: String, default: '' },
        image:         { type: String, default: '' },
        authorName:    { type: String, default: '' },
        datePublished: { type: String, default: '' },
        dateModified:  { type: String, default: '' },
      },
      rawOverride:        { type: String, default: '' },
      rawOverrideEnabled: { type: Boolean, default: false },
      validationStatus: {
        type: String,
        enum: ['valid', 'warning', 'error', 'disabled', 'unchecked'],
        default: 'unchecked',
      },
      validationMessage: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'articles' }
);

ArticleSchema.index({ publishedAt: -1, active: 1 });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ programs: 1 });
ArticleSchema.index({ isPinnedOnArticlePage: 1, pinOrder: 1 });
ArticleSchema.index({ featuredOnLanding: 1, publishedAt: -1 });

export default mongoose.models.Article || mongoose.model('Article', ArticleSchema);