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
 *   training_topics              ← [{ title, bullets[] }]
 *   course_doc_paths[]           ← URL[]
 *   course_lab_paths[]           ← URL[]
 *   course_case_study_paths[]    ← URL[]
 *   website_urls[]               ← URL[]
 *   exam_links[]                 ← URL[]
 */

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { aiFetch, unwrap } from '@/lib/api/client';
import { parseTrainingTopicsValue } from '@/lib/courses/trainingTopics';
import { outlineFromFormValue } from '@/lib/courses/courseOutline';
import { checkboxBool, courseTypeFlags } from '@/lib/courses/courseTypeFlags';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import {
  resolveCourseObjectIds,
  resolveCourseObjectId,
} from '@/lib/api/resolveIds';

const ADMIN_PATH = '/admin/courses';

/**
 * ── AUDIT NOTES FOR THIS FILE — THE MSDB HALF ───────────────────────────────
 *
 * Nothing here writes Mongo. Every mutation is an HTTP call to MSDB, which is
 * exactly why the coverage guard could not see these three exports until its
 * classifier learned the `msdb*` names (§8.9). Two consequences for the audit
 * call that do not apply anywhere else in the sweep:
 *
 *   recordId is an MSDB ObjectId, and it identifies NOTHING to a human. That
 *   is what makes `recordLabel` load-bearing here rather than decorative — see
 *   the comment in deleteCourse.
 *
 *   `before` costs a network round-trip, not a Mongo read. It is taken only
 *   where the value cannot be recovered another way: on DELETE, where the
 *   record is about to stop existing. On update it is deliberately skipped —
 *   see courseFields().
 */

/**
 * The compact course summary logged as `before`/`after`.
 *
 * NOT the shaped MSDB payload. That object carries `training_topics`,
 * `bullets`, four arrays of URLs and a long rich-text `title`; a single edit
 * would blow past the writer's 2 KB per-field cap and land in the trail as a
 * truncation marker — 200 characters of arbitrary prefix, which is worse than
 * a chosen summary because it looks like data.
 *
 * So: the scalar fields an admin would actually dispute, verbatim, plus counts
 * for the long-form arrays. "the objectives list went from 6 items to 4" is the
 * useful claim; the objectives themselves are on the page.
 */
function courseFields(body) {
  return {
    course_id:            body.course_id ?? '',
    course_name:          body.course_name ?? '',
    course_levels:        body.course_levels ?? '',
    course_price:         body.course_price ?? null,
    course_netprice:      body.course_netprice ?? null,
    sort_order:           body.sort_order ?? null,
    course_type_public:   Boolean(body.course_type_public),
    course_type_inhouse:  Boolean(body.course_type_inhouse),
    course_promote_status: Boolean(body.course_promote_status),
    program:              body.program ?? '',
    counts: {
      skills:          Array.isArray(body.skills) ? body.skills.length : 0,
      related_courses: Array.isArray(body.related_courses) ? body.related_courses.length : 0,
      objectives:      Array.isArray(body.course_objectives) ? body.course_objectives.length : 0,
      training_topics: Array.isArray(body.training_topics) ? body.training_topics.length : 0,
    },
  };
}

/**
 * Read one course fresh, bypassing every cache.
 *
 * `revalidate: 0` is client.js's documented "admin-page always fresh" signal —
 * it becomes `cache: 'no-store'`. This must NOT go through
 * `getPublicCourse()` (tagged, 1 h ISR) or `resolveCourseObjectId()`
 * (resolveIds.js:26, 300 s and untagged): a label read through a cached path
 * logs the course's name from BEFORE a rename, and the audit row would then
 * assert the wrong thing about the record that was just deleted.
 *
 * Filters on `course`, never `_id`. Upstream silently ignores `_id` and
 * returns the whole list — verified again 2026-07-31: `?_id=<oid>` gives 77
 * rows, `?course=<oid>` gives exactly the one.
 *
 * Never throws: a label is worth a round-trip, not a failed delete.
 */
async function readCourseUncached(id) {
  try {
    const raw = await aiFetch('/public-course', { params: { course: id }, revalidate: 0 });
    const { items } = unwrap(raw);
    return items?.[0] ?? null;
  } catch (err) {
    console.warn('[courses] uncached label read failed:', err?.message ?? err);
    return null;
  }
}

/** "COPILOT-STU — AI Agents with Microsoft Copilot Studio" */
function courseLabel(courseId, courseName) {
  return [courseId, courseName].map((s) => String(s ?? '').trim()).filter(Boolean).join(' — ');
}

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
 * Pull the JSON-serialized Training Topics out of the form and decode them.
 *
 * Each row is `{ title: string, bullets: string[] }` — the shape MSDB actually
 * stores. It was `{ topic, subtopics }` here, which upstream discards, so a
 * save replaced real subdocuments with schema defaults. The decode itself lives
 * in src/lib/courses/trainingTopics.js, which carries the measurement and is
 * importable by tests; this module is `'use server'` and is not.
 */
function parseTrainingTopics(formData) {
  const raw = formData instanceof FormData
    ? formData.get('training_topics')
    : formData?.training_topics;
  return parseTrainingTopicsValue(raw);
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

  // course_type comes from either two checkboxes (new form) or the legacy
  // single select. Which dialect this is, is decided by whether the LEGACY
  // FIELD was posted — never by whether a checkbox has a value, because an
  // unchecked box posts nothing and so cannot tell the two apart. See
  // lib/courses/courseTypeFlags for the trace this came out of.
  const { isPublic, isInhouse } = courseTypeFlags({
    courseType:   get('course_type'),
    publicField:  get('course_type_public'),
    inhouseField: get('course_type_inhouse'),
  });

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
    course_workshop_status:    checkboxBool(get('course_workshop_status')),
    course_certificate_status: checkboxBool(get('course_certificate_status')),
    course_promote_status:     checkboxBool(get('course_promote_status')),
    /* STAYS `|| undefined` — deliberately NOT clearable, unlike its neighbour.
     * A course with no program drops out of the mega menu, the /schedule
     * grouping and all-courses at once. Measured before ruling: 0 of the 77
     * upstream courses have an empty program, so nothing depends on clearing
     * it. MSDB would accept null (the path is not `required`), which is exactly
     * why the guard has to live here and in the form's `required` select rather
     * than upstream. Omitting the key leaves the stored program in place. */
    program:                   toStr(get('program')) || undefined,
    skills:                    toStrArr(getAll('skills')),
    // course_id strings — caller resolves to ObjectIds for MSDB body.
    /* `null`, not undefined and NOT '': an optional prerequisite has to be
     * removable, and undefined omitted the key so "— ไม่มี —" never saved.
     * Verified read-only against MSDB's schema — the path is
     * `{ ObjectId, ref: PublicCourse, default: null }`, so null is its own
     * resting value and validates; '' is REJECTED with a cast-to-ObjectId
     * error, which is why the empty string is not the fix here. */
    previous_course:           toStr(get('previous_course')) || null,
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
    /* ── OUTLINE PDFs — ALWAYS BOTH KEYS, ALWAYS THE FULL 8-KEY OBJECT ──────
     *
     * The form posts a root-relative path per language, or '' to clear. An
     * empty value becomes the ALL-EMPTY OBJECT, never an omitted key: omitting
     * asks MSDB to leave the previous value alone, so "clear" would appear to
     * work in the form and change nothing upstream — the same silent no-op
     * that hid the training_topics damage.
     *
     * The five keys we do not set (file_id, filename, content_type, size,
     * uploaded_at) are left exactly as upstream leaves them. Measured: they
     * are empty even on POWER-BI, the row that renders a working button.
     */
    course_outline_th:           outlineFromFormValue(toStr(get('course_outline_th_path'))),
    course_outline_en:           outlineFromFormValue(toStr(get('course_outline_en_path'))),
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
  const session = await requireAdmin('courses');
  const body = shapePayload(formData);
  if (!body.course_name) return { ok: false, error: 'กรุณากรอกชื่อหลักสูตร' };
  if (!body.course_id)   return { ok: false, error: 'กรุณากรอกรหัสหลักสูตร (course_id)' };

  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbCreate('public-course', payload);
    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu:        'courses',
      action:      'create',
      entity:      'course',
      // The MSDB-assigned _id, which only exists after the write.
      recordId:    String(item?._id ?? ''),
      recordLabel: courseLabel(body.course_id, body.course_name),
      after:       courseFields(body),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, item, id: item?._id };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างหลักสูตรไม่สำเร็จ' };
  }
}

export async function updateCourse(id, formData) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };

  const body = shapePayload(formData);
  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbUpdate('public-course', id, payload);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${id}/edit`);

    // NO `before`, deliberately. Capturing it would mean an extra uncached MSDB
    // round-trip on every course edit — a 10 s-timeout network call, paid every
    // save, to record something the trail already holds: once every update logs
    // its `after`, the previous row's `after` for the same recordId IS this
    // row's before. The reading surface reconstructs it by walking the record's
    // history, which it already fetches. Deletes are the exception (see below),
    // because there is no next row to reconstruct from.
    recordAdminActionAfter({
      menu:        'courses',
      action:      'update',
      entity:      'course',
      recordId:    String(id),
      recordLabel: courseLabel(body.course_id, body.course_name),
      after:       courseFields(body),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตหลักสูตรไม่สำเร็จ' };
  }
}

export async function deleteCourse(id) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };

  // READ BEFORE DELETING, and this is the one place in the sweep so far where
  // the extra round-trip is unambiguously worth it.
  //
  // `recordId` here is an MSDB ObjectId — `692d39b52ee07293c9131fd8`. It
  // identifies nothing to a human, and the moment msdbDelete returns, there is
  // nothing left anywhere to resolve it against. "Who deleted this, and what
  // was it called" is the question the central page exists to answer, and after
  // the delete the snapshotted label is the ONLY thing that can answer it.
  //
  // This looks like the opposite of round 2, where every delete logs
  // `recordLabel: ''`. It is the same principle reaching a different answer:
  // there `recordId` IS the human-readable reference (the admin's เลขอ้างอิง is
  // literally String(_id).slice(-8).toUpperCase()) and the PII policy forbids
  // anything more. Here the id is opaque and a course name is not personal data.
  //
  // The read is UNCACHED on purpose — see readCourseUncached().
  const existing = await readCourseUncached(id);

  try {
    await msdbDelete('public-course', id);
    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu:        'courses',
      action:      'delete',
      entity:      'course',
      recordId:    String(id),
      recordLabel: courseLabel(existing?.course_id, existing?.course_name),
      before:      existing ? courseFields(existing) : null,
      // A failed label read must not be invisible: without this, a row with an
      // empty label reads identically to a course that never had a name.
      ...(existing ? {} : { meta: { labelReadFailed: true } }),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบหลักสูตรไม่สำเร็จ' };
  }
}

