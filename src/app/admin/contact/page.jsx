import { getContactVideo, getTransportMap } from '@/lib/actions/contact';
import { ContactAdminClient } from './_components/ContactAdminClient';

export const metadata = { title: 'จัดการหน้าติดต่อเรา' };
export const dynamic = 'force-dynamic';

export default async function ContactAdminPage() {
  const [video, map] = await Promise.all([
    getContactVideo(),
    getTransportMap(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          จัดการหน้าติดต่อเรา
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          จัดการวิดีโอแนะนำและแผนที่การเดินทางบนหน้า /contact-us
        </p>
      </div>

      <ContactAdminClient initialVideo={video} initialMap={map} />
    </div>
  );
}
