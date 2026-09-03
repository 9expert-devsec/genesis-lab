'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import MasterclassCourse   from '@/models/MasterclassCourse';
import MasterclassBatch    from '@/models/MasterclassBatch';
import { requireAdmin }    from '@/lib/actions/auth';
import { sanitizeRichHtml, sanitizeBasicHtml } from '@/lib/sanitizeRichHtml';

function serialize(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

const ADMIN_COURSE_PATH  = '/admin/masterclass';
const PUBLIC_LISTING     = '/masterclass';

function bustCaches(slug) {
  revalidatePath(ADMIN_COURSE_PATH);
  revalidatePath(PUBLIC_LISTING);
  if (slug) revalidatePath(`${PUBLIC_LISTING}/${slug}`);
}

/**
 * Sanitise every HTML field this collection carries, in place on a shallow
 * clone. `createMasterclassCourse`/`updateMasterclassCourse` write whatever
 * `data` the client sent with no schema and no field allow-list (`.create`
 * / `{ $set: data }` directly) — see docs/audit/unsanitized-html-render-
 * sites.md, which measured that write path rather than assuming its shape.
 * This targets only the known HTML fields rather than adding a schema this
 * round did not ask for; everything else in `data` passes through exactly
 * as it did before.
 *
 * Nested arrays (`curriculum`, `license_options.choices`) are optional and
 * caller-shaped, so every access is defensive — a caller that omits one
 * must not throw, it must simply have nothing there to sanitise.
 */
function sanitizeMasterclassCourseHtml(data) {
  const out = { ...(data ?? {}) };
  if (typeof out.description_html === 'string') {
    out.description_html = sanitizeRichHtml(out.description_html);
  }
  if (typeof out.system_requirements_html === 'string') {
    out.system_requirements_html = sanitizeRichHtml(out.system_requirements_html);
  }
  if (Array.isArray(out.curriculum)) {
    out.curriculum = out.curriculum.map((section) => ({
      ...section,
      modules: Array.isArray(section?.modules)
        ? section.modules.map((mod) => ({
            ...mod,
            topics_html: typeof mod?.topics_html === 'string'
              ? sanitizeRichHtml(mod.topics_html)
              : mod?.topics_html,
            content_html: typeof mod?.content_html === 'string'
              ? sanitizeRichHtml(mod.content_html)
              : mod?.content_html,
          }))
        : section?.modules,
    }));
  }
  if (out.license_options && Array.isArray(out.license_options.choices)) {
    out.license_options = {
      ...out.license_options,
      choices: out.license_options.choices.map((choice) => (
        choice?.info_popup && typeof choice.info_popup.html_content === 'string'
          ? { ...choice, info_popup: { ...choice.info_popup, html_content: sanitizeBasicHtml(choice.info_popup.html_content) } }
          : choice
      )),
    };
  }
  return out;
}

// ── MasterclassCourse ─────────────────────────────────────────────────────────

export async function createMasterclassCourse(data) {
  await requireAdmin('masterclass');
  await dbConnect();
  const doc = await MasterclassCourse.create(sanitizeMasterclassCourseHtml(data));
  bustCaches();
  return { ok: true, id: String(doc._id) };
}

export async function updateMasterclassCourse(id, data) {
  await requireAdmin('masterclass');
  await dbConnect();
  const doc = await MasterclassCourse.findByIdAndUpdate(
    id,
    { $set: sanitizeMasterclassCourseHtml(data) },
    { new: true }
  ).lean();
  if (!doc) return { ok: false, error: 'Not found' };
  bustCaches(doc.slug);
  return { ok: true };
}

export async function deleteMasterclassCourse(id) {
  await requireAdmin('masterclass');
  await dbConnect();
  const doc = await MasterclassCourse.findByIdAndDelete(id).lean();
  if (doc?.slug) bustCaches(doc.slug);
  // Also delete all batches for this course
  await MasterclassBatch.deleteMany({ course_id: id });
  return { ok: true };
}

// ── MasterclassBatch ──────────────────────────────────────────────────────────

export async function createMasterclassBatch(courseId, data) {
  await requireAdmin('masterclass');
  await dbConnect();
  // Auto-increment batch_no if not provided
  if (!data.batch_no) {
    const last = await MasterclassBatch.findOne({ course_id: courseId })
      .sort({ batch_no: -1 })
      .lean();
    data.batch_no = (last?.batch_no ?? 0) + 1;
  }
  if (!data.batch_label) {
    data.batch_label = `รุ่นที่ ${data.batch_no}`;
  }
  // Populate course_slug from the course doc if not provided
  if (!data.course_slug) {
    const courseDoc = await MasterclassCourse.findById(courseId).select('slug').lean();
    if (courseDoc?.slug) data.course_slug = courseDoc.slug;
  }
  if (typeof data.preparation_html === 'string') {
    data.preparation_html = sanitizeRichHtml(data.preparation_html);
  }
  const doc = await MasterclassBatch.create({ ...data, course_id: courseId });
  revalidatePath(ADMIN_COURSE_PATH);
  return { ok: true, id: String(doc._id) };
}

export async function updateMasterclassBatch(batchId, data) {
  await requireAdmin('masterclass');
  await dbConnect();

  // Auto-compute status if status_override is false
  const existing = await MasterclassBatch.findById(batchId).lean();
  if (!existing) return { ok: false, error: 'Not found' };

  if (!data.status_override && data.status_override !== undefined ? !data.status_override : !existing.status_override) {
    const regCount = data.registered_count ?? existing.registered_count;
    const cap      = data.capacity        ?? existing.capacity;
    if (regCount >= cap) {
      data.status = 'full';
    } else if (existing.status === 'full') {
      data.status = 'open';
    }
  }

  if (typeof data.preparation_html === 'string') {
    data.preparation_html = sanitizeRichHtml(data.preparation_html);
  }

  await MasterclassBatch.findByIdAndUpdate(batchId, { $set: data });
  revalidatePath(ADMIN_COURSE_PATH);
  return { ok: true };
}

export async function deleteMasterclassBatch(batchId) {
  await requireAdmin('masterclass');
  await dbConnect();
  await MasterclassBatch.findByIdAndDelete(batchId);
  revalidatePath(ADMIN_COURSE_PATH);
  return { ok: true };
}

// LocalFaq actions moved to src/lib/actions/local-faqs.js (per-course scoping).
