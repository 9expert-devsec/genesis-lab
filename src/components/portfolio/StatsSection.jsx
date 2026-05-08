import { Building2, Users, Star, Trophy } from 'lucide-react';

const STATS = [
  { value: '5,000+', label: 'องค์กรที่ไว้วางใจ',  icon: Building2 },
  { value: '90,000+', label: 'ผู้เรียนทั้งหมด',     icon: Users },
  { value: '4.9★',    label: 'คะแนนความพึงพอใจ',    icon: Star },
  { value: '15+ ปี',  label: 'ประสบการณ์ฝึกอบรม',   icon: Trophy },
];

export default function StatsSection() {
  return (
    <section className="bg-white py-16 dark:bg-[var(--page-bg)] md:py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div
              key={label}
              className="rounded-9e-lg border-t-2 border-9e-brand bg-white p-6 shadow-9e-sm dark:bg-9e-card md:p-8"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-9e-md bg-9e-signature-950 dark:bg-9e-signature-900">
                <Icon className="h-7 w-7 text-9e-brand" strokeWidth={2} />
              </div>
              <p className="bg-9e-gradient-hero bg-clip-text font-heading text-4xl font-bold text-transparent">
                {value}
              </p>
              <p className="mt-2 font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
