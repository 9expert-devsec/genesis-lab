/**
 * Article public-ordering rank.
 *
 * Answers "where does this article actually land on /articles?" for the admin
 * list, which otherwise shows `pinOrder` — a number that is meaningful only for
 * pinned rows and is a flat default `0` on every other one.
 *
 * ── THE DUPLICATED CASCADE ──────────────────────────────────────────────────
 * This comparator mirrors, in JS, the Mongo sort in
 * src/lib/actions/articles.js (`getArticles`), quoted here verbatim:
 *
 *     .sort({ isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 })
 *
 * THESE TWO MUST MOVE TOGETHER. There is no mechanism that makes them agree —
 * the duplication is deliberate (the rank has to be computable without a
 * database, in the pure tier and in the browser) and therefore fragile. If you
 * change the sort in articles.js, change `compareArticlesForPublicOrder` in the
 * same commit; test/pure/articleRank.test.mjs pins the behaviour, not the
 * literal, so it will NOT catch a drift on its own.
 *
 * ── WHAT "PUBLISHED ORDERING" MEANS ─────────────────────────────────────────
 * /articles fetches with `active: true` (src/app/(public)/articles/page.jsx),
 * while the admin list fetches with no `active` filter and so also holds
 * inactive rows. An inactive article has NO position on /articles, so it gets
 * `rank: null` rather than a number — numbering it would both invent a position
 * it does not have and push every active article's number away from its real
 * one.
 *
 * ── FIDELITY NOTES (read before trusting an edge case) ───────────────────────
 * Verified by reading MongoDB's documented BSON comparison order, NOT by
 * executing it: the cluster is not reachable from the dev environment, so the
 * live check that would have settled these was not run.
 *
 *   · `publishedAt: null` (what buildModelData writes for a draft) — Null sorts
 *     BELOW Date in BSON order, so under `-1` real dates come first and nulls
 *     land at the END, where `createdAt: -1` then orders them among themselves.
 *     Encoded faithfully below. This is the common case: every draft hits it.
 *
 *   · A document MISSING `isPinnedOnArticlePage` entirely would, under BSON
 *     rules, sort after both `true` and `false` under `-1`. This helper instead
 *     treats absent as `false`. STATED DIVERGENCE, not an oversight: the field
 *     carries `default: false` in the model, so every document written through
 *     this app has it, and encoding an unreachable branch I could not execute
 *     would be pinning a guess. If legacy documents without the field turn up,
 *     revisit this line first.
 *
 * Dependency-free by design (no next/*, no db, no models) so it runs in the
 * `pure` test tier and in the client component that renders the list.
 */

/** Provenance of the cascade this file mirrors — quoted in the doc block above. */
export const ARTICLE_SORT_SOURCE = 'src/lib/actions/articles.js → getArticles()';

/** An article appears on /articles only if it matches the `active: true` filter. */
export function isPubliclyOrdered(article) {
  return article?.active === true;
}

const time = (v) => {
  if (v == null || v === '') return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Descending date compare with NULLS LAST, matching Mongo's `{ field: -1 }`
 * over a field that is Null on some documents.
 */
function compareDateDesc(a, b) {
  const ta = time(a);
  const tb = time(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;  // nulls sink
  if (tb === null) return -1;
  return tb - ta;             // newer first
}

/**
 * The cascade, in order. Returns <0 if `a` ranks ahead of `b`.
 *
 * Mirrors: { isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 }
 */
export function compareArticlesForPublicOrder(a, b) {
  // isPinnedOnArticlePage: -1 → true before false
  const pa = a?.isPinnedOnArticlePage === true ? 1 : 0;
  const pb = b?.isPinnedOnArticlePage === true ? 1 : 0;
  if (pa !== pb) return pb - pa;

  // pinOrder: 1 → ascending. Applies to EVERY document, not just pinned ones;
  // it is simply uninformative for unpinned rows, which all hold the default 0.
  const oa = Number.isFinite(Number(a?.pinOrder)) ? Number(a.pinOrder) : 0;
  const ob = Number.isFinite(Number(b?.pinOrder)) ? Number(b.pinOrder) : 0;
  if (oa !== ob) return oa - ob;

  // publishedAt: -1 (nulls last)
  const pub = compareDateDesc(a?.publishedAt, b?.publishedAt);
  if (pub !== 0) return pub;

  // createdAt: -1 (nulls last)
  const cre = compareDateDesc(a?.createdAt, b?.createdAt);
  if (cre !== 0) return cre;

  // NOT part of the Mongo cascade. Mongo leaves the order of a full tie
  // unspecified; this helper picks a stable one so a rank does not shuffle
  // between two renders of the same data.
  return String(a?._id ?? '').localeCompare(String(b?._id ?? ''));
}

/**
 * Assign each article its position in the public ordering.
 *
 * Input order is PRESERVED in the output — callers look ranks up by id while
 * rendering their own (filtered, paginated) view, so re-ordering here would buy
 * nothing and would make the "no rows lost" property harder to see.
 *
 * @param {object[]} articles — the FULL set, not a page of it. A rank computed
 *   from one page restarts at 1 on the next and is meaningless.
 * @returns {object[]} same length, same ids, each with:
 *   - `rank`      number 1..N over publicly-ordered articles, or `null`
 *   - `rankBasis` 'pinned' | 'date' | null
 *   - `pinTie`    true when a pinned article shares its `pinOrder` with another
 *                 pinned article, so the position it looks like it controls was
 *                 actually decided by date
 */
export function assignArticleRanks(articles) {
  if (!Array.isArray(articles)) return [];

  const ranked = articles.filter(isPubliclyOrdered);
  const order = [...ranked].sort(compareArticlesForPublicOrder);

  const rankById = new Map();
  order.forEach((a, i) => rankById.set(String(a?._id), i + 1));

  // A pinOrder shared by two or more PINNED articles means the pin no longer
  // determines their relative position — publishedAt broke the tie. The admin
  // set a number and did not get what it looks like they asked for.
  const pinOrderCounts = new Map();
  for (const a of ranked) {
    if (a?.isPinnedOnArticlePage !== true) continue;
    const key = Number.isFinite(Number(a?.pinOrder)) ? Number(a.pinOrder) : 0;
    pinOrderCounts.set(key, (pinOrderCounts.get(key) ?? 0) + 1);
  }

  return articles.map((a) => {
    if (!isPubliclyOrdered(a)) {
      return { ...a, rank: null, rankBasis: null, pinTie: false };
    }
    const pinned = a?.isPinnedOnArticlePage === true;
    const key = Number.isFinite(Number(a?.pinOrder)) ? Number(a.pinOrder) : 0;
    return {
      ...a,
      rank: rankById.get(String(a?._id)) ?? null,
      rankBasis: pinned ? 'pinned' : 'date',
      pinTie: pinned && (pinOrderCounts.get(key) ?? 0) > 1,
    };
  });
}
