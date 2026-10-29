import { listPrograms } from '@/lib/api/programs';
import { listInstructors as listUpstreamInstructors } from '@/lib/api/instructors';
import { getPageLinkability } from '@/lib/resolvePageSlug';
import {
  initialProgramIds,
  toProgramOptions,
  instructorProgramLinks,
} from '@/lib/instructors/instructorPrograms';
import { photoCropValues } from '@/lib/instructors/photoCrop';

/**
 * /about-us instructor cards: the active instructors from getInstructors()
 * (admin order, unchanged selection) plus each one's program icons.
 *
 * Programs come from the MSDB master for a linked instructor (instructor_id),
 * because the local mirror is not synced for that field; an unlinked one uses
 * its local list. Ids resolve to { name, iconUrl, href } through the upstream
 * /programs list; href is the program's listing page (programCardHref), or
 * null when that page is unpublished. Both upstream reads go through aiFetch's
 * Data Cache (1h, tagged), like every other upstream read; a failed read just
 * means no icons. getPageLinkability fails closed to the legacy paths.
 *
 * Server-only.
 */
export async function buildInstructorCards(instructors = []) {
  const [programsResp, upstreamResp, linkability] = await Promise.all([
    listPrograms().catch(() => null),
    listUpstreamInstructors().catch(() => null),
    getPageLinkability(),
  ]);
  const options = toProgramOptions(programsResp?.items);
  const upstreamById = new Map(
    (upstreamResp?.items ?? []).map((u) => [String(u?._id ?? ''), u])
  );

  return instructors.map((i) => {
    const upstream = i.instructor_id ? upstreamById.get(String(i.instructor_id)) ?? null : null;
    return {
      id: String(i._id),
      name: i.name,
      title: i.title ?? '',
      imageUrl: i.image_url ?? '',
      crop: photoCropValues(i),
      specialties: Array.isArray(i.specialties) ? i.specialties.filter(Boolean) : [],
      programs: instructorProgramLinks(initialProgramIds({ local: i, upstream }), options, linkability),
    };
  });
}
