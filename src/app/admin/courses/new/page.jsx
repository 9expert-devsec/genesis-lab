import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { CourseForm } from '../_components/CourseForm';

export const metadata = {
  title: 'สร้างหลักสูตรใหม่',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
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

  return (
    <div className="mx-auto max-w-4xl">
      <CourseForm
        mode="create"
        skills={skills}
        programs={programs}
        allCourses={allCourses}
      />
    </div>
  );
}
