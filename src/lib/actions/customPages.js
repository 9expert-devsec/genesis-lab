'use server';

/**
 * Server actions for the CustomPage collection.
 *
 * Custom pages are Genesis-owned (no MSDB sync). Reads of published pages
 * are public; writes require an authenticated admin session.
 */

import { randomUUID } from 'crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CustomPage from '@/models/CustomPage';
import { customPageSchema } from '@/lib/schemas/customPage';
import { requireAdmin } from '@/lib/actions/auth';
import { auth } from '@/lib/auth/options';
import { deleteFromCloudinary } from '@/lib/cloudinary';

const ADMIN_PATH = '/admin/pages';

// Block these at create/update so admins can't shadow a real route.
const RESERVED_SLUGS = [
  'masterclass', 'career-path', 'career-path-register', 'career-path-project',
  'admin', 'api', 'articles', 'promotions', 'about-us', 'contact-us', 'portfolio',
  'join-us', 'training-course', 'schedule', 'faq', 'social', 'p', 'lp',
  'sitemap.xml', 'robots.txt', '_next', 'favicon.ico',
];

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function bustCaches(slug) {
  revalidateTag('custom-pages');
  revalidatePath(ADMIN_PATH);
  // The public catch-all route at `/[slug]` arrives in a later batch —
  // wiring the revalidate now is harmless.
  if (slug) revalidatePath(`/${slug}`);
}

function firstZodMessage(error) {
  const issue = error?.issues?.[0] ?? error?.errors?.[0];
  if (!issue) return 'รูปแบบข้อมูลไม่ถูกต้อง';
  const path = issue.path?.join('.') || 'field';
  return `${path}: ${issue.message}`;
}

/**
 * Read the current admin session's user as a plain `{ id, name }`. Never
 * throws — audit stamping must not block a save.
 */
async function currentUserStamp() {
  try {
    const session = await auth();
    return {
      id:   session?.user?.id   ? String(session.user.id)   : '',
      name: session?.user?.name ? String(session.user.name) : '',
    };
  } catch {
    return { id: '', name: '' };
  }
}

/**
 * Parse the FormData posted by CustomPageForm into a plain object the Zod
 * schema can validate. `jsonLd` and `slugHistory` ride across the wire as
 * JSON blobs. previewToken / createdBy / updatedBy are set server-side and
 * are never read from the form.
 */
function parseFormData(formData) {
  let jsonLd = {};
  try {
    const parsed = JSON.parse(String(formData.get('jsonLd') ?? '{}'));
    if (parsed && typeof parsed === 'object') jsonLd = parsed;
  } catch {
    jsonLd = {};
  }

  let slugHistory = [];
  try {
    const parsed = JSON.parse(String(formData.get('slugHistory') ?? '[]'));
    if (Array.isArray(parsed)) slugHistory = parsed;
  } catch {
    slugHistory = [];
  }

  return {
    slug:            String(formData.get('slug') ?? '').trim(),
    title:           String(formData.get('title') ?? '').trim(),
    body:            String(formData.get('body') ?? ''),
    status:          String(formData.get('status') ?? 'draft'),
    metaTitle:       String(formData.get('metaTitle') ?? '').trim(),
    metaDescription: String(formData.get('metaDescription') ?? '').trim(),
    canonicalUrl:    String(formData.get('canonicalUrl') ?? '').trim(),
    noIndex:         formData.get('noIndex') === 'true',
    ogTitle:         String(formData.get('ogTitle') ?? '').trim(),
    ogDescription:   String(formData.get('ogDescription') ?? '').trim(),
    ogImage:         String(formData.get('ogImage') ?? '').trim(),
    ogImagePublicId: String(formData.get('ogImagePublicId') ?? '').trim(),
    ogType:          String(formData.get('ogType') ?? 'website'),
    twitterCard:     String(formData.get('twitterCard') ?? 'summary_large_image'),
    jsonLd,
    slugHistory,
  };
}

// ── reads ────────────────────────────────────────────────────────

export async function getCustomPages({
  page = 1,
  limit = 20,
  search = '',
  status,
} = {}) {
  await dbConnect();

  const filter = {};
  if (status) filter.status = String(status);
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { slug:  { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [docs, total] = await Promise.all([
    CustomPage.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomPage.countDocuments(filter),
  ]);

  return {
    items: serialize(docs),
    total,
    page,
    limit,
  };
}

export async function getCustomPageById(id) {
  if (!id) return null;
  await dbConnect();
  const doc = await CustomPage.findById(id).lean();
  return serialize(doc);
}

export async function getCustomPageBySlug(slug) {
  if (!slug) return null;
  await dbConnect();
  // Slugs are ASCII kebab-case, but keep parity with the article action:
  // Next.js sometimes hands us the raw `[slug]` param URL-encoded.
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await CustomPage.findOne({
    slug: key,
    status: 'published',
  }).lean();
  return serialize(doc);
}

/**
 * Fetch a page by slug with NO status filter — used by the admin preview
 * and the future redirect lookup.
 */
export async function getCustomPageBySlugAny(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await CustomPage.findOne({ slug: key }).lean();
  return serialize(doc);
}

/**
 * Resolve a historical slug to the page's current slug — used for 301
 * redirects in a later batch. Returns the current slug string or null.
 */
export async function findCustomPageByHistoricalSlug(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await CustomPage.findOne({ slugHistory: key, status: 'published' })
    .select('slug')
    .lean();
  return doc ? serialize(doc) : null;
}

// ── mutations ────────────────────────────────────────────────────

export async function createCustomPage(formData) {
  await requireAdmin('pages');
  await dbConnect();

  const raw = parseFormData(formData);
  const parsed = customPageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  if (RESERVED_SLUGS.includes(parsed.data.slug)) {
    return { ok: false, error: 'slug นี้เป็นเส้นทางระบบ ใช้ไม่ได้' };
  }

  const stamp = await currentUserStamp();

  try {
    const doc = await CustomPage.create({
      ...parsed.data,
      previewToken: randomUUID(),
      createdBy: stamp,
      updatedBy: stamp,
    });
    bustCaches(doc.slug);
    return { ok: true, slug: doc.slug, id: String(doc._id) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateCustomPage(id, formData) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const existing = await CustomPage.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const raw = parseFormData(formData);
  const parsed = customPageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  if (RESERVED_SLUGS.includes(parsed.data.slug)) {
    return { ok: false, error: 'slug นี้เป็นเส้นทางระบบ ใช้ไม่ได้' };
  }

  const update = { ...parsed.data };

  // Slug history: if the slug changed, retire the old one into history
  // (deduped) and make sure the new slug never lingers there.
  if (parsed.data.slug !== existing.slug) {
    const history = new Set(existing.slugHistory ?? []);
    history.add(existing.slug);
    history.delete(parsed.data.slug);
    update.slugHistory = [...history];
  }

  update.updatedBy = await currentUserStamp();

  try {
    const updated = await CustomPage.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    // Bust caches for both the old and the new slug.
    bustCaches(existing.slug);
    bustCaches(updated.slug);
    return { ok: true, slug: updated.slug };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deleteCustomPage(id) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();
  const doc = await CustomPage.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  // Best-effort image cleanup — never block deletion on Cloudinary.
  if (doc.ogImagePublicId) {
    try {
      await deleteFromCloudinary(doc.ogImagePublicId);
    } catch {
      /* swallow — the DB record is already gone */
    }
  }

  bustCaches(doc.slug);
  return { ok: true };
}

export async function toggleCustomPageStatus(id, status) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!['draft', 'published'].includes(status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();
  const doc = await CustomPage.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true }
  );
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  bustCaches(doc.slug);
  return { ok: true };
}

export async function regeneratePreviewToken(id) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();
  const token = randomUUID();
  const doc = await CustomPage.findByIdAndUpdate(
    id,
    { $set: { previewToken: token } },
    { new: true }
  );
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  return { ok: true, token };
}
