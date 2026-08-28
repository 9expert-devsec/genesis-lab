'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { FeaturedOnlineCourse } from '@/models/FeaturedOnlineCourse';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';
import { requireAdmin } from '@/lib/actions/auth';

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
  await requireAdmin('featured_online_courses');
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
  const created = await FeaturedOnlineCourse.create({
    course_id,
    course_name,
    course_cover_url,
    sort_order: count,
    active: true,
  });

  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();
  // { ok, data } — see the note in actions/featured-courses.js. The client
  // splices this row into a sibling list whose comparator is
  // { sort_order: 1, createdAt: -1 }, and only the database knows createdAt.
  return { ok: true, data: JSON.parse(JSON.stringify(created.toObject())) };
}

export async function updateFeaturedOnlineCourse(id, formData) {
  await requireAdmin('featured_online_courses');
  await dbConnect();

  const sort_order = Number(formData.get('sort_order') ?? 0);
  const active = formData.get('active') === 'true';

  /**
   * `skipSync` — set on all-but-one call by FeaturedOnlineCourseList's
   * deferred-save reorder batch, which calls this action once per CHANGED
   * row via Promise.allSettled. Without this, N changed rows would each
   * schedule their own triggerLandingSync() — N overlapping 5-15s
   * landing-snapshot rebuilds for one save. The batch designates exactly one
   * of its calls to carry skipSync=false, so a save collapses to ONE sync
   * regardless of how many rows moved — and because the batch only reaches
   * its "fully succeeded" branch when every call (including the
   * skipSync=false one) has landed, that one call is guaranteed to have run
   * whenever a sync is expected. `handleToggle`'s own single-row call never
   * sets this flag, so an active/inactive toggle still syncs immediately, as
   * before. Same shape as featured-courses.js's updateFeaturedCourse.
   */
  const skipSync = formData.get('skipSync') === 'true';

  /**
   * TRY/CATCH ADDED (was previously absent — a thrown Mongo error propagated
   * as an unhandled rejection to whichever caller awaited this, with no
   * {ok:false} to check). Every caller was enumerated before this change
   * (FeaturedOnlineCourseList.jsx: the reorder-save batch, handleToggle; no
   * caller anywhere else in the repo) and each now handles ok:false
   * explicitly.
   */
  try {
    await FeaturedOnlineCourse.findByIdAndUpdate(id, { sort_order, active });
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }

  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  if (!skipSync) triggerLandingSync();
  return { ok: true };
}

export async function deleteFeaturedOnlineCourse(id) {
  await requireAdmin('featured_online_courses');
  await dbConnect();
  await FeaturedOnlineCourse.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();
  return { ok: true };
}
