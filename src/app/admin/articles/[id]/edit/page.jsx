import { notFound } from 'next/navigation';
import { getArticleById } from '@/lib/actions/articles';
import { listPrograms } from '@/lib/api/programs';
import { listSkills }   from '@/lib/api/skills';
import { listPublicCourses } from '@/lib/api/public-courses';
import { requirePage } from '@/lib/rbac/guard';
import { ArticleForm } from '../../_components/ArticleForm';

export const metadata = { title: 'แก้ไขบทความ' };
export const dynamic  = 'force-dynamic';

export default async function EditArticlePage({ params }) {
  const session = await requirePage('articles');

  const { id } = await params;

  const [article, programsRes, skillsRes, coursesRes] = await Promise.all([
    getArticleById(id),
    listPrograms().catch(() => ({ items: [] })),
    listSkills().catch(()   => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);
  if (!article) notFound();
  const isSuperAdmin = session?.user?.isSuperadmin ?? false;

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
      article={article}
      programs={programs}
      skills={skills}
      courses={courses}
      isSuperAdmin={isSuperAdmin}
    />
  );
}