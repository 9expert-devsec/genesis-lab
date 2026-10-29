import { requirePage } from '@/lib/rbac/guard';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { listInstructors as listUpstreamInstructors } from '@/lib/api/instructors';
import { listPrograms } from '@/lib/api/programs';
import { initialProgramIds, toProgramOptions } from '@/lib/instructors/instructorPrograms';
import { InstructorsAdminClient } from './_components/InstructorsAdminClient';

export const metadata = {
  title: 'จัดการวิทยากร',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminInstructorsPage() {
  await requirePage('instructors');

  const [instructors, programsResp, upstreamResp] = await Promise.all([
    listInstructorsForAdmin(),
    listPrograms().catch(() => null),
    listUpstreamInstructors().catch(() => null),
  ]);

  // The picker starts from what MSDB holds for a linked instructor — the local
  // mirror is not synced for `programs` — so an untouched picker re-sends it.
  const upstreamById = new Map(
    (upstreamResp?.items ?? []).map((u) => [String(u?._id ?? ''), u])
  );
  const rows = instructors.map((i) => ({
    ...i,
    programs: initialProgramIds({
      local: i,
      upstream: i.instructor_id ? upstreamById.get(String(i.instructor_id)) ?? null : null,
    }),
  }));

  return (
    <div>
      <InstructorsAdminClient
        instructors={rows}
        programs={toProgramOptions(programsResp?.items)}
        programsUnavailable={!programsResp}
      />
    </div>
  );
}
