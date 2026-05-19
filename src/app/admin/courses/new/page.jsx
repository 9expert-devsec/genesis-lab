import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { CourseForm } from '../_components/CourseForm';

export const metadata = {
  title: 'สร้างหลักสูตรใหม่',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  // Best-effort — if skills/programs API fails, the form still works.
  const [skillsRes, programsRes] = await Promise.allSettled([
    listSkills(),
    listPrograms(),
  ]);

  const skills   = skillsRes.status   === 'fulfilled' ? skillsRes.value.items   ?? [] : [];
  const programs = programsRes.status === 'fulfilled' ? programsRes.value.items ?? [] : [];

  return (
    <div className="mx-auto max-w-3xl">
      <CourseForm
        mode="create"
        skills={skills}
        programs={programs}
      />
    </div>
  );
}
