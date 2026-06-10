import { notFound, redirect } from 'next/navigation';
import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { resolveSkillBySlug } from '@/lib/resolvePageSlug';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { SkillPageClient } from './_components/SkillPageClient';

export const revalidate = 3600;

function courseInSkill(course, skillId) {
  const arr = Array.isArray(course?.skills) ? course.skills : [];
  return arr.some((s) => {
    if (typeof s === 'string') return s === skillId;
    return s?._id === skillId || s?.skill_id === skillId;
  });
}

/**
 * /skill/[slug] is now a transitional route. When the skill has an
 * admin-set custom `urlSlug`, the canonical page lives at /<urlSlug> via
 * the catch-all route, so we redirect there. Skills without a custom
 * slug keep rendering inline here (canonical stays /skill/<slug>).
 */
export default async function SkillPage({ params }) {
  const { slug } = await params;
  const skillsRes = await listSkills().catch(() => ({ items: [] }));
  const skills = skillsRes.items ?? [];

  const resolved = await resolveSkillBySlug(slug, skills);
  if (!resolved) notFound();
  if (resolved.config?.isPublished === false) notFound();

  const custom = resolved.config?.urlSlug?.trim();
  if (custom) redirect(`/${custom}`);

  // No custom slug — render inline under /skill/<slug>.
  const { skill } = resolved;
  const skillId = String(skill._id);
  const [programsRes, coursesRes] = await Promise.all([
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);

  const enriched = await enrichCoursesWithDetails(coursesRes.items ?? []);
  const skillCourses = enriched.filter((c) => courseInSkill(c, skillId));

  const ordered = await getOrderedPrograms(programsRes.items ?? []).catch(
    () => programsRes.items ?? []
  );
  const coursesByProgram = ordered
    .map((prog) => ({
      program: prog,
      courses: skillCourses.filter(
        (c) => String(c?.program?._id ?? '') === String(prog._id)
      ),
    }))
    .filter((g) => g.courses.length > 0);

  return (
    <SkillPageClient
      skill={skill}
      coursesByProgram={coursesByProgram}
      totalCourses={skillCourses.length}
    />
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const skillsRes = await listSkills().catch(() => ({ items: [] }));
  const resolved = await resolveSkillBySlug(slug, skillsRes.items ?? []);
  if (!resolved) return {};

  const { skill, config } = resolved;
  const title =
    config?.metaTitle?.trim() ||
    `${skill.skill_name} | 9Expert Training`;
  const description =
    config?.metaDescription?.trim() ||
    skill.skill_description ||
    skill.skill_teaser ||
    '';
  const ogImage = config?.ogImage?.trim() || skill.skilliconurl || '';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}
