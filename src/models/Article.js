import mongoose from 'mongoose';

const ArticleSchema = new mongoose.Schema(
  {
    slug:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    title:      { type: String, required: true, trim: true },
    excerpt:    { type: String, trim: true },
    content:    { type: String, required: true }, // rich HTML
    coverUrl:   { type: String },
    coverPublicId: { type: String },
    tags:       [{ type: String, lowercase: true, trim: true }],
    author:     { type: String, trim: true },
    publishedAt: { type: Date },
    active:     { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'articles' }
);

ArticleSchema.index({ publishedAt: -1, active: 1 });
ArticleSchema.index({ tags: 1 });

export default mongoose.models.Article || mongoose.model('Article', ArticleSchema);
