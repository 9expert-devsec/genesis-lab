import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { aiFetch, unwrap } from '@/lib/api/client';
import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { CourseForm } from '../../_components/CourseForm';

export const metadata = {
  title: 'แก้ไขหลักสูตร',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `params.courseId` here is the MSDB Mongo `_id` (passed by the admin
 * list `Edit` button). The neighbouring SEO/Gallery editor takes a
 * `course_id` code via the same segment — two conventions in one slot,
 * but the routes are disjoint (`/edit` suffix vs. bare), so they
 * don't actually collide.
 */
export default async function EditCoursePage({ params }) {
  await requirePage('courses');

  const { courseId } = await params;
  const id = decodeURIComponent(courseId);

  // Fetch the course by upstream Mongo _id. The dedicated detail path
  // doesn't exist on MSDB so we filter listPublicCourses() and match
  // by _id locally — slow on a big catalog but adequate for an admin
  // form. Bail to 404 if the upstream list lookup misses.
  let course = null;
  let allCourses = [];
  try {
    // One round-trip serves both the lookup AND the related-course
    // picker. saves us calling /public-course twice.
    const raw = await aiFetch('/public-course', { revalidate: 0 });
    const { items } = unwrap(raw);
    allCourses = items;
    course = items.find((c) => String(c._id) === id) ?? null;
  } catch (err) {
    console.error('[admin/courses/edit] aiFetch failed', err?.message);
  }
  if (!course) notFound();

  const [skillsRes, programsRes] = await Promise.allSettled([
    listSkills(),
    listPrograms(),
  ]);
  const skills   = skillsRes.status   === 'fulfilled' ? skillsRes.value.items   ?? [] : [];
  const programs = programsRes.status === 'fulfilled' ? programsRes.value.items ?? [] : [];

  return (
    <div className="mx-auto max-w-4xl">
      <CourseForm
        mode="edit"
        initial={course}
        skills={skills}
        programs={programs}
        allCourses={allCourses}
      />
    </div>
  );
}
