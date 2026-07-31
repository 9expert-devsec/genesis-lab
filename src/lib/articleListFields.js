/**
 * Field projections for the article LIST reads.
 *
 * `getArticles` is shared by /admin/articles and /articles and had no
 * `.select()` at all, so every list read serialised WHOLE documents — including
 * the full `content` HTML body of every row — into the RSC payload. At 200 rows
 * that is already the dominant cost of the admin page, and raising the window
 * (commit 3's server-side pagination) multiplies it. Projection has to land
 * first or the fix for one bug pays for itself with a slower page.
 *
 * There is also a disclosure angle, which is the sharper of the two: with no
 * projection, `jsonLd.rawOverride` — a field the form gates behind the
 * SUPERADMIN tier — ships to the browser of every admin who opens the list,
 * for all 200 rows. Nothing renders it, so nothing was visibly wrong; it was
 * simply in the payload. Naming the fields removes it.
 *
 * ── WHY THESE LIVE HERE AND NOT AT THE CALL SITE ────────────────────────────
 * A projection is a contract between a query and the component that renders its
 * result, and it is the kind of contract that fails SILENTLY: a field left out
 * (or misspelled) reads back `undefined`, and `undefined` renders as an empty
 * cell, an unlit toggle, or — for `isPinnedOnArticlePage` — a badge that simply
 * stops appearing. No error, no warning, nothing in a log. As a literal inlined
 * at the call site there would be nothing for a test to hold onto;
 * test/pure/articleListFields.test.mjs checks these names against the real
 * Mongoose schema AND against what the client actually reads.
 *
 * Dependency-free (no next/*, no db, no models) so the `pure` tier can run it.
 */

/**
 * What /admin/articles needs.
 *
 * Derived from what ArticlesAdminClient renders plus what its two pure helpers
 * read, NOT from what looks useful:
 *   · the table columns          — slug, title, author, coverUrl, tags,
 *                                  articleType, active, featuredOnLanding,
 *                                  publishedAt
 *   · PositionCell               — isPinnedOnArticlePage, pinOrder, showPinBadge
 *   · assignArticleRanks         — active, isPinnedOnArticlePage, pinOrder,
 *                                  publishedAt, createdAt, _id
 *   · every mutation handler     — _id
 *
 * `createdAt` is the one that looks superfluous and is not: it is the last tier
 * of the ordering cascade, so dropping it would make the rank column disagree
 * with /articles for any two rows sharing a publishedAt.
 *
 * `rank`, `rankBasis` and `pinTie` are absent because they are COMPUTED by
 * assignArticleRanks — they are not stored, and asking Mongo for them would be
 * a silent no-op.
 */
export const ADMIN_LIST_FIELDS =
  '_id slug title author coverUrl tags articleType active featuredOnLanding ' +
  'publishedAt createdAt isPinnedOnArticlePage pinOrder showPinBadge';

/**
 * What an article CARD renders — the same set `getArticlesByIds` already
 * projects for the related-articles rail.
 *
 * ⚠ NOT WIRED INTO /articles, DELIBERATELY, AND NOT SAFE TO WIRE AS-IS.
 * ArticlesPageClient also calls `shouldShowPinBadge(article)`, which reads
 * `isPinnedOnArticlePage` and `showPinBadge` — neither of which is in this
 * list. Projecting it onto the public list today would make
 * `isPinnedOnArticlePage === true` false for every row and silently delete the
 * pin badge from the whole of /articles, with nothing raising an error: exactly
 * the failure mode described at the top of this file. Add those two fields
 * before pointing the public list at this constant.
 * test/pure/articleListFields.test.mjs pins that gap so it cannot be discovered
 * in production.
 */
export const PUBLIC_LIST_FIELDS =
  '_id slug title excerpt coverUrl tags articleType publishedAt';

/**
 * Normalise a projection to the space-joined string `.select()` wants.
 *
 * Accepts a string or an array so callers are not forced to remember which,
 * and returns `''` for anything empty — `getArticles` treats that as "no
 * projection", which is the pre-existing behaviour every other caller relies on.
 *
 * @param {string|string[]} spec
 * @returns {string}
 */
export function toSelectString(spec) {
  const list = Array.isArray(spec) ? spec : String(spec ?? '').split(/\s+/);
  return list.map((f) => String(f ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * The same projection as an array of field names — for tests and for anything
 * that needs to reason about the set rather than hand it to Mongoose.
 *
 * @param {string|string[]} spec
 * @returns {string[]}
 */
export function toFieldList(spec) {
  const s = toSelectString(spec);
  return s ? s.split(' ') : [];
}
