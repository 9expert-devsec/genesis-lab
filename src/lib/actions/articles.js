'use server';

/**
 * Server actions for the Article collection.
 *
 * Articles are Genesis-owned (no MSDB sync). Reads are public; writes
 * require an authenticated admin session.
 */

import mongoose from 'mongoose';
import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import { articleSchema } from '@/lib/schemas/article';
import { parseArticleFormData } from '@/lib/articleFormPayload';
import { toSelectString } from '@/lib/articleListFields';
import {
  describePinCapacity,
  planBadgeToggle,
  planDemotion,
  planPromotion,
} from '@/lib/articlePositioning';
import { planMoveToBlockTop, planMoveToRank, planOrderStep } from '@/lib/articleOrdering';
import { ARTICLE_SORT } from '@/lib/articleRank';
import { nextSortKeyForNew } from '@/lib/articleSortKey';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { requireAdmin } from '@/lib/actions/auth';

const ADMIN_PATH  = '/admin/articles';
const PUBLIC_PATH = '/articles';

/**
 * ── THE AUDIT SHAPE FOR THIS FILE — SWEEP ROUND 4 ───────────────────────────
 *
 * `articles` is the only menu where ONE HUMAN ACTION WRITES MANY ROWS, which is
 * why it got a round of its own. A step between two articles whose keys are one
 * apart rebalances a span; pinning renumbers the block behind it; unpinning
 * renumbers what is left. Every one of those is ONE audit row, because one
 * person did one thing.
 *
 *   recordId     the article the human acted on — its Mongo `_id`, always.
 *   entity       'article', always. There is no ordering entity: the record that
 *                changed IS an article, and a second entity would fragment
 *                "everything that happened to this article" across two series
 *                that no screen joins. The verb lives in `action`.
 *   action       one of ARTICLE_ACTIONS below.
 *   meta         `alsoTouched` — the COUNT of other articles the plan wrote,
 *                never their ids. This is the setPromotionPageLink rule (§8.7
 *                ruling (h)) and the reorder rule: collateral is counted, not
 *                enumerated. A rebalance touching 80 rows must not produce 80
 *                audit rows, and must not produce one row carrying 80 ids
 *                either — that is the same list wearing a different hat, and it
 *                is what the writer's 2 KB cap would truncate into uselessness.
 *                `kind` rides alongside so a rebalance stays distinguishable
 *                from an ordinary step after the fact.
 *
 * WHAT `before`/`after` HOLD, and what they must never hold: `articleFields`.
 * The whole document is a median of 4.4 KB and a maximum of 51 KB (measured
 * over the real 486), because it carries the rendered HTML body. The writer's
 * per-field ceiling is 2 KB, so logging the document would store a truncation
 * marker and nothing else — the audit equivalent of writing "…" in the log.
 */
const ARTICLE_ACTIONS = Object.freeze([
  'create', 'update', 'delete',
  'activate', 'deactivate',
  'feature-on-landing', 'unfeature-on-landing',
  'reposition', 'move-top', 'move-to-rank',
  'pin', 'unpin',
  'badge-on', 'badge-off',
]);

/**
 * The audited snapshot of an article. NEVER the whole document.
 *
 * `content` is excluded and its LENGTH recorded instead: the body is what makes
 * an article document big, and "the body changed, from 5,231 characters to
 * 5,980" is the fact a reader of the log actually wants — the diff itself
 * belongs to the page-version history, not here.
 *
 * MEASURED over all 486 production articles: median 947 characters, p95 1,304,
 * max 2,165 — so exactly ONE article in 486 exceeds the writer's 2 KB per-field
 * cap and degrades to its truncation marker. That is the marker doing its job
 * rather than a reason to trim the set further; dropping `excerpt` was tried and
 * moved the median by four characters, because the size is carried by the tag /
 * program / skill arrays, not by any one string.
 */
function articleFields(doc) {
  if (!doc) return null;
  return serialize({
    slug:              doc.slug,
    title:             doc.title,
    excerpt:           doc.excerpt,
    author:            doc.author,
    articleType:       doc.articleType,
    active:            doc.active,
    publishedAt:       doc.publishedAt,
    tags:              doc.tags,
    programs:          doc.programs,
    skills:            doc.skills,
    featuredOnLanding: doc.featuredOnLanding,
    showPinBadge:      doc.showPinBadge,
    coverUrl:          doc.coverUrl,
    seoTitle:          doc.seoTitle,
    seoDescription:    doc.seoDescription,
    focusKeyword:      doc.focusKeyword,
    relatedArticles:   (doc.relatedArticles ?? []).length,
    relatedCourses:    (doc.relatedCourses ?? []).length,
    contentChars:      String(doc.content ?? '').length,
  });
}

/**
 * The ordering fields of one row, as they stand right now.
 *
 * Read off the block context the action ALREADY fetched to plan with — no extra
 * query, and by construction the same snapshot the planner reasoned about.
 */
function orderingFields(article) {
  if (!article) return null;
  return {
    isPinnedOnArticlePage: article.isPinnedOnArticlePage === true,
    pinOrder: Number(article.pinOrder) || 0,
    sortKey: article.sortKey ?? null,
  };
}

/**
 * What the PLAN assigned to this article — read out of the plan, never recomputed.
 *
 * RULING 2, unchanged from round 3: two computations of the same value can
 * disagree, and when they do the log is wrong with no symptom anywhere. The
 * planner already decided the number; the audit call's only job is to copy it.
 * Calling `nextSortKeyForNew` (or any planner) a second time inside the audit
 * call would be a second computation by definition.
 */
function plannedFields(plan, id) {
  const write = (plan?.writes ?? []).find((w) => String(w._id) === String(id));
  if (!write) return null;
  const { _id, ...fields } = write;
  return fields;
}

/**
 * The meta every ordering action carries.
 *
 * `alsoTouched` is a COUNT. The ids are deliberately absent — see the note at
 * the top of this file.
 */
function orderingMeta(plan, id) {
  const writes = plan?.writes ?? [];
  return {
    kind: plan?.kind ?? null,
    tier: plan?.tier ?? null,
    alsoTouched: writes.filter((w) => String(w._id) !== String(id)).length,
  };
}

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function bustCaches(slug) {
  revalidateTag('articles');
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  if (slug) revalidatePath(`${PUBLIC_PATH}/${slug}`);
}

function firstZodMessage(error) {
  const issue = error?.issues?.[0] ?? error?.errors?.[0];
  if (!issue) return 'รูปแบบข้อมูลไม่ถูกต้อง';
  const path = issue.path?.join('.') || 'field';
  return `${path}: ${issue.message}`;
}

// ── reads ────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string|string[]} [opts.select] Optional Mongo projection. OMITTED BY
 *   DEFAULT so every existing caller keeps the whole-document behaviour it was
 *   written against — this reader is shared by /admin/articles and /articles,
 *   and the two need different field sets (see src/lib/articleListFields.js).
 *   Hardcoding one here would silently starve the other of a field it renders,
 *   which fails as a blank cell rather than as an error.
 */
export async function getArticles({
  page = 1,
  limit = 20,
  search = '',
  tag = '',
  program = '',
  skill = '',
  articleType = '', // 'article' | 'video' | '' (all)
  active,
  select = '',
} = {}) {
  await dbConnect();

  const filter = {};
  if (typeof active === 'boolean') filter.active = active;
  if (tag)         filter.tags        = String(tag);
  if (program)     filter.programs    = String(program);
  // Exactly the `program` shape: a flat array of upstream ids, equality-matched,
  // served by a multikey index (`{ skills: 1 }` in src/models/Article.js, added
  // in the commit before this one — the measurement lives beside it).
  if (skill)       filter.skills      = String(skill);
  if (articleType) filter.articleType = String(articleType);
  if (search) {
    filter.$or = [
      { title:   { $regex: search, $options: 'i' } },
      { excerpt: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;

  // Projection is applied to the DOCUMENT read only. `countDocuments` runs
  // against the same `filter` and is deliberately untouched: `total` must
  // describe the whole matching set, which is the number the admin banner
  // compares its row count against.
  // THE CASCADE IS IMPORTED, NOT SPELLED OUT. It used to be a literal here and a
  // hand-written copy in src/lib/articleRank.js, with nothing forcing the two to
  // agree — that file's own doc block said so. One object now, in the pure
  // module, so the reader, the JS comparator and ARTICLE_ORDER_INDEX in
  // src/models/Article.js all point at the same three keys IN THE SAME
  // DIRECTIONS. Direction is not cosmetic: an index serves a sort only in its
  // own direction or its exact reverse, so flipping a sign here without flipping
  // the index drops this query to a COLLSCAN plus a blocking in-memory sort,
  // silently.
  const query = Article.find(filter)
    .sort(ARTICLE_SORT)
    .skip(skip)
    .limit(limit);

  const projection = toSelectString(select);
  if (projection) query.select(projection);

  const [docs, total] = await Promise.all([
    query.lean(),
    Article.countDocuments(filter),
  ]);

  return {
    items: serialize(docs),
    total,
    page,
    limit,
  };
}

/**
 * The skill ids that PUBLICLY VISIBLE articles actually carry.
 *
 * ── WHY DISTINCT-OVER-ARTICLES AND NOT THE UPSTREAM SKILL LIST ──────────────
 * `/articles` already fetches every skill from upstream to resolve the chips on
 * each card, so building the filter's dropdown from that list is the shorter
 * code. It is also the wrong list: upstream holds skills nothing has been
 * written about yet, and every one of those becomes an option whose only
 * possible outcome is `ไม่พบบทความที่ตรงกับเงื่อนไข`. A control that can only
 * disappoint is worse than a shorter list — the admin-list truncation banner is
 * the same lesson from the other direction, where a surface that could not
 * reach part of its collection said nothing about it.
 *
 * SCOPED TO `active: true`, matching what the page renders. The public list
 * filters on it, so a skill carried only by inactive articles would be offered
 * and return nothing — the same defect one step smaller.
 *
 * Returns IDS, not names. Resolution happens on the page, through the
 * `skillNames` map it already builds, so there is one resolver and one
 * drop-what-you-cannot-name rule rather than two.
 */
export async function listUsedArticleSkillIds() {
  await dbConnect();
  const ids = await Article.distinct('skills', { active: true });
  return ids.map((s) => String(s)).filter(Boolean);
}

export async function getArticleById(id) {
  if (!id) return null;
  await dbConnect();
  const doc = await Article.findById(id).lean();
  return serialize(doc);
}

export async function getArticleBySlug(slug) {
  if (!slug) return null;
  await dbConnect();
  // Slugs may contain Thai characters; Next.js sometimes hands us the
  // raw `[slug]` param URL-encoded, sometimes already decoded. Try the
  // decoded form first — if it was already plain, decodeURIComponent
  // is a no-op; if it was encoded, this is what matches the stored slug.
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await Article.findOne({
    slug: key,
    active: true,
  }).lean();
  return serialize(doc);
}

/**
 * Fetch articles by ObjectId list — used by the public detail page to
 * resolve the `relatedArticles` references without a roundtrip per item.
 */
export async function getArticlesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  await dbConnect();
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  if (valid.length === 0) return [];
  const docs = await Article.find({ _id: { $in: valid }, active: true })
    .select('_id slug title excerpt coverUrl publishedAt tags articleType')
    .lean();
  // Preserve the order supplied by the caller.
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return serialize(valid.map((id) => byId.get(String(id))).filter(Boolean));
}

/**
 * Autocomplete for the "Related articles" picker in the admin form.
 * Returns a minimal projection — id, title, slug — capped at 20 hits.
 */
export async function searchArticles(q) {
  const query = String(q ?? '').trim();
  if (query.length < 2) return [];
  await dbConnect();
  const docs = await Article.find({
    title: { $regex: query, $options: 'i' },
  })
    .select('_id title slug')
    .limit(20)
    .lean();
  return serialize(docs);
}

// ── mutations ────────────────────────────────────────────────────

function buildModelData(data) {
  // ObjectId-cast relatedArticles so Mongo accepts them; silently
  // drop anything that isn't a valid 24-char id.
  const relatedArticles = (data.relatedArticles || [])
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const out = {
    ...data,
    relatedArticles,
  };

  // Empty datetime → null on the doc so the index sort behaves and
  // the admin UI can show "Draft" cleanly.
  if (data.publishedAt) {
    out.publishedAt = new Date(data.publishedAt);
  } else {
    out.publishedAt = null;
  }
  return out;
}

/**
 * Every article's `sortKey`, and nothing else — the context the planner needs to
 * pick the next one.
 *
 * A FRESH READ at call time, never a value from the caller, for the same reason
 * `readBlockContext` exists: the key is a property of the whole collection, so a
 * number decided anywhere but here is decided against a snapshot. Cost is one
 * read of ~486 documents projected to a single number. It is unsorted, so
 * ARTICLE_ORDER_INDEX does not serve it and this is a collection scan — of two
 * fields, once per article created, which is not worth an index of its own.
 */
async function readSortKeyContext() {
  const docs = await Article.find({}, '_id sortKey').lean();
  return serialize(docs);
}

export async function createArticle(formData) {
  const session = await requireAdmin('articles');
  await dbConnect();

  const raw = parseArticleFormData(formData);
  const parsed = articleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  // A new article goes to the TOP — max + GAP, regardless of `publishedAt`.
  // Backdating the publish date must not bury a new article: "I wrote it and I
  // can't find it" is the worst outcome this ordering can produce, and dragging
  // it down afterwards is one action away.
  //
  // This lands in round 1 rather than with the cascade in round 2 on purpose:
  // any article created between the two deploys would otherwise carry no
  // sortKey at all when the cascade starts reading it. `Article.create` DOES
  // apply schema defaults (unlike the `.lean()` reads), but a default cannot
  // compute max+GAP, so this is an explicit assignment. It sits AFTER the
  // spread so the form payload can never supply it — and it cannot anyway,
  // since articleSchema does not declare it and zod strips what it does not
  // declare.
  const sortKey = nextSortKeyForNew(await readSortKeyContext());

  try {
    const doc = await Article.create({ ...buildModelData(parsed.data), sortKey });
    bustCaches(doc.slug);

    // `recordId` is the id the create RETURNED — the same string this action
    // hands back to the caller, so the row and the client agree on which
    // article was made. `sortKey` is read off the document rather than off the
    // local: the local is what we asked for, the document is what was stored.
    recordAdminActionAfter({
      menu:        'articles',
      action:      'create',
      entity:      'article',
      recordId:    String(doc._id),
      recordLabel: doc.title ?? '',
      after:       articleFields(doc),
      meta:        { sortKey: doc.sortKey ?? null },
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, slug: doc.slug, id: String(doc._id) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateArticle(id, formData) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();

  const raw = parseArticleFormData(formData);
  const parsed = articleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  try {
    const data = buildModelData(parsed.data);

    // `new: false` — the PRE-IMAGE, so `before` costs no extra query. The house
    // pattern from round 2, and safe here because nothing consumed the returned
    // document except its slug, which is `data.slug` and therefore already known.
    // (ArticleForm ignores the returned slug entirely; it pushes to the list.)
    const previous = await Article.findByIdAndUpdate(
      id,
      { $set: data },
      { new: false, runValidators: true }
    );
    if (!previous) return { ok: false, error: 'ไม่พบบทความ' };

    // BOTH slugs, which the `new: true` form could not do. A rename left the OLD
    // public path cached under its own key — that path still resolves until it
    // expires, serving an article that has moved. Not a drive-by: reading the
    // pre-image is what made the old slug available to bust in the first place.
    bustCaches(data.slug);
    if (previous.slug && previous.slug !== data.slug) revalidatePath(`${PUBLIC_PATH}/${previous.slug}`);

    recordAdminActionAfter({
      menu:        'articles',
      action:      'update',
      entity:      'article',
      recordId:    String(previous._id),
      recordLabel: data.title ?? previous.title ?? '',
      before:      articleFields(previous),
      // The payload the update APPLIED, not a re-read. `articleFields` reads the
      // same keys off either shape, so before/after stay comparable.
      after:       articleFields(data),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, slug: data.slug };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deleteArticle(id) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();

  // NO EXTRA READ, unlike deleteCourse. That one needs an uncached fetch because
  // the record lives upstream in MSDB and is gone the moment the delete lands;
  // an article lives in Mongo, and `findByIdAndDelete` RETURNS the document it
  // removed. So `before` and the label are already in hand — the delete is the
  // read.
  const doc = await Article.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบบทความ' };
  bustCaches(doc.slug);

  recordAdminActionAfter({
    menu:        'articles',
    action:      'delete',
    entity:      'article',
    recordId:    String(doc._id),
    // The title, for the same reason `courses` logs one: an ObjectId identifies
    // nothing to a reader, and once the article is gone the label is the only
    // thing left that says what was deleted.
    recordLabel: doc.title ?? '',
    before:      articleFields(doc),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

export async function toggleArticleActive(id, active) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();
  const next = Boolean(active);
  // `new: false` for the PREVIOUS value. Deriving `before` as `!next` would be a
  // guess: re-sending the state it already holds is a no-op the log would record
  // as a change.
  const doc = await Article.findByIdAndUpdate(
    id,
    { $set: { active: next } },
    { new: false }
  );
  if (!doc) return { ok: false, error: 'ไม่พบบทความ' };
  bustCaches(doc.slug);

  recordAdminActionAfter({
    menu:        'articles',
    action:      next ? 'activate' : 'deactivate',
    entity:      'article',
    recordId:    String(doc._id),
    recordLabel: doc.title ?? '',
    before:      { active: doc.active === true },
    after:       { active: next },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// RETIRED: toggleArticlePinnedOnArticlePage.
// It wrote `isPinnedOnArticlePage` and left `pinOrder` STALE, which is the only
// remaining path that could produce b-006 — an unpinned article carrying a
// non-zero pinOrder, which sinks below every pinOrder:0 row and lands dead last
// (see the invariant note in src/lib/articlePositioning.js). It had no callers.
// Pinning and unpinning go through setArticlePinned(), which maintains both
// fields together — planPromotion appends, planDemotion zeroes AND renumbers.

export async function toggleArticleFeaturedOnLanding(id, value) {
  const session = await requireAdmin('articles');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  const next = Boolean(value);
  // `findByIdAndUpdate` already defaults to `new: false`, so the previous
  // document was always being returned here and discarded. Capturing it costs
  // nothing and changes no behaviour — including the pre-existing absence of a
  // not-found check, which stays as it is rather than being tightened inside an
  // audit commit.
  const doc = await Article.findByIdAndUpdate(id, { $set: { featuredOnLanding: next } });
  revalidatePath(ADMIN_PATH);
  revalidatePath('/');

  recordAdminActionAfter({
    menu:        'articles',
    action:      next ? 'feature-on-landing' : 'unfeature-on-landing',
    entity:      'article',
    recordId:    String(id),
    recordLabel: doc?.title ?? '',
    before:      { featuredOnLanding: doc?.featuredOnLanding === true },
    after:       { featuredOnLanding: next },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── positioning ──────────────────────────────────────────────────
//
// ── THE INVARIANT: EXACTLY ONE THING DECIDES A pinOrder ─────────────────────
// That thing is a planner in src/lib/articlePositioning.js, and it is called
// HERE, on the server, from a FRESH read of the block. Nothing below accepts a
// pinOrder — or a plan — from the browser.
//
// This used to work the other way. `applyArticlePositionPlan` was an exported
// server action taking `{writes:[{_id, pinOrder}]}` straight from the client,
// and the admin list computed its own plans and POSTed them. Two problems, and
// the second is the one that mattered:
//
//   1. It is a free `pinOrder` write with extra steps. If the browser can send
//      the numbers, the browser decides them, and the planner is a convention
//      rather than a guarantee — which is exactly the state that produced
//      b-005's `1,1,2,3,4,5,6,7,9,10`.
//   2. The client's list is a PAGE-LOAD SNAPSHOT. A move renumbers the entire
//      block, so a plan computed in a tab left open since this morning writes a
//      block-wide renumbering derived from data that has since changed. That is
//      the lost-update hazard src/lib/articleFormPayload.js already refuses to
//      accept for a single field — and here it spans every row in the block.
//
// So `applyPlan` is no longer exported: in a `'use server'` module an export IS
// a POST endpoint, and un-exporting it is what makes the guarantee structural
// rather than a matter of who calls what. Each exported action below re-reads
// the block, runs a planner, applies it, and RETURNS the plan so the client can
// replay it locally for an optimistic update — one piece of arithmetic, computed
// once, on the authoritative data.
//
// Cost: one extra read per click of ~483 documents projected to five positioning
// fields. That is nothing next to a corrupted block.

/**
 * The fields every planner needs, and nothing else.
 *
 * `sortKey` joined this in the same commit the step planner started reading it.
 * A projection failure here is SILENT in the worst possible way for ordering
 * code: the field reads back `undefined`, every row ties on "no key", and
 * `planOrderStep` would compute midpoints between neighbours it picked out of a
 * collapsed order — writing plausible numbers that move the wrong rows.
 */
const POSITION_FIELDS = '_id title isPinnedOnArticlePage pinOrder sortKey showPinBadge publishedAt createdAt active';

// `title` is the ONE field here no planner reads. It is the audit label: a row
// saying "moved 68f3…a01 up one place" identifies nothing to a human, and the
// four ordering actions have no other document in hand. The alternative was a
// second query per click purely to fetch one string, on a read that already
// returns every article. ~29 KB more on a server-side read that never reaches
// the browser.

/** The whole collection, projected for planning. */
async function readBlockContext() {
  const docs = await Article.find({}, POSITION_FIELDS).lean();
  return serialize(docs);
}

/**
 * Apply a positioning plan. NOT EXPORTED — see the note above.
 *
 * ONE bulkWrite rather than a call per document: a move or a demotion renumbers
 * several rows, and a per-document loop that fails halfway leaves the block with
 * a hole or a duplicate — exactly the state the renumbering exists to prevent.
 *
 * Only the four ordering fields are writable through here. `pinOrder` and
 * `sortKey` are gated on `Number.isFinite`, so a planned `0` writes and an
 * ABSENT key leaves the stored value alone — which is why a planner that drops a
 * row it meant to renumber fails silently rather than loudly, and why
 * test/pure/articlePositioning.test.mjs checks that no row goes missing.
 *
 * `sortKey` is read off `w` exactly as `pinOrder` is, so both numbers can only
 * ever come from a plan. test/fs/articleSortKeyWrites.test.mjs pins that.
 */
async function applyPlan(plan) {
  const writes = Array.isArray(plan?.writes) ? plan.writes : [];
  if (writes.length === 0) return { ok: true, modified: 0, plan };
  await dbConnect();

  const ops = [];
  for (const w of writes) {
    if (!mongoose.isValidObjectId(w?._id)) continue;
    const $set = {};
    if (typeof w.isPinnedOnArticlePage === 'boolean') $set.isPinnedOnArticlePage = w.isPinnedOnArticlePage;
    if (typeof w.showPinBadge === 'boolean') $set.showPinBadge = w.showPinBadge;
    if (Number.isFinite(Number(w.pinOrder))) $set.pinOrder = Number(w.pinOrder);
    if (Number.isFinite(Number(w.sortKey))) $set.sortKey = Number(w.sortKey);
    if (Object.keys($set).length === 0) continue;
    ops.push({ updateOne: { filter: { _id: w._id }, update: { $set } } });
  }
  if (ops.length === 0) return { ok: true, modified: 0, plan };

  const res = await Article.bulkWrite(ops);
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true, modified: res?.modifiedCount ?? ops.length, plan };
}

/**
 * Move an article ONE PLACE up or down the list.
 *
 * ── THE NEIGHBOUR IS FOUND HERE, FROM A FRESH READ ──────────────────────────
 * Not passed in, not derived from what the browser is showing. The admin list
 * has a client-side pager and a search box, so the row visually above another is
 * frequently not its neighbour in the collection — and a caller that could name
 * the neighbour could name the wrong one, from a page-load snapshot, exactly as
 * `applyArticlePositionPlan` used to let it name the numbers.
 *
 * `planOrderStep` decides which FIELD expresses the move: `sortKey` between two
 * unpinned rows, `pinOrder` between two pinned ones. A step across the pin
 * boundary is refused with a reason rather than half-done — see
 * src/lib/articleOrdering.js.
 */
export async function moveArticleOneStep(id, direction) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  if (direction !== 'up' && direction !== 'down') {
    return { ok: false, error: `Unknown direction: ${direction}` };
  }
  await dbConnect();
  const articles = await readBlockContext();

  try {
    const plan = planOrderStep(articles, id, direction);
    // A REFUSED step writes nothing and is not a thing that happened. No row —
    // the trail answers "who changed this", and nothing changed.
    if (plan.kind === 'noop') return { ok: false, error: stepRefusalMessage(plan.reason), plan };

    const subject = articles.find((a) => String(a._id) === String(id));
    const res = await applyPlan(plan);

    // ONE ROW. A rebalance rewrites a whole span of neighbours and this is still
    // one row, because one person pressed one arrow — `meta.alsoTouched` carries
    // the count and `meta.kind` says whether it was a rebalance.
    recordAdminActionAfter({
      menu:        'articles',
      action:      'reposition',
      entity:      'article',
      recordId:    String(id),
      recordLabel: subject?.title ?? '',
      before:      orderingFields(subject),
      after:       plannedFields(plan, id),
      meta:        { ...orderingMeta(plan, id), direction },
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return res;
  } catch (err) {
    if (err?.name === 'NotInListError') return { ok: false, error: 'ไม่พบบทความนี้ในรายการ' };
    throw err;
  }
}

/**
 * Move an article to the top of ITS OWN block.
 *
 * A pinned article goes to `pinOrder` 1. An unpinned one goes to `max + GAP`,
 * i.e. the top of the NORMAL ordering — which is below the pinned block, not the
 * top of the page. The UI copy says so.
 */
export async function moveArticleToBlockTop(id) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const articles = await readBlockContext();

  try {
    const plan = planMoveToBlockTop(articles, id);
    if (plan.writes.length === 0) return { ok: false, error: stepRefusalMessage(plan.reason), plan };

    const subject = articles.find((a) => String(a._id) === String(id));
    const res = await applyPlan(plan);

    recordAdminActionAfter({
      menu:        'articles',
      action:      'move-top',
      entity:      'article',
      recordId:    String(id),
      recordLabel: subject?.title ?? '',
      before:      orderingFields(subject),
      after:       plannedFields(plan, id),
      meta:        orderingMeta(plan, id),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return res;
  } catch (err) {
    if (err?.name === 'NotInListError') return { ok: false, error: 'ไม่พบบทความนี้ในรายการ' };
    throw err;
  }
}

/**
 * Move an article to the RANK an admin typed.
 *
 * Same shape as `moveArticleOneStep`: guard, fresh read, plan, apply, return the
 * plan so the client can replay it. The `rank` argument is the only thing that
 * arrives from the browser and it never reaches the database — it is resolved
 * against THIS read, by a planner, into writes the planner decided.
 *
 * ── WHY A NUMBER FROM THE CLIENT IS SAFE HERE AND WAS NOT BEFORE ────────────
 * The retired `updateArticlePinOrder` took a number and WROTE it. This takes a
 * number and LOOKS IT UP: `planMoveToRank` resolves the rank to the row that
 * currently holds it in a collection this function just read, then hands that
 * row's position to `planMoveToPosition` or `planSortKeyMove`. Nothing the
 * browser sends becomes a stored value, an out-of-range number is refused
 * rather than clamped, and a target on the far side of the pinned block is
 * refused rather than half-applied.
 *
 * The refusal SENTENCE comes out of the plan, which got it from
 * `describeRankTarget` — the same function the input renders its warning from.
 * One source, so the control cannot offer what this rejects.
 */
export async function moveArticleToRank(id, rank) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const articles = await readBlockContext();

  try {
    const plan = planMoveToRank(articles, id, rank);
    // A REFUSED move writes nothing and is not a thing that happened, so no
    // audit row — the trail answers "who changed this", and nothing changed.
    if (plan.reason) return { ok: false, error: plan.message, plan };

    const subject = articles.find((a) => String(a._id) === String(id));
    const targetRank = plan.target ?? null;
    const res = await applyPlan(plan);

    // ONE ROW, like every other ordering action: a typed rank can rebalance a
    // span of eighty neighbours and that is still one person doing one thing.
    // `targetRank` rides alongside because it is the only part of this action a
    // human chose — the writes are arithmetic, the number was a decision.
    recordAdminActionAfter({
      menu:        'articles',
      action:      'move-to-rank',
      entity:      'article',
      recordId:    String(id),
      recordLabel: subject?.title ?? '',
      before:      orderingFields(subject),
      after:       plannedFields(plan, id),
      meta:        { ...orderingMeta(plan, id), targetRank },
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return res;
  } catch (err) {
    if (err?.name === 'NotInListError') return { ok: false, error: 'ไม่พบบทความนี้ในรายการ' };
    throw err;
  }
}

/**
 * Pin an article to the top block, or release it.
 *
 * ── A DEDICATED ACTION, NOT A FORM FIELD ────────────────────────────────────
 * `isPinnedOnArticlePage` is cross-row state: pinning appends to the block and
 * unpinning renumbers what is left, so neither can be decided from one document.
 * It is therefore absent from `articleSchema` — and since zod runs in default
 * STRIP mode, a checkbox for it in the form would be dropped silently between
 * parse and `$set`: a green save that changes nothing. This action re-reads the
 * block and plans server-side instead, the same shape as every other ordering
 * action here.
 *
 * ── UNPINNING RENUMBERS, AND THAT IS NOT TIDINESS ───────────────────────────
 * `planDemotion` writes `pinOrder: 0` on the released row AND re-emits the
 * survivors as contiguous 1..M. Leaving the released row holding a non-zero
 * `pinOrder` is b-006 exactly — `pinOrder` is the second cascade key and applies
 * to every document, so that row would sink below all ~480 rows holding 0 and
 * land dead last regardless of its date or its `sortKey`. It was found in
 * production once and repaired; this is the path that would recreate it.
 * Leaving a HOLE in the survivors' numbering is b-005's other half: the next
 * pin computes max+1 from an inflated maximum and the numbers drift upward
 * forever.
 */
export async function setArticlePinned(id, pinned) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const articles = await readBlockContext();

  const plan = pinned ? planPromotion(articles, id) : planDemotion(articles, id);

  // THE CAP REFUSES HERE, not only in the form. This is an exported function in
  // a `'use server'` module, i.e. a POST endpoint: a disabled toggle is a hint
  // to whoever is looking at the screen and nothing at all to anything else —
  // a stale tab whose block filled up while it sat open, a second admin, a
  // replayed request. `plan.message` is the sentence the PLANNER produced from
  // the same descriptor the form disabled itself with, returned verbatim rather
  // than recomputed, so the button and the endpoint cannot describe different
  // situations.
  //
  // NO AUDIT ROW. A refused pin writes nothing and is not a thing that happened
  // — the same rule moveArticleOneStep and moveArticleToRank already follow. The
  // trail answers "who changed this", and nothing changed.
  //
  // Only a PIN can be refused. planDemotion has no capacity check and must not
  // grow one: unpinning is how an over-cap block drains.
  if (plan.reason) return { ok: false, error: plan.message, plan };

  const subject = articles.find((a) => String(a._id) === String(id));
  const res = await applyPlan(plan);

  // ONE ROW for an unpin, even though planDemotion renumbers every survivor
  // behind the released article. Those survivors did not have anything done TO
  // them by a human — they are the arithmetic of the thing that was done — so
  // they are `meta.alsoTouched`, a number.
  recordAdminActionAfter({
    menu:        'articles',
    action:      pinned ? 'pin' : 'unpin',
    entity:      'article',
    recordId:    String(id),
    recordLabel: subject?.title ?? '',
    before:      orderingFields(subject),
    after:       plannedFields(plan, id),
    meta:        orderingMeta(plan, id),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return res;
}

/**
 * How full the pinned block is, and whether `id` may join it. READ-ONLY.
 *
 * ── WHY THIS IS AN ACTION AND NOT SOMETHING THE FORM WORKS OUT ──────────────
 * The edit screen holds ONE document. "Is the block full" is a property of the
 * whole collection, so the form cannot know it and must not guess: a client
 * that counted anything would be counting rows it does not have.
 *
 * It reuses `readBlockContext()` rather than adding a targeted count, so the
 * capacity is computed from the same projection and the same pure descriptor
 * every ordering action already uses. A `countDocuments` would be cheaper and
 * would be a SECOND way of answering one question — which is how the two halves
 * of a number start disagreeing. The cost is one projected read of the
 * collection when an admin opens an edit screen; the arrows on the list do the
 * same read on every click.
 *
 * NOT MUTATING and therefore carries no audit row: nothing happened.
 */
export async function getPinCapacity(id) {
  await requireAdmin('articles');
  await dbConnect();
  const articles = await readBlockContext();
  return describePinCapacity(articles, id);
}

/** Why a refused step was refused, in the admin's language. */
function stepRefusalMessage(reason) {
  if (reason === 'pin-boundary') {
    return 'ติดขอบบล็อกปักหมุด — ใช้ปุ่มปักหมุดที่หน้าแก้ไขบทความแทน';
  }
  if (reason === 'stray-pin-order') {
    return 'บทความนี้มีลำดับปักหมุดค้างอยู่ทั้งที่ไม่ได้ปักหมุด — รัน normalize:positions ก่อน';
  }
  if (reason === 'already-top') return 'อยู่บนสุดของกลุ่มนี้แล้ว';
  return 'อยู่สุดขอบรายการแล้ว';
}

/**
 * Turn the pin BADGE on or off. Positioning is untouched — see the note on
 * shouldShowPinBadge in src/lib/articlePositioning.js for why these are two
 * different concerns wearing one name historically.
 */
export async function setArticlePinBadge(id, show) {
  const session = await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();

  const next = Boolean(show);
  const plan = planBadgeToggle(id, next);
  const res = await applyPlan(plan);

  // `badge-on` / `badge-off` rather than `update`, and NOT one of the ordering
  // verbs: the badge is a per-document property with no cross-row consequence
  // at all, so it writes exactly one row and carries no `alsoTouched`. Keeping
  // it out of the ordering vocabulary is the same boundary the UI draws.
  //
  // No `before`: this action reads nothing, and inventing `!next` would record a
  // change that may not have happened when the switch was already in that state.
  recordAdminActionAfter({
    menu:        'articles',
    action:      next ? 'badge-on' : 'badge-off',
    entity:      'article',
    recordId:    String(id),
    after:       plannedFields(plan, id),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return res;
}

// RETIRED: updateArticlePinOrder.
// It wrote a free integer to a single row with no view of the block, so
// duplicates and gaps (b-005: production held 1,1,2,3,4,5,6,7,9,10) were a
// normal thing to type. Ordering now goes through moveArticleOneStep().
//
// RETIRED: moveArticleToPosition.
// It took a 1..M target from a select bounded by the PINNED BLOCK, which was a
// coherent control while only 5 articles had a position and is not one now that
// all 486 do: the equivalent for the normal ordering is a 486-entry dropdown.
//
// ── THIS NOTE USED TO END "AND IS NOT COMING BACK". IT CAME BACK. ───────────
// The old sentence said fixed-slot targeting had been rejected in this project
// and would not return, and moveArticleToRank() above is exactly that: type a
// number, the article goes there. Leaving the old wording would have been an
// authoritative comment contradicting the shipped code four functions up, which
// is the failure articlePositioning.js already paid three rounds of
// investigation for.
//
// So what was actually wrong with the retired action, stated properly, because
// only one of the three objections was about typing a number at all:
//
//   1. THE CONTROL WAS A SELECT OF 1..M. That is the part that does not scale
//      and the part that is genuinely gone — 486 options is not a control. An
//      input is O(1) in the collection size.
//   2. IT TOOK A SLOT, NOT A RANK. The two are equal only when every article is
//      active; with one inactive row above, they differ, and the article lands
//      somewhere other than where the admin looked. planMoveToRank resolves the
//      typed number to the ROW currently holding it and plans against that row.
//   3. THE NUMBER WAS THE WRITE. `updateArticlePinOrder` stored what it was
//      handed. Here the number never reaches the database: the server re-reads
//      the collection, a planner turns the rank into writes, and the client
//      cannot supply a value that is persisted.
//
// And the two behaviours that make the affordance safe rather than merely
// convenient: a target on the far side of the pinned block is REFUSED (crossing
// it is pinning, which is a different act on a different screen), and an
// out-of-range number is REFUSED RATHER THAN CLAMPED — a click is a gesture the
// UI bounded, but a typed number is a claim, and quietly landing the article
// somewhere else is the defect this whole area exists to prevent.
//
// The one-step arrows and "to the top of this block" are unchanged and are
// still the right control for nudging. Use moveArticleOneStep() /
// moveArticleToBlockTop() / moveArticleToRank().
//
// RETIRED: repositionArticle.
// It bundled TWO different acts behind one direction argument — 'promote' put an
// article into the pinned block, 'demote' took it out — under a name that said
// neither. Splitting ordering from pinning is the whole point of this round, so
// pinning gets its own verb: setArticlePinned(). The planners it called
// (planPromotion / planDemotion) are unchanged and still do the work.

/**
 * Featured articles for the Landing page BlogSection.
 * Admin sets `featuredOnLanding=true` per article.
 */
export async function getFeaturedArticlesForLanding(limit = 6) {
  await dbConnect();
  const docs = await Article.find({ active: true, featuredOnLanding: true })
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(limit)
    .select('slug title excerpt coverUrl tags articleType publishedAt')
    .lean();
  return serialize(docs);
}