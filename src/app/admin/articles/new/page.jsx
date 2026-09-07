import { listPrograms } from '@/lib/api/programs';
import { listSkills }   from '@/lib/api/skills';
import { listPublicCourses } from '@/lib/api/public-courses';
import { requirePage } from '@/lib/rbac/guard';
import { articleListQuery } from '@/lib/articles/adminListQuery';
import { ArticleForm } from '../_components/ArticleForm';

export const metadata = { title: 'สร้างบทความใหม่' };
export const dynamic  = 'force-dynamic';

export default async function NewArticlePage({ searchParams }) {
  const session = await requirePage('articles');

  // The list's page position, if the admin got here from a paged list. This
  // screen's POST-SAVE REDIRECT is the second return path — the edit screen has
  // no redirect at all, it stays put — so it has to carry the page back too, or
  // the fix works for one way home and not the other.
  const listQuery = articleListQuery(await searchParams);

  const [programsRes, skillsRes, coursesRes] = await Promise.all([
    listPrograms().catch(() => ({ items: [] })),
    listSkills().catch(()   => ({ items: [] })),
    // includeHidden — admin picker. An article may already pin a course that
    // has since been hidden; filtering would drop it on the next save.
    listPublicCourses({ includeHidden: true }).catch(() => ({ items: [] })),
  ]);
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
      article={null}
      programs={programs}
      skills={skills}
      courses={courses}
      isSuperAdmin={isSuperAdmin}
      listQuery={listQuery}
    />
  );
}