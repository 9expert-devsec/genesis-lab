import { notFound } from 'next/navigation';
import { listSkills } from '@/lib/api/skills';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { resolveSkillBySlug } from '@/lib/resolvePageSlug';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { MOCK_BLOGS } from '@/app/_components/home/BlogSection';
import { SkillPageClient } from './_components/SkillPageClient';

export const revalidate = 3600;

function courseInSkill(course, skillId) {
  const arr = Array.isArray(course?.skills) ? course.skills : [];
  return arr.some((s) => {
    if (typeof s === 'string') return s === skillId;
    return s?._id === skillId || s?.skill_id === skillId;
  });
}

async function loadSkillAndCourses(slug) {
  const [skillsRes, programsRes, coursesRes] = await Promise.all([
    listSkills().catch(() => ({ items: [] })),
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);
  const skills = skillsRes.items ?? [];
  const programs = programsRes.items ?? [];
  const allCourses = coursesRes.items ?? [];

  const resolved = await resolveSkillBySlug(slug, skills);
  if (!resolved) return null;
  const { skill, config } = resolved;
  const skillId = String(skill._id);

  // Enrich first so we have full skill objects on each course; the
  // list response only has ObjectId strings.
  const enriched = await enrichCoursesWithDetails(allCourses);
  const skillCourses = enriched.filter((c) => courseInSkill(c, skillId));

  // Group by program, then sort groups by admin-set program order.
  const ordered = await getOrderedPrograms(programs).catch(() => programs);
  const coursesByProgram = ordered
    .map((prog) => {
      const progKey = String(prog._id);
      return {
        program: prog,
        courses: skillCourses.filter(
          (c) => String(c?.program?._id ?? '') === progKey
        ),
      };
    })
    .filter((g) => g.courses.length > 0);

  return { skill, config, coursesByProgram, totalCourses: skillCourses.length };
}

export default async function SkillPage({ params }) {
  const { slug } = await params;
  const data = await loadSkillAndCourses(slug);
  if (!data) notFound();
  if (data.config && data.config.isPublished === false) notFound();

  return (
    <SkillPageClient
      skill={data.skill}
      coursesByProgram={data.coursesByProgram}
      totalCourses={data.totalCourses}
      blogs={MOCK_BLOGS}
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

