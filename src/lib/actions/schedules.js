'use server';

/**
 * Server actions for upstream Schedule CRUD.
 *
 * Genesis does not cache schedules in Mongo — public pages call MSDB
 * directly with a short ISR window. These actions:
 *   1. Resolve the human `course_id` to its MSDB `_id` (Schedule.course
 *      is an ObjectId ref).
 *   2. Write through to MSDB.
 *   3. Upsert a ScheduleLocal sidecar with metadata MSDB doesn't track
 *      (`max_seats`, `instructor_ids`).
 *
 * Webhooks bust the public ISR caches; revalidating the admin path
 * here keeps the table fresh after each mutation.
 */

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import { resolveCourseObjectId } from '@/lib/api/resolveIds';
import ScheduleLocal from '@/models/ScheduleLocal';

const ADMIN_PATH = '/admin/schedules';

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
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
function toNullableNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Pull dates from the form. Accepts either repeated `dates` keys
 * (legacy) or a JSON-encoded `dates_json` field (new multi-date editor).
 */
function readDates(formData) {
  const json = toStr(formData.get('dates_json'));
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return toStrArr(parsed);
    } catch {
      // fall through
    }
  }
  return toStrArr(formData.getAll('dates'));
}

/**
 * Build the MSDB body. Only the fields MSDB knows about — local-only
 * fields (max_seats, instructor_ids) stay in Genesis.
 */
function shapeMsdbPayload(courseObjectId, formData) {
  return {
    course:     courseObjectId,
    dates:      readDates(formData),
    status:     toStr(formData.get('status')) || 'open',
    type:       toStr(formData.get('type'))   || 'classroom',
    signup_url: toStr(formData.get('signup_url')),
  };
}

async function upsertLocal({ msdbScheduleId, courseIdString, formData }) {
  if (!msdbScheduleId) return;
  await dbConnect();
  await ScheduleLocal.findOneAndUpdate(
    { msdb_schedule_id: String(msdbScheduleId) },
    {
      $set: {
        msdb_schedule_id: String(msdbScheduleId),
        course_id:        courseIdString,
        max_seats:        toNullableNum(formData.get('max_seats')),
        instructor_ids:   toStrArr(formData.getAll('instructor_ids')),
      },
    },
    { upsert: true, new: true }
  );
}

export async function createSchedule(formData) {
  await requireAdmin();

  const courseIdString = toStr(formData.get('course_id'));
  if (!courseIdString) return { ok: false, error: 'กรุณาเลือกหลักสูตร' };

  const courseObjectId = await resolveCourseObjectId(courseIdString);
  if (!courseObjectId) {
    return { ok: false, error: `ไม่พบหลักสูตร: ${courseIdString}` };
  }

  const body = shapeMsdbPayload(courseObjectId, formData);
  if (!body.dates.length) {
    return { ok: false, error: 'กรุณาเลือกอย่างน้อย 1 วัน' };
  }

  try {
    const { item } = await msdbCreate('schedules', body);
    await upsertLocal({
      msdbScheduleId: item?._id,
      courseIdString,
      formData,
    });
    revalidatePath(ADMIN_PATH);
    return { ok: true, item, id: item?._id };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างตารางไม่สำเร็จ' };
  }
}

/**
 * Update a schedule. The id can be passed positionally (legacy) OR
 * embedded in the FormData under `schedule_id` (preferred — lets the
 * client wire it up via a hidden input + plain `updateSchedule(fd)`
 * call without juggling two args).
 */
export async function updateSchedule(idOrFormData, maybeFormData) {
  await requireAdmin();

  // Resolve which arg is which.
  let id, formData;
  if (idOrFormData instanceof FormData) {
    formData = idOrFormData;
    id = toStr(formData.get('schedule_id'));
  } else {
    id = toStr(idOrFormData);
    formData = maybeFormData;
  }
  if (!formData) return { ok: false, error: 'Missing form data' };
  if (!id)       return { ok: false, error: 'Missing schedule id' };

  const courseIdString = toStr(formData.get('course_id'));
  const courseObjectId = courseIdString
    ? await resolveCourseObjectId(courseIdString)
    : null;
  if (!courseObjectId) {
    return { ok: false, error: `ไม่พบหลักสูตร: ${courseIdString || '(missing)'}` };
  }

  const body = shapeMsdbPayload(courseObjectId, formData);
  if (!body.dates.length) {
    return { ok: false, error: 'กรุณาเลือกอย่างน้อย 1 วัน' };
  }

  try {
    const { item } = await msdbUpdate('schedules', id, body);
    await upsertLocal({
      msdbScheduleId: id,
      courseIdString,
      formData,
    });
    revalidatePath(ADMIN_PATH);
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตตารางไม่สำเร็จ' };
  }
}

export async function deleteSchedule(id) {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing schedule id' };

  try {
    await msdbDelete('schedules', id);
    // Best-effort sidecar cleanup. If MSDB delete already succeeded,
    // a leftover sidecar is harmless but worth tidying up.
    await dbConnect();
    await ScheduleLocal.deleteOne({ msdb_schedule_id: String(id) }).catch(() => {});
    revalidatePath(ADMIN_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบตารางไม่สำเร็จ' };
  }
}

/**
 * Read-side helper for the admin page. Returns ScheduleLocal sidecar
 * rows so the UI can merge them with MSDB schedules.
 *
 *   - `getScheduleLocals()`           → every row (used by the
 *                                       program-grouped admin view)
 *   - `getScheduleLocals(idArray)`    → just rows whose
 *                                       `msdb_schedule_id` is in the
 *                                       array (legacy callers)
 *
 * Always returns a plain serialised array. Callers that want a lookup
 * map can build one with Object.fromEntries(rows.map(r => [...])).
 */
export async function getScheduleLocals(scheduleIds) {
  await dbConnect();
  const filter =
    Array.isArray(scheduleIds) && scheduleIds.length > 0
      ? { msdb_schedule_id: { $in: scheduleIds.map(String) } }
      : {};
  const rows = await ScheduleLocal.find(filter).lean();
  return JSON.parse(JSON.stringify(rows));
}
