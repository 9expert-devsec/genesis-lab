'use server';

/**
 * Server actions for LocalFaq — admin-managed, per-course FAQs.
 *
 * A LocalFaq is scoped to one specific course via (`course_type`, `ref_id`).
 * Writes are gated by the RBAC page key that owns that course type's admin
 * area (prefix-matched in src/lib/rbac/pages.js):
 *   public      → 'courses'       (/admin/courses/[courseId] FAQ tab)
 *   career_path → 'career_paths'  (/admin/career-paths/[id]/faqs)
 *   masterclass → 'masterclass'   (/admin/masterclass/[id]/faqs)
 *
 * Errors are returned as { ok: false, error } rather than thrown, matching the
 * style of src/lib/actions/faqs.js.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import LocalFaq from '@/models/LocalFaq';
import CourseExtension from '@/models/CourseExtension';
import CareerPath from '@/models/CareerPath';
import MasterclassCourse from '@/models/MasterclassCourse';
import { requireAdmin } from '@/lib/actions/auth';

const COURSE_TYPES = ['public', 'career_path', 'masterclass'];

/** RBAC page key that owns each course type's admin area. */
function pageKeyForType(course_type) {
  switch (course_type) {
    case 'public':      return 'courses';
    case 'career_path': return 'career_paths';
    case 'masterclass': return 'masterclass';
    default:            return 'local_faqs';
  }
}

function isValidType(course_type) {
  return COURSE_TYPES.includes(course_type);
}

/**
 * Revalidate both the admin editor and the public page(s) for a course.
 * Best-effort — public URL resolution may query the DB; failures here should
 * never block the write, so callers wrap this in try/catch.
 */
async function revalidateForFaq(course_type, ref_id) {
  // Admin overview always changes.
  revalidatePath('/admin/local-faqs');

  if (!ref_id) return;

  if (course_type === 'public') {
    revalidatePath(`/admin/courses/${ref_id}`);
    const ext = await CourseExtension.findOne({ courseId: ref_id })
      .select('urlAlias')
      .lean();
    const publicPath = ext?.urlAlias || `/${ref_id.toLowerCase()}-training-course`;
    revalidatePath(publicPath);
    return;
  }

  if (course_type === 'career_path') {
    revalidatePath(`/admin/career-paths/${ref_id}/faqs`);
    const cp = await CareerPath.findOne({ career_path_id: ref_id })
      .select('api_slug')
      .lean();
    if (cp?.api_slug) revalidatePath(`/${cp.api_slug}`);
    return;
  }

  if (course_type === 'masterclass') {
    revalidatePath(`/admin/masterclass/${ref_id}/faqs`);
    const mc = await MasterclassCourse.findById(ref_id).select('slug').lean();
    if (mc?.slug) {
      revalidatePath('/masterclass');
      revalidatePath(`/masterclass/${mc.slug}`);
    }
    return;
  }
}

/** Fields an admin may edit on an existing FAQ (course scope is not remapped). */
function pickEditableFields(data = {}) {
  const out = {};
  if (typeof data.question_th === 'string') out.question_th = data.question_th.trim();
  if (typeof data.answer_html === 'string') out.answer_html = data.answer_html;
  if (typeof data.is_active === 'boolean') out.is_active = data.is_active;
  if (data.display_order != null) out.display_order = Number(data.display_order) || 0;
  return out;
}

export async function createLocalFaq({
  course_type,
  ref_id,
  question_th,
  answer_html,
  display_order,
}) {
  if (!isValidType(course_type)) {
    return { ok: false, error: 'course_type ไม่ถูกต้อง' };
  }
  if (typeof ref_id !== 'string' || !ref_id.trim()) {
    return { ok: false, error: 'ref_id (course) ต้องไม่ว่าง' };
  }
  if (typeof question_th !== 'string' || !question_th.trim()) {
    return { ok: false, error: 'กรุณากรอกคำถาม (question_th)' };
  }

  await requireAdmin(pageKeyForType(course_type));
  await dbConnect();

  const doc = await LocalFaq.create({
    course_type,
    ref_id: ref_id.trim(),
    question_th: question_th.trim(),
    answer_html: answer_html ?? '',
    display_order: Number(display_order) || 0,
  });

  try {
    await revalidateForFaq(course_type, ref_id.trim());
  } catch {
    /* best-effort cache busting */
  }
  return { ok: true, id: String(doc._id) };
}

export async function updateLocalFaq(id, data = {}) {
  if (!id) return { ok: false, error: 'Missing id' };

  await dbConnect();
  const existing = await LocalFaq.findById(id).select('course_type ref_id').lean();
  if (!existing) return { ok: false, error: 'Not found' };

  await requireAdmin(pageKeyForType(existing.course_type));

  const patch = pickEditableFields(data);
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'ไม่มีข้อมูลที่จะอัปเดต' };
  }

  await LocalFaq.findByIdAndUpdate(id, { $set: patch });

  try {
    await revalidateForFaq(existing.course_type, existing.ref_id);
  } catch {
    /* best-effort cache busting */
  }
  return { ok: true };
}

export async function deleteLocalFaq(id) {
  if (!id) return { ok: false, error: 'Missing id' };

  await dbConnect();
  const existing = await LocalFaq.findById(id).select('course_type ref_id').lean();
  if (!existing) return { ok: false, error: 'Not found' };

  await requireAdmin(pageKeyForType(existing.course_type));

  await LocalFaq.findByIdAndDelete(id);

  try {
    await revalidateForFaq(existing.course_type, existing.ref_id);
  } catch {
    /* best-effort cache busting */
  }
  return { ok: true };
}

/**
 * Persist a new ordering for one course's FAQs. `orderedIds` is an array of
 * LocalFaq _id values in the desired display order; each row's display_order
 * is set to its index.
 */
export async function reorderLocalFaqs(course_type, ref_id, orderedIds) {
  if (!isValidType(course_type)) {
    return { ok: false, error: 'course_type ไม่ถูกต้อง' };
  }
  if (typeof ref_id !== 'string' || !ref_id.trim()) {
    return { ok: false, error: 'ref_id (course) ต้องไม่ว่าง' };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }

  await requireAdmin(pageKeyForType(course_type));
  await dbConnect();

  const ops = orderedIds.map((faqId, index) => ({
    updateOne: {
      // Scope the filter to this course so a stray id can't reorder another
      // course's FAQ.
      filter: { _id: faqId, course_type, ref_id: ref_id.trim() },
      update: { $set: { display_order: index } },
    },
  }));
  await LocalFaq.bulkWrite(ops);

  try {
    await revalidateForFaq(course_type, ref_id.trim());
  } catch {
    /* best-effort cache busting */
  }
  return { ok: true };
}
