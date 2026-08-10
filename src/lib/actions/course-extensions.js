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
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';

const ADMIN_PATH = '/admin/courses';

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
  await requireAdmin('courses');
  await dbConnect();
  const docs = await CourseExtension.find({}).sort({ updatedAt: -1 }).lean();
  return serialize(docs);
}

/**
 * The extension summary logged as `before`/`after`.
 *
 * Scalars verbatim; `gallery` as a count. A gallery is a list of media objects
 * with URLs and alt text — twenty of them would blow the writer's 2 KB
 * per-field cap and land as a truncation marker. "the gallery went from 4 items
 * to 7" is the claim worth keeping; the images themselves are on the page.
 * `tags` stay verbatim because they are short and are the field people argue
 * about.
 */
function extensionFields(doc) {
  if (!doc) return null;
  return {
    urlAlias:            doc.urlAlias ?? '',
    metaTitle:           doc.metaTitle ?? '',
    metaDescription:     doc.metaDescription ?? '',
    ogImage:             doc.ogImage ?? '',
    tags:                Array.isArray(doc.tags) ? doc.tags : [],
    isPublished:         Boolean(doc.isPublished),
    omisePaymentEnabled: Boolean(doc.omisePaymentEnabled),
    galleryCount:        Array.isArray(doc.gallery) ? doc.gallery.length : 0,
  };
}

/** Admin-only — create or update by `courseId`. */
export async function saveCourseExtension(courseId, data) {
  const session = await requireAdmin('courses');
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
    omisePaymentEnabled:
      typeof data?.omisePaymentEnabled === 'boolean' ? data.omisePaymentEnabled : false,
  };

  try {
    // `before` from an explicit read rather than `new: false`, because this
    // action RETURNS the post-update document to its caller — flipping the flag
    // would silently change what the admin UI receives. One indexed findOne on
    // a small collection is the cheaper mistake.
    //
    // null here is meaningful, not missing: this is an upsert, so a null
    // `before` is how the trail says "this created the extension".
    const before = extensionFields(await CourseExtension.findOne({ courseId }).lean());

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

    // THE SECOND KEY SPACE. `recordId` is the `course_id` CODE, not an MSDB
    // ObjectId — CourseExtension keys on it (see the model: "matches course_id
    // from the upstream API"). Same menu as courses.js, different key space,
    // unnormalised by decision (§8.7 ruling (e)). That is why the code doubles
    // as the label: unlike an ObjectId, it already reads as a course.
    recordAdminActionAfter({
      menu:        'courses',
      action:      before ? 'update' : 'create',
      entity:      'extension',
      recordId:    courseId,
      recordLabel: courseId,
      before,
      after:       extensionFields(doc),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

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
  const session = await requireAdmin('courses');
  await dbConnect();

  // findOneAndDelete rather than deleteOne: same single round-trip, but it
  // hands back the document being removed so `before` costs nothing extra.
  // The caller sees no difference — this action returns { ok: true } either
  // way, exactly as before.
  //
  // No label read is needed here, unlike deleteCourse: `courseId` IS the
  // human-readable code, so the record identifies itself.
  const removed = await CourseExtension.findOneAndDelete({ courseId }).lean();

  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu:        'courses',
    action:      'delete',
    entity:      'extension',
    recordId:    courseId,
    recordLabel: courseId,
    before:      extensionFields(removed),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}
