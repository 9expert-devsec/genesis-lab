import { listPrograms } from '@/lib/api/programs';
import { listSkills }   from '@/lib/api/skills';
import { listPublicCourses } from '@/lib/api/public-courses';
import { auth } from '@/lib/auth/options';
import { ArticleForm } from '../_components/ArticleForm';

export const metadata = { title: 'สร้างบทความใหม่' };
export const dynamic  = 'force-dynamic';

export default async function NewArticlePage() {
  const [session, programsRes, skillsRes, coursesRes] = await Promise.all([
    auth(),
    listPrograms().catch(() => ({ items: [] })),
    listSkills().catch(()   => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);
  const isSuperAdmin = session?.user?.role === 'superadmin';

  const programs = (programsRes.items ?? []).map((p) => ({
    program_id:   p.program_id,
    program_name: p.program_name,
  }));
  const skills = (skillsRes.items ?? []).map((s) => ({
    skill_id:   s.skill_id,
    skill_name: s.skill_name,
  }));
  const courses = (coursesRes.items ?? []).map((c) => ({
    _id:         c._id,
    course_id:   c.course_id,
    course_name: c.course_name ?? '',
  }));

  return (
    <ArticleForm
      article={null}
      programs={programs}
      skills={skills}
      courses={courses}
      isSuperAdmin={isSuperAdmin}
    />
  );
}