'use server';

/**
 * Server actions for upstream Schedule CRUD.
 *
 * Genesis does not cache schedules in Mongo — public pages call MSDB
 * directly with a short ISR window. These actions just round-trip to
 * MSDB and revalidate the admin path; webhooks bust public caches.
 */

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';

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

function shapePayload(formData) {
  const get = (k) =>
    formData instanceof FormData ? formData.get(k) : formData?.[k];
  const getAll = (k) =>
    formData instanceof FormData ? formData.getAll(k) : formData?.[k];

  const out = {};
  const courseId = toStr(get('course_id'));
  if (courseId) out.course = courseId; // MSDB stores as `course` (ObjectId)

  const dates = toStrArr(getAll('dates'));
  if (dates.length) out.dates = dates;

  const status = toStr(get('status'));
  if (status) out.status = status;

  const type = toStr(get('type'));
  if (type) out.type = type;

  const signupUrl = toStr(get('signup_url'));
  if (signupUrl) out.signup_url = signupUrl;

  return out;
}

export async function createSchedule(formData) {
  await requireAdmin();
  const body = shapePayload(formData);
  if (!body.course)            return { ok: false, error: 'กรุณาเลือกหลักสูตร' };
  if (!body.dates?.length)     return { ok: false, error: 'กรุณาเลือกอย่างน้อย 1 วัน' };

  try {
    const { item } = await msdbCreate('schedules', body);
    revalidatePath(ADMIN_PATH);
    return { ok: true, item, id: item?._id };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างตารางไม่สำเร็จ' };
  }
}

export async function updateSchedule(id, formData) {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing schedule id' };

  const body = shapePayload(formData);
  try {
    const { item } = await msdbUpdate('schedules', id, body);
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
    revalidatePath(ADMIN_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบตารางไม่สำเร็จ' };
  }
}
