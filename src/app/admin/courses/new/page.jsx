import { requirePage } from '@/lib/rbac/guard';
import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { courseListQuery } from '@/lib/courses/adminListQuery';
import { CourseForm } from '../_components/CourseForm';

export const metadata = {
  title: 'สร้างหลักสูตรใหม่',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewCoursePage({ searchParams }) {
  await requirePage('courses');

  // The list's filter state, so ← and the post-create redirect both land back
  // on the list the admin was actually looking at.
  const listQuery = courseListQuery(await searchParams);

  // Best-effort — if any upstream lookup fails, the form still renders;
  // the missing selector just shows an empty state.
  const [skillsRes, programsRes, coursesRes] = await Promise.allSettled([
    listSkills(),
    listPrograms(),
    listPublicCourses(),
  ]);

  const skills      = skillsRes.status   === 'fulfilled' ? skillsRes.value.items   ?? [] : [];
  const programs    = programsRes.status === 'fulfilled' ? programsRes.value.items ?? [] : [];
  const allCourses  = coursesRes.status  === 'fulfilled' ? coursesRes.value.items  ?? [] : [];

  // No `max-w-4xl` wrapper: the form now renders the full-height shell, which
  // owns its own width and must fill `main` exactly — see AdminContentWrapper
  // for why an extra box around a 100dvh child is what grows a second
  // scrollbar. Same reason the edit page has no wrapper either.
  return (
    <CourseForm
      mode="create"
      skills={skills}
      programs={programs}
      allCourses={allCourses}
      listQuery={listQuery}
    />
  );
}
