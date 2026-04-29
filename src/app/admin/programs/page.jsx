import Link from 'next/link';
import { dbConnect } from '@/lib/db/connect';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import ProgramOrder from '@/models/ProgramOrder';
import SkillOrder from '@/models/SkillOrder';
import ProgramOrderClient from './_components/ProgramOrderClient';
import SkillOrderClient from './_components/SkillOrderClient';

export const metadata = { title: 'จัดการลำดับโปรแกรม & Skills' };
export const dynamic = 'force-dynamic';

export default async function ProgramsAdminPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const tab = sp.tab === 'skills' ? 'skills' : 'programs';

  await dbConnect();
  const [programsResp, skillsResp, programOrdersRaw, skillOrdersRaw] =
    await Promise.all([
      listPrograms().catch(() => ({ items: [] })),
      listSkills().catch(() => ({ items: [] })),
      ProgramOrder.find({}).lean(),
      SkillOrder.find({}).lean(),
    ]);

  const apiPrograms = programsResp?.items ?? [];
  const apiSkills = skillsResp?.items ?? [];

  // Stripping mongoose internals so the data crosses the
  // server→client boundary cleanly.
  const programOrders = JSON.parse(JSON.stringify(programOrdersRaw));
  const skillOrders = JSON.parse(JSON.stringify(skillOrdersRaw));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-9e-navy">
        จัดการลำดับโปรแกรม &amp; Skills
      </h1>

      <div className="flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { key: 'programs', label: 'โปรแกรม' },
          { key: 'skills', label: 'Skills' },
        ].map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            className={
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t.key
                ? 'border-9e-primary text-9e-primary'
                : 'border-transparent text-9e-slate hover:text-9e-navy')
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'programs' ? (
        <ProgramOrderClient
          initialPrograms={apiPrograms}
          orderData={programOrders}
        />
      ) : (
        <SkillOrderClient
          initialSkills={apiSkills}
          initialPrograms={apiPrograms}
          orderData={skillOrders}
          programOrders={programOrders}
        />
      )}
    </div>
  );
}
