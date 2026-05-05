import { getAllInstructors, getAboutConfig } from '@/lib/actions/about';
import { AboutAdminClient } from './_components/AboutAdminClient';

export const metadata = { title: 'จัดการหน้าเกี่ยวกับเรา' };
export const dynamic = 'force-dynamic';

export default async function AboutAdminPage() {
  const [instructors, config] = await Promise.all([
    getAllInstructors(),
    getAboutConfig(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          จัดการหน้าเกี่ยวกับเรา
        </h1>
        <p className="mt-1 text-sm text-9e-slate dark:text-[#94a3b8]">
          จัดการรายชื่อวิทยากรและข้อความบนหน้า /about-us
        </p>
      </div>

      <AboutAdminClient initialInstructors={instructors} initialConfig={config} />
    </div>
  );
}
