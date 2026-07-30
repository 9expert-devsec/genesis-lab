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
  planBadgeToggle,
  planDemotion,
  planMoveToPosition,
  planPromotion,
} from '@/lib/articlePositioning';
import { requireAdmin } from '@/lib/actions/auth';

const ADMIN_PATH  = '/admin/articles';
const PUBLIC_PATH = '/articles';

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
  articleType = '', // 'article' | 'video' | '' (all)
  active,
  select = '',
} = {}) {
  await dbConnect();

  const filter = {};
  if (typeof active === 'boolean') filter.active = active;
  if (tag)         filter.tags        = String(tag);
  if (program)     filter.programs    = String(program);
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
  const query = Article.find(filter)
    .sort({ isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 })
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

export async function createArticle(formData) {
  await requireAdmin('articles');
  await dbConnect();

  const raw = parseArticleFormData(formData);
  const parsed = articleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  try {
    const doc = await Article.create(buildModelData(parsed.data));
    bustCaches(doc.slug);
    return { ok: true, slug: doc.slug, id: String(doc._id) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateArticle(id, formData) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();

  const raw = parseArticleFormData(formData);
  const parsed = articleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  try {
    const updated = await Article.findByIdAndUpdate(
      id,
      { $set: buildModelData(parsed.data) },
      { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบบทความ' };
    bustCaches(updated.slug);
    return { ok: true, slug: updated.slug };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deleteArticle(id) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();
  const doc = await Article.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบบทความ' };
  bustCaches(doc.slug);
  return { ok: true };
}

export async function toggleArticleActive(id, active) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();
  const doc = await Article.findByIdAndUpdate(
    id,
    { $set: { active: Boolean(active) } },
    { new: true }
  );
  if (!doc) return { ok: false, error: 'ไม่พบบทความ' };
  bustCaches(doc.slug);
  return { ok: true };
}

// RETIRED: toggleArticlePinnedOnArticlePage.
// It wrote `isPinnedOnArticlePage` and left `pinOrder` STALE, which is the only
// remaining path that could produce b-006 — an unpinned article carrying a
// non-zero pinOrder, which sinks below every pinOrder:0 row and lands dead last
// (see the invariant note in src/lib/articlePositioning.js). It had no callers.
// Promotion and demotion go through repositionArticle(), which maintains both
// fields together.

export async function toggleArticleFeaturedOnLanding(id, value) {
  await requireAdmin('articles');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Article.findByIdAndUpdate(id, { $set: { featuredOnLanding: Boolean(value) } });
  revalidatePath(ADMIN_PATH);
  revalidatePath('/');
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

/** The fields every planner needs, and nothing else. */
const POSITION_FIELDS = '_id isPinnedOnArticlePage pinOrder showPinBadge publishedAt createdAt active';

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
 * Only the three positioning fields are writable through here. `pinOrder` is
 * gated on `Number.isFinite`, so a planned `0` writes and an ABSENT key leaves
 * the stored value alone — which is why a planner that drops a row it meant to
 * renumber fails silently rather than loudly, and why
 * test/pure/articlePositioning.test.mjs checks that no row goes missing.
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
 * Promote / demote an article.
 *
 * Both surfaces use this — the admin list and the edit form — even though the
 * list now holds every article and could compute the plan itself. It does not,
 * for the reason in the block comment above: a plan the browser computes is a
 * plan the browser can get wrong, from a snapshot that may be hours old.
 */
export async function repositionArticle(id, direction) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  if (direction !== 'promote' && direction !== 'demote') {
    return { ok: false, error: `Unknown direction: ${direction}` };
  }
  await dbConnect();
  const articles = await readBlockContext();

  const plan =
    direction === 'promote'
      ? planPromotion(articles, id)
      : planDemotion(articles, id);

  return applyPlan(plan);
}

/**
 * Move an article to position `target` within the positioned block.
 *
 * Replaces `updateArticlePinOrder`, which took an integer from a free number
 * input and wrote it to ONE row while knowing nothing about the others — so
 * duplicates and gaps were a normal thing to type. `planMoveToPosition` re-emits
 * the whole block as contiguous 1..M, which makes both unrepresentable.
 *
 * `target` is bounded by the UI to 1..M and clamped by the planner anyway. An id
 * outside the block throws `NotInBlockError`; that is a programmer error rather
 * than user input, so it is reported rather than swallowed into a no-op that
 * would look like success.
 */
export async function moveArticleToPosition(id, target) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const articles = await readBlockContext();

  try {
    return await applyPlan(planMoveToPosition(articles, id, target));
  } catch (err) {
    if (err?.name === 'NotInBlockError') {
      return { ok: false, error: 'บทความนี้ไม่ได้อยู่ในบล็อกที่จัดตำแหน่งไว้' };
    }
    throw err;
  }
}

/**
 * Turn the pin BADGE on or off. Positioning is untouched — see the note on
 * shouldShowPinBadge in src/lib/articlePositioning.js for why these are two
 * different concerns wearing one name historically.
 */
export async function setArticlePinBadge(id, show) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  return applyPlan(planBadgeToggle(id, Boolean(show)));
}

// RETIRED: updateArticlePinOrder.
// It wrote a free integer to a single row with no view of the block, so
// duplicates and gaps (b-005: production held 1,1,2,3,4,5,6,7,9,10) were a
// normal thing to type. Use moveArticleToPosition().

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