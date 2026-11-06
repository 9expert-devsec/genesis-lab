import { dedupeIds, joinWriterNames, orderWriters } from '@/lib/writers/articleWriters';

/**
 * Moving a writer's articles when the writer is deactivated.
 *
 *   sole writer   → writerIds becomes [academy]
 *   co-written    → the writer is removed, and Academy is not added
 *
 * Pure, so the rules run without a database. The action reads the articles, plans
 * here and writes the result in one transaction.
 *
 * An article is only ever given Academy when nobody else is left, which is what
 * keeps Academy from appearing twice and `writerIds` from ending up empty.
 */

/** Above this, revalidate the article route as a whole rather than path by path. */
export const TRANSFER_PATH_LIMIT = 50;

/**
 * @param {object} input
 * @param {unknown} input.writerId    the writer being deactivated
 * @param {{_id: unknown, displayName: string}} input.academy
 * @param {{_id: unknown, slug: string, writerIds: unknown[]}[]} input.articles
 * @param {{_id: unknown, displayName: string}[]} [input.coWriters]  rows for the
 *   other writers on these articles, for the compat `author` string
 * @returns {{writes: object[], sole: number, coWritten: number}}
 */
export function planWriterTransfer({ writerId, academy, articles, coWriters = [] }) {
  const target = String(writerId);
  const academyId = String(academy._id);
  const writes = [];

  for (const article of articles ?? []) {
    const stored = dedupeIds(article.writerIds);
    if (!stored.includes(target)) continue;

    const remaining = stored.filter((id) => id !== target);
    if (remaining.length === 0) {
      writes.push({
        _id: article._id,
        slug: article.slug,
        kind: 'sole',
        writerIds: [academyId],
        author: academy.displayName,
      });
    } else {
      writes.push({
        _id: article._id,
        slug: article.slug,
        kind: 'coWritten',
        writerIds: remaining,
        author: joinWriterNames(orderWriters(remaining, [...coWriters, academy])),
      });
    }
  }

  return {
    writes,
    sole: writes.filter((write) => write.kind === 'sole').length,
    coWritten: writes.filter((write) => write.kind === 'coWritten').length,
  };
}

/**
 * One bulkWrite op per article.
 *
 * Each filter re-states what the plan saw, so an article that changed after the
 * read matches nothing and the action can abort. The co-written filter is the
 * guard that $pull cannot empty `writerIds`: it needs a second writer to match.
 *
 * `timestamps: false` keeps `updatedAt` as it was. `contentUpdatedAt` is not
 * touched: moving a byline does not change the article.
 */
export function transferBulkOps(plan, writerId) {
  return plan.writes.map((write) => {
    if (write.kind === 'sole') {
      return {
        updateOne: {
          filter: { _id: write._id, writerIds: writerId, 'writerIds.1': { $exists: false } },
          update: { $set: { writerIds: write.writerIds, author: write.author } },
          timestamps: false,
        },
      };
    }
    return {
      updateOne: {
        filter: { _id: write._id, writerIds: writerId, 'writerIds.1': { $exists: true } },
        update: { $pull: { writerIds: writerId }, $set: { author: write.author } },
        timestamps: false,
      },
    };
  });
}

/**
 * Article pages to revalidate. One path each up to the limit; past it, the whole
 * route, so one click cannot queue hundreds of revalidations.
 */
export function transferArticlePaths(plan) {
  const paths = plan.writes.map((write) => `/articles/${encodeURIComponent(write.slug)}`);
  return paths.length > TRANSFER_PATH_LIMIT
    ? { paths: [], wholeRoute: true }
    : { paths, wholeRoute: false };
}
