import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { getActiveTnhsCourses } from '@/lib/actions/tnhs-courses';
import { getActiveNavFeaturedOnlineCourses } from '@/lib/actions/nav-featured-online-courses';
import { getNavMenuData } from '@/lib/navmenu/getNavMenuData';
import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
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
  const [programs, dynamicCareerPaths, tnhsCourses, navOnlineCourses, navMenuData, navMasterclasses] =
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
      getNavMenuData().catch((err) => {
        console.error('[PublicHeader] failed to fetch nav menu cache:', err);
        return { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {} };
      }),
      getPublishedMasterclasses().catch((err) => {
        console.error('[PublicHeader] failed to fetch masterclasses:', err);
        return [];
      }),
    ]);

  // The mega menu is a public-course browser. The program list comes from
  // /programs, not the cache, so filter it down to programs that actually
  // have a non-empty cached course entry — otherwise online-only / empty
  // programs would still render as menu items with no courses on hover.
  // Key derivation must mirror syncNavMenuData's `String(p.program_id ?? p._id ?? '')`.
  const publicPrograms = programs.filter((p) => {
    const pid = String(p.program_id ?? p._id ?? '');
    const entry = navMenuData?.programs?.[pid];
    return entry && Array.isArray(entry.items) && entry.items.length > 0;
  });

  return (
    <PublicHeaderClient
      programs={publicPrograms}
      dynamicCareerPaths={dynamicCareerPaths}
      tnhsCourses={tnhsCourses}
      navOnlineCourses={navOnlineCourses}
      navMenuData={navMenuData}
      navMasterclasses={navMasterclasses}
    />
  );
}
