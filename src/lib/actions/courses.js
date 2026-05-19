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
 *   course_name          ← title              (course display name)
 *   course_teaser        ← short_desc         (card / SEO snippet)
 *   title                ← description        (rich-text body — note the
 *                                              upstream misnomer: "title"
 *                                              here is the LONG body)
 *   course_trainingdays  ← duration_days
 *   course_price         ← price
 *   course_cover_url     ← image_url
 *   course_type_public   ← (course_type !== 'inhouse')
 *   course_type_inhouse  ← (course_type === 'inhouse')
 *   program              ← program            (ObjectId)
 *   skills[]             ← skills[]           (ObjectId[])
 * MSDB has no `slug` field — we drop it.
 * MSDB has no `is_active` — visibility is controlled by the two
 * `course_type_*` booleans.
 */

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';

const ADMIN_PATH = '/admin/courses';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

function toStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function toNum(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Read the form, accepting either legacy Genesis names (`title`,
 * `short_desc`, …) or the new MSDB-aligned names (`course_name`,
 * `course_teaser`, …). The form currently posts MSDB names — the
 * legacy fallbacks let us migrate clients without breaking older form
 * payloads that may still be in flight.
 */
function shapePayload(formData) {
  const get = (k) =>
    formData instanceof FormData ? formData.get(k) : formData?.[k];
  const getAll = (k) => {
    if (formData instanceof FormData) return formData.getAll(k);
    const v = formData?.[k];
    return Array.isArray(v) ? v : [];
  };

  // course_type lives in a single select; MSDB needs two booleans.
  const courseType = toStr(get('course_type'));
  // If neither course_type_public nor course_type_inhouse is provided
  // directly, derive them from the select.
  const explicitPublic  = get('course_type_public');
  const explicitInhouse = get('course_type_inhouse');
  const isPublic  =
    explicitPublic  != null
      ? (explicitPublic === true || explicitPublic === 'on' || explicitPublic === 'true')
      : courseType !== 'inhouse';
  const isInhouse =
    explicitInhouse != null
      ? (explicitInhouse === true || explicitInhouse === 'on' || explicitInhouse === 'true')
      : courseType === 'inhouse';

  const program = toStr(get('program'));
  const skills  = toStrArr(getAll('skills'));
  const objectives = toStrArr(getAll('course_objectives'));

  return {
    course_name:          toStr(get('course_name') || get('title')),
    course_teaser:        toStr(get('course_teaser') || get('short_desc')),
    // Yes — MSDB's `title` field stores the long rich-text body.
    title:                toStr(get('title') || get('description')),
    course_trainingdays:  toNum(get('course_trainingdays') || get('duration_days')),
    course_price:         toNum(get('course_price') || get('price')),
    course_cover_url:     toStr(get('course_cover_url') || get('image_url')),
    course_type_public:   isPublic,
    course_type_inhouse:  isInhouse,
    program:              program || undefined,
    skills,
    course_objectives:    objectives,
  };
}

export async function createCourse(formData) {
  await requireAdmin();
  const body = shapePayload(formData);
  if (!body.course_name) {
    return { ok: false, error: 'กรุณากรอกชื่อหลักสูตร' };
  }

  try {
    const { item } = await msdbCreate('public-course', body);
    revalidatePath(ADMIN_PATH);
    return { ok: true, item, id: item?._id };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างหลักสูตรไม่สำเร็จ' };
  }
}

export async function updateCourse(id, formData) {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing course id' };

  const body = shapePayload(formData);
  try {
    const { item } = await msdbUpdate('public-course', id, body);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${id}/edit`);
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตหลักสูตรไม่สำเร็จ' };
  }
}

export async function deleteCourse(id) {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing course id' };

  try {
    await msdbDelete('public-course', id);
    revalidatePath(ADMIN_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบหลักสูตรไม่สำเร็จ' };
  }
}
