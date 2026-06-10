import { notFound, redirect } from 'next/navigation';
import { listPrograms } from '@/lib/api/programs';
import { listPublicCourses } from '@/lib/api/public-courses';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { resolveProgramBySlug } from '@/lib/resolvePageSlug';
import { ProgramPageClient } from './_components/ProgramPageClient';

export const revalidate = 3600;

/**
 * /program/[slug] is now a transitional route. When the program has an
 * admin-set custom `urlSlug`, the canonical page lives at /<urlSlug> via
 * the catch-all route, so we redirect there. Programs without a custom
 * slug keep rendering inline here (canonical stays /program/<slug>), so
 * existing links never break.
 *
 * We resolve the config first and redirect before doing the heavier
 * course/early-bird fetches, so a redirect doesn't pay for work it
 * throws away.
 */
export default async function ProgramPage({ params }) {
  const { slug } = await params;
  const programsRes = await listPrograms().catch(() => ({ items: [] }));
  const programs = programsRes.items ?? [];

  const resolved = await resolveProgramBySlug(slug, programs);
  if (!resolved) notFound();
  if (resolved.config?.isPublished === false) notFound();

  const custom = resolved.config?.urlSlug?.trim();
  if (custom) redirect(`/${custom}`);

  // No custom slug — render inline under /program/<slug>.
  const { program, config } = resolved;
  const [coursesRes, earlyBirdMap] = await Promise.all([
    listPublicCourses().catch(() => ({ items: [] })),
    getAllActiveEarlyBirdMap().catch(() => ({})),
  ]);
  const programKey = String(program._id);
  const programCourses = (coursesRes.items ?? []).filter(
    (c) => String(c?.program?._id ?? '') === programKey
  );
  const courses = await enrichCoursesWithDetails(programCourses);

  return (
    <ProgramPageClient
      program={program}
      config={config}
      courses={courses}
      earlyBirdMap={earlyBirdMap}
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
