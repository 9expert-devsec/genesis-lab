/**
 * The `private_courses` store — every read and write a PRIVATE course makes.
 *
 * ══ NOTHING HERE MAY REACH MSDB ═════════════════════════════════════════════
 * A private course lives in genesis only. This module imports no upstream
 * client — no msdb-write, no aiFetch, no resolveIds — and test/fs/
 * privateCourseNoMsdb pins that, along with the three server actions that call
 * it. The body it stores is exactly what `shapePayload` produced for the form,
 * unresolved: see models/PrivateCourse for why the course refs stay codes.
 *
 * `deps.model` exists so the pure tier can drive it without a database, the
 * same split hiddenCourses and resolveCourse use. Production passes nothing.
 */

import { normaliseCourseId } from '@/lib/courses/courseIdAvailability';
import { searchTermPattern } from '@/lib/searchTerm';

async function defaultModel() {
  const { dbConnect } = await import('@/lib/db/connect');
  await dbConnect();
  return (await import('@/models/PrivateCourse')).default;
}

/** The shaped body as stored: `course_id` uppercased, nothing else changed. */
export function privateCourseDoc(body) {
  return { ...body, course_id: normaliseCourseId(body?.course_id) };
}

/**
 * The stored `course_id` matching `code` IGNORING CASE, or null. Anchored and
 * escaped exactly like findCourseExtensionCodeInsensitive — a code is user
 * input and `.` is a live regex metacharacter.
 */
export async function findPrivateCourseCodeInsensitive(code, { model } = {}) {
  const wanted = String(code ?? '').trim();
  if (!wanted) return null;
  const M = model ?? (await defaultModel());
  const doc = await M.findOne({
    course_id: { $regex: `^${searchTermPattern(wanted)}$`, $options: 'i' },
  })
    .select('course_id')
    .lean();
  return doc?.course_id ?? null;
}

export async function insertPrivateCourse(body, { model } = {}) {
  const M = model ?? (await defaultModel());
  const created = await M.create(privateCourseDoc(body));
  return typeof created?.toObject === 'function' ? created.toObject() : created;
}

/**
 * Replace the stored body with the form's. `course_id` is NOT changed by an
 * update — the code is read-only on the edit form, and renaming a private
 * course would strand its CourseExtension row, which is keyed by the code.
 */
export async function updatePrivateCourseDoc(id, body, { model } = {}) {
  const M = model ?? (await defaultModel());
  const { course_id: _ignored, ...rest } = privateCourseDoc(body);
  return M.findByIdAndUpdate(id, { $set: rest }, { new: true, runValidators: true }).lean();
}

export async function removePrivateCourse(id, { model } = {}) {
  const M = model ?? (await defaultModel());
  return M.findByIdAndDelete(id).lean();
}

/**
 * The private course with this code, or null — ONE read on the unique
 * `course_id` index. Exact, not a regex: the code is stored uppercase, so
 * uppercasing the lookup is the whole of the case rule and the index serves it.
 * This is what resolveCourse runs on the public route, including for every
 * MSDB course (where it misses), so it must stay this cheap.
 */
export async function getPrivateCourseByCode(code, { model } = {}) {
  const wanted = normaliseCourseId(code);
  if (!wanted) return null;
  const M = model ?? (await defaultModel());
  return M.findOne({ course_id: wanted }).lean();
}

export async function getPrivateCourse(id, { model } = {}) {
  if (!id) return null;
  const M = model ?? (await defaultModel());
  return M.findById(id).lean();
}

export async function listPrivateCourses({ model } = {}) {
  const M = model ?? (await defaultModel());
  return M.find({}).sort({ sort_order: 1, course_name: 1 }).lean();
}
