'use server';

/**
 * Server actions for Public Course CRUD against the upstream MSDB API.
 *
 * Genesis does NOT keep a Mongo cache for course detail rows — public
 * pages call MSDB via aiFetch with ISR + cache tags. So these actions
 * only have to:
 *   1. Forward the form payload to MSDB (msdb-write helpers).
 *   2. Revalidate the admin list path so the table refreshes.
 *
 * Public-page revalidation is handled by the inbound webhook
 * (`course.created` / `course.updated` / `course.deleted`).
 *
 * Field mapping — Genesis form ↔ MSDB PublicCourse (curl-verified):
 *   course_name          ← course display name
 *   course_id            ← human-readable code (required on create,
 *                          immutable on edit by convention)
 *   course_teaser        ← card / SEO snippet
 *   title                ← LONG rich-text body (yes — MSDB's "title"
 *                          field stores the description)
 *   course_trainingdays  ← number of training days
 *   course_traininghours ← number of training hours
 *   course_levels        ← "1"|"2"|"3"|"4"
 *   course_price         ← list price (THB)
 *   course_netprice      ← net price after discount (nullable)
 *   course_cover_url     ← Cloudinary URL
 *   course_type_public   ← boolean
 *   course_type_inhouse  ← boolean
 *   course_workshop_status     ← boolean
 *   course_certificate_status  ← boolean
 *   course_promote_status      ← boolean
 *   sort_order           ← display order
 *   program              ← ObjectId
 *   skills[]             ← ObjectId[]
 *   previous_course      ← ObjectId   (resolved from course_id by caller)
 *   related_courses[]    ← ObjectId[] (resolved from course_id[] by caller, max 5)
 *   course_objectives[]          ← string[] (bullets)
 *   course_target_audience[]     ← string[]
 *   course_prerequisites[]       ← string[]
 *   course_system_requirements[] ← string[]
 *   bullets[]                    ← string[] (highlight bullets)
 *   training_topics              ← [{ topic, subtopics[] }]
 *   course_doc_paths[]           ← URL[]
 *   course_lab_paths[]           ← URL[]
 *   course_case_study_paths[]    ← URL[]
 *   website_urls[]               ← URL[]
 *   exam_links[]                 ← URL[]
 */

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import {
  resolveCourseObjectIds,
  resolveCourseObjectId,
} from '@/lib/api/resolveIds';

const ADMIN_PATH = '/admin/courses';

// ── coercion helpers ────────────────────────────────────────────────

function toStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function toNum(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toNullableNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toBool(v) {
  if (typeof v === 'boolean') return v;
  return v === 'on' || v === 'true' || v === '1';
}
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Split a textarea value into trimmed lines, dropping blanks. Used for
 * bullet lists and URL arrays.
 */
function linesOf(formData, key) {
  const raw = formData instanceof FormData ? formData.get(key) : formData?.[key];
  return toStr(raw)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse the JSON-serialized Training Topics. Each row should be
 * `{ topic: string, subtopics: string[] }`. Malformed input falls back
 * to an empty array — better to lose the field than to abort the save.
 */
function parseTrainingTopics(formData) {
  const raw = formData instanceof FormData
    ? formData.get('training_topics')
    : formData?.training_topics;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        topic: toStr(row?.topic),
        subtopics: Array.isArray(row?.subtopics)
          ? row.subtopics.map(toStr).filter(Boolean)
          : toStr(row?.subtopics)
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
      }))
      .filter((t) => t.topic || t.subtopics.length > 0);
  } catch {
    return [];
  }
}

/**
 * Shape the form payload for MSDB. Returns an object with **course_id
 * strings** still present in `related_courses` / `previous_course` —
 * the caller resolves these to ObjectIds before POSTing upstream so
 * the local doc retains the human-readable codes.
 */
function shapePayload(formData) {
  const get = (k) =>
    formData instanceof FormData ? formData.get(k) : formData?.[k];
  const getAll = (k) => {
    if (formData instanceof FormData) return formData.getAll(k);
    const v = formData?.[k];
    return Array.isArray(v) ? v : [];
  };

  // course_type comes from either two checkboxes (new form) or the
  // legacy single select. Accept both.
  const courseType = toStr(get('course_type'));
  const explicitPublic  = get('course_type_public');
  const explicitInhouse = get('course_type_inhouse');
  const isPublic  =
    explicitPublic  != null
      ? toBool(explicitPublic)
      : courseType !== 'inhouse';
  const isInhouse =
    explicitInhouse != null
      ? toBool(explicitInhouse)
      : courseType === 'inhouse';

  return {
    course_name:               toStr(get('course_name') || get('title')),
    course_id:                 toStr(get('course_id')),
    course_teaser:             toStr(get('course_teaser') || get('short_desc')),
    title:                     toStr(get('title') || get('description')),
    course_trainingdays:       toNum(get('course_trainingdays') || get('duration_days')),
    course_traininghours:      toNum(get('course_traininghours')),
    course_levels:             toStr(get('course_levels')) || '1',
    course_price:              toNum(get('course_price') || get('price')),
    course_netprice:           toNullableNum(get('course_netprice')),
    course_cover_url:          toStr(get('course_cover_url') || get('image_url')),
    sort_order:                toNum(get('sort_order')),
    course_type_public:        isPublic,
    course_type_inhouse:       isInhouse,
    course_workshop_status:    toBool(get('course_workshop_status')),
    course_certificate_status: toBool(get('course_certificate_status')),
    course_promote_status:     toBool(get('course_promote_status')),
    program:                   toStr(get('program')) || undefined,
    skills:                    toStrArr(getAll('skills')),
    // course_id strings — caller resolves to ObjectIds for MSDB body.
    previous_course:           toStr(get('previous_course')) || undefined,
    related_courses:           toStrArr(getAll('related_courses')).slice(0, 5),
    // Bullets / arrays
    course_objectives:           linesOf(formData, 'course_objectives'),
    course_target_audience:      linesOf(formData, 'course_target_audience'),
    course_prerequisites:        linesOf(formData, 'course_prerequisites'),
    course_system_requirements:  linesOf(formData, 'course_system_requirements'),
    bullets:                     linesOf(formData, 'bullets'),
    course_doc_paths:            linesOf(formData, 'course_doc_paths'),
    course_lab_paths:            linesOf(formData, 'course_lab_paths'),
    course_case_study_paths:     linesOf(formData, 'course_case_study_paths'),
    website_urls:                linesOf(formData, 'website_urls'),
    exam_links:                  linesOf(formData, 'exam_links'),
    training_topics:             parseTrainingTopics(formData),
  };
}

/**
 * Replace course_id strings with ObjectIds in `previous_course` and
 * `related_courses` so the upstream body is FK-correct.
 */
async function resolveCourseRefs(body) {
  const out = { ...body };

  if (body.previous_course) {
    const id = await resolveCourseObjectId(body.previous_course);
    // If the code didn't resolve, drop the field rather than send a
    // nonsense string that MSDB will reject.
    if (id) out.previous_course = id;
    else    delete out.previous_course;
  }

  if (Array.isArray(body.related_courses) && body.related_courses.length > 0) {
    out.related_courses = await resolveCourseObjectIds(body.related_courses);
  } else {
    out.related_courses = [];
  }

  return out;
}

export async function createCourse(formData) {
  await requireAdmin('courses');
  const body = shapePayload(formData);
  if (!body.course_name) return { ok: false, error: 'กรุณากรอกชื่อหลักสูตร' };
  if (!body.course_id)   return { ok: false, error: 'กรุณากรอกรหัสหลักสูตร (course_id)' };

  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbCreate('public-course', payload);
    revalidatePath(ADMIN_PATH);
    return { ok: true, item, id: item?._id };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างหลักสูตรไม่สำเร็จ' };
  }
}

export async function updateCourse(id, formData) {
  await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };

  const body = shapePayload(formData);
  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbUpdate('public-course', id, payload);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${id}/edit`);
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตหลักสูตรไม่สำเร็จ' };
  }
}

export async function deleteCourse(id) {
  await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };

  try {
    await msdbDelete('public-course', id);
    revalidatePath(ADMIN_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบหลักสูตรไม่สำเร็จ' };
  }
}
