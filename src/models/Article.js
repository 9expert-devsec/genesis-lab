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
  },
  { timestamps: true, collection: 'articles' }
);

ArticleSchema.index({ publishedAt: -1, active: 1 });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ programs: 1 });

export default mongoose.models.Article || mongoose.model('Article', ArticleSchema);