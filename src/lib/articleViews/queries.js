import 'server-only';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import ArticleView from '@/models/ArticleView';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. Replaces this module's private escapeRegex copy.
import { searchTermPattern } from '@/lib/searchTerm';

/**
 * /admin/article-views — the reads. READ-ONLY: find / distinct / aggregate
 * only. Everything the page decides from these results lives in the pure
 * lib/articleViews/dashboard.js.
 *
 * Every view aggregate is scoped to an explicit list of article ids — the
 * filtered article set — so the totals are a LEFT JOIN from the article side
 * (dashboard.mergeArticleViews) and views of deleted articles count nowhere.
 * The day range is served by the `{ day: 1 }` index on ArticleView.
 */

/** The fields the dashboard reads off an article. */
export const ARTICLE_VIEWS_FIELDS = '_id title slug skills programs active publishedAt contentUpdatedAt';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** The earliest counted day ('YYYY-MM-DD'), or null when nothing was ever counted. */
export async function getCollectionStart() {
  await dbConnect();
  const doc = await ArticleView.findOne({}, { day: 1, _id: 0 }).sort({ day: 1 }).lean();
  return doc?.day ?? null;
}

/**
 * The articles matching every filter EXCEPT skill (the page applies skill in
 * memory, because the per-skill bars must ignore it). `status`: 'active'
 * (shown on the site, the default), 'hidden', or 'all'.
 */
export async function listDashboardArticles({ q = '', program = '', status = 'active' } = {}) {
  await dbConnect();
  const filter = {};
  if (status === 'active') filter.active = true;
  else if (status === 'hidden') filter.active = false;
  if (program) filter.programs = program;
  // The private `escapeRegex` this file used to define was the ONLY correct
  // copy in the repo and is now the shared helper, which also caps the length —
  // see lib/searchTerm.js. Matching is unchanged.
  const term = searchTermPattern(q);
  if (term) {
    const re = new RegExp(term, 'i');
    filter.$or = [{ title: re }, { slug: re }];
  }
  return Article.find(filter).select(ARTICLE_VIEWS_FIELDS).lean();
}

/** Program and skill ids that any article carries — the filter options. */
export async function listUsedTaxonomyIds() {
  await dbConnect();
  const [programs, skills] = await Promise.all([Article.distinct('programs'), Article.distinct('skills')]);
  return { programs: programs.map(String).filter(Boolean), skills: skills.map(String).filter(Boolean) };
}

/** articleId (string) → views in [from, to], for the given articles. */
export async function getViewTotalsByArticle(ids, from, to) {
  if (!ids?.length) return new Map();
  await dbConnect();
  const rows = await ArticleView.aggregate([
    { $match: { day: { $gte: from, $lte: to }, articleId: { $in: ids.map(oid) } } },
    { $group: { _id: '$articleId', views: { $sum: '$count' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.views]));
}

/** day → views in [from, to], summed over the given articles. */
export async function getDailyTotals(ids, from, to) {
  if (!ids?.length) return new Map();
  await dbConnect();
  const rows = await ArticleView.aggregate([
    { $match: { day: { $gte: from, $lte: to }, articleId: { $in: ids.map(oid) } } },
    { $group: { _id: '$day', views: { $sum: '$count' } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.views]));
}

/** Total views in [from, to] over the given articles. */
export async function getRangeTotal(ids, from, to) {
  const daily = await getDailyTotals(ids, from, to);
  let total = 0;
  for (const v of daily.values()) total += v;
  return total;
}

/**
 * articleId (string) → (day → views), for the sparklines. Called with the
 * CURRENT PAGE's ids only, never the whole set.
 */
export async function getDailyByArticle(ids, from, to) {
  const out = new Map();
  if (!ids?.length) return out;
  await dbConnect();
  const rows = await ArticleView.find(
    { day: { $gte: from, $lte: to }, articleId: { $in: ids.map(oid) } },
    { articleId: 1, day: 1, count: 1, _id: 0 },
  ).lean();
  for (const r of rows) {
    const id = String(r.articleId);
    if (!out.has(id)) out.set(id, new Map());
    out.get(id).set(r.day, r.count);
  }
  return out;
}
