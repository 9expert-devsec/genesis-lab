import 'server-only';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import ArticleView from '@/models/ArticleView';
import { articleCanonicalUrl } from '@/lib/articles/articleUrl';

/**
 * The published-article snapshot genesis sends to MSDB
 * (PUT /api/ai/articles/sync, see msdbPutArticleSnapshot in
 * lib/api/msdb-write.js) so MSDB's /api/ai can serve articles.
 *
 * A FULL SNAPSHOT, not a diff: MSDB replaces its set with `items`, which is
 * why it refuses an empty or >50%-smaller snapshot with 409. Every published
 * article is in every snapshot.
 *
 * Split in two on purpose. `toSnapshotItem` / `assembleArticleSnapshot` are
 * pure (documents in, JSON out) so the MCP article tool and tests can reuse
 * the exact item shape; `buildArticleSnapshot` is the only part that reads
 * the database: one article find, one all-time views $group, joined here.
 */

/**
 * The first counted day in `article_views`. Counting began on this day, so a
 * `view_count` means "views since then", not lifetime views. A constant, not
 * a query: the collection's earliest day cannot move later than this.
 */
export const VIEWS_SINCE = '2026-10-06';

/** The article fields the snapshot reads. Nothing else is fetched. */
export const SNAPSHOT_ARTICLE_FIELDS =
  '_id title slug excerpt coverUrl articleType programs skills publishedAt contentUpdatedAt';

/**
 * Published, by the stricter of the repo's definitions: shown on the site
 * (`active`) AND past its publish time. Same rule as the admin "Published"
 * badge (ArticleForm isPublished), so a scheduled article never reaches MSDB
 * before its time.
 */
export function publishedArticleFilter(now = new Date()) {
  return { active: true, publishedAt: { $lte: now } };
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * One article document (lean) + its all-time view total → one snapshot item.
 * `content_updated_at` falls back to `publishedAt`: an absent
 * `contentUpdatedAt` means "unchanged since that field shipped"
 * (src/models/Article.js).
 */
export function toSnapshotItem(doc, viewCount = 0) {
  const slug = String(doc.slug ?? '');
  return {
    article_id: String(doc._id),
    title: doc.title ?? '',
    slug,
    // Percent-encoded: the Thai slug as a byte-safe ASCII URI, which the live
    // site serves as a final 200 (no trailing slash; that one is a 308).
    url: articleCanonicalUrl(encodeURIComponent(slug)),
    type: doc.articleType === 'video' ? 'video' : 'article',
    excerpt: doc.excerpt ?? '',
    cover_url: doc.coverUrl ?? '',
    programs: (doc.programs ?? []).map(String).filter(Boolean),
    skills: (doc.skills ?? []).map(String).filter(Boolean),
    view_count: Number(viewCount) || 0,
    views_since: VIEWS_SINCE,
    published_at: iso(doc.publishedAt),
    content_updated_at: iso(doc.contentUpdatedAt ?? doc.publishedAt),
  };
}

/**
 * Articles + a Map(articleId string → views) → `{ synced_at, items }`.
 * A left join from the article side: views of hidden or deleted articles are
 * dropped, and an article with no views gets 0.
 */
export function assembleArticleSnapshot(articles, viewTotals, now = new Date()) {
  return {
    synced_at: now.toISOString(),
    items: articles.map((a) => toSnapshotItem(a, viewTotals.get(String(a._id)) ?? 0)),
  };
}

/** articleId (string) → all-time views, over every article. One $group. */
async function allTimeViewTotals() {
  const rows = await ArticleView.aggregate([
    { $group: { _id: '$articleId', views: { $sum: '$count' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.views]));
}

/**
 * The snapshot, read from the database. READ-ONLY.
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ synced_at: string, items: object[] }>}
 */
export async function buildArticleSnapshot({ now = new Date() } = {}) {
  await dbConnect();
  const [articles, viewTotals] = await Promise.all([
    Article.find(publishedArticleFilter(now))
      .select(SNAPSHOT_ARTICLE_FIELDS)
      .sort({ _id: 1 })
      .lean(),
    allTimeViewTotals(),
  ]);
  return assembleArticleSnapshot(articles, viewTotals, now);
}
