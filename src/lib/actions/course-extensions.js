'use server';

/**
 * Server actions for the CourseExtension collection — admin-managed
 * SEO, gallery, and pretty-URL data layered on top of the upstream
 * read-only course API.
 *
 * Read functions (getCourseExtension, getCourseExtensionByAlias) are
 * intentionally NOT auth-gated — they're consumed by the public course
 * detail page. The data they return is meant to be public anyway.
 *
 * Write/list functions require an authenticated admin session. We
 * don't role-gate further (admin/editor can both manage content),
 * matching the existing banners / featured-* convention.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CourseExtension from '@/models/CourseExtension';
import { auth } from '@/lib/auth/options';

const ADMIN_PATH = '/admin/courses';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

function serialize(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc));
}

function normalizeAlias(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Fetch a single extension by upstream `course_id`. */
export async function getCourseExtension(courseId) {
  if (!courseId) return null;
  await dbConnect();
  const doc = await CourseExtension.findOne({ courseId }).lean();
  return serialize(doc);
}

/** Fetch a single extension by its `urlAlias` (with or without leading slash). */
export async function getCourseExtensionByAlias(alias) {
  if (!alias) return null;
  await dbConnect();
  const normalized = normalizeAlias(alias);
  if (!normalized) return null;
  const doc = await CourseExtension.findOne({ urlAlias: normalized }).lean();
  return serialize(doc);
}

/** Admin-only — list every extension for the management table. */
export async function listCourseExtensions() {
  await requireAdmin();
  await dbConnect();
  const docs = await CourseExtension.find({}).sort({ updatedAt: -1 }).lean();
  return serialize(docs);
}

/** Admin-only — create or update by `courseId`. */
export async function saveCourseExtension(courseId, data) {
  await requireAdmin();
  await dbConnect();

  if (!courseId || typeof courseId !== 'string') {
    return { ok: false, error: 'Missing courseId' };
  }

  const cleanAlias = normalizeAlias(data?.urlAlias);

  // Normalize gallery — drop empty rows, re-number `order`.
  const galleryRaw = Array.isArray(data?.gallery) ? data.gallery : [];
  const gallery = galleryRaw
    .filter((item) => {
      if (!item || !item.type) return false;
      if (item.type === 'youtube') return Boolean(item.videoId?.trim());
      if (item.type === 'image') return Boolean(item.url?.trim());
      return false;
    })
    .map((item, i) => ({
      type: item.type,
      url: item.type === 'image' ? String(item.url ?? '').trim() : '',
      videoId: item.type === 'youtube' ? String(item.videoId ?? '').trim() : '',
      alt: String(item.alt ?? '').trim(),
      order: i,
    }));

  const tags = Array.isArray(data?.tags)
    ? data.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const update = {
    courseId,
    urlAlias: cleanAlias,
    metaTitle: String(data?.metaTitle ?? '').trim(),
    metaDescription: String(data?.metaDescription ?? '').trim(),
    ogImage: String(data?.ogImage ?? '').trim(),
    tags,
    gallery,
    isPublished:
      typeof data?.isPublished === 'boolean' ? data.isPublished : true,
  };

  try {
    const doc = await CourseExtension.findOneAndUpdate({ courseId }, update, {
      upsert: true,
      new: true,
      runValidators: true,
    });

    // Revalidate the admin list, the per-course editor, and the public
    // detail page (both possible URL shapes — alias and code suffix).
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${courseId}`);
    if (cleanAlias) revalidatePath(cleanAlias);
    revalidatePath(`/${courseId.toLowerCase()}-training-course`);

    return { ok: true, data: serialize(doc) };
  } catch (err) {
    // Mongo's E11000 on unique alias collisions is the most likely
    // expected error — surface it cleanly.
    if (err?.code === 11000) {
      return { ok: false, error: 'URL Alias นี้ถูกใช้แล้วโดยหลักสูตรอื่น' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

/** Admin-only — delete an extension document. The upstream course
 *  itself remains; only the SEO/gallery layer is removed. */
export async function deleteCourseExtension(courseId) {
  await requireAdmin();
  await dbConnect();
  await CourseExtension.deleteOne({ courseId });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
