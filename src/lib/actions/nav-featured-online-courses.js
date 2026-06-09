'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { NavFeaturedOnlineCourse } from '@/models/NavFeaturedOnlineCourse';

const ADMIN_PATH = '/admin/nav-featured-online-courses';
const MAX_ACTIVE = 3;

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

function revalidate() {
  // Bust the public layout (navbar) and the admin list.
  revalidatePath('/', 'layout');
  revalidatePath(ADMIN_PATH);
}

/** All nav online courses for the admin list, sorted. */
export async function getNavFeaturedOnlineCourses() {
  await dbConnect();
  const items = await NavFeaturedOnlineCourse.find({})
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return serialize(items);
}

/** Active nav online courses (max 3) for the public navbar dropdown. */
export async function getActiveNavFeaturedOnlineCourses() {
  await dbConnect();
  const items = await NavFeaturedOnlineCourse.find({ active: true })
    .sort({ sort_order: 1 })
    .limit(MAX_ACTIVE)
    .lean();
  return serialize(items);
}

export async function addNavFeaturedOnlineCourse(formData) {
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

  const course_url =
    typeof formData.get('course_url') === 'string'
      ? formData.get('course_url').trim()
      : '';

  const exists = await NavFeaturedOnlineCourse.findOne({ course_id });
  if (exists) return { ok: false, error: `${course_id} มีอยู่แล้ว` };

  const activeCount = await NavFeaturedOnlineCourse.countDocuments({
    active: true,
  });
  if (activeCount >= MAX_ACTIVE) {
    return {
      ok: false,
      error: 'มีคอร์สออนไลน์ครบ 3 แล้ว',
    };
  }

  const count = await NavFeaturedOnlineCourse.countDocuments();
  await NavFeaturedOnlineCourse.create({
    course_id,
    course_name,
    course_cover_url,
    course_url,
    sort_order: count,
    active: true,
  });

  revalidate();
  return { ok: true };
}

export async function updateNavFeaturedOnlineCourse(id, formData) {
  await dbConnect();

  const sort_order = Number(formData.get('sort_order') ?? 0) || 0;
  const active = formData.get('active') === 'true';

  // Re-enabling must respect the 3-active cap.
  if (active) {
    const activeCount = await NavFeaturedOnlineCourse.countDocuments({
      active: true,
      _id: { $ne: id },
    });
    if (activeCount >= MAX_ACTIVE) {
      return {
        ok: false,
        error: `เลือกได้สูงสุด ${MAX_ACTIVE} คอร์ส active`,
      };
    }
  }

  await NavFeaturedOnlineCourse.findByIdAndUpdate(id, { sort_order, active });
  revalidate();
  return { ok: true };
}

export async function deleteNavFeaturedOnlineCourse(id) {
  await dbConnect();
  await NavFeaturedOnlineCourse.findByIdAndDelete(id);
  revalidate();
  return { ok: true };
}
