import { notFound } from 'next/navigation';
import { getArticleById, getPinCapacity } from '@/lib/actions/articles';
import { listPrograms } from '@/lib/api/programs';
import { listSkills }   from '@/lib/api/skills';
import { listPublicCourses } from '@/lib/api/public-courses';
import { requirePage } from '@/lib/rbac/guard';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { ArticleForm } from '../../_components/ArticleForm';

export const metadata = { title: 'แก้ไขบทความ' };
export const dynamic  = 'force-dynamic';

export default async function EditArticlePage({ params }) {
  const session = await requirePage('articles');

  const { id } = await params;

  // `pinCapacity` is read HERE and not in the form. The form holds one document
  // and "is the pinned block full" is a property of the whole collection, so a
  // client that worked it out would be counting rows it does not have. No
  // `.catch` on this one, unlike the three upstream calls: those reach a
  // separate service and an edit screen that 500s because a skill lookup did is
  // a worse page, whereas this is our own database and a silent `{}` here would
  // disable the pin toggle for a reason nobody could see.
  const [article, pinCapacity, programsRes, skillsRes, coursesRes] = await Promise.all([
    getArticleById(id),
    getPinCapacity(id),
    listPrograms().catch(() => ({ items: [] })),
    listSkills().catch(()   => ({ items: [] })),
    // includeHidden — admin picker. An article may already pin a course that
    // has since been hidden; filtering would drop it on the next save.
    listPublicCourses({ includeHidden: true }).catch(() => ({ items: [] })),
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
    <>
      <ArticleForm
        article={article}
        programs={programs}
        skills={skills}
        courses={courses}
        isSuperAdmin={isSuperAdmin}
        pinCapacity={pinCapacity}
      />
      {/* Mounted here rather than inside ArticleForm because RecordHistory is a
          SERVER component that reads the session itself — the form is
          'use client'. `menu` and `entity` are literals written into this
          screen's source, never derived from the URL or from client state, and
          the reader re-checks canAccess against the session anyway.

          THIS SCREEN, NOT THE LIST. The list would need a 486-element $in per
          render; measured, that query fetches every audit row ever written for
          every article on the page — 9,720 documents at twenty rows per article
          — to keep 486 of them. See the note in
          test/fs/auditArticles.test.mjs. The edit screen asks about ONE record
          and is where the question is actually asked. */}
      <div className="mx-auto mt-6 max-w-7xl">
        <RecordHistory
          menu="articles"
          entity="article"
          recordId={String(article._id)}
        />
      </div>
    </>
  );
}