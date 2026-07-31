/**
 * Article public-ordering rank.
 *
 * Answers "where does this article actually land on /articles?" for the admin
 * list, which otherwise shows `pinOrder` — a number that is meaningful only for
 * pinned rows and is a flat default `0` on every other one.
 *
 * ── THE DUPLICATED CASCADE, AND THE HALF THAT IS NO LONGER DUPLICATED ───────
 * The Mongo sort in src/lib/actions/articles.js (`getArticles`) is now
 * `ARTICLE_SORT`, declared below and IMPORTED by that reader. There used to be
 * a literal there and a hand-written copy of it in this paragraph — which went
 * stale the moment the cascade changed, because a comment is not something a
 * test can hold. The spec is one object; the SOURCE OF THAT OBJECT is this file.
 *
 * What is still written twice is the COMPARATOR: `compareArticlesForPublicOrder`
 * re-implements the cascade in JS because a rank has to be computable without a
 * database, in the pure tier and in the browser. That duplication is deliberate
 * and remains fragile. If you change `ARTICLE_SORT`, change the comparator in
 * the same commit — test/pure/articleRank.test.mjs pins BEHAVIOUR, not the
 * literal, so it will not catch a drift on its own.
 *
 * A THIRD party has to move with them and is easy to forget:
 * `ARTICLE_ORDER_INDEX` in src/models/Article.js. An index serves a sort only in
 * its own direction or its exact reverse, so flipping a sign here without
 * flipping it there does not fail — it drops the query to a COLLSCAN plus a
 * blocking in-memory sort. test/fs/articleCascade.test.mjs holds all three
 * together.
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

/**
 * THE CASCADE, as one object, in one place.
 *
 * `getArticles` used to carry this as a literal and this file carried a hand
 * written copy of it, with nothing forcing the two to agree — the doc block
 * above says so in as many words. The SPEC is now single-sourced here and
 * imported by the reader; what still has to be written twice is the COMPARATOR
 * below, because a rank has to be computable without a database. That is a
 * smaller gap than two literals, and `test/fs/articleCascade.test.mjs` closes
 * what is left by asserting the reader imports this rather than spelling it out.
 *
 * ── IT LANDED ONE COMMIT BEFORE THE READER USED IT, ON PURPOSE ──────────────
 * An index has to exist before the query that needs it goes live, or the first
 * request after the deploy runs a COLLSCAN plus a blocking in-memory sort
 * against the whole collection. So the order was: declare the cascade and build
 * `ARTICLE_ORDER_INDEX` for it (src/models/Article.js), THEN switch the reader
 * and this file's comparator over to it.
 *
 * DIRECTION AND KEY ORDER ARE LOAD-BEARING. An index serves a sort only in its
 * own direction or its exact reverse, so changing a `-1` here without changing
 * `ARTICLE_ORDER_INDEX` silently drops the query back to a blocking sort.
 */
export const ARTICLE_SORT = Object.freeze({
  isPinnedOnArticlePage: -1,
  pinOrder: 1,
  sortKey: -1,
});

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
 * THE DATE ORDERING — the tail of the cascade, on its own.
 *
 * `publishedAt: -1, createdAt: -1`, then `_id` to break a full tie. This is the
 * order an article sits in when nobody has positioned it, i.e. "where this
 * belongs in the normal ordering".
 *
 * ── WHY IT IS A SEPARATE EXPORT AND NOT A SECOND COMPARATOR ─────────────────
 * `assignSortKeysFromOrder` in src/lib/articleSortKey.js needs exactly these
 * three tiers and NOT the two above them — a sortKey means "where this sits in
 * the normal ordering", so a pinned article must get the key its DATE earns
 * rather than one that strands it at the top of the collection forever. The
 * obvious way to get that is to write a second comparator, which is how the two
 * halves of a duplicated cascade start disagreeing (this file's own doc block
 * already warns about the copy it keeps in sync with articles.js by hand).
 * Instead the shipped comparator now ENDS IN this function, so there is one
 * implementation of the date tiers and a caller that wants only them asks for
 * them by name. Behaviour of `compareArticlesForPublicOrder` is unchanged.
 *
 * ── IT IS TOTAL, AND THAT IS LOAD-BEARING ───────────────────────────────────
 * The `_id` tiebreak was added so a rank would not shuffle between two renders
 * of the same data. The backfill depends on the same property for a stronger
 * reason: `publishedAt` is full of ties by construction (an import burst writes
 * hundreds of rows within minutes, and drafts share a null), so without a final
 * discriminator two runs of the assignment could pick different orders and a
 * re-run would silently renumber the list. Distinct `_id` values are the only
 * thing guaranteed to separate two documents.
 */
export function compareArticlesByDate(a, b) {
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
 * The stored `sortKey`, or `null` when the article has none.
 *
 * ── WHY THIS READER LIVES HERE AND NOT IN articleSortKey.js ─────────────────
 * It belongs there by subject matter, and it started there. It is here because
 * articleSortKey.js imports `compareArticlesByDate` from this file, so this file
 * importing back would be a cycle — and the alternative, a second two-line
 * reader written out in each module, is the "two things that must agree with
 * nothing forcing them to" shape this repo keeps paying for. One reader, in the
 * module with no dependencies of its own; articleSortKey.js re-exports it so
 * callers can still ask the module that owns the concept.
 *
 * `null` rather than `0`: absent means "not backfilled", and 0 is a real
 * position. Collapsing the two would let a document with no key claim a place in
 * the ordering instead of being visibly missing from it.
 */
export function sortKeyOf(article) {
  const n = Number(article?.sortKey);
  return Number.isFinite(n) ? n : null;
}

/**
 * `sortKey` descending, missing keys last, ties resolved by the date ordering.
 *
 * A missing key SINKS, which is what Mongo's `{sortKey: -1}` does with a
 * document that does not carry the field: under a descending sort, absent sorts
 * below every number. After the backfill no article is in that state; it is
 * defined because a document created between a deploy and a backfill would be,
 * and because "absent" must never accidentally read as "first".
 */
export function compareBySortKeyDesc(a, b) {
  const ka = sortKeyOf(a);
  const kb = sortKeyOf(b);
  if (ka !== null || kb !== null) {
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka !== kb) return kb - ka;
  }
  // BEYOND the Mongo cascade. Two equal (or two absent) sortKeys leave Mongo's
  // order unspecified; this picks a stable one so a rank does not shuffle
  // between two renders of the same data. Same role the `_id` tiebreak has
  // always had, one tier up.
  return compareArticlesByDate(a, b);
}

/**
 * The cascade, in order. Returns <0 if `a` ranks ahead of `b`.
 *
 * Mirrors `ARTICLE_SORT`: { isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 }
 *
 * ── THIS COMPARATOR HAS MORE TIERS THAN THE MONGO SORT, AND MUST ────────────
 * Mongo stops at `sortKey`. Where two documents tie there — equal keys, or both
 * missing one — the engine's order is unspecified, so this helper continues into
 * `publishedAt`, `createdAt` and finally `_id` to produce a stable answer. That
 * is a REFINEMENT of the Mongo order, never a contradiction of it: every pair
 * Mongo does order, this orders the same way. After the backfill all 486 keys
 * are distinct, so the extra tiers decide nothing in production — they exist so
 * that a newly created article, or a fixture with no keys at all, still has one
 * defined order rather than a per-render coin flip.
 *
 * ── WHAT `pinOrder` IS DOING IN A sortKey WORLD ─────────────────────────────
 * Deciding the pinned block, and only that. Pin ordering is a thing the admin
 * controls SEPARATELY from normal ordering, so the two live in two fields; if
 * `pinOrder` were dropped the pinned block would inherit `sortKey` and the two
 * orderings this whole rework exists to separate would collapse back into one.
 * It is still the SECOND key and so still applies to every document, which is
 * why an unpinned row holding a stray non-zero value still sinks to the end of
 * the list (b-006) and why `pinTie` is still worth keeping as a tripwire.
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

  // sortKey: -1, then the stable tail — see compareBySortKeyDesc.
  return compareBySortKeyDesc(a, b);
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
