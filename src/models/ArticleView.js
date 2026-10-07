import mongoose from 'mongoose';

/**
 * Anonymous daily article view totals — one document per (article, Asia/Bangkok
 * day), written only with `$inc` by src/app/api/articles/view/route.js.
 *
 * A SEPARATE COLLECTION ON PURPOSE. Counting into the `articles` document would
 * bump its `updatedAt` on every read (Mongoose timestamps) and churn every
 * cache keyed on it; here a view touches nothing a page renders from.
 *
 * Nothing identifies a visitor: no IP, no user agent, no cookie, no session id,
 * nothing finer than the day. Read by /admin/article-views
 * (src/lib/articleViews/queries.js).
 */
const ArticleViewSchema = new mongoose.Schema(
  {
    articleId: { type: mongoose.Schema.Types.ObjectId, required: true },
    day:       { type: String, required: true }, // 'YYYY-MM-DD', Asia/Bangkok
    count:     { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false, collection: 'article_views' }
);

ArticleViewSchema.index({ articleId: 1, day: 1 }, { unique: true });
// /admin/article-views reads by day range across all articles (range totals,
// the daily series, and the collection start — the earliest `day`), which the
// compound index above cannot serve because `day` is not its prefix. Built by
// Mongoose autoIndex on first model use (dbConnect leaves autoIndex at its
// default); the collection is small, so the build is cheap.
ArticleViewSchema.index({ day: 1 });

export default mongoose.models.ArticleView ||
  mongoose.model('ArticleView', ArticleViewSchema);
