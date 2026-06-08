'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { TnhsCourse } from '@/models/TnhsCourse';

const ADMIN_PATH = '/admin/tnhs-courses';

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

function revalidate() {
  // Bust the public layout (navbar) and the admin list.
  revalidatePath('/', 'layout');
  revalidatePath(ADMIN_PATH);
}

/** Active TNHS courses for the public navbar dropdown, sorted. */
export async function getActiveTnhsCourses() {
  await dbConnect();
  const items = await TnhsCourse.find({ is_active: true })
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return serialize(items);
}

/** All TNHS courses for the admin list. */
export async function getAllTnhsCourses() {
  await dbConnect();
  const items = await TnhsCourse.find({})
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return serialize(items);
}

export async function createTnhsCourse(formData) {
  await dbConnect();

  const course_name =
    typeof formData.get('course_name') === 'string'
      ? formData.get('course_name').trim()
      : '';
  if (!course_name) return { ok: false, error: 'กรุณาระบุชื่อคอร์ส' };

  const cover_url =
    typeof formData.get('cover_url') === 'string'
      ? formData.get('cover_url').trim()
      : '';
  const external_url =
    typeof formData.get('external_url') === 'string'
      ? formData.get('external_url').trim()
      : '';
  const sort_order = Number(formData.get('sort_order') ?? 0) || 0;
  const is_active = formData.get('is_active') === 'true';

  await TnhsCourse.create({
    course_name,
    cover_url,
    external_url,
    sort_order,
    is_active,
  });

  revalidate();
  return { ok: true };
}

export async function updateTnhsCourse(id, formData) {
  await dbConnect();

  const update = {};
  if (formData.has('course_name')) {
    update.course_name = String(formData.get('course_name') ?? '').trim();
  }
  if (formData.has('cover_url')) {
    update.cover_url = String(formData.get('cover_url') ?? '').trim();
  }
  if (formData.has('external_url')) {
    update.external_url = String(formData.get('external_url') ?? '').trim();
  }
  if (formData.has('sort_order')) {
    update.sort_order = Number(formData.get('sort_order') ?? 0) || 0;
  }
  if (formData.has('is_active')) {
    update.is_active = formData.get('is_active') === 'true';
  }

  await TnhsCourse.findByIdAndUpdate(id, update);
  revalidate();
  return { ok: true };
}

export async function deleteTnhsCourse(id) {
  await dbConnect();
  await TnhsCourse.findByIdAndDelete(id);
  revalidate();
  return { ok: true };
}
