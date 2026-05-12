import { notFound } from 'next/navigation';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { resolveProgramBySlug } from '@/lib/resolvePageSlug';
import { MOCK_BLOGS } from '@/app/_components/home/BlogSection';
import { ProgramPageClient } from './_components/ProgramPageClient';

export const revalidate = 3600;

async function loadProgramAndCourses(slug) {
  const [programsRes, coursesRes, earlyBirdMap] = await Promise.all([
    listPrograms().catch(() => ({ items: [] })),
    listPublicCourses().catch(() => ({ items: [] })),
    getAllActiveEarlyBirdMap().catch(() => ({})),
  ]);
  const programs = programsRes.items ?? [];
  const allCourses = coursesRes.items ?? [];

  const resolved = await resolveProgramBySlug(slug, programs);
  if (!resolved) return null;

  const { program, config } = resolved;
  const programKey = String(program._id);

  // Course→program is `course.program._id` per the verified shape.
  const programCourses = allCourses.filter(
    (c) => String(c?.program?._id ?? '') === programKey
  );

  const enriched = await enrichCoursesWithDetails(programCourses);
  return { program, config, courses: enriched, earlyBirdMap };
}

export default async function ProgramPage({ params }) {
  const { slug } = await params;
  const data = await loadProgramAndCourses(slug);
  if (!data) notFound();
  if (data.config && data.config.isPublished === false) notFound();

  return (
    <ProgramPageClient
      program={data.program}
      config={data.config}
      courses={data.courses}
      blogs={MOCK_BLOGS}
      earlyBirdMap={data.earlyBirdMap}
    />
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const programsRes = await listPrograms().catch(() => ({ items: [] }));
  const resolved = await resolveProgramBySlug(slug, programsRes.items ?? []);
  if (!resolved) return {};

  const { program, config } = resolved;
  const title =
    config?.metaTitle?.trim() ||
    `${program.program_name} | 9Expert Training`;
  const description =
    config?.metaDescription?.trim() ||
    program.program_description ||
    program.program_teaser ||
    '';
  const ogImage = config?.ogImage?.trim() || program.programiconurl || '';

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
