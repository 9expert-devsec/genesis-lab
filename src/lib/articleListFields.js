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
 *   · the table columns          — slug, title, author, tags, articleType,
 *                                  active, featuredOnLanding, publishedAt
 *   · OrderCell                  — isPinnedOnArticlePage, pinOrder, sortKey,
 *                                  showPinBadge
 *   · assignArticleRanks         — active, isPinnedOnArticlePage, pinOrder,
 *                                  sortKey, publishedAt, createdAt, _id
 *   · every mutation handler     — _id
 *
 * `sortKey` HAD TO LAND IN THE SAME COMMIT AS THE CASCADE, and the coverage
 * guard is what said so rather than a review: `assignArticleRanks` runs in the
 * browser over these projected rows, so the moment the comparator started
 * reading `sortKey`, a projection without it would have computed every rank
 * against `undefined` — all 486 rows tying on "no key" and falling through to
 * the date tiers. The admin column would then have disagreed with /articles for
 * every row someone had reordered, silently, which is the exact failure this
 * file exists to prevent.
 *
 * `createdAt` and `publishedAt` look superfluous now that `sortKey` decides and
 * are not: they are the comparator's tiebreak below `sortKey`, where the Mongo
 * cascade stops and leaves the order unspecified. Dropping them would make the
 * rank column shuffle between renders for any two rows sharing a key.
 *
 * `rank`, `rankBasis` and `pinTie` are absent because they are COMPUTED by
 * assignArticleRanks — they are not stored, and asking Mongo for them would be
 * a silent no-op.
 *
 * ── `coverUrl` WAS REMOVED BY HAND, AND NO TEST ASKED FOR IT ────────────────
 * The list dropped its ภาพ column, so nothing on the page reads `coverUrl` any
 * more. Note what that does and does not mean for the guards in
 * test/pure/articleListFields.test.mjs: the coverage guard checks only
 * READ ⊆ PROJECTED. A field that is projected and no longer read is a SUPERSET,
 * which that guard passes by construction — it would have stayed green forever
 * with `coverUrl` still in this string, shipping a cover URL for every row to a
 * page that renders none. Removing it is therefore a deliberate act, not one a
 * failing test forced, and the same is true of the next column anybody deletes.
 * The guard that WOULD have caught it does not exist and is not worth building:
 * PROJECTED ⊆ READ is false by design for `_id`, and for anything a helper
 * reaches through an import in a shape the scanner cannot see.
 */
export const ADMIN_LIST_FIELDS =
  '_id slug title author tags articleType active featuredOnLanding ' +
  'publishedAt createdAt isPinnedOnArticlePage pinOrder sortKey showPinBadge';

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

/**
 * The projection for the PROGRAM PAGE's related-articles section.
 *
 * ── DERIVED FROM WHAT THE CARD READS, NOT FROM WHAT AN `article.X` SCAN SEES ─
 *
 * The section renders `components/articles/ArticleCard`, so this set is that
 * component's field reads and nothing else. Six of the eight are visible as
 * literal `article.<field>` expressions in its markup:
 *
 *   slug excerpt title coverUrl programs skills
 *
 * THE OTHER TWO ARE THE WHOLE REASON THIS CONSTANT EXISTS. The card does not
 * read them directly — it calls `shouldShowPinBadge(article)`, and the helper
 * reads them:
 *
 *   isPinnedOnArticlePage   showPinBadge
 *
 * A projection built by grepping the card for `article.` therefore misses both,
 * and the failure is silent in a specific way: `getArticles` runs `.lean()` and
 * then a JSON round-trip that DROPS undefined keys, so the omitted field does
 * not arrive as `undefined` — it does not arrive at all. `shouldShowPinBadge`
 * then evaluates `article?.isPinnedOnArticlePage === true` as false for every
 * row and the pin badge disappears from the section with nothing thrown and
 * nothing logged. That is the same gap PUBLIC_LIST_FIELDS is documented as
 * having above, and it is why this constant is a second one rather than a
 * reuse of it — the note there says to add those two fields BEFORE pointing a
 * public list at it, and this list is what that would have produced.
 *
 * `_id` is listed rather than assumed: Mongo returns it by default, but the
 * section uses it as the React key, so it is a field this surface depends on
 * and a reader should not have to know Mongo's default to see that.
 *
 * NOT LISTED, deliberately: `pinOrder` and `sortKey`. They order the result and
 * the sort runs in the database, so nothing renders them.
 */
export const PROGRAM_ARTICLE_CARD_FIELDS =
  '_id slug title excerpt coverUrl programs skills isPinnedOnArticlePage showPinBadge';

/**
 * How many related articles the program page shows.
 *
 * ONE CONSTANT, because ProgramPageClient has TWO route mounts and a cap that
 * disagreed between them would be invisible: both pages would render, just with
 * different numbers of cards, and only someone comparing the two would notice.
 * The same reasoning the class guard in test/fs/programSectionPropsThreading
 * applies to the props applies to their values.
 *
 * SIX is two full rows at the section's `lg:grid-cols-3`, which is itself set
 * by the card's measured chip cap rather than chosen — see the note in
 * components/program/ProgramArticlesSection.
 */
export const PROGRAM_ARTICLE_LIMIT = 6;
