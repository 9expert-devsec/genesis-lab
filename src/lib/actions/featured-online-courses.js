'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { FeaturedOnlineCourse } from '@/models/FeaturedOnlineCourse';

const ADMIN_PATH = '/admin/featured-online-courses';

export async function getFeaturedOnlineCourses() {
  await dbConnect();
  const items = await FeaturedOnlineCourse.find({})
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(items));
}

export async function getActiveFeaturedOnlineCourseIds() {
  await dbConnect();
  const items = await FeaturedOnlineCourse.find({ active: true })
    .sort({ sort_order: 1 })
    .lean();
  return items.map((i) => i.course_id);
}

export async function addFeaturedOnlineCourse(formData) {
  await dbConnect();

  const rawId = formData.get('course_id');
  const course_id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!course_id) return { ok: false, error: 'กรุณาระบุ Course ID' };

  const course_name =
    typeof formData.get('course_name') === 'string'
      ? formData.get('course_name').trim()
      : '';
  if (!course_name) return { ok: false, error: 'กรุณาระบุชื่อคอร์ส' };

  const course_cover_url =
    typeof formData.get('course_cover_url') === 'string'
      ? formData.get('course_cover_url').trim()
      : '';

  const exists = await FeaturedOnlineCourse.findOne({ course_id });
  if (exists) return { ok: false, error: `${course_id} มีอยู่แล้ว` };

  const count = await FeaturedOnlineCourse.countDocuments();
  await FeaturedOnlineCourse.create({
    course_id,
    course_name,
    course_cover_url,
    sort_order: count,
    active: true,
  });

  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updateFeaturedOnlineCourse(id, formData) {
  await dbConnect();

  const sort_order = Number(formData.get('sort_order') ?? 0);
  const active = formData.get('active') === 'true';

  await FeaturedOnlineCourse.findByIdAndUpdate(id, { sort_order, active });
  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function deleteFeaturedOnlineCourse(id) {
  await dbConnect();
  await FeaturedOnlineCourse.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
