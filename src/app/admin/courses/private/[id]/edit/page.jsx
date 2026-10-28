import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { requirePage } from '@/lib/rbac/guard';
import { aiFetch, unwrap } from '@/lib/api/client';
import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { getCourseExtension } from '@/lib/actions/course-extensions';
import { getPrivateCourse } from '@/lib/courses/privateCourseStore';
import { courseListQuery } from '@/lib/courses/adminListQuery';
import { CourseForm } from '../../../_components/CourseForm';

export const metadata = {
  title: 'แก้ไข Private Course',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The editor for a genesis-only PRIVATE course.
 *
 * A SEPARATE route from /admin/courses/[courseId]/edit on purpose: that one
 * takes an MSDB `_id` and 404s when MSDB does not have it, which a private
 * course never has. `params.id` here is a `private_courses` `_id`.
 *
 * Same CourseForm, with `privateCourse` set, so every save goes through
 * updatePrivateCourse and never reaches MSDB. The only upstream call on this
 * page is the READ of the course list for the previous/related pickers — the
 * same uncached read the normal editor makes.
 */
export default async function EditPrivateCoursePage({ params, searchParams }) {
  await requirePage('courses');

  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const listQuery = courseListQuery(await searchParams);
  if (!mongoose.isValidObjectId(id)) notFound();

  const stored = await getPrivateCourse(id);
  if (!stored) notFound();
  // ObjectIds and Dates cannot cross into a client component as they are.
  const course = JSON.parse(JSON.stringify(stored));

  const [listRes, skillsRes, programsRes] = await Promise.allSettled([
    aiFetch('/public-course', { revalidate: 0 }),
    listSkills(),
    listPrograms(),
  ]);
  const allCourses = listRes.status === 'fulfilled' ? unwrap(listRes.value).items ?? [] : [];
  const skills = skillsRes.status === 'fulfilled' ? skillsRes.value.items ?? [] : [];
  const programs = programsRes.status === 'fulfilled' ? programsRes.value.items ?? [] : [];

  // Keyed by the code, exactly like a normal course's rail.
  let extension = null;
  try {
    extension = await getCourseExtension(course.course_id);
  } catch (err) {
    console.error('[admin/courses/private/edit] extension read failed', err?.message);
  }

  return (
    <CourseForm
      mode="edit"
      privateCourse
      initial={course}
      skills={skills}
      programs={programs}
      allCourses={allCourses}
      extension={extension}
      listQuery={listQuery}
    />
  );
}
