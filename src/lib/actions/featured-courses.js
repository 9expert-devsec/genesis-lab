'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { FeaturedCourse } from '@/models/FeaturedCourse';
import { getCourseByCode } from '@/lib/api/public-courses';

export async function getFeaturedCourses() {
  await dbConnect();
  const items = await FeaturedCourse.find({})
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(items));
}

export async function getActiveFeaturedCourseIds() {
  await dbConnect();
  const items = await FeaturedCourse.find({ active: true })
    .sort({ sort_order: 1 })
    .lean();
  return items.map((i) => i.course_id);
}

export async function addFeaturedCourse(formData) {
  await dbConnect();

  const rawId = formData.get('course_id');
  // Preserve case — upstream course_id is case-sensitive (e.g. "Power-Apps",
  // not "POWER-APPS"). The autocomplete already selects the exact value
  // from the API, so no normalization needed.
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

  const exists = await FeaturedCourse.findOne({ course_id });
  if (exists) return { ok: false, error: `${course_id} มีอยู่แล้ว` };

  const count = await FeaturedCourse.countDocuments();
  await FeaturedCourse.create({
    course_id,
    course_name,
    course_cover_url,
    sort_order: count,
    active: true,
  });

  // Background backfill: the list endpoint doesn't include course_cover_url,
  // so the formData value is usually empty. Fetch detail and update the
  // stored record in the background — not awaited so the user's request
  // returns immediately.
  if (!course_cover_url) {
    getCourseByCode(course_id)
      .then((detail) => {
        if (detail?.course_cover_url) {
          return FeaturedCourse.findOneAndUpdate(
            { course_id },
            { course_cover_url: detail.course_cover_url }
          ).exec();
        }
        return null;
      })
      .catch((err) => {
        console.warn('[featured-courses] cover backfill failed:', course_id, err);
      });
  }

  revalidatePath('/');
  revalidatePath('/admin/featured-courses');
  return { ok: true };
}

export async function updateFeaturedCourse(id, formData) {
  await dbConnect();

  const sort_order = Number(formData.get('sort_order') ?? 0);
  const active = formData.get('active') === 'true';

  await FeaturedCourse.findByIdAndUpdate(id, { sort_order, active });
  revalidatePath('/');
  revalidatePath('/admin/featured-courses');
  return { ok: true };
}

export async function deleteFeaturedCourse(id) {
  await dbConnect();
  await FeaturedCourse.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath('/admin/featured-courses');
  return { ok: true };
}
