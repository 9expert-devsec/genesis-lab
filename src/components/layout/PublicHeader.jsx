import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { getActiveTnhsCourses } from '@/lib/actions/tnhs-courses';
import { getActiveNavFeaturedOnlineCourses } from '@/lib/actions/nav-featured-online-courses';
import { PublicHeaderClient } from './PublicHeaderClient';

/**
 * Public site header — Server Component shell.
 *
 * Fetches:
 *  - Programs list (server-cached via ISR in the adapter) for the
 *    หลักสูตร mega menu.
 *  - Active career paths from Mongo for the Career Path dropdown. We
 *    pull the live list so an admin create/edit/delete reflects in the
 *    nav immediately (the action revalidates the public layout to bust
 *    this fetch). If the read fails we fall back to an empty list and
 *    the client uses the static `careerPaths` config — no broken nav.
 *
 * Both reads are best-effort. The header renders even on failure;
 * the mega trigger degrades to a plain link, the dropdown to config.
 */
export async function PublicHeader() {
  const [programs, dynamicCareerPaths, tnhsCourses, navOnlineCourses] =
    await Promise.all([
      listPrograms()
        .then((result) => getOrderedPrograms(result.items))
        .catch((err) => {
          console.error('[PublicHeader] failed to fetch programs:', err);
          return [];
        }),
      getActiveCareerPaths().catch((err) => {
        console.error('[PublicHeader] failed to fetch career paths:', err);
        return [];
      }),
      getActiveTnhsCourses().catch((err) => {
        console.error('[PublicHeader] failed to fetch TNHS courses:', err);
        return [];
      }),
      getActiveNavFeaturedOnlineCourses().catch((err) => {
        console.error('[PublicHeader] failed to fetch nav online courses:', err);
        return [];
      }),
    ]);

  return (
    <PublicHeaderClient
      programs={programs}
      dynamicCareerPaths={dynamicCareerPaths}
      tnhsCourses={tnhsCourses}
      navOnlineCourses={navOnlineCourses}
    />
  );
}
