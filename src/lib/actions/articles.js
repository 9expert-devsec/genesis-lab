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

/**
 * Parse the FormData posted by ArticleForm into a plain object the
 * Zod schema can validate. All array-shaped fields ride across the wire
 * as JSON strings so the client-side editor can keep one canonical
 * source of truth.
 */
function parseFormData(formData) {
  function jsonArr(key) {
    try {
      const parsed = JSON.parse(String(formData.get(key) ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // datetime-local emits `YYYY-MM-DDTHH:mm`, which is NOT a valid
  // ISO-8601 string for Zod's `.datetime()` check. Normalize.
  const publishedAtRaw = String(formData.get('publishedAt') ?? '').trim();
  const publishedAt = publishedAtRaw
    ? new Date(publishedAtRaw).toISOString()
    : '';

  // jsonLd ships as a JSON blob — let Zod sanitize it on the way in.
  let jsonLd = {};
  try {
    const parsed = JSON.parse(String(formData.get('jsonLd') ?? '{}'));
    if (parsed && typeof parsed === 'object') jsonLd = parsed;
  } catch {
    jsonLd = {};
  }

  return {
    slug:            String(formData.get('slug') ?? '').trim(),
    title:           String(formData.get('title') ?? '').trim(),
    excerpt:         String(formData.get('excerpt') ?? '').trim(),
    content:         String(formData.get('content') ?? ''),
    coverUrl:        String(formData.get('coverUrl') ?? '').trim(),
    coverPublicId:   String(formData.get('coverPublicId') ?? '').trim(),
    tags:            jsonArr('tags'),
    programs:        jsonArr('programs'),
    skills:          jsonArr('skills'),
    relatedArticles: jsonArr('relatedArticles'),
    relatedCourses:  jsonArr('relatedCourses'),
    articleType:     String(formData.get('articleType') ?? 'article'),
    seoTitle:        String(formData.get('seoTitle') ?? ''),
    seoDescription:  String(formData.get('seoDescription') ?? ''),
    focusKeyword:    String(formData.get('focusKeyword') ?? ''),
    author:          String(formData.get('author') ?? '').trim(),
    publishedAt,
    active:          formData.get('active') === 'true',
    jsonLd,
  };
}

function firstZodMessage(error) {
  const issue = error?.issues?.[0] ?? error?.errors?.[0];
  if (!issue) return 'รูปแบบข้อมูลไม่ถูกต้อง';
  const path = issue.path?.join('.') || 'field';
  return `${path}: ${issue.message}`;
}

// ── reads ────────────────────────────────────────────────────────

export async function getArticles({
  page = 1,
  limit = 20,
  search = '',
  tag = '',
  program = '',
  active,
} = {}) {
  await dbConnect();

  const filter = {};
  if (typeof active === 'boolean') filter.active = active;
  if (tag)     filter.tags     = String(tag);
  if (program) filter.programs = String(program);
  if (search) {
    filter.$or = [
      { title:   { $regex: search, $options: 'i' } },
      { excerpt: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [docs, total] = await Promise.all([
    Article.find(filter)
      .sort({ isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
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
  await requireAdmin();
  await dbConnect();

  const raw = parseFormData(formData);
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
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();

  const raw = parseFormData(formData);
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
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing article id' };
  await dbConnect();
  const doc = await Article.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบบทความ' };
  bustCaches(doc.slug);
  return { ok: true };
}

export async function toggleArticleActive(id, active) {
  await requireAdmin();
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
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Article.findByIdAndUpdate(id, { $set: { isPinnedOnArticlePage: Boolean(value) } });
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

export async function toggleArticleFeaturedOnLanding(id, value) {
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Article.findByIdAndUpdate(id, { $set: { featuredOnLanding: Boolean(value) } });
  revalidatePath(ADMIN_PATH);
  revalidatePath('/');
  return { ok: true };
}

export async function updateArticlePinOrder(id, pinOrder) {
  await requireAdmin();
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