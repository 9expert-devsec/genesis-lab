import Link from 'next/link';
import { dbConnect } from '@/lib/db/connect';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { PageConfigEditor } from './_components/PageConfigEditor';

export const metadata = { title: 'จัดการ URL & SEO ของ Program / Skill' };
export const dynamic = 'force-dynamic';

export default async function PageConfigsAdmin({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const tab = sp.tab === 'skills' ? 'skills' : 'programs';

  await dbConnect();
  const [programsResp, skillsResp, programConfigsRaw, skillConfigsRaw] =
    await Promise.all([
      listPrograms().catch(() => ({ items: [] })),
      listSkills().catch(() => ({ items: [] })),
      ProgramPageConfig.find({}).lean(),
      SkillPageConfig.find({}).lean(),
    ]);

  const programs = (programsResp?.items ?? []).map((p) => ({
    id: String(p.program_id ?? p._id ?? ''),
    name: p.program_name,
    iconUrl: p.programiconurl,
  }));
  const skills = (skillsResp?.items ?? []).map((s) => ({
    id: String(s.skill_id ?? s._id ?? ''),
    name: s.skill_name,
    iconUrl: s.skilliconurl,
  }));

  const programConfigs = JSON.parse(JSON.stringify(programConfigsRaw));
  const skillConfigs = JSON.parse(JSON.stringify(skillConfigsRaw));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          จัดการ URL &amp; SEO
        </h1>
        <p className="mt-1 text-sm text-9e-slate dark:text-[#94a3b8]">
          ตั้งค่า URL slug และ metadata ของหน้า /program และ /skill
          ไม่กรอก slug จะใช้ค่าเริ่มต้นจากชื่อโปรแกรม / skill โดยอัตโนมัติ
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { key: 'programs', label: 'Program URLs' },
          { key: 'skills', label: 'Skill URLs' },
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
        <PageConfigEditor
          kind="program"
          items={programs}
          configs={programConfigs}
          urlPrefix="/program/"
        />
      ) : (
        <PageConfigEditor
          kind="skill"
          items={skills}
          configs={skillConfigs}
          urlPrefix="/skill/"
        />
      )}
    </div>
  );
}
