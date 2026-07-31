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

    // PINNED TO THE TOP BLOCK. It sorts the article above the whole normal
    // ordering via the cascade in src/lib/actions/articles.js. The BADGE — the
    // pin glyph drawn on the public card — is `showPinBadge` below, and the two
    // are independent: an article can be pinned with the badge off.
    //
    // ── THE RENAME ADVICE THAT USED TO BE HERE IS NOW WRONG ────────────────
    // This comment said the field "means 'has a manually chosen position'" and
    // should be renamed to something like `hasManualPosition`. That was true
    // while only the pinned block had chosen positions and everything else fell
    // back to `publishedAt`. It is false now: every article carries a `sortKey`
    // and every article's position is chosen, so `hasManualPosition` would be
    // true of all 486 and would name nothing. The field means what it always
    // said — pinned — and the honest short name is `isPinned`. Still NOT renamed
    // here: a rename is a data migration coupled to a deploy and is its own
    // decision. But the target changed, so the note had to.
    isPinnedOnArticlePage: { type: Boolean, default: false },
    // Display order WITHIN the pinned block (lower = first), contiguous 1..M.
    // Kept as the second cascade key on purpose: pin ordering is controlled
    // separately from normal ordering, and folding it into `sortKey` would
    // collapse the two orderings that exist to be separate.
    pinOrder:              { type: Number,  default: 0 },
    // BADGE ONLY — draws the pin glyph on the /articles card. Split out from
    // isPinnedOnArticlePage so an article can be positioned without being
    // branded as pinned. Read it through shouldShowPinBadge() in
    // src/lib/articlePositioning.js, NEVER as a bare truthiness check: existing
    // documents predate this field and read back `undefined` under `.lean()`,
    // which must mean ON. The default below applies to NEW documents only.
    showPinBadge:          { type: Boolean, default: true },

    // ORDERING — every article's own place in the list. Higher = higher on the
    // page. Spaced, never contiguous: see SORT_KEY_GAP in
    // src/lib/articleSortKey.js for why, and for the planners that decide a
    // value. Server-planned only, exactly like `pinOrder`: it is an invariant of
    // the whole collection, not a field of one document, so it is deliberately
    // absent from src/lib/articleFormPayload.js and src/lib/schemas/article.js.
    //
    // NO DEFAULT, deliberately. A default cannot compute max+GAP, and — more
    // importantly — it would be a lie: `getArticles` reads with `.lean()`, which
    // does not apply defaults, and `serialize()` then drops undefined keys, so a
    // default would reach NEW documents only while every pre-existing article
    // read back with the key absent. Leaving it undeclared on old rows makes
    // "has this been backfilled?" an answerable question
    // (scripts/backfill-article-sortkey.mjs) instead of a hidden one.
    //
    // Indexed by ARTICLE_ORDER_INDEX below, in the cascade's own direction.
    sortKey:               { type: Number },

    // Show this article in the Landing page BlogSection
    featuredOnLanding:     { type: Boolean, default: false },

    // Schema.org JSON-LD configuration. `overrides` lets the admin
    // pin specific JSON-LD fields without having to touch raw JSON;
    // `rawOverride` (gated by `rawOverrideEnabled`) lets a superadmin
    // ship a hand-crafted document straight through. `validation*`
    // are scratch fields the admin form writes after a Preview pass.
    jsonLd: {
      enabled:    { type: Boolean, default: true },
      schemaType: {
        type: String,
        enum: ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'],
        default: 'Article',
      },
      overrides: {
        headline:      { type: String, default: '' },
        description:   { type: String, default: '' },
        image:         { type: String, default: '' },
        authorName:    { type: String, default: '' },
        datePublished: { type: String, default: '' },
        dateModified:  { type: String, default: '' },
      },
      rawOverride:        { type: String, default: '' },
      rawOverrideEnabled: { type: Boolean, default: false },
      validationStatus: {
        type: String,
        enum: ['valid', 'warning', 'error', 'disabled', 'unchecked'],
        default: 'unchecked',
      },
      validationMessage: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'articles' }
);

ArticleSchema.index({ publishedAt: -1, active: 1 });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ programs: 1 });
ArticleSchema.index({ featuredOnLanding: 1, publishedAt: -1 });

/**
 * `skills`, multikey — the twin of `{ programs: 1 }` above.
 *
 * Both fields are flat arrays of upstream ids filtered by equality
 * (`filter.skills = <skill_id>` in getArticles), so they want the same index.
 * This one lands ONE COMMIT BEFORE the /articles skill filter that needs it,
 * for the reason ARTICLE_ORDER_INDEX records below: an index has to exist
 * before the query does, or the first request after a deploy pays for its
 * absence.
 *
 * ── MEASURED, NOT ASSUMED ───────────────────────────────────────────────────
 * explain('executionStats') on a SCRATCH COPY of the real 487 documents with
 * the real production indexes — never against production. Two shapes, because
 * one page load runs both: the paged read, and the countDocuments that gives
 * the pager its total. Six skills are in use, spanning 45 down to 2 articles.
 *
 *   THE PAGED READ   find({active:true, skills:X}).sort(ARTICLE_SORT).limit(12)
 *
 *     X (matches)   without { skills: 1 }                       keys/docs
 *     BUSINESS (45) LIMIT<-FETCH<-IXSCAN(order index)              18 / 18
 *     DATA     (41) LIMIT<-FETCH<-IXSCAN(order index)            240 / 240
 *     RPA       (2) LIMIT<-FETCH<-IXSCAN(order index)            487 / 487
 *
 *     X (matches)   with { skills: 1 }                            keys/docs
 *     BUSINESS (45) LIMIT<-FETCH<-IXSCAN(order index)  UNCHANGED   18 / 18
 *     DATA     (41) SORT<-FETCH<-IXSCAN(skills_1)                  41 / 41
 *     RPA       (2) SORT<-FETCH<-IXSCAN(skills_1)                   2 / 2
 *
 *   THE COUNT        find({active:true, skills:X})   (no sort, no limit)
 *
 *     without: COLLSCAN, 487 docs examined — for EVERY skill, every request
 *     with:    FETCH<-IXSCAN(skills_1), 45 / 41 / 2 docs examined
 *
 * ── WHAT THAT ACTUALLY SAYS, INCLUDING THE PART THAT IS NOT A WIN ───────────
 * ON THE MOST COMMON SKILL THE INDEX CHANGES NO PLAN. For BUSINESS the planner
 * still prefers ARTICLE_ORDER_INDEX and examines the same 18 keys; the only
 * difference is that `skills_1` shows up as a rejected plan. That is written
 * down here rather than left to be rediscovered: an index that changes nothing
 * on the fattest bucket is a fact about this data, not a reason to doubt the
 * index or to start reordering the cascade.
 *
 * THE CHOICE IS CARDINALITY-DEPENDENT, and it inverts as the bucket shrinks.
 * The ordering-index plan walks the collection IN SORT ORDER and fetches until
 * it has twelve matches, so its cost scales with how much it must skip past —
 * 487 documents examined to return 2 for RPA, i.e. the whole collection. The
 * `skills_1` plan fetches only the matches and then does a BLOCKING SORT, so
 * its cost scales with the match count. At 487 documents the crossover already
 * favours `skills_1` everywhere except the largest bucket.
 *
 * THE BLOCKING SORT IS THE TRADE, and it is acceptable HERE and not
 * unconditionally: it sorts at most one skill's worth of documents (45 today),
 * nowhere near the 32 MB limit that turns a blocking sort into an outage. If a
 * single skill ever holds a substantial fraction of the collection, revisit —
 * the fix would be a compound { skills: 1, ...ARTICLE_SORT } index, which is
 * not built now because it would be four indexes' worth of write cost for a
 * problem this data does not have.
 *
 * THE UNAMBIGUOUS WIN IS THE COUNT. Without this index every skill-filtered
 * page load COLLSCANs all 487 documents just to compute `total`, and that cost
 * grows with the collection rather than with the filter. `{ programs: 1 }`
 * already spares the program filter exactly this; the skill filter was about to
 * ship without it.
 *
 * NO REGRESSION: the unfiltered read (`{active:true}` sorted and limited) plans
 * identically with and without — 12 keys, 12 documents — so the index costs
 * writes and nothing else on the common path.
 */
ArticleSchema.index({ skills: 1 });

/**
 * The ordering cascade's index — DIRECTION IS THE WHOLE POINT.
 *
 * An index serves a sort only in ITS OWN DIRECTION or its EXACT REVERSE. The
 * cascade (src/lib/actions/articles.js → getArticles) is
 *
 *     { isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 }
 *
 * so the index has to be that same triple, or its exact reverse {1, -1, 1}.
 * Anything else — including the plausible-looking {1, 1, -1}, which reverses to
 * {-1, -1, 1} — matches neither, and Mongo silently falls back to a COLLSCAN
 * plus a blocking in-memory SORT. Nothing errors; the page just gets slower as
 * the collection grows, until the 32 MB sort limit turns it into an outage.
 *
 * MEASURED, NOT ASSUMED, against a copy of the real 486 documents:
 *
 *   no sortKey index          PROJECTION_SIMPLE <- SORT <- COLLSCAN     (blocking)
 *   {  1,  1, -1 }            PROJECTION_SIMPLE <- SORT <- COLLSCAN     (blocking)
 *   { -1,  1, -1 }  ← this    LIMIT <- PROJECTION_SIMPLE <- FETCH <- IXSCAN
 *   {  1, -1,  1 }            LIMIT <- PROJECTION_SIMPLE <- FETCH <- IXSCAN
 *
 * The pre-existing {isPinnedOnArticlePage: 1, pinOrder: 1} below has exactly
 * this defect against the OLD cascade — verified: sorting {-1, 1} plans a
 * blocking SORT while {1, 1} and {-1, -1} both plan an IXSCAN. It is KEPT, not
 * replaced: it still serves the equality-filtered block read
 * (`find({isPinnedOnArticlePage: true}).sort({pinOrder: 1})` → IXSCAN, 5 keys,
 * 5 documents examined), which is the shape every pinned-block planner wants.
 * Dropping an index is a separate decision from adding one.
 */
export const ARTICLE_ORDER_INDEX = Object.freeze({
  isPinnedOnArticlePage: -1,
  pinOrder: 1,
  sortKey: -1,
});
// Spread rather than passed by reference: Mongoose keeps what it is handed, and
// a frozen object shared with the rest of the app is not something to hand it.
ArticleSchema.index({ ...ARTICLE_ORDER_INDEX });

ArticleSchema.index({ isPinnedOnArticlePage: 1, pinOrder: 1 });


export default mongoose.models.Article || mongoose.model('Article', ArticleSchema);