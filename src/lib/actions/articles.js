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
import { planDemotion, planPromotion } from '@/lib/articlePositioning';
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

export async function toggleArticlePinnedOnArticlePage(id, value) {
  await requireAdmin('articles');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Article.findByIdAndUpdate(id, { $set: { isPinnedOnArticlePage: Boolean(value) } });
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

export async function toggleArticleFeaturedOnLanding(id, value) {
  await requireAdmin('articles');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Article.findByIdAndUpdate(id, { $set: { featuredOnLanding: Boolean(value) } });
  revalidatePath(ADMIN_PATH);
  revalidatePath('/');
  return { ok: true };
}

/**
 * Apply a positioning plan produced by src/lib/articlePositioning.js
 * (`planPromotion` / `planDemotion` / `planBadgeToggle`).
 *
 * ONE bulkWrite rather than a call per document: demoting an article renumbers
 * every survivor, and a per-document loop that fails halfway leaves the block
 * with a hole — exactly the state the renumbering exists to prevent.
 *
 * Only the three positioning fields are writable through here; anything else in
 * the payload is dropped rather than trusted, since the plan is computed on the
 * client from the list it was handed.
 */
export async function applyArticlePositionPlan(plan) {
  await requireAdmin('articles');
  const writes = Array.isArray(plan?.writes) ? plan.writes : [];
  if (writes.length === 0) return { ok: true, modified: 0 };
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
  if (ops.length === 0) return { ok: true, modified: 0 };

  const res = await Article.bulkWrite(ops);
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true, modified: res?.modifiedCount ?? ops.length };
}

/**
 * Promote / demote an article from a surface that does NOT hold the whole list.
 *
 * The admin list computes its plan client-side because it already has every
 * article in state. The edit form has ONE document, and `planPromotion` needs
 * the whole block to answer "what is the highest pinOrder?" — so rather than
 * invent a second numbering rule for the form, this re-reads the block and runs
 * the SAME planners the list uses. There is still exactly one place that knows
 * how the block is numbered.
 *
 * Only the positioning fields are projected: the plan needs the cascade keys and
 * nothing else, and pulling full documents to compute one integer would be a
 * pointless read of every article body.
 */
export async function repositionArticle(id, direction) {
  await requireAdmin('articles');
  if (!id) return { ok: false, error: 'Missing id' };
  if (direction !== 'promote' && direction !== 'demote') {
    return { ok: false, error: `Unknown direction: ${direction}` };
  }
  await dbConnect();

  const docs = await Article.find(
    {},
    '_id isPinnedOnArticlePage pinOrder publishedAt createdAt active'
  ).lean();
  const articles = serialize(docs);

  const plan =
    direction === 'promote'
      ? planPromotion(articles, id)
      : planDemotion(articles, id);

  return applyArticlePositionPlan(plan);
}

export async function updateArticlePinOrder(id, pinOrder) {
  await requireAdmin('articles');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  const numeric = Number.isFinite(Number(pinOrder)) ? Number(pinOrder) : 0;
  await Article.findByIdAndUpdate(id, { $set: { pinOrder: numeric } });
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

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